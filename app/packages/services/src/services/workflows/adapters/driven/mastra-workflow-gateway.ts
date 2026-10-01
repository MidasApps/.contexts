import { ScheduleSchema, WorkflowEventSchema, WorkflowRunSchema } from "@core/contracts";
import { z } from "zod";
import type { AgentCallScope } from "../../../agents/application/ports/agent-runtime-gateway.ts";
import { mapMastraStatus, UPSTREAM_TIMEOUT, UPSTREAM_UNAVAILABLE } from "../../../agents/adapters/driven/mastra-error-mapper.ts";
import { buildForwardedHeaders, type MastraConnection } from "../../../agents/adapters/driven/mastra-request.ts";
import type { ServerlessIdTokenSource } from "../../../agents/adapters/driven/serverless-id-token.ts";
import type { WorkflowGatewayError, WorkflowGatewayResult, WorkflowRuntimeGateway } from "../../application/ports/workflow-runtime-gateway.ts";

export const DEFAULT_WORKFLOW_GATEWAY_TIMEOUT_MS = 30_000;

/** Codes of our own Mastra routes that reach `/v1` as they are (`workflow-route-http.ts`). */
const PASSED_CODES = new Set(["VALIDATION_FAILED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "WORKFLOW_NOT_STARTABLE", "WORKFLOW_NOT_SCHEDULABLE", "SCHEDULE_INTERVAL_TOO_SHORT"]);

const ErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    details: z.array(z.object({ field: z.string().max(200), issue: z.string().max(100) })).max(100).optional(),
  }),
});

const PageSchema = z.object({ cursor: z.string().nullable(), hasMore: z.boolean(), limit: z.number().int() });
const RunListSchema = z.object({ data: z.array(WorkflowRunSchema), meta: z.object({ page: PageSchema }) });
const RunSchema = z.object({ data: WorkflowRunSchema });
const EventsSchema = z.object({ data: z.object({ run: WorkflowRunSchema, events: z.array(WorkflowEventSchema) }) });
const StartedSchema = z.object({ data: z.object({ runId: z.string().min(1) }) });
const ScheduleListSchema = z.object({ data: z.array(ScheduleSchema) });
const ScheduleOneSchema = z.object({ data: ScheduleSchema });
const ScheduleActedSchema = z.object({ data: z.union([ScheduleSchema, z.object({ scheduleId: z.string().min(1) })]) });

export type MastraWorkflowGatewayOptions = {
  readonly baseUrl: string;
  readonly serverlessToken: ServerlessIdTokenSource | null;
  readonly timeoutMs?: number;
  /** Test seam; defaults to the global `fetch`. */
  readonly fetch?: typeof fetch;
};

type Call = { readonly method: "GET" | "POST" | "PATCH" | "DELETE"; readonly path: string; readonly body?: unknown };

// Our routes answer the api.md envelope; an allowlisted code keeps its status and details.
const errorOf = async (response: Response): Promise<WorkflowGatewayError> => {
  const mapped = mapMastraStatus(response.status, response.headers.get("retry-after"));
  if (response.status < 400 || response.status >= 500) return mapped;
  const parsed = ErrorBodySchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success || !PASSED_CODES.has(parsed.data.error.code)) return mapped;
  const { code, details } = parsed.data.error;
  return { code, status: response.status, ...(details === undefined ? {} : { details }) };
};

const segment = (value: string): string => encodeURIComponent(value);

/**
 * `WorkflowRuntimeGateway` over the SP5 custom Mastra routes, with the caller's own Bearer and
 * the `/v1` scope as headers (`buildForwardedHeaders`). A body that does not fit the contract is
 * `UPSTREAM_UNAVAILABLE`; network errors and timeouts never surface as they are.
 */
