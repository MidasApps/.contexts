import { adminListStaffEndpoint, adminRevokeStaffEndpoint, adminSetStaffRoleEndpoint } from "@core/contracts";
import { requireStaff } from "#/services/platform/adapters/driving/console-guards.ts";
import { apiError, dataResponse, noContentResponse } from "#/services/shared/http/api-errors.ts";
import { type ApiRouteDeps, withApiRoute } from "#/services/shared/http/api-route.ts";
import type { RouteHandler } from "#/services/shared/http/route-boundary.ts";
import type { StaffChangeError } from "../../application/use-cases/manage-platform-staff.ts";
import type { PlatformServices } from "../../platform-composition.ts";

const STAFF_MANAGE = "platform.staff.manage";

export type AdminStaffRouteDeps = {
  readonly pipeline: ApiRouteDeps;
  readonly platform: Pick<PlatformServices, "listPlatformStaff" | "setPlatformStaffRole" | "revokePlatformStaff">;
};

const refusal = (error: StaffChangeError, requestId: string): Response =>
  error.code === "NOT_FOUND" ? apiError(404, "NOT_FOUND", requestId) : apiError(422, "STAFF_SELF_CHANGE", requestId);

/**
 * `/v1/admin/staff` (decision 0075): platform admins (`platform.staff.manage`, MFA) list the staff,
 * grant or change a role and revoke, never their own record. `requireStaff` runs first.
 */
export const buildAdminStaffRoutes = (deps: AdminStaffRouteDeps): Record<string, RouteHandler> => ({
  [adminListStaffEndpoint.id]: withApiRoute(adminListStaffEndpoint, deps.pipeline, async (ctx) => {
    const denied = await requireStaff(ctx, { permission: STAFF_MANAGE });
    return denied ?? dataResponse({ data: await deps.platform.listPlatformStaff() });
  }),
  [adminSetStaffRoleEndpoint.id]: withApiRoute(adminSetStaffRoleEndpoint, deps.pipeline, async (ctx) => {
    const denied = await requireStaff(ctx, { permission: STAFF_MANAGE });
    if (denied !== null) return denied;
    if (ctx.principal.type !== "user") return apiError(403, "FORBIDDEN", ctx.requestId);
    const result = await deps.platform.setPlatformStaffRole({
      actor: ctx.principal,
      userId: ctx.input.params.userId,
      role: ctx.input.body.role,
      requestId: ctx.requestId,
    });
    return result.ok ? dataResponse({ data: result.data }) : refusal(result.error, ctx.requestId);
  }),
  [adminRevokeStaffEndpoint.id]: withApiRoute(adminRevokeStaffEndpoint, deps.pipeline, async (ctx) => {
    const denied = await requireStaff(ctx, { permission: STAFF_MANAGE });
    if (denied !== null) return denied;
    if (ctx.principal.type !== "user") return apiError(403, "FORBIDDEN", ctx.requestId);
    const result = await deps.platform.revokePlatformStaff({
      actor: ctx.principal,
      userId: ctx.input.params.userId,
      requestId: ctx.requestId,
    });
    return result.ok ? noContentResponse() : refusal(result.error, ctx.requestId);
  }),
});
