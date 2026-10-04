import { listAuditLogsEndpoint } from "@core/contracts";
import { deniedResponse, invalidCursorResponse, listResponse, pageRequestOf } from "../../../shared/http/api-list.ts";
import { type ApiRouteDeps, withApiRoute } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import type { AuditLogServices } from "../../composition.ts";

/** `GET /v1/organizations/{organizationId}/audit-logs` (SP1 spec §7.3, audit row): the SP5 audit viewer. */
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
});
