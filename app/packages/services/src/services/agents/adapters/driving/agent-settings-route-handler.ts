import {
  getAgentSettingsEndpoint,
  getOrganizationAgentSettingsEndpoint,
  updateAgentSettingsEndpoint,
  updateOrganizationAgentSettingsEndpoint,
} from "@core/contracts";
import { CONSOLE_PERMISSIONS } from "../../../platform/adapters/driving/admin-platform-route-handler.ts";
import { requireStaff, requireTenant } from "../../../platform/adapters/driving/console-guards.ts";
import type { ConsoleServices } from "../../../platform/composition.ts";
import { apiError, dataResponse } from "../../../shared/http/api-errors.ts";
import { type ApiRouteDeps, withApiRoute } from "../../../shared/http/api-route.ts";
import type { RouteHandler } from "../../../shared/http/route-boundary.ts";

export const AGENT_SETTINGS_PERMISSIONS = {
  read: "core.agent-settings.read",
  update: "core.agent-settings.update",
} as const;

const aboveThePlan = (requestId: string): Response =>
  apiError(400, "VALIDATION_FAILED", requestId, [
    { field: "budget.monthlyMicroUsd", issue: "ABOVE_PLAN" },
    { field: "budget.monthlyTokens", issue: "ABOVE_PLAN" },
  ]);

/**
 * `/v1/agent-settings` (tenant, `?organizationId=`) and `/v1/admin/organizations/{id}/agent-settings`
 * (staff, `platform.agent.manage`): enabled agents, web opt-ins, PII mode and the organization's own
 * lower budget cap, which may never exceed the plan (400 `ABOVE_PLAN`).
 */
export const buildAgentSettingsRoutes = (deps: {
  readonly pipeline: ApiRouteDeps;
  readonly console: ConsoleServices;
}): Record<string, RouteHandler> => ({
  [getAgentSettingsEndpoint.id]: withApiRoute(getAgentSettingsEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = await requireTenant(ctx, {
      organizationId: ctx.input.query.organizationId,
      permission: AGENT_SETTINGS_PERMISSIONS.read,
    });
    return tenantId instanceof Response
      ? tenantId
      : dataResponse({ data: await deps.console.getAgentSettings({ tenantId }) });
  }),
  [updateAgentSettingsEndpoint.id]: withApiRoute(updateAgentSettingsEndpoint, deps.pipeline, async (ctx) => {
    const tenantId = await requireTenant(ctx, {
      organizationId: ctx.input.query.organizationId,
      permission: AGENT_SETTINGS_PERMISSIONS.update,
    });
    if (tenantId instanceof Response) return tenantId;
    const result = await deps.console.updateAgentSettings({
      actor: ctx.principal,
      by: "tenant",
      tenantId,
      requestId: ctx.requestId,
      input: ctx.input.body,
    });
    return result.ok ? dataResponse({ data: result.data }) : aboveThePlan(ctx.requestId);
  }),
  [getOrganizationAgentSettingsEndpoint.id]: withApiRoute(
    getOrganizationAgentSettingsEndpoint,
    deps.pipeline,
    async (ctx) => {
      const tenantId = ctx.input.params.organizationId;
      const denied = await requireStaff(ctx, { permission: CONSOLE_PERMISSIONS.agents, targetTenantId: tenantId });
      return denied ?? dataResponse({ data: await deps.console.getAgentSettings({ tenantId }) });
    },
  ),
  [updateOrganizationAgentSettingsEndpoint.id]: withApiRoute(
    updateOrganizationAgentSettingsEndpoint,
    deps.pipeline,
    async (ctx) => {
      const tenantId = ctx.input.params.organizationId;
      const denied = await requireStaff(ctx, { permission: CONSOLE_PERMISSIONS.agents, targetTenantId: tenantId });
      if (denied !== null) return denied;
      const result = await deps.console.updateAgentSettings({
        actor: ctx.principal,
        by: "staff",
        tenantId,
        requestId: ctx.requestId,
        input: ctx.input.body,
      });
      return result.ok ? dataResponse({ data: result.data }) : aboveThePlan(ctx.requestId);
    },
  ),
});
