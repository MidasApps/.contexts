import {
  createPlanEndpoint,
  getAdminOverviewEndpoint,
  listOrganizationsAdminEndpoint,
  listPlansEndpoint,
  setOrganizationBudgetEndpoint,
  updateOrganizationAdminEndpoint,
  updatePlanEndpoint,
} from "@core/contracts";
import { apiError, dataResponse } from "../../../shared/http/api-errors.ts";
import { invalidCursorResponse, listResponse, pageRequestOf } from "../../../shared/http/api-list.ts";
import { withApiRoute, type ApiRouteDeps } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";
import type { OrganizationAdminError } from "../../application/use-cases/update-organization-admin.ts";
import type { ConsoleServices } from "../../composition.ts";
import { requireStaff } from "./console-guards.ts";

/** `platform.*` permissions of the console APIs (SP5 spec §2.1). */
export const CONSOLE_PERMISSIONS = {
  plans: "platform.plan.manage",
  organizationRead: "platform.organization.read",
  organizationUpdate: "platform.organization.update",
  agents: "platform.agent.manage",
  usage: "platform.usage.read",
} as const;

const organizationErrorResponse = (error: OrganizationAdminError, requestId: string): Response =>
  error.code === "NOT_FOUND" ? apiError(404, "NOT_FOUND", requestId) : apiError(400, "VALIDATION_FAILED", requestId, [{ field: "planId", issue: "NOT_FOUND" }]);

/**
 * `/v1/admin` plans, organizations, budgets and overview (SP5 spec §6, decisions 0039 and 0041):
 * every handler first requires staff with MFA and the `platform.*` permission (`requireStaff`),
 * and every mutation is audited on the platform log (with `targetTenantId` for an organization).
 */
export const buildAdminPlatformRoutes = (deps: { readonly pipeline: ApiRouteDeps; readonly console: ConsoleServices }): Record<string, RouteHandler> => ({
  [listPlansEndpoint.id]: withApiRoute(listPlansEndpoint, deps.pipeline, async (ctx) => {
    const denied = await requireStaff(ctx, { permission: CONSOLE_PERMISSIONS.plans });
    return denied ?? dataResponse({ data: await deps.console.listPlans() });
  }),
  [createPlanEndpoint.id]: withApiRoute(createPlanEndpoint, deps.pipeline, async (ctx) => {
    const denied = await requireStaff(ctx, { permission: CONSOLE_PERMISSIONS.plans });
    if (denied !== null) return denied;
    const plan = await deps.console.createPlan({ actor: ctx.principal, requestId: ctx.requestId, input: ctx.input.body });
    return dataResponse({ data: plan }, { status: 201, location: `/v1/admin/plans/${plan.id}` });
  }),
  [updatePlanEndpoint.id]: withApiRoute(updatePlanEndpoint, deps.pipeline, async (ctx) => {
    const denied = await requireStaff(ctx, { permission: CONSOLE_PERMISSIONS.plans });
    if (denied !== null) return denied;
    const result = await deps.console.updatePlan({ actor: ctx.principal, requestId: ctx.requestId, planId: ctx.input.params.planId, input: ctx.input.body });
    return result.ok ? dataResponse({ data: result.data }) : apiError(404, "NOT_FOUND", ctx.requestId);
  }),
  [listOrganizationsAdminEndpoint.id]: withApiRoute(listOrganizationsAdminEndpoint, deps.pipeline, async (ctx) => {
    const denied = await requireStaff(ctx, { permission: CONSOLE_PERMISSIONS.organizationRead });
    if (denied !== null) return denied;
    const page = pageRequestOf(ctx.input.query);
    if (page === null) return invalidCursorResponse(ctx.requestId);
    return listResponse(await deps.console.listOrganizations(page), page.limit);
  }),
  [updateOrganizationAdminEndpoint.id]: withApiRoute(updateOrganizationAdminEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = ctx.input.params.organizationId;
    const denied = await requireStaff(ctx, { permission: CONSOLE_PERMISSIONS.organizationUpdate, targetTenantId: tenantId });
    if (denied !== null) return denied;
    const result = await deps.console.updateOrganization({ actor: ctx.principal, tenantId, requestId: ctx.requestId, input: ctx.input.body });
    return result.ok ? dataResponse({ data: result.data }) : organizationErrorResponse(result.error, ctx.requestId);
  }),
  [setOrganizationBudgetEndpoint.id]: withApiRoute(setOrganizationBudgetEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = ctx.input.params.organizationId;
    const denied = await requireStaff(ctx, { permission: CONSOLE_PERMISSIONS.organizationUpdate, targetTenantId: tenantId });
    if (denied !== null) return denied;
    const result = await deps.console.setOrganizationBudget({ actor: ctx.principal, tenantId, requestId: ctx.requestId, input: ctx.input.body });
    return result.ok ? dataResponse({ data: result.data }) : organizationErrorResponse(result.error, ctx.requestId);
  }),
  [getAdminOverviewEndpoint.id]: withApiRoute(getAdminOverviewEndpoint, deps.pipeline, async (ctx) => {
    const denied = await requireStaff(ctx, { permission: CONSOLE_PERMISSIONS.usage });
    return denied ?? dataResponse({ data: await deps.console.getOverview() });
  }),
});
