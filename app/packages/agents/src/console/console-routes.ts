import type { AdminAgent, AgentRequestContext } from "@core/contracts";
import type { Logger } from "@core/services";
import type { Mastra } from "@mastra/core/mastra";
import { type ApiRoute, registerApiRoute } from "@mastra/core/server";
import { z } from "zod";
import { buildAgentPrincipal } from "../auth/agent-principal.ts";
import { buildAgentRequestContext, writeAgentContext } from "../context/write-agent-context.ts";
import type { AccessPort } from "../runtime/runtime-ports.ts";
import { addFeedbackItem, listDatasets } from "./dataset-console.ts";
import { EvalRunRecordSchema, type ExperimentStore, getExperimentSummary, listExperimentSummaries, recordEvalRun } from "./eval-console.ts";
import { actOnAdminSchedule, AdminRunsQuerySchema, cancelAdminRun, listAdminRuns, listAdminSchedules, SCHEDULE_ACTIONS } from "./operations-console.ts";
import { createTraceReader, type TraceStore } from "./trace-reader.ts";

/**
 * Console reads and writes over Mastra storage (decision 0040), custom routes outside the API
 * prefix like the settle route of decision 0036: no user Bearer, Cloud Run IAM outside local. `/v1`
 * authorizes the caller first and always passes the tenant of a tenant endpoint; no `tenantId`
 * (staff endpoints) reads every tenant.
 */
export const CONSOLE_ROUTES_PREFIX = "/console";

export type ConsoleRouteDeps = {
  readonly access: Pick<AccessPort, "resolveAccessContext">;
  readonly aiMode: AgentRequestContext["aiMode"];
  readonly logger: Pick<Logger, "info" | "error">;
  /** The registered agents for the staff catalog (decision 0044); absent: an empty catalog. */
  readonly agentCatalog?: () => readonly AdminAgent[];
};

/** What a console handler reads from the Hono context of its custom route. */
type Ctx = {
  readonly query: (key: string) => string | undefined;
  readonly param: (key: string) => string;
  readonly json: () => Promise<unknown>;
  readonly header: (key: string) => string | undefined;
  readonly queries: () => Record<string, string>;
  readonly mastra: Mastra;
};

type HonoLike = {
  readonly req: { url: string; query: (key: string) => string | undefined; param: () => Record<string, string>; json: () => Promise<unknown>; header: (key: string) => string | undefined };
  readonly get: (key: "mastra") => Mastra;
};

const ctxOf = (c: HonoLike): Ctx => ({
  query: (key) => c.req.query(key),
  param: (key) => c.req.param()[key] ?? "",
  json: () => c.req.json(),
  header: (key) => c.req.header(key),
  queries: () => Object.fromEntries(new URL(c.req.url).searchParams),
  mastra: c.get("mastra"),
});

const json = (status: number, body: unknown): Response => Response.json(body, { status });
const fail = (status: number, code: string): Response => json(status, { error: { code, message: code } });
const tenantOf = (ctx: Ctx): string | null => ctx.query("tenantId") ?? null;
const pageOf = (ctx: Ctx) => ({ page: Math.max(0, Number(ctx.query("page") ?? 0) || 0), perPage: Math.min(100, Math.max(1, Number(ctx.query("perPage") ?? 20) || 20)) });

// `undefined` = not asked; `null` = asked with something that is not an instant.
const instantOf = (ctx: Ctx, key: string): Date | undefined | null => {
  const raw = ctx.query(key);
  if (raw === undefined) return undefined;
  const at = new Date(raw);
  return Number.isNaN(at.getTime()) ? null : at;
};

const storeOf = async <T>(ctx: Ctx, name: "observability" | "experiments"): Promise<T | null> =>
  ((await ctx.mastra.getStorage()?.getStore(name)) as T | undefined) ?? null;

// Infrastructure errors answer 500 with no detail; the log keeps the cause.
const guarded = (deps: ConsoleRouteDeps, event: string, run: (ctx: Ctx) => Promise<Response>) => async (c: HonoLike) => {
  try {
    return await run(ctxOf(c));
  } catch (error: unknown) {
    deps.logger.error(event, { err: error });
    return fail(500, "INTERNAL_ERROR");
  }
};

