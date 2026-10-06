import { listAuditLogsEndpoint, listPlatformAuditLogsEndpoint } from "@core/contracts";
import { requireStaff } from "#/services/platform/adapters/driving/console-guards.ts";
import { deniedResponse, invalidCursorResponse, listResponse, pageRequestOf } from "#/services/shared/http/api-list.ts";
import { type ApiRouteDeps, withApiRoute } from "#/services/shared/http/api-route.ts";
import type { RouteHandler } from "#/services/shared/http/route-boundary.ts";
import type { AuditLogServices } from "../../composition.ts";

/**
 * `GET /v1/organizations/{organizationId}/audit-logs` (SP1 spec §7.3, audit row): the tenant audit
 * viewer; `GET /v1/admin/audit-logs`: the platform log, staff with `platform.audit-log.read`
 * (decision 0075).
 */
export const buildAuditLogsRoutes = (deps: {
  pipeline: ApiRouteDeps;
  auditLogs: AuditLogServices;
}): Record<string, RouteHandler> => ({
  [listAuditLogsEndpoint.id]: withApiRoute(
    listAuditLogsEndpoint,
    deps.pipeline,
    async ({ principal, input, scope, requestId }) => {
      const page = pageRequestOf(input.query);
      if (page === null) return invalidCursorResponse(requestId);
      const { action, actorId, occurredAfter, occurredBefore } = input.query;
      const filters = { action, actorId, occurredAfter, occurredBefore };
      const result = await deps.auditLogs.listAuditLogs({
        actor: principal,
        access: scope,
        tenantId: input.params.organizationId,
        filters,
        page,
      });
      return result.ok ? listResponse(result.data, page.limit) : deniedResponse(result.error.reason, requestId);
    },
  ),
  [listPlatformAuditLogsEndpoint.id]: withApiRoute(listPlatformAuditLogsEndpoint, deps.pipeline, async (ctx) => {
    const denied = await requireStaff(ctx, { permission: "platform.audit-log.read" });
    if (denied !== null) return denied;
    const page = pageRequestOf(ctx.input.query);
    if (page === null) return invalidCursorResponse(ctx.requestId);
    const { action, organizationId } = ctx.input.query;
    return listResponse(
      await deps.auditLogs.listPlatformAuditLogs({ filters: { action, targetTenantId: organizationId }, page }),
      page.limit,
    );
  }),
});
