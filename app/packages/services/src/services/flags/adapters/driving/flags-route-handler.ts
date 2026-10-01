import { listFlagsEndpoint, setTenantFlagEndpoint } from "@core/contracts";
import { requireTenant } from "../../../platform/adapters/driving/console-guards.ts";
import { apiError, dataResponse } from "../../../shared/http/api-errors.ts";
import { withApiRoute, type ApiRouteDeps } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import type { SetFlagError } from "../../application/use-cases/set-flag-value.ts";
import type { FlagsServices } from "../../composition.ts";

export const FLAG_PERMISSIONS = { read: "core.flag.read", write: "core.flag.write", manage: "platform.flag.manage" } as const;

/** 404 unknown flag, 403 not overridable by a tenant, 400 when the environment disables it. */
export const flagErrorResponse = (error: SetFlagError, requestId: string): Response => {
  if (error.code === "FLAG_NOT_FOUND") return apiError(404, "NOT_FOUND", requestId);
  if (error.code === "FLAG_NOT_OVERRIDABLE") return apiError(403, "FORBIDDEN", requestId);
  return apiError(400, "VALIDATION_FAILED", requestId, [{ field: "value", issue: "ENVIRONMENT_DISABLED" }]);
};

/**
 * `/v1/flags` (SP5 spec §5, `/settings/flags`): auth → validate → `core.flag.read|write` at the
 * organization of the call → the tenant-overridable flags and their override. The organization
 * comes from `?organizationId=` (or an API key's own one), never from the body.
 */
export const buildFlagsRoutes = (deps: { readonly pipeline: ApiRouteDeps; readonly flags: FlagsServices }): Record<string, RouteHandler> => ({
  [listFlagsEndpoint.id]: withApiRoute(listFlagsEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = await requireTenant(ctx, { organizationId: ctx.input.query.organizationId, permission: FLAG_PERMISSIONS.read });
    if (tenantId instanceof Response) return tenantId;
    return dataResponse({ data: await deps.flags.listFlags({ tenantId, tenantOverridableOnly: true }) });
  }),
  [setTenantFlagEndpoint.id]: withApiRoute(setTenantFlagEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = await requireTenant(ctx, { organizationId: ctx.input.query.organizationId, permission: FLAG_PERMISSIONS.write });
    if (tenantId instanceof Response) return tenantId;
    const result = await deps.flags.setFlagValue({
      actor: ctx.principal,
      by: "tenant",
      key: ctx.input.params.flagKey,
      value: ctx.input.body.value,
      tenantId,
      requestId: ctx.requestId,
    });
    return result.ok ? dataResponse({ data: result.data }) : flagErrorResponse(result.error, ctx.requestId);
  }),
});