export const createMastraWorkflowGateway = (options: MastraWorkflowGatewayOptions): WorkflowRuntimeGateway => {
  const connection: MastraConnection = {
    baseUrl: options.baseUrl.replace(/\/+$/, ""),
    apiPrefix: "",
    fetch: options.fetch ?? fetch,
    timeouts: { jsonMs: options.timeoutMs ?? DEFAULT_WORKFLOW_GATEWAY_TIMEOUT_MS, streamConnectMs: options.timeoutMs ?? DEFAULT_WORKFLOW_GATEWAY_TIMEOUT_MS },
    serverlessToken: options.serverlessToken,
  };
  const send = async <T>(scope: AgentCallScope, call: Call, schema: z.ZodType<T> | null): Promise<WorkflowGatewayResult<T>> => {
    const deadline = AbortSignal.timeout(connection.timeouts.jsonMs);
    const signal = scope.signal === undefined ? deadline : AbortSignal.any([deadline, scope.signal]);
    try {
      const headers = { ...(await buildForwardedHeaders(connection, scope)), ...(call.body === undefined ? {} : { "content-type": "application/json" }) };
      const init = { method: call.method, headers, signal, ...(call.body === undefined ? {} : { body: JSON.stringify(call.body) }) };
      const response = await connection.fetch(`${connection.baseUrl}${call.path}`, init);
      if (!response.ok) return { ok: false, error: await errorOf(response) };
      if (schema === null) {
        await response.body?.cancel();
        return { ok: true, data: null as T };
      }
      const parsed = schema.safeParse(await response.json());
      return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: UPSTREAM_UNAVAILABLE };
    } catch (error: unknown) {
      if (scope.signal?.aborted === true) throw scope.signal.reason ?? error;
      return { ok: false, error: deadline.aborted ? UPSTREAM_TIMEOUT : UPSTREAM_UNAVAILABLE };
    }
  };
  const map = async <T, U>(result: Promise<WorkflowGatewayResult<T>>, pick: (value: T) => U): Promise<WorkflowGatewayResult<U>> => {
    const resolved = await result;
    return resolved.ok ? { ok: true, data: pick(resolved.data) } : resolved;
  };
  return {
    listRuns: (scope, query) => {
      const params = new URLSearchParams({ limit: String(query.limit) });
      for (const [key, value] of [["workflowId", query.workflowId], ["status", query.status], ["cursor", query.cursor]] as const) if (value !== undefined) params.set(key, value);
      return map(send(scope, { method: "GET", path: `/workflow-runs?${params.toString()}` }, RunListSchema), (body) => ({ runs: body.data, page: body.meta.page }));
    },
    getRun: (scope, runId) => map(send(scope, { method: "GET", path: `/workflow-runs/${segment(runId)}` }, RunSchema), (body) => body.data),
    getRunEvents: (scope, runId) => map(send(scope, { method: "GET", path: `/workflow-runs/${segment(runId)}/events` }, EventsSchema), (body) => body.data),
    cancelRun: (scope, runId) => send(scope, { method: "POST", path: `/workflow-runs/${segment(runId)}/cancel` }, null),
    startRun: (scope, input) =>
      map(send(scope, { method: "POST", path: `/workflow-runs/start/${segment(input.workflowId)}`, body: { inputData: input.inputData } }, StartedSchema), (body) => body.data),
    listSchedules: (scope) => map(send(scope, { method: "GET", path: "/tenant-schedules" }, ScheduleListSchema), (body) => body.data),
    getSchedule: (scope, id) => map(send(scope, { method: "GET", path: `/tenant-schedules/${segment(id)}` }, ScheduleOneSchema), (body) => body.data),
    createSchedule: (scope, input) => map(send(scope, { method: "POST", path: "/tenant-schedules", body: input }, ScheduleOneSchema), (body) => body.data),
    updateSchedule: (scope, id, input) => map(send(scope, { method: "PATCH", path: `/tenant-schedules/${segment(id)}`, body: input }, ScheduleOneSchema), (body) => body.data),
    actOnSchedule: (scope, id, action) => map(send(scope, { method: "POST", path: `/tenant-schedules/${segment(id)}/${action}` }, ScheduleActedSchema), (body) => body.data),
    deleteSchedule: (scope, id) => send(scope, { method: "DELETE", path: `/tenant-schedules/${segment(id)}` }, null),
  };
};
