import {
  AdminAgentSchema,
  AdminScheduleSchema,
  AdminWorkflowRunSchema,
  FORWARDED_HEADERS,
  PageMetaSchema,
  PromptSeedSchema,
} from "@core/contracts";
import { z } from "zod";
import type { ServerlessIdTokenSource } from "../../../agents/adapters/driven/serverless-id-token.ts";
import type {
  OperationsError,
  OperationsGateway,
  OperationsResult,
} from "../../application/ports/operations-gateway.ts";

const UNAVAILABLE: OperationsError = { code: "UPSTREAM_UNAVAILABLE", status: 502 };

// Status-only mapping: an upstream error body is never read (like the console gateway).
const errorOf = (status: number): OperationsError =>
  status === 404
    ? { code: "NOT_FOUND", status: 404 }
    : status === 400 || status === 422
      ? { code: "VALIDATION_FAILED", status: 400 }
      : UNAVAILABLE;

const RunsSchema = z.object({ data: z.array(AdminWorkflowRunSchema), meta: z.object({ page: PageMetaSchema }) });
const RunSchema = z.object({ data: AdminWorkflowRunSchema });
const SchedulesSchema = z.object({ data: z.array(AdminScheduleSchema) });
const ScheduleSchema = z.object({ data: AdminScheduleSchema });
const AgentsSchema = z.object({ data: z.array(AdminAgentSchema) });
const SeedSchema = z.object({ data: PromptSeedSchema });

type Call = {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly query?: Record<string, string | number | undefined>;
  readonly requestId?: string;
};

/**
 * `OperationsGateway` over the runtime's `/console/workflow-runs`, `/console/schedules` and
 * `/console/agents` routes (decisions 0043 and 0044). Sends no user credential, only `X-Request-Id` and, outside local, the
 * serverless token: `/v1/admin` already required staff with MFA. Every answer is parsed against
 * the contracts; a malformed one is 502.
 */
export const createMastraOperationsGateway = (options: {
  readonly baseUrl: string;
  readonly serverlessToken: ServerlessIdTokenSource | null;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
}): OperationsGateway => {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchFn = options.fetch ?? fetch;
  const call = async <S extends z.ZodType>(request: Call, schema: S): Promise<OperationsResult<z.infer<S>>> => {
    const params = new URLSearchParams(
      Object.entries(request.query ?? {}).flatMap(([key, value]) =>
        value === undefined ? [] : [[key, String(value)] as [string, string]],
      ),
    );
    const url = `${baseUrl}/console${request.path}${params.size === 0 ? "" : `?${params.toString()}`}`;
    try {
      const headers: Record<string, string> = {
        ...(request.requestId === undefined ? {} : { [FORWARDED_HEADERS.requestId]: request.requestId }),
        ...(options.serverlessToken === null
          ? {}
          : { [FORWARDED_HEADERS.serverlessAuthorization]: await options.serverlessToken.headerValue() }),
      };
      const response = await fetchFn(url, {
        method: request.method,
        headers,
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        return { ok: false, error: errorOf(response.status) };
      }
      const parsed = schema.safeParse(await response.json());
      return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: UNAVAILABLE };
    } catch {
      return { ok: false, error: UNAVAILABLE };
    }
  };
  const tenant = (tenantId: string | null) => (tenantId === null ? {} : { tenantId });
  return {
    listRuns: async (query) => {
      const result = await call(
        {
          method: "GET",
          path: "/workflow-runs",
          query: {
            ...tenant(query.tenantId),
            workflowId: query.workflowId,
            status: query.status,
            cursor: query.cursor,
            limit: query.limit,
          },
        },
        RunsSchema,
      );
      return result.ok ? { ok: true, data: { runs: result.data.data, page: result.data.meta.page } } : result;
    },
    cancelRun: async ({ runId, requestId }) => {
      const result = await call(
        { method: "POST", path: `/workflow-runs/${encodeURIComponent(runId)}/cancel`, requestId },
        RunSchema,
      );
      return result.ok ? { ok: true, data: result.data.data } : result;
    },
    listSchedules: async (query) => {
      const result = await call({ method: "GET", path: "/schedules", query: tenant(query.tenantId) }, SchedulesSchema);
      return result.ok ? { ok: true, data: result.data.data } : result;
    },
    actOnSchedule: async ({ scheduleId, action, requestId }) => {
      const result = await call(
        { method: "POST", path: `/schedules/${encodeURIComponent(scheduleId)}/${action}`, requestId },
        ScheduleSchema,
      );
      return result.ok ? { ok: true, data: result.data.data } : result;
    },
    listAgents: async ({ requestId }) => {
      const result = await call({ method: "GET", path: "/agents", requestId }, AgentsSchema);
      return result.ok ? { ok: true, data: result.data.data } : result;
    },
    getPromptSeed: async ({ agentId, requestId }) => {
      const result = await call(
        { method: "GET", path: `/agents/${encodeURIComponent(agentId)}/prompt-seed`, requestId },
        SeedSchema,
      );
      return result.ok ? { ok: true, data: result.data.data } : result;
    },
  };
};