const traceRoutes = (deps: ConsoleRouteDeps): ApiRoute[] => [
  registerApiRoute(`${CONSOLE_ROUTES_PREFIX}/traces`, {
    method: "GET",
    requiresAuth: false,
    handler: guarded(deps, "console_traces_failed", async (ctx) => {
      const store = await storeOf<TraceStore>(ctx, "observability");
      if (store === null) return json(200, { data: [], meta: { hasMore: false } });
      const status = ctx.query("status");
      const agentId = ctx.query("agentId");
      const startedAfter = instantOf(ctx, "startedAfter");
      const startedBefore = instantOf(ctx, "startedBefore");
      if (startedAfter === null || startedBefore === null) return fail(400, "VALIDATION_FAILED");
      const listed = await createTraceReader(store).list({
        tenantId: tenantOf(ctx),
        ...pageOf(ctx),
        ...(agentId === undefined ? {} : { agentId }),
        ...(status === "ok" || status === "error" ? { status } : {}),
        ...(startedAfter === undefined ? {} : { startedAfter }),
        ...(startedBefore === undefined ? {} : { startedBefore }),
      });
      return json(200, { data: listed.traces, meta: { hasMore: listed.hasMore } });
    }),
  }),
  registerApiRoute(`${CONSOLE_ROUTES_PREFIX}/traces/:traceId`, {
    method: "GET",
    requiresAuth: false,
    handler: guarded(deps, "console_trace_failed", async (ctx) => {
      const store = await storeOf<TraceStore>(ctx, "observability");
      const detail = store === null ? null : await createTraceReader(store).get({ traceId: ctx.param("traceId"), tenantId: tenantOf(ctx) });
      return detail === null ? fail(404, "NOT_FOUND") : json(200, { data: detail });
    }),
  }),
];

const StartSchema = z.strictObject({ tenantId: z.string().min(1).max(128), userId: z.string().min(1).max(128), datasetId: z.string().min(1).max(128), agentId: z.string().regex(/^[a-z][a-z0-9-]*$/) });

/** The verified context of the requesting member, so the experiment runs with their current grants. */
const memberContextOf = async (deps: ConsoleRouteDeps, input: z.infer<typeof StartSchema>, requestId: string): Promise<Record<string, unknown> | null> => {
  const principal = { type: "user", uid: input.userId, mfa: false } as const;
  const context = await deps.access.resolveAccessContext({ principal, node: { level: "organization", tenantId: input.tenantId } });
  const agentPrincipal = buildAgentPrincipal({ principal, identity: { kind: "user", uid: input.userId }, scope: { tenantId: input.tenantId }, context });
  const built = buildAgentRequestContext({ principal: agentPrincipal, requestId, aiMode: deps.aiMode });
  if (built === null) return null;
  const store = new Map<string, unknown>();
  writeAgentContext({ get: (key) => store.get(key), set: (key, value) => void store.set(key, value), delete: (key) => store.delete(key) }, { context: built, principal });
  return Object.fromEntries(store);
};

const evalRoutes = (deps: ConsoleRouteDeps): ApiRoute[] => [
  registerApiRoute(`${CONSOLE_ROUTES_PREFIX}/experiments`, {
    method: "GET",
    requiresAuth: false,
    handler: guarded(deps, "console_experiments_failed", async (ctx) => {
      const store = await storeOf<ExperimentStore>(ctx, "experiments");
      if (store === null) return json(200, { data: [], meta: { hasMore: false } });
      const listed = await listExperimentSummaries(store, { tenantId: tenantOf(ctx), ...pageOf(ctx) });
      return json(200, { data: listed.experiments, meta: { hasMore: listed.hasMore } });
    }),
  }),
  registerApiRoute(`${CONSOLE_ROUTES_PREFIX}/experiments/:experimentId`, {
    method: "GET",
    requiresAuth: false,
    handler: guarded(deps, "console_experiment_failed", async (ctx) => {
      const store = await storeOf<ExperimentStore>(ctx, "experiments");
      const summary = store === null ? null : await getExperimentSummary(store, { experimentId: ctx.param("experimentId"), tenantId: tenantOf(ctx) });
      return summary === null ? fail(404, "NOT_FOUND") : json(200, { data: summary });
    }),
  }),
  registerApiRoute(`${CONSOLE_ROUTES_PREFIX}/experiments`, {
    method: "POST",
    requiresAuth: false,
    handler: guarded(deps, "console_experiment_start_failed", async (ctx) => {
      const input = StartSchema.safeParse(await ctx.json().catch(() => null));
      if (!input.success) return fail(400, "VALIDATION_FAILED");
      const mastra = ctx.mastra;
      if (mastra.getAgentById(input.data.agentId) === undefined) return fail(422, "AGENT_NOT_ENABLED");
      const dataset = await mastra.datasets.get({ id: input.data.datasetId, organizationId: input.data.tenantId }).catch(() => null);
      if (dataset === null) return fail(404, "NOT_FOUND");
      const requestContext = await memberContextOf(deps, input.data, ctx.header("x-request-id") ?? input.data.datasetId);
      if (requestContext === null) return fail(403, "FORBIDDEN");
      const started = await dataset.startExperimentAsync({ targetType: "agent", targetId: input.data.agentId, requestContext, name: `tenant:${input.data.agentId}` });
      return json(202, { data: { experimentId: started.experimentId } });
    }),
  }),
  registerApiRoute(`${CONSOLE_ROUTES_PREFIX}/eval-runs`, {
    method: "POST",
    requiresAuth: false,
    handler: guarded(deps, "console_eval_run_failed", async (ctx) => {
      const run = EvalRunRecordSchema.safeParse(await ctx.json().catch(() => null));
      const store = await storeOf<ExperimentStore>(ctx, "experiments");
      if (!run.success) return fail(400, "VALIDATION_FAILED");
      if (store === null) return fail(503, "UPSTREAM_UNAVAILABLE");
      return json(201, { data: { experimentId: await recordEvalRun(store, run.data, null) } });
    }),
  }),
];

