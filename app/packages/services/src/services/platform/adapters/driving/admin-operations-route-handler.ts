import {
  adminCancelWorkflowRunEndpoint,
  adminListConnectorsEndpoint,
  adminListSchedulesEndpoint,
  adminListWorkflowRunsEndpoint,
  adminPauseScheduleEndpoint,
  adminResumeScheduleEndpoint,
  adminRunScheduleNowEndpoint,
  type AuditAction,
  type Connector,
  type TenantId,
} from "@core/contracts";
import { auditActorOf } from "../../../audit/domain/audit-actor.ts";
import { apiError, dataResponse, noContentResponse } from "../../../shared/http/api-errors.ts";
import { invalidCursorResponse, listResponse, pageRequestOf } from "../../../shared/http/api-list.ts";
import { withApiRoute, type ApiRouteDeps } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import type { Page, PageRequest } from "../../../shared/pagination/page.ts";
import type { OperationsError, OperationsGateway, ScheduleAction } from "../../application/ports/operations-gateway.ts";
import { type GuardContext, requireStaff } from "./console-guards.ts";

/** `platform.*` permissions of the staff operations (SP5 spec §2.1). */
export const OPERATIONS_PERMISSIONS = { workflows: "platform.workflow.manage", connectors: "platform.connector.read" } as const;

export type AdminOperationsRouteDeps = {
  readonly pipeline: ApiRouteDeps;
  readonly operations: OperationsGateway;
  /** Connectors of one organization, newest first (the connectors repository; never a secret). */
  readonly listConnectors: (args: { tenantId: TenantId; page: PageRequest }) => Promise<Page<Connector>>;
};

const failed = (error: OperationsError, requestId: string): Response => apiError(error.status, error.code, requestId);

const SCHEDULE_AUDIT: Readonly<Record<ScheduleAction, AuditAction>> = { pause: "SCHEDULE_PAUSED", resume: "SCHEDULE_RESUMED", run: "SCHEDULE_RUN_REQUESTED" };

// Every staff mutation is on the platform log, with the tenant it touched when there is one.
const recordStaffAction = (ctx: GuardContext, args: { action: AuditAction; target: { type: string; id: string }; tenantId: string | null }): Promise<unknown> =>
  ctx.audit.record({
    log: "platform",
    action: args.action,
    actor: auditActorOf(ctx.principal),
    target: args.target,
    ...(args.tenantId === null ? {} : { targetTenantId: args.tenantId as TenantId }),
    outcome: "success",
    requestId: ctx.requestId,
  });

const buildRunRoutes = (deps: AdminOperationsRouteDeps): Record<string, RouteHandler> => ({
  [adminListWorkflowRunsEndpoint.id]: withApiRoute(adminListWorkflowRunsEndpoint, deps.pipeline, async (ctx) => {
    const { organizationId, workflowId, status, cursor, limit } = ctx.input.query;
    const denied = await requireStaff(ctx, { permission: OPERATIONS_PERMISSIONS.workflows, ...(organizationId === undefined ? {} : { targetTenantId: organizationId }) });
    if (denied !== null) return denied;
    const result = await deps.operations.listRuns({ tenantId: organizationId ?? null, workflowId, status, cursor, limit });
    return result.ok ? dataResponse({ data: result.data.runs, meta: { page: result.data.page } }) : failed(result.error, ctx.requestId);
  }),
  [adminCancelWorkflowRunEndpoint.id]: withApiRoute(adminCancelWorkflowRunEndpoint, deps.pipeline, async (ctx) => {
    const denied = await requireStaff(ctx, { permission: OPERATIONS_PERMISSIONS.workflows });
    if (denied !== null) return denied;
    const result = await deps.operations.cancelRun({ runId: ctx.input.params.runId, requestId: ctx.requestId });
    if (!result.ok) return failed(result.error, ctx.requestId);
    await recordStaffAction(ctx, { action: "WORKFLOW_RUN_CANCELED", target: { type: "workflow-run", id: result.data.runId }, tenantId: result.data.tenantId });
    return noContentResponse();
  }),
});

type ScheduleContext = GuardContext & { readonly input: { readonly params: { readonly scheduleId: string } } };

const actOnSchedule = async (deps: AdminOperationsRouteDeps, ctx: ScheduleContext, action: ScheduleAction): Promise<Response> => {
  const denied = await requireStaff(ctx, { permission: OPERATIONS_PERMISSIONS.workflows });
  if (denied !== null) return denied;
  const result = await deps.operations.actOnSchedule({ scheduleId: ctx.input.params.scheduleId, action, requestId: ctx.requestId });
  if (!result.ok) return failed(result.error, ctx.requestId);
  await recordStaffAction(ctx, { action: SCHEDULE_AUDIT[action], target: { type: "schedule", id: result.data.id }, tenantId: result.data.tenantId });
  return action === "run" ? dataResponse({ data: { scheduleId: result.data.id } }, { status: 202 }) : dataResponse({ data: result.data });
};

const buildScheduleRoutes = (deps: AdminOperationsRouteDeps): Record<string, RouteHandler> => ({
  [adminListSchedulesEndpoint.id]: withApiRoute(adminListSchedulesEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = ctx.input.query.organizationId ?? null;
    const denied = await requireStaff(ctx, { permission: OPERATIONS_PERMISSIONS.workflows, ...(tenantId === null ? {} : { targetTenantId: tenantId }) });
    if (denied !== null) return denied;
    const result = await deps.operations.listSchedules({ tenantId });
    return result.ok ? dataResponse({ data: result.data }) : failed(result.error, ctx.requestId);
  }),
  [adminPauseScheduleEndpoint.id]: withApiRoute(adminPauseScheduleEndpoint, deps.pipeline, (ctx) => actOnSchedule(deps, ctx, "pause")),
  [adminResumeScheduleEndpoint.id]: withApiRoute(adminResumeScheduleEndpoint, deps.pipeline, (ctx) => actOnSchedule(deps, ctx, "resume")),
  [adminRunScheduleNowEndpoint.id]: withApiRoute(adminRunScheduleNowEndpoint, deps.pipeline, (ctx) => actOnSchedule(deps, ctx, "run")),
});

const buildConnectorRoutes = (deps: AdminOperationsRouteDeps): Record<string, RouteHandler> => ({
  [adminListConnectorsEndpoint.id]: withApiRoute(adminListConnectorsEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = ctx.input.query.organizationId;
    const denied = await requireStaff(ctx, { permission: OPERATIONS_PERMISSIONS.connectors, ...(tenantId === undefined ? {} : { targetTenantId: tenantId }) });
    if (denied !== null) return denied;
    // Connectors are indexed per tenant; a cross-tenant list would need its own index (decision 0043).
    if (tenantId === undefined) return apiError(400, "VALIDATION_FAILED", ctx.requestId, [{ field: "organizationId", issue: "REQUIRED" }]);
    const page = pageRequestOf(ctx.input.query);
    if (page === null) return invalidCursorResponse(ctx.requestId);
    return listResponse(await deps.listConnectors({ tenantId, page }), page.limit);
  }),
});

/**
 * `/v1/admin` workflow runs, schedules and connectors (SP5 spec §6, decision 0043): every handler
 * first requires staff with MFA and the `platform.*` permission; cancel, pause, resume and
 * run-now are audited on the platform log with `targetTenantId` when the row is a tenant's.
 */
export const buildAdminOperationsRoutes = (deps: AdminOperationsRouteDeps): Record<string, RouteHandler> => ({
  ...buildRunRoutes(deps),
  ...buildScheduleRoutes(deps),
  ...buildConnectorRoutes(deps),
});
