import {
  addEvalDatasetItemEndpoint,
  adminGetExperimentEndpoint,
  adminGetTraceEndpoint,
  adminListDatasetsEndpoint,
  adminListExperimentsEndpoint,
  adminListTracesEndpoint,
  createEvalDatasetEndpoint,
  deleteEvalDatasetItemEndpoint,
  getEvalExperimentEndpoint,
  getTraceEndpoint,
  listEvalDatasetItemsEndpoint,
  listEvalDatasetsEndpoint,
  listEvalExperimentsEndpoint,
  listTracesEndpoint,
  startEvalExperimentEndpoint,
} from "@core/contracts";
import { requireStaff, requireTenant } from "../../../platform/adapters/driving/console-guards.ts";
import { apiError, dataResponse, noContentResponse } from "../../../shared/http/api-errors.ts";
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

const answer = <T>(result: ConsoleResult<T>, requestId: string, body: (data: T) => { data: unknown; meta?: unknown }, status: 200 | 201 | 202 = 200): Response =>
  result.ok ? dataResponse(body(result.data), { status }) : errorResponse(result.error, requestId);

type TraceListQuery = {
  agentId?: string | undefined;
  status?: "ok" | "error" | undefined;
  startedAfter?: string | undefined;
  startedBefore?: string | undefined;
  page: number;
  perPage: number;
};

const filtersOf = (query: TraceListQuery) => ({
  page: query.page,
  perPage: query.perPage,
  ...(query.agentId === undefined ? {} : { agentId: query.agentId }),
  ...(query.status === undefined ? {} : { status: query.status }),
  ...(query.startedAfter === undefined ? {} : { startedAfter: query.startedAfter }),
  ...(query.startedBefore === undefined ? {} : { startedBefore: query.startedBefore }),
});

// An empty or inverted range is a client mistake, told as one (never a silently empty list).
const invalidRange = (query: TraceListQuery, requestId: string): Response | null =>
  query.startedAfter !== undefined && query.startedBefore !== undefined && Date.parse(query.startedAfter) >= Date.parse(query.startedBefore)
    ? apiError(400, "VALIDATION_FAILED", requestId, [{ field: "startedBefore", issue: "NOT_AFTER_START" }])
    : null;

/**
 * `/v1/traces` (tenant: the organization of the call, never one the query names) and
 * `/v1/admin/traces` (staff, `platform.trace.read`, optional organization filter), decision 0040.
 * Both take a time range (`startedAfter`, `startedBefore`) and carry the ledger's cost (decision 0044).
 */
const buildTraceRoutes = (deps: { readonly pipeline: ApiRouteDeps; readonly observability: ObservabilityServices }): Record<string, RouteHandler> => ({
  [listTracesEndpoint.id]: withApiRoute(listTracesEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = await requireTenant(ctx, { organizationId: ctx.input.query.organizationId, permission: OBSERVABILITY_PERMISSIONS.traceRead });
    if (tenantId instanceof Response) return tenantId;
    const invalid = invalidRange(ctx.input.query, ctx.requestId);
    if (invalid !== null) return invalid;
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
    const invalid = invalidRange(ctx.input.query, ctx.requestId);
    if (invalid !== null) return invalid;
    const result = await deps.observability.listTraces({ tenantId, ...filtersOf(ctx.input.query) });
    return answer(result, ctx.requestId, (data) => ({ data: data.traces, meta: { hasMore: data.hasMore } }));
  }),
  [adminGetTraceEndpoint.id]: withApiRoute(adminGetTraceEndpoint, deps.pipeline, async (ctx) => {
    const denied = await requireStaff(ctx, { permission: OBSERVABILITY_PERMISSIONS.platformTraces });
    return denied ?? answer(await deps.observability.getTrace({ traceId: ctx.input.params.traceId, tenantId: null }), ctx.requestId, (data) => ({ data }));
  }),
});

