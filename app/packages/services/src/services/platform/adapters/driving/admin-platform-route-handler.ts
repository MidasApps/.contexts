import {
  createPlanEndpoint,
  deletePlanEndpoint,
  getAdminOverviewEndpoint,
  getAdminUsageEndpoint,
  getOrganizationAdminEndpoint,
  listOrganizationsAdminEndpoint,
  listPlansEndpoint,
  setOrganizationBudgetEndpoint,
  updateOrganizationAdminEndpoint,
  updatePlanEndpoint,
} from "@core/contracts";
import { apiError, dataResponse, noContentResponse } from "#/services/shared/http/api-errors.ts";
import { invalidCursorResponse, listResponse, pageRequestOf } from "#/services/shared/http/api-list.ts";
import { type ApiRouteDeps, withApiRoute } from "#/services/shared/http/api-route.ts";
import type { RouteHandler } from "#/services/shared/http/route-boundary.ts";
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
  error.code === "NOT_FOUND"
    ? apiError(404, "NOT_FOUND", requestId)
    : apiError(400, "VALIDATION_FAILED", requestId, [{ field: "planId", issue: "NOT_FOUND" }]);

type ConsoleRouteDeps = { readonly pipeline: ApiRouteDeps; readonly console: ConsoleServices };

/** The plan catalog (decision 0039; deletion: decision 0075), platform.plan.manage. */
const buildPlanRoutes = (deps: ConsoleRouteDeps): Record<string, RouteHandler> => ({
  [listPlansEndpoint.id]: withApiRoute(listPlansEndpoint, deps.pipeline, async (ctx) => {
    const denied = await requireStaff(ctx, { permission: CONSOLE_PERMISSIONS.plans });
    return denied ?? dataResponse({ data: await deps.console.listPlans() });
  }),
  [createPlanEndpoint.id]: withApiRoute(createPlanEndpoint, deps.pipeline, async (ctx) => {
    const denied = await requireStaff(ctx, { permission: CONSOLE_PERMISSIONS.plans });
    if (denied !== null) return denied;
    const plan = await deps.console.createPlan({
      actor: ctx.principal,
      requestId: ctx.requestId,
      input: ctx.input.body,
    });
    return dataResponse({ data: plan }, { status: 201, location: `/v1/admin/plans/${plan.id}` });
  }),
  [updatePlanEndpoint.id]: withApiRoute(updatePlanEndpoint, deps.pipeline, async (ctx) => {
    const denied = await requireStaff(ctx, { permission: CONSOLE_PERMISSIONS.plans });
    if (denied !== null) return denied;
    const result = await deps.console.updatePlan({
      actor: ctx.principal,
      requestId: ctx.requestId,
      planId: ctx.input.params.planId,
      input: ctx.input.body,
    });
    return result.ok ? dataResponse({ data: result.data }) : apiError(404, "NOT_FOUND", ctx.requestId);
  }),
  [deletePlanEndpoint.id]: withApiRoute(deletePlanEndpoint, deps.pipeline, async (ctx) => {
    const denied = await requireStaff(ctx, { permission: CONSOLE_PERMISSIONS.plans });
    if (denied !== null) return denied;
    const result = await deps.console.deletePlan({
      actor: ctx.principal,
      requestId: ctx.requestId,
      planId: ctx.input.params.planId,
    });
    if (result.ok) return noContentResponse();
    return result.error.code === "NOT_FOUND"
      ? apiError(404, "NOT_FOUND", ctx.requestId)
      : apiError(409, "PLAN_IN_USE", ctx.requestId);
  }),
});

/**
 * `/v1/admin` plans, organizations, budgets and overview (SP5 spec §6, decisions 0039 and 0041):
 * every handler first requires staff with MFA and the `platform.*` permission (`requireStaff`),
 * and every mutation is audited on the platform log (with `targetTenantId` for an organization).
 */
export const buildAdminPlatformRoutes = (deps: ConsoleRouteDeps): Record<string, RouteHandler> => ({
  ...buildPlanRoutes(deps),
  [listOrganizationsAdminEndpoint.id]: withApiRoute(listOrganizationsAdminEndpoint, deps.pipeline, async (ctx) => {
    const denied = await requireStaff(ctx, { permission: CONSOLE_PERMISSIONS.organizationRead });
    if (denied !== null) return denied;
    const page = pageRequestOf(ctx.input.query);
    if (page === null) return invalidCursorResponse(ctx.requestId);
    const { query, status } = ctx.input.query;
    return listResponse(await deps.console.listOrganizations({ page, filter: { query, status } }), page.limit);
  }),
  [getOrganizationAdminEndpoint.id]: withApiRoute(getOrganizationAdminEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = ctx.input.params.organizationId;
    const denied = await requireStaff(ctx, {
      permission: CONSOLE_PERMISSIONS.organizationRead,
      targetTenantId: tenantId,
    });
    if (denied !== null) return denied;
    const organization = await deps.console.getOrganization(tenantId);
    return organization === null ? apiError(404, "NOT_FOUND", ctx.requestId) : dataResponse({ data: organization });
  }),
  [updateOrganizationAdminEndpoint.id]: withApiRoute(updateOrganizationAdminEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = ctx.input.params.organizationId;
    const denied = await requireStaff(ctx, {
      permission: CONSOLE_PERMISSIONS.organizationUpdate,
      targetTenantId: tenantId,
    });
    if (denied !== null) return denied;
    const result = await deps.console.updateOrganization({
      actor: ctx.principal,
      tenantId,
      requestId: ctx.requestId,
      input: ctx.input.body,
    });
    return result.ok ? dataResponse({ data: result.data }) : organizationErrorResponse(result.error, ctx.requestId);
  }),
  [setOrganizationBudgetEndpoint.id]: withApiRoute(setOrganizationBudgetEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = ctx.input.params.organizationId;
    const denied = await requireStaff(ctx, {
      permission: CONSOLE_PERMISSIONS.organizationUpdate,
      targetTenantId: tenantId,
    });
    if (denied !== null) return denied;
    const result = await deps.console.setOrganizationBudget({
      actor: ctx.principal,
      tenantId,
      requestId: ctx.requestId,
      input: ctx.input.body,
    });
    return result.ok ? dataResponse({ data: result.data }) : organizationErrorResponse(result.error, ctx.requestId);
  }),
  [getAdminOverviewEndpoint.id]: withApiRoute(getAdminOverviewEndpoint, deps.pipeline, async (ctx) => {
    const denied = await requireStaff(ctx, { permission: CONSOLE_PERMISSIONS.usage });
    return denied ?? dataResponse({ data: await deps.console.getOverview() });
  }),
  [getAdminUsageEndpoint.id]: withApiRoute(getAdminUsageEndpoint, deps.pipeline, async (ctx) => {
    const { from, to, organizationId } = ctx.input.query;
    const denied = await requireStaff(ctx, {
      permission: CONSOLE_PERMISSIONS.usage,
      ...(organizationId === undefined ? {} : { targetTenantId: organizationId }),
    });
    if (denied !== null) return denied;
    const result = await deps.console.getUsage({ from, to, tenantId: organizationId ?? null });
    if (result.ok) return dataResponse({ data: result.data });
    return result.error.code === "NOT_FOUND"
      ? apiError(404, "NOT_FOUND", ctx.requestId)
      : apiError(400, "VALIDATION_FAILED", ctx.requestId, [{ field: result.error.field, issue: result.error.issue }]);
  }),
});
