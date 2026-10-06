// Staff console and tenant agent settings `/v1` descriptors (SP5 spec §6, §7; decisions 0039, 0041).
import { z } from "zod";
import { AgentSettingsSchema } from "../agents/agent-settings.schema.ts";
import { UpdateAgentSettingsInputSchema } from "../agents/update-agent-settings.schema.ts";
import { none } from "../field-docs.ts";
import { defineEndpoint, type EndpointDefinition } from "../http/endpoint.ts";
import { dataEnvelope, listEnvelope, PageQuerySchema } from "../http/envelopes.schema.ts";
import { OrganizationIdSchema } from "../tenancy/ids.schema.ts";
import { OrganizationStatusSchema } from "../tenancy/organization.schema.ts";
import { OrganizationQuerySchema } from "../workflows/endpoints.ts";
import { AdminOverviewSchema } from "./admin-overview.schema.ts";
import { AdminUsageSchema, UsageDaySchema } from "./admin-usage.schema.ts";
import {
  OrganizationAdminDetailSchema,
  OrganizationAdminSummarySchema,
  SetTenantBudgetInputSchema,
  UpdateOrganizationAdminInputSchema,
} from "./organization-admin.schema.ts";
import { PlanIdSchema, PlanSchema, UpsertPlanInputSchema } from "./plan.schema.ts";

const STAFF_ERRORS = { 403: ["FORBIDDEN", "MFA_REQUIRED"] } as const;
const organizationParams = z.object({ organizationId: OrganizationIdSchema.meta(none("Organization id.")) });

export const listPlansEndpoint = defineEndpoint({
  id: "admin.listPlans",
  method: "GET",
  path: "/v1/admin/plans",
  auth: "user",
  responses: { 200: dataEnvelope(z.array(PlanSchema)) },
  errors: STAFF_ERRORS,
  summary: "Lists the plan catalog (staff, platform.plan.manage).",
});

export const createPlanEndpoint = defineEndpoint({
  id: "admin.createPlan",
  method: "POST",
  path: "/v1/admin/plans",
  auth: "user",
  body: UpsertPlanInputSchema,
  responses: { 201: dataEnvelope(PlanSchema) },
  errors: { 400: ["VALIDATION_FAILED"], ...STAFF_ERRORS },
  summary: "Creates a plan (staff, platform.plan.manage).",
});

export const updatePlanEndpoint = defineEndpoint({
  id: "admin.updatePlan",
  method: "PUT",
  path: "/v1/admin/plans/{planId}",
  auth: "user",
  params: z.object({ planId: PlanIdSchema.meta(none("Plan id.")) }),
  body: UpsertPlanInputSchema,
  responses: { 200: dataEnvelope(PlanSchema) },
  errors: { 400: ["VALIDATION_FAILED"], ...STAFF_ERRORS, 404: ["NOT_FOUND"] },
  summary: "Replaces a plan; the budgets of organizations on it follow (staff, platform.plan.manage).",
});

export const deletePlanEndpoint = defineEndpoint({
  id: "admin.deletePlan",
  method: "DELETE",
  path: "/v1/admin/plans/{planId}",
  auth: "user",
  params: z.object({ planId: PlanIdSchema.meta(none("Plan id.")) }),
  responses: { 204: null },
  errors: { ...STAFF_ERRORS, 404: ["NOT_FOUND"], 409: ["PLAN_IN_USE"] },
  summary: "Deletes a plan no organization is on (staff, platform.plan.manage).",
});

export const listOrganizationsAdminEndpoint = defineEndpoint({
  id: "admin.listOrganizations",
  method: "GET",
  path: "/v1/admin/organizations",
  auth: "user",
  query: PageQuerySchema.extend({
    query: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional()
      .meta(
        none(
          "Words the name or id must contain (case and accents ignored); an exact organization id always comes first.",
        ),
      ),
    status: OrganizationStatusSchema.optional().meta(none("Only organizations in this status.")),
  }),
  responses: { 200: listEnvelope(OrganizationAdminSummarySchema) },
  errors: { 400: ["VALIDATION_FAILED"], ...STAFF_ERRORS },
  summary:
    "Lists live organizations with plan, budget and cost month to date, optionally filtered by text and status; a filtered page may hold fewer rows than `limit` while `hasMore` is true (staff, platform.organization.read).",
});

export const getOrganizationAdminEndpoint = defineEndpoint({
  id: "admin.getOrganization",
  method: "GET",
  path: "/v1/admin/organizations/{organizationId}",
  auth: "user",
  params: organizationParams,
  responses: { 200: dataEnvelope(OrganizationAdminDetailSchema) },
  errors: { ...STAFF_ERRORS, 404: ["NOT_FOUND"] },
  summary:
    "Reads one live organization with plan, budget, cost month to date and member count (staff, platform.organization.read).",
});

