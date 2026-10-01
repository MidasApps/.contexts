import { adminEndImpersonationSessionEndpoint, adminListImpersonationSessionsEndpoint } from "@core/contracts";
import { requireStaff } from "../../../platform/adapters/driving/console-guards.ts";
import { apiError, noContentResponse } from "../../../shared/http/api-errors.ts";
import { invalidCursorResponse, listResponse, pageRequestOf } from "../../../shared/http/api-list.ts";
import { withApiRoute, type ApiRouteDeps } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import type { PlatformServices } from "../../platform-composition.ts";

/** `platform.*` permissions of the staff view of impersonation sessions (SP5 spec §2.1). */
export const IMPERSONATION_ADMIN_PERMISSIONS = { read: "platform.user.read", end: "platform.user.impersonate" } as const;

export type AdminImpersonationRouteDeps = {
  readonly pipeline: ApiRouteDeps;
  readonly platform: Pick<PlatformServices, "listImpersonationSessions" | "endImpersonationSession">;
};

/**
 * `/v1/admin/impersonation-sessions` (decision 0044): staff with MFA list every support access
 * session (`platform.user.read`) and end any of them (`platform.user.impersonate`, audited on the
 * platform and tenant logs). `requireStaff` runs first, so an impersonated token never gets here.
 */
export const buildAdminImpersonationRoutes = (deps: AdminImpersonationRouteDeps): Record<string, RouteHandler> => ({
  [adminListImpersonationSessionsEndpoint.id]: withApiRoute(adminListImpersonationSessionsEndpoint, deps.pipeline, async (ctx) => {
    const denied = await requireStaff(ctx, { permission: IMPERSONATION_ADMIN_PERMISSIONS.read });
    if (denied !== null) return denied;
    const page = pageRequestOf(ctx.input.query);
    if (page === null) return invalidCursorResponse(ctx.requestId);
    return listResponse(await deps.platform.listImpersonationSessions({ activeOnly: ctx.input.query.status === "active", page }), page.limit);
  }),
  [adminEndImpersonationSessionEndpoint.id]: withApiRoute(adminEndImpersonationSessionEndpoint, deps.pipeline, async (ctx) => {
    const denied = await requireStaff(ctx, { permission: IMPERSONATION_ADMIN_PERMISSIONS.end });
    if (denied !== null) return denied;
    const result = await deps.platform.endImpersonationSession({ actor: ctx.principal, sessionId: ctx.input.params.sessionId, requestId: ctx.requestId });
    return result.ok ? noContentResponse() : apiError(404, "NOT_FOUND", ctx.requestId);
  }),
});
