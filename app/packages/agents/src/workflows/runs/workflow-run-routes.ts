import { WorkflowRunStatusSchema } from "@core/contracts";
import type { Logger } from "@core/services";
import type { Mastra } from "@mastra/core/mastra";
import { type ApiRoute, registerApiRoute } from "@mastra/core/server";
import { z } from "zod";
import type { AccessPort, WorkflowApprovalPort } from "../../runtime/runtime-ports.ts";
import type { WorkflowCatalog } from "../workflow-catalog.ts";
import { cancelStoredRun } from "./cancel-stored-run.ts";
import {
  authorizeCaller,
  dataJson,
  inputsOf,
  type RouteInputs,
  routeError,
  validateWorkflowInput,
} from "./workflow-route-http.ts";
import { eventsOfRun, isTenantRun, type StoredRun, toWorkflowRunView } from "./workflow-run-view.ts";

/** Custom routes of tenant workflow runs (SP5 spec §3.6, decision 0040); the `/v1` gateway calls them. */
export const WORKFLOW_RUN_ROUTES_PATTERN = "/workflow-runs/*";
export const WORKFLOW_RUNS_PATH = "/workflow-runs";
export const WORKFLOW_RUN_START_PATH = "/workflow-runs/start/:workflowId";

export const WORKFLOW_RUN_PERMISSIONS = {
  read: "core.workflow-run.read",
  start: "core.workflow-run.start",
  cancel: "core.workflow-run.cancel",
} as const;

/** Storage page while scanning for a tenant's runs, and how many pages a list reads at most. */
const SCAN_PAGE = 200;
const SCAN_PAGES = 10;
const MAX_LIMIT = 100;

const ListQuerySchema = z.object({
  workflowId: z.string().min(1).max(100).optional(),
  status: WorkflowRunStatusSchema.optional(),
  cursor: z
    .string()
    .regex(/^\d{1,6}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(20),
});

const StartBodySchema = z.strictObject({ inputData: z.record(z.string(), z.unknown()) });

export type WorkflowRunRouteDeps = {
  readonly access: AccessPort;
  /** Settles the approval request of a cancelled run (follow-up 82). */
  readonly approvals: Pick<WorkflowApprovalPort, "cancelWorkflowApproval">;
  readonly catalog: WorkflowCatalog;
  readonly logger: Pick<Logger, "info" | "error">;
};

type WorkflowsStore = {
  readonly listWorkflowRuns: (args: {
    workflowName?: string;
    status?: string;
    perPage?: number;
    page?: number;
  }) => Promise<{ runs: StoredRun[] }>;
  readonly getWorkflowRunById: (args: { runId: string }) => Promise<StoredRun | null>;
};

const storeOf = async (mastra: Mastra): Promise<WorkflowsStore> => {
  const store = (await mastra.getStorage()?.getStore("workflows")) as WorkflowsStore | undefined;
  if (store === undefined) throw new Error("workflow storage unavailable");
  return store;
};

/** The tenant's runs, newest first; the cursor is an offset into that list. */
const listTenantRuns = async (mastra: Mastra, tenantId: string, query: z.infer<typeof ListQuerySchema>) => {
  const store = await storeOf(mastra);
  const offset = Number(query.cursor ?? "0");
  const matches: StoredRun[] = [];
  for (let page = 0; page < SCAN_PAGES && matches.length < offset + query.limit + 1; page += 1) {
    const { runs } = await store.listWorkflowRuns({
      ...(query.workflowId === undefined ? {} : { workflowName: query.workflowId }),
      ...(query.status === undefined ? {} : { status: query.status }),
      perPage: SCAN_PAGE,
      page,
    });
    matches.push(...runs.filter((run) => isTenantRun(run, tenantId)));
    if (runs.length < SCAN_PAGE) break;
  }
  const window = matches.slice(offset, offset + query.limit + 1);
  const hasMore = window.length > query.limit;
  const views = window.slice(0, query.limit).flatMap((run) => toWorkflowRunView(run) ?? []);
  return { views, page: { cursor: hasMore ? String(offset + query.limit) : null, hasMore, limit: query.limit } };
};

/** A run of the caller's tenant; another tenant's run reads as not found. */
const tenantRunOf = async (mastra: Mastra, tenantId: string, runId: string): Promise<StoredRun | null> => {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(runId)) return null;
  const run = await (await storeOf(mastra)).getWorkflowRunById({ runId });
  return run !== null && isTenantRun(run, tenantId) ? run : null;
};

const guarded =
  (deps: WorkflowRunRouteDeps, event: string, handle: (inputs: RouteInputs) => Promise<Response>) =>
  async (inputs: RouteInputs) => {
    try {
      return await handle(inputs);
    } catch (error: unknown) {
      deps.logger.error(event, { requestId: inputs.requestContext.get("requestId"), err: error });
      return routeError("INTERNAL_ERROR", inputs.requestContext);
    }
  };

export const handleListRuns = (deps: WorkflowRunRouteDeps, url: string) =>
  guarded(deps, "workflow_runs_list_failed", async ({ mastra, requestContext }) => {
    const caller = await authorizeCaller({
      access: deps.access,
      requestContext,
      permission: WORKFLOW_RUN_PERMISSIONS.read,
    });
    if (!caller.ok) return caller.response;
    const query = ListQuerySchema.safeParse(Object.fromEntries(new URL(url).searchParams));
    if (!query.success)
      return routeError(
        "VALIDATION_FAILED",
        requestContext,
        query.error.issues.map((issue) => ({
          field: issue.path.map(String).join("."),
          issue: issue.code.toUpperCase(),
        })),
      );
    const { views, page } = await listTenantRuns(mastra, caller.data.context.tenantId, query.data);
    return dataJson(views, { meta: { page } });
  });