const FeedbackItemSchema = z.strictObject({
  tenantId: z.string().min(1).max(128),
  feedbackKey: z.string().min(1).max(400),
  conversationId: z.string().min(1).max(128),
  messageId: z.string().min(1).max(128),
  rating: z.enum(["up", "down"]),
  comment: z.string().max(1000).nullable(),
});

const datasetRoutes = (deps: ConsoleRouteDeps): ApiRoute[] => [
  registerApiRoute(`${CONSOLE_ROUTES_PREFIX}/datasets`, {
    method: "GET",
    requiresAuth: false,
    handler: guarded(deps, "console_datasets_failed", async (ctx) => json(200, { data: await listDatasets(ctx.mastra.datasets, tenantOf(ctx)) })),
  }),
  registerApiRoute(`${CONSOLE_ROUTES_PREFIX}/feedback-items`, {
    method: "POST",
    requiresAuth: false,
    handler: guarded(deps, "console_feedback_item_failed", async (ctx) => {
      const input = FeedbackItemSchema.safeParse(await ctx.json().catch(() => null));
      if (!input.success) return fail(400, "VALIDATION_FAILED");
      return json(201, { data: await addFeedbackItem(ctx.mastra.datasets, input.data) });
    }),
  }),
];

const requestIdOf = (ctx: Ctx): { requestId?: string } => {
  const requestId = ctx.header("x-request-id");
  return requestId === undefined ? {} : { requestId };
};

// Staff operations (decision 0043): `/v1/admin` requires staff with MFA and audits; these act on any tenant.
const operationRoutes = (deps: ConsoleRouteDeps): ApiRoute[] => [
  registerApiRoute(`${CONSOLE_ROUTES_PREFIX}/workflow-runs`, {
    method: "GET",
    requiresAuth: false,
    handler: guarded(deps, "console_workflow_runs_failed", async (ctx) => {
      const query = AdminRunsQuerySchema.safeParse(ctx.queries());
      if (!query.success) return fail(400, "VALIDATION_FAILED");
      const listed = await listAdminRuns(ctx.mastra, query.data);
      return json(200, { data: listed.runs, meta: { page: listed.page } });
    }),
  }),
  registerApiRoute(`${CONSOLE_ROUTES_PREFIX}/workflow-runs/:runId/cancel`, {
    method: "POST",
    requiresAuth: false,
    handler: guarded(deps, "console_workflow_run_cancel_failed", async (ctx) => {
      const run = await cancelAdminRun(ctx.mastra, ctx.param("runId"));
      if (run === null) return fail(404, "NOT_FOUND");
      deps.logger.info("console_workflow_run_canceled", { ...requestIdOf(ctx), runId: run.runId, workflowId: run.workflowId, tenantId: run.tenantId });
      return json(200, { data: run });
    }),
  }),
  registerApiRoute(`${CONSOLE_ROUTES_PREFIX}/schedules`, {
    method: "GET",
    requiresAuth: false,
    handler: guarded(deps, "console_schedules_failed", async (ctx) => json(200, { data: await listAdminSchedules(ctx.mastra, tenantOf(ctx)) })),
  }),
  ...SCHEDULE_ACTIONS.map((action) =>
    registerApiRoute(`${CONSOLE_ROUTES_PREFIX}/schedules/:scheduleId/${action}`, {
      method: "POST",
      requiresAuth: false,
      handler: guarded(deps, `console_schedule_${action}_failed`, async (ctx) => {
        const schedule = await actOnAdminSchedule(ctx.mastra, ctx.param("scheduleId"), action);
        if (schedule === null) return fail(404, "NOT_FOUND");
        deps.logger.info(`console_schedule_${action}`, { ...requestIdOf(ctx), scheduleId: schedule.id, tenantId: schedule.tenantId });
        return json(200, { data: schedule });
      }),
    }),
  ),
];

// Registry data of the runtime itself (decision 0044): no tenant data, so no tenant filter.
const agentRoutes = (deps: ConsoleRouteDeps): ApiRoute[] => [
  registerApiRoute(`${CONSOLE_ROUTES_PREFIX}/agents`, {
    method: "GET",
    requiresAuth: false,
    handler: guarded(deps, "console_agents_failed", () => Promise.resolve(json(200, { data: deps.agentCatalog?.() ?? [] }))),
  }),
];

export const createConsoleRoutes = (deps: ConsoleRouteDeps): ApiRoute[] => [
  ...traceRoutes(deps),
  ...evalRoutes(deps),
  ...datasetRoutes(deps),
  ...operationRoutes(deps),
  ...agentRoutes(deps),
];
