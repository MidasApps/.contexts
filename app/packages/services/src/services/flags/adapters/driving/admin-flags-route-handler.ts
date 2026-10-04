import { adminClearFlagOverrideEndpoint, adminListFlagsEndpoint, adminSetFlagEndpoint } from "@core/contracts";
import { requireStaff } from "../../../platform/adapters/driving/console-guards.ts";
import { apiError, dataResponse } from "../../../shared/http/api-errors.ts";
import { withApiRoute, type ApiRouteDeps } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import type { FlagsServices } from "../../composition.ts";
import { FLAG_PERMISSIONS, flagErrorResponse } from "./flags-route-handler.ts";

/**
 * `/v1/admin/flags` (SP5 spec §5, §6): staff with MFA (`platform.flag.manage`) list every flag
 * with values and expiry warnings, and set the environment value or an organization's override
 * (audited on the platform log with `targetTenantId`).
 */
export const buildAdminFlagsRoutes = (deps: { readonly pipeline: ApiRouteDeps; readonly flags: FlagsServices }): Record<string, RouteHandler> => ({
  [adminListFlagsEndpoint.id]: withApiRoute(adminListFlagsEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = ctx.input.query.organizationId ?? null;
    const denied = await requireStaff(ctx, { permission: FLAG_PERMISSIONS.manage, ...(tenantId === null ? {} : { targetTenantId: tenantId }) });
    if (denied !== null) return denied;
    return dataResponse({ data: await deps.flags.listFlags({ tenantId, tenantOverridableOnly: false }) });
  }),
  [adminSetFlagEndpoint.id]: withApiRoute(adminSetFlagEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = ctx.input.body.tenantId ?? null;
    const denied = await requireStaff(ctx, { permission: FLAG_PERMISSIONS.manage, ...(tenantId === null ? {} : { targetTenantId: tenantId }) });
    if (denied !== null) return denied;
    const result = await deps.flags.setFlagValue({
      actor: ctx.principal,
      by: "staff",
      key: ctx.input.params.flagKey,
      value: ctx.input.body.value,
      tenantId,
      requestId: ctx.requestId,
    });
    return result.ok ? dataResponse({ data: result.data }) : flagErrorResponse(result.error, ctx.requestId);
  }),
  [adminClearFlagOverrideEndpoint.id]: withApiRoute(adminClearFlagOverrideEndpoint, deps.pipeline, async (ctx) => {
    const { flagKey, organizationId } = ctx.input.params;
    const denied = await requireStaff(ctx, { permission: FLAG_PERMISSIONS.manage, targetTenantId: organizationId });
    if (denied !== null) return denied;
    const result = await deps.flags.clearFlagOverride({ actor: ctx.principal, by: "staff", key: flagKey, tenantId: organizationId, requestId: ctx.requestId });
    return result.ok ? dataResponse({ data: result.data }) : apiError(404, "NOT_FOUND", ctx.requestId);
  }),
});