export const handleGetRun = (deps: WorkflowRunRouteDeps, runId: string, view: "run" | "events") =>
  guarded(deps, "workflow_run_read_failed", async ({ mastra, requestContext }) => {
    const caller = await authorizeCaller({
      access: deps.access,
      requestContext,
      permission: WORKFLOW_RUN_PERMISSIONS.read,
    });
    if (!caller.ok) return caller.response;
    const run = await tenantRunOf(mastra, caller.data.context.tenantId, runId);
    const data =
      run === null
        ? null
        : view === "run"
          ? toWorkflowRunView(run)
          : { run: toWorkflowRunView(run), events: eventsOfRun(run) };
    return data === null ? routeError("NOT_FOUND", requestContext) : dataJson(data);
  });

export const handleCancelRun = (deps: WorkflowRunRouteDeps, runId: string) =>
  guarded(deps, "workflow_run_cancel_failed", async ({ mastra, requestContext }) => {
    const caller = await authorizeCaller({
      access: deps.access,
      requestContext,
      permission: WORKFLOW_RUN_PERMISSIONS.cancel,
    });
    if (!caller.ok) return caller.response;
    const run = await tenantRunOf(mastra, caller.data.context.tenantId, runId);
    if (run === null) return routeError("NOT_FOUND", requestContext);
    const requestId = String(requestContext.get("requestId") ?? runId);
    const { approvalRequestCancelled } = await cancelStoredRun(mastra, run, {
      approvals: deps.approvals,
      requestId,
      logger: deps.logger,
    });
    deps.logger.info("workflow_run_canceled", {
      requestId,
      runId,
      workflowId: run.workflowName,
      approvalRequestCancelled,
    });
    return new Response(null, { status: 204 });
  });

/** Starts a startable workflow as the caller (resource `tenantId:uid`) without waiting: 202 `{ runId }`. */
export const handleStartRun = (deps: WorkflowRunRouteDeps, workflowId: string, readBody: () => Promise<unknown>) =>
  guarded(deps, "workflow_run_start_failed", async ({ mastra, requestContext }) => {
    const caller = await authorizeCaller({
      access: deps.access,
      requestContext,
      permission: WORKFLOW_RUN_PERMISSIONS.start,
    });
    if (!caller.ok) return caller.response;
    const policy = deps.catalog.get(workflowId);
    if (policy === undefined) return routeError("NOT_FOUND", requestContext);
    if (!policy.startable) return routeError("WORKFLOW_NOT_STARTABLE", requestContext);
    const body = StartBodySchema.safeParse(await readBody().catch(() => undefined));
    if (!body.success)
      return routeError("VALIDATION_FAILED", requestContext, [{ field: "inputData", issue: "INVALID" }]);
    const workflow = mastra.getWorkflow(workflowId);
    const valid = await validateWorkflowInput(workflow.inputSchema, body.data.inputData);
    if (!valid.ok) return routeError("VALIDATION_FAILED", requestContext, valid.details);
    const { context } = caller.data;
    const run = await workflow.createRun({ resourceId: `${context.tenantId}:${context.userId}` });
    // Not awaited: the caller follows the run through the progress stream.
    run.start({ inputData: body.data.inputData, requestContext }).catch((error: unknown) => {
      deps.logger.error("workflow_run_failed", {
        requestId: context.requestId,
        runId: run.runId,
        workflowId,
        err: error,
      });
    });
    deps.logger.info("workflow_run_started", { requestId: context.requestId, runId: run.runId, workflowId });
    return dataJson({ runId: run.runId }, { status: 202 });
  });

/**
 * `GET /workflow-runs`, `GET /workflow-runs/:runId`, `GET /workflow-runs/:runId/events`,
 * `POST /workflow-runs/:runId/cancel` and `POST /workflow-runs/start/:workflowId`: all require
 * Mastra auth, read the tenant from the verified context and answer another tenant's run as 404.
 */
export const createWorkflowRunRoutes = (deps: WorkflowRunRouteDeps): ApiRoute[] => [
  registerApiRoute(WORKFLOW_RUNS_PATH, {
    method: "GET",
    requiresAuth: true,
    handler: (c) => handleListRuns(deps, c.req.url)(inputsOf(c)),
  }),
  registerApiRoute(WORKFLOW_RUN_START_PATH, {
    method: "POST",
    requiresAuth: true,
    handler: (c) => handleStartRun(deps, c.req.param("workflowId"), () => c.req.json())(inputsOf(c)),
  }),
  registerApiRoute("/workflow-runs/:runId", {
    method: "GET",
    requiresAuth: true,
    handler: (c) => handleGetRun(deps, c.req.param("runId"), "run")(inputsOf(c)),
  }),
  registerApiRoute("/workflow-runs/:runId/events", {
    method: "GET",
    requiresAuth: true,
    handler: (c) => handleGetRun(deps, c.req.param("runId"), "events")(inputsOf(c)),
  }),
  registerApiRoute("/workflow-runs/:runId/cancel", {
    method: "POST",
    requiresAuth: true,
    handler: (c) => handleCancelRun(deps, c.req.param("runId"))(inputsOf(c)),
  }),
];