/**
 * `/v1/evals/*` (the organization's datasets and experiments) and `/v1/admin/datasets|experiments`
 * (staff). One experiment by id lets a comparison span list pages (decision 0049).
 */
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
  [getEvalExperimentEndpoint.id]: withApiRoute(getEvalExperimentEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = await requireTenant(ctx, { organizationId: ctx.input.query.organizationId, permission: OBSERVABILITY_PERMISSIONS.evalRead });
    if (tenantId instanceof Response) return tenantId;
    return answer(await deps.observability.getExperiment({ experimentId: ctx.input.params.experimentId, tenantId }), ctx.requestId, (data) => ({ data }));
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
  [adminGetExperimentEndpoint.id]: withApiRoute(adminGetExperimentEndpoint, deps.pipeline, async (ctx) => {
    const denied = await requireStaff(ctx, { permission: OBSERVABILITY_PERMISSIONS.platformEvals });
    return denied ?? answer(await deps.observability.getExperiment({ experimentId: ctx.input.params.experimentId, tenantId: null }), ctx.requestId, (data) => ({ data }));
  }),
});

/**
 * `/v1/evals/datasets[/{datasetId}/items[/{itemId}]]`: an organization creates datasets and manages
 * their items (follow-up 66, decision 0062). The tenant is always the authorized organization;
 * reading needs `core.eval.read`, every change `core.eval.write`.
 */
const buildDatasetItemRoutes = (deps: { readonly pipeline: ApiRouteDeps; readonly observability: ObservabilityServices }): Record<string, RouteHandler> => ({
  [createEvalDatasetEndpoint.id]: withApiRoute(createEvalDatasetEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = await requireTenant(ctx, { organizationId: ctx.input.query.organizationId, permission: OBSERVABILITY_PERMISSIONS.evalWrite });
    if (tenantId instanceof Response) return tenantId;
    return answer(await deps.observability.createDataset({ tenantId, name: ctx.input.body.name }), ctx.requestId, (data) => ({ data }), 201);
  }),
  [listEvalDatasetItemsEndpoint.id]: withApiRoute(listEvalDatasetItemsEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = await requireTenant(ctx, { organizationId: ctx.input.query.organizationId, permission: OBSERVABILITY_PERMISSIONS.evalRead });
    if (tenantId instanceof Response) return tenantId;
    const result = await deps.observability.listDatasetItems({ tenantId, datasetId: ctx.input.params.datasetId, page: ctx.input.query.page, perPage: ctx.input.query.perPage });
    return answer(result, ctx.requestId, (data) => ({ data: data.items, meta: { hasMore: data.hasMore } }));
  }),
  [addEvalDatasetItemEndpoint.id]: withApiRoute(addEvalDatasetItemEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = await requireTenant(ctx, { organizationId: ctx.input.query.organizationId, permission: OBSERVABILITY_PERMISSIONS.evalWrite });
    if (tenantId instanceof Response) return tenantId;
    const { input, expectedOutput } = ctx.input.body;
    const result = await deps.observability.addDatasetItem({ tenantId, datasetId: ctx.input.params.datasetId, input, ...(expectedOutput === undefined ? {} : { expectedOutput }) });
    return answer(result, ctx.requestId, (data) => ({ data }), 201);
  }),
  [deleteEvalDatasetItemEndpoint.id]: withApiRoute(deleteEvalDatasetItemEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = await requireTenant(ctx, { organizationId: ctx.input.query.organizationId, permission: OBSERVABILITY_PERMISSIONS.evalWrite });
    if (tenantId instanceof Response) return tenantId;
    const result = await deps.observability.deleteDatasetItem({ tenantId, datasetId: ctx.input.params.datasetId, itemId: ctx.input.params.itemId });
    return result.ok ? noContentResponse() : errorResponse(result.error, ctx.requestId);
  }),
});

export const buildObservabilityRoutes = (deps: { readonly pipeline: ApiRouteDeps; readonly observability: ObservabilityServices }): Record<string, RouteHandler> => ({
  ...buildTraceRoutes(deps),
  ...buildEvalRoutes(deps),
  ...buildDatasetItemRoutes(deps),
});
