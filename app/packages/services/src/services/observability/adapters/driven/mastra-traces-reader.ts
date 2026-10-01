import { EvalDatasetSchema, EvalExperimentSummarySchema, FORWARDED_HEADERS, TraceDetailSchema, TraceSummarySchema } from "@core/contracts";
import { z } from "zod";
import type { ServerlessIdTokenSource } from "../../../agents/adapters/driven/serverless-id-token.ts";
import type { ConsoleError, ConsoleGateway, ConsoleResult } from "../../application/ports/console-gateway.ts";

const UNAVAILABLE: ConsoleError = { code: "UPSTREAM_UNAVAILABLE", status: 502 };

// Status-only mapping: an upstream error body is never read (like the Mastra gateway).
const errorOf = (status: number): ConsoleError =>
  status === 404 ? { code: "NOT_FOUND", status: 404 } : status === 403 ? { code: "FORBIDDEN", status: 403 } : status === 422 || status === 400 ? { code: "VALIDATION_FAILED", status: 400 } : UNAVAILABLE;

const paged = <S extends z.ZodType>(schema: S) => z.object({ data: z.array(schema), meta: z.object({ hasMore: z.boolean() }) });

/**
 * `ConsoleGateway` over the runtime's `/console/*` routes (decision 0040; the plan's "Mastra traces
 * reader" also covers experiments and datasets). Sends no user credential, only `X-Request-Id`
 * and, outside local, the serverless token: `/v1` already authorized the caller and fixes the tenant.
 * Every answer is parsed against the contracts; a malformed one is 502.
 */
export const createMastraConsoleGateway = (options: {
  readonly baseUrl: string;
  readonly serverlessToken: ServerlessIdTokenSource | null;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
}): ConsoleGateway => {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchFn = options.fetch ?? fetch;
  const call = async <S extends z.ZodType>(request: { method: "GET" | "POST"; path: string; query?: Record<string, string | number | undefined>; body?: unknown; requestId?: string }, schema: S): Promise<ConsoleResult<z.infer<S>>> => {
    const params = new URLSearchParams(Object.entries(request.query ?? {}).flatMap(([key, value]) => (value === undefined ? [] : [[key, String(value)] as [string, string]])));
    const url = `${baseUrl}/console${request.path}${params.size === 0 ? "" : `?${params.toString()}`}`;
    try {
      const headers: Record<string, string> = {
        ...(request.body === undefined ? {} : { "content-type": "application/json" }),
        ...(request.requestId === undefined ? {} : { [FORWARDED_HEADERS.requestId]: request.requestId }),
        ...(options.serverlessToken === null ? {} : { [FORWARDED_HEADERS.serverlessAuthorization]: await options.serverlessToken.headerValue() }),
      };
      const init: RequestInit = { method: request.method, headers, signal: AbortSignal.timeout(options.timeoutMs ?? 30_000), ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }) };
      const response = await fetchFn(url, init);
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
  const unwrapPage = <T>(result: ConsoleResult<{ data: T[]; meta: { hasMore: boolean } }>) => (result.ok ? { ok: true as const, data: { items: result.data.data, hasMore: result.data.meta.hasMore } } : result);
  return {
    listTraces: async (query) => {
      const result = unwrapPage(await call({ method: "GET", path: "/traces", query: { ...tenant(query.tenantId), page: query.page, perPage: query.perPage, agentId: query.agentId, status: query.status } }, paged(TraceSummarySchema)));
      return result.ok ? { ok: true, data: { traces: result.data.items, hasMore: result.data.hasMore } } : result;
    },
    getTrace: async (query) => {
      const result = await call({ method: "GET", path: `/traces/${encodeURIComponent(query.traceId)}`, query: tenant(query.tenantId) }, z.object({ data: TraceDetailSchema }));
      return result.ok ? { ok: true, data: result.data.data } : result;
    },
    listExperiments: async (query) => {
      const result = unwrapPage(await call({ method: "GET", path: "/experiments", query: { ...tenant(query.tenantId), page: query.page, perPage: query.perPage } }, paged(EvalExperimentSummarySchema)));
      return result.ok ? { ok: true, data: { experiments: result.data.items, hasMore: result.data.hasMore } } : result;
    },
    listDatasets: async (query) => {
      const result = await call({ method: "GET", path: "/datasets", query: tenant(query.tenantId) }, z.object({ data: z.array(EvalDatasetSchema) }));
      return result.ok ? { ok: true, data: result.data.data } : result;
    },
    startExperiment: async ({ requestId, ...body }) => {
      const result = await call({ method: "POST", path: "/experiments", body, requestId }, z.object({ data: z.object({ experimentId: z.string().min(1) }) }));
      return result.ok ? { ok: true, data: result.data.data } : result;
    },
    addFeedbackItem: async (body) => {
      const result = await call({ method: "POST", path: "/feedback-items", body }, z.object({ data: z.object({ datasetId: z.string().min(1), itemId: z.string().min(1) }) }));
      return result.ok ? { ok: true, data: result.data.data } : result;
    },
  };
};