export const updateOrganizationAdminEndpoint = defineEndpoint({
  id: "admin.updateOrganization",
  method: "PATCH",
  path: "/v1/admin/organizations/{organizationId}",
  auth: "user",
  params: organizationParams,
  body: UpdateOrganizationAdminInputSchema,
  responses: { 200: dataEnvelope(OrganizationAdminSummarySchema) },
  errors: { 400: ["VALIDATION_FAILED"], ...STAFF_ERRORS, 404: ["NOT_FOUND"] },
  summary: "Changes an organization's plan or status (staff, platform.organization.update).",
});

export const setOrganizationBudgetEndpoint = defineEndpoint({
  id: "admin.setOrganizationBudget",
  method: "PUT",
  path: "/v1/admin/organizations/{organizationId}/budget",
  auth: "user",
  params: organizationParams,
  body: SetTenantBudgetInputSchema,
  responses: { 200: dataEnvelope(OrganizationAdminSummarySchema) },
  errors: { 400: ["VALIDATION_FAILED"], ...STAFF_ERRORS, 404: ["NOT_FOUND"] },
  summary: "Overrides or clears an organization's monthly budget caps (staff, platform.organization.update).",
});

export const getOrganizationAgentSettingsEndpoint = defineEndpoint({
  id: "admin.getOrganizationAgentSettings",
  method: "GET",
  path: "/v1/admin/organizations/{organizationId}/agent-settings",
  auth: "user",
  params: organizationParams,
  responses: { 200: dataEnvelope(AgentSettingsSchema) },
  errors: { ...STAFF_ERRORS, 404: ["NOT_FOUND"] },
  summary: "Reads an organization's agent settings (staff, platform.agent.manage).",
});

export const updateOrganizationAgentSettingsEndpoint = defineEndpoint({
  id: "admin.updateOrganizationAgentSettings",
  method: "PUT",
  path: "/v1/admin/organizations/{organizationId}/agent-settings",
  auth: "user",
  params: organizationParams,
  body: UpdateAgentSettingsInputSchema,
  responses: { 200: dataEnvelope(AgentSettingsSchema) },
  errors: { 400: ["VALIDATION_FAILED"], ...STAFF_ERRORS, 404: ["NOT_FOUND"] },
  summary: "Changes an organization's agent settings (staff, platform.agent.manage, audited with targetTenantId).",
});

export const getAdminOverviewEndpoint = defineEndpoint({
  id: "admin.getOverview",
  method: "GET",
  path: "/v1/admin/overview",
  auth: "user",
  responses: { 200: dataEnvelope(AdminOverviewSchema) },
  errors: STAFF_ERRORS,
  summary: "Platform overview numbers (staff, platform.usage.read).",
});

export const getAdminUsageEndpoint = defineEndpoint({
  id: "admin.getUsage",
  method: "GET",
  path: "/v1/admin/usage",
  auth: "user",
  query: z.object({
    from: UsageDaySchema.optional().meta(
      none("First UTC day (`2026-09-01`); default: the first day of the month of `to`."),
    ),
    to: UsageDaySchema.optional().meta(
      none("Last UTC day, included; default: today (UTC). At most 92 days after `from`."),
    ),
    organizationId: OrganizationIdSchema.optional().meta(
      none("Only this organization; without it, every live organization."),
    ),
  }),
  responses: { 200: dataEnvelope(AdminUsageSchema) },
  errors: { 400: ["VALIDATION_FAILED"], ...STAFF_ERRORS, 404: ["NOT_FOUND"] },
  summary:
    "Model usage and cost by UTC day and by model from the usage ledger, of every live organization or of one (staff, platform.usage.read).",
});

export const getAgentSettingsEndpoint = defineEndpoint({
  id: "agent-settings.get",
  method: "GET",
  path: "/v1/agent-settings",
  auth: "principal",
  query: OrganizationQuerySchema,
  responses: { 200: dataEnvelope(AgentSettingsSchema) },
  errors: { 403: ["FORBIDDEN"] },
  summary: "Reads the organization's agent settings (core.agent-settings.read).",
});

export const updateAgentSettingsEndpoint = defineEndpoint({
  id: "agent-settings.update",
  method: "PATCH",
  path: "/v1/agent-settings",
  auth: "user",
  query: OrganizationQuerySchema,
  body: UpdateAgentSettingsInputSchema,
  responses: { 200: dataEnvelope(AgentSettingsSchema) },
  errors: { 400: ["VALIDATION_FAILED"], 403: ["FORBIDDEN"] },
  summary:
    "Changes the organization's agent settings; its own budget cap may only be lower than the plan's (core.agent-settings.update).",
});

export const ADMIN_PLATFORM_ENDPOINTS: readonly EndpointDefinition[] = [
  listPlansEndpoint,
  createPlanEndpoint,
  updatePlanEndpoint,
  deletePlanEndpoint,
  listOrganizationsAdminEndpoint,
  getOrganizationAdminEndpoint,
  updateOrganizationAdminEndpoint,
  setOrganizationBudgetEndpoint,
  getOrganizationAgentSettingsEndpoint,
  updateOrganizationAgentSettingsEndpoint,
  getAdminOverviewEndpoint,
  getAdminUsageEndpoint,
  getAgentSettingsEndpoint,
  updateAgentSettingsEndpoint,
];
