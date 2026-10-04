import { getUsageSummaryEndpoint } from "@core/contracts";
import { requireTenant } from "../../../platform/adapters/driving/console-guards.ts";
import { apiError, dataResponse } from "../../../shared/http/api-errors.ts";
import { type ApiRouteDeps, withApiRoute } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import type { GetUsageSummary } from "../../application/use-cases/get-usage-summary.ts";

export const USAGE_READ_PERMISSION = "core.usage.read";

/**
 * `GET /v1/usage` (SP5 spec §7, `/settings/usage`): the month usage of the organization of the
 * call against its caps. The tenant is the authorized organization, never a value from the query
 * alone: `requireTenant` checks `core.usage.read` there before the ledger is read.
 */
export const buildUsageRoutes = (deps: {
  readonly pipeline: ApiRouteDeps;
  readonly getUsageSummary: GetUsageSummary;
}): Record<string, RouteHandler> => ({
  [getUsageSummaryEndpoint.id]: withApiRoute(getUsageSummaryEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = await requireTenant(ctx, {
      organizationId: ctx.input.query.organizationId,
      permission: USAGE_READ_PERMISSION,
    });
    if (tenantId instanceof Response) return tenantId;
    const { month } = ctx.input.query;
    const summary = await deps.getUsageSummary({ tenantId, ...(month === undefined ? {} : { month }) });
    return summary.ok
      ? dataResponse({ data: summary.data })
      : apiError(400, "VALIDATION_FAILED", ctx.requestId, [...summary.error.details]);
  }),
});
