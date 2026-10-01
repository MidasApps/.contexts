import {
  adminGetTraceEndpoint,
  adminListDatasetsEndpoint,
  adminListExperimentsEndpoint,
  adminListTracesEndpoint,
  getTraceEndpoint,
  listEvalDatasetsEndpoint,
  listEvalExperimentsEndpoint,
  listTracesEndpoint,
  startEvalExperimentEndpoint,
} from "@core/contracts";
import { requireStaff, requireTenant } from "../../../platform/adapters/driving/console-guards.ts";
import { apiError, dataResponse } from "../../../shared/http/api-errors.ts";
import { withApiRoute, type ApiRouteDeps } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import type { ConsoleError, ConsoleResult } from "../../application/ports/console-gateway.ts";
import type { ObservabilityServices } from "../../composition.ts";

export const OBSERVABILITY_PERMISSIONS = {
  traceRead: "core.trace.read",
  evalRead: "core.eval.read",
  evalWrite: "core.eval.write",
  platformTraces: "platform.trace.read",
  platformEvals: "platform.eval.manage",
} as const;

const errorResponse = (error: ConsoleError, requestId: string): Response =>
  error.code === "AGENT_NOT_ENABLED" ? apiError(400, "VALIDATION_FAILED", requestId, [{ field: "agentId", issue: "AGENT_NOT_ENABLED" }]) : apiError(error.status, error.code, requestId);

const answer = <T>(result: ConsoleResult<T>, requestId: string, body: (data: T) => { data: unknown; meta?: unknown }, status: 200 | 202 = 200): Response =>
  result.ok ? dataResponse(body(result.data), { status }) : errorResponse(result.error, requestId);

const filtersOf = (query: { agentId?: string | undefined; status?: "ok" | "error" | undefined; page: number; perPage: number }) => ({
  page: query.page,
  perPage: query.perPage,
  ...(query.agentId === undefined ? {} : { agentId: query.agentId }),
  ...(query.status === undefined ? {} : { status: query.status }),
});

/**
 * `/v1/traces` (tenant: the organization of the call, never one the query names) and
 * `/v1/admin/traces` (staff, `platform.trace.read`, optional organization filter), decision 0040.
 */
const buildTraceRoutes = (deps: { readonly pipeline: ApiRouteDeps; readonly observability: ObservabilityServices }): Record<string, RouteHandler> => ({
  [listTracesEndpoint.id]: withApiRoute(listTracesEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = await requireTenant(ctx, { organizationId: ctx.input.query.organizationId, permission: OBSERVABILITY_PERMISSIONS.traceRead });
    if (tenantId instanceof Response) return tenantId;
    const result = await deps.observability.listTraces({ tenantId, ...filtersOf(ctx.input.query) });
    return answer(result, ctx.requestId, (data) => ({ data: data.traces, meta: { hasMore: data.hasMore } }));
  }),
  [getTraceEndpoint.id]: withApiRoute(getTraceEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = await requireTenant(ctx, { organizationId: ctx.input.query.organizationId, permission: OBSERVABILITY_PERMISSIONS.traceRead });
    if (tenantId instanceof Response) return tenantId;
    return answer(await deps.observability.getTrace({ traceId: ctx.input.params.traceId, tenantId }), ctx.requestId, (data) => ({ data }));
  }),
  [adminListTracesEndpoint.id]: withApiRoute(adminListTracesEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = ctx.input.query.organizationId ?? null;
    const denied = await requireStaff(ctx, { permission: OBSERVABILITY_PERMISSIONS.platformTraces, ...(tenantId === null ? {} : { targetTenantId: tenantId }) });
    if (denied !== null) return denied;
    const result = await deps.observability.listTraces({ tenantId, ...filtersOf(ctx.input.query) });
    return answer(result, ctx.requestId, (data) => ({ data: data.traces, meta: { hasMore: data.hasMore } }));
  }),
  [adminGetTraceEndpoint.id]: withApiRoute(adminGetTraceEndpoint, deps.pipeline, async (ctx) => {
    const denied = await requireStaff(ctx, { permission: OBSERVABILITY_PERMISSIONS.platformTraces });
    return denied ?? answer(await deps.observability.getTrace({ traceId: ctx.input.params.traceId, tenantId: null }), ctx.requestId, (data) => ({ data }));
  }),
});

/** `/v1/evals/*` (the organization's datasets and experiments) and `/v1/admin/datasets|experiments` (staff). */
const buildEvalRoutes = (deps: { readonly pipeline: ApiRouteDeps; readonly observability: ObservabilityServices }): Record<string, RouteHandler> => ({
  [listEvalDatasetsEndpoint.id]: withApiRoute(listEvalDatasetsEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = await requireTenant(ctx, { organizationId: ctx.input.query.organizationId, permission: OBSERVABILITY_PERMISSIONS.evalRead });
    return tenantId instanceof Response ? tenantId : answer(await deps.observability.listDatasets({ tenantId }), ctx.requestId, (data) => ({ data }));
  }),
  [listEvalExperimentsEndpoint.id]: withApiRoute(listEvalExperimentsEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = await requireTenant(ctx, { organizationId: ctx.input.query.organizationId, permission: OBSERVABILITY_PERMISSIONS.evalRead });
    if (tenantId instanceof Response) return tenantId;
    const result = await deps.observability.listExperiments({ tenantId, page: ctx.input.query.page, perPage: ctx.input.query.perPage });
    return answer(result, ctx.requestId, (data) => ({ data: data.experiments, meta: { hasMore: data.hasMore } }));
  }),
  [startEvalExperimentEndpoint.id]: withApiRoute(startEvalExperimentEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = await requireTenant(ctx, { organizationId: ctx.input.query.organizationId, permission: OBSERVABILITY_PERMISSIONS.evalWrite });
    if (tenantId instanceof Response) return tenantId;
    const result = await deps.observability.startExperiment({ actor: ctx.principal, tenantId, input: ctx.input.body, requestId: ctx.requestId });
    return answer(result, ctx.requestId, (data) => ({ data }), 202);
  }),
  [adminListDatasetsEndpoint.id]: withApiRoute(adminListDatasetsEndpoint, deps.pipeline, async (ctx) => {
    const denied = await requireStaff(ctx, { permission: OBSERVABILITY_PERMISSIONS.platformEvals });
    return denied ?? answer(await deps.observability.listDatasets({ tenantId: null }), ctx.requestId, (data) => ({ data }));
  }),
  [adminListExperimentsEndpoint.id]: withApiRoute(adminListExperimentsEndpoint, deps.pipeline, async (ctx) => {
    const denied = await requireStaff(ctx, { permission: OBSERVABILITY_PERMISSIONS.platformEvals });
    if (denied !== null) return denied;
    const result = await deps.observability.listExperiments({ tenantId: null, page: ctx.input.query.page, perPage: ctx.input.query.perPage });
    return answer(result, ctx.requestId, (data) => ({ data: data.experiments, meta: { hasMore: data.hasMore } }));
  }),
});

export const buildObservabilityRoutes = (deps: { readonly pipeline: ApiRouteDeps; readonly observability: ObservabilityServices }): Record<string, RouteHandler> => ({
  ...buildTraceRoutes(deps),
  ...buildEvalRoutes(deps),
});
