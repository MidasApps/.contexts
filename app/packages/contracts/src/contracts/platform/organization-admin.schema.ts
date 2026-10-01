import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS } from "../example-values.ts";
import { none } from "../field-docs.ts";
import { NodeNameSchema, OrganizationStatusSchema } from "../tenancy/organization.schema.ts";
import { OrganizationIdSchema } from "../tenancy/ids.schema.ts";
import { PlanIdSchema } from "./plan.schema.ts";

const cap = (description: string) => z.int().nonnegative().meta(none(description));

/** Monthly caps (micro-USD and tokens) as staff override them or a tenant lowers them. */
export const BudgetCapsSchema = z.strictObject({
  monthlyMicroUsd: cap("Monthly model spend cap in micro-USD."),
  monthlyTokens: cap("Monthly model token cap."),
});
export type BudgetCaps = z.infer<typeof BudgetCapsSchema>;

/** Where the caps in force come from (decision 0039): staff override, the plan, or the platform default. */
export const BudgetSourceSchema = z.enum(["override", "plan", "default"]);

/** An organization as `/admin/organizations` lists it (SP5 spec §6). */
export const OrganizationAdminSummarySchema = z.strictObject({
  id: OrganizationIdSchema.meta(none("Organization id (= tenant id).")),
  name: NodeNameSchema.meta(none("Display name.")),
  status: OrganizationStatusSchema.meta(none("`active` or `suspended`.")),
  planId: PlanIdSchema.nullable().meta(none("Assigned plan; null = platform default caps.")),
  budget: z
    .strictObject({
      caps: BudgetCapsSchema.meta(none("Caps in force (after the tenant's own lower cap).")),
      source: BudgetSourceSchema.meta(none("`override`, `plan` or `default`.")),
      override: BudgetCapsSchema.nullable().meta(none("Staff override, if any.")),
    })
    .meta(none("Monthly budget of the organization.")),
  costMtdMicroUsd: z.int().nonnegative().meta(none("Model cost month to date, in micro-USD.")),
});
export type OrganizationAdminSummary = z.infer<typeof OrganizationAdminSummarySchema>;

const SUMMARY_EXAMPLE = {
  id: EXAMPLE_IDS.organization,
  name: "Northwind",
  status: "active",
  planId: "Pl1aB2cD3eF4gH5iJ6kL",
  budget: { caps: { monthlyMicroUsd: 50_000_000, monthlyTokens: 20_000_000 }, source: "plan", override: null },
  costMtdMicroUsd: 1_250_000,
} as const;

export const OrganizationAdminSummaryContract = defineContract(OrganizationAdminSummarySchema, {
  id: "platform.OrganizationAdminSummary",
  kind: "view",
  description: "An organization for staff: status, plan, budget caps and their source, cost month to date.",
  examples: [SUMMARY_EXAMPLE],
  pii: "none",
  tenancyScope: "platform",
  relations: [],
  permission: "platform.organization.read",
});

export const UpdateOrganizationAdminInputSchema = z
  .strictObject({
    planId: PlanIdSchema.nullable().optional().meta(none("Plan to assign; null removes it (platform default caps).")),
    status: OrganizationStatusSchema.optional().meta(none("`active` or `suspended`.")),
  })
  .refine((input) => input.planId !== undefined || input.status !== undefined, { error: "Change the plan, the status or both." });
export type UpdateOrganizationAdminInput = z.infer<typeof UpdateOrganizationAdminInputSchema>;

export const UpdateOrganizationAdminInputContract = defineContract(UpdateOrganizationAdminInputSchema, {
  id: "platform.UpdateOrganizationAdminInput",
  kind: "command",
  description: "Staff changes an organization's plan or status (audited with targetTenantId).",
  examples: [{ planId: "Pl1aB2cD3eF4gH5iJ6kL" }, { status: "suspended" }],
  pii: "none",
  tenancyScope: "platform",
  relations: [],
  permission: "platform.organization.update",
});

export const SetTenantBudgetInputSchema = z.strictObject({
  override: BudgetCapsSchema.nullable().meta(none("Caps that replace the plan's; null returns to the plan.")),
});
export type SetTenantBudgetInput = z.infer<typeof SetTenantBudgetInputSchema>;

export const SetTenantBudgetInputContract = defineContract(SetTenantBudgetInputSchema, {
  id: "platform.SetTenantBudgetInput",
  kind: "command",
  description: "Staff overrides (or clears the override of) an organization's monthly budget caps.",
  examples: [{ override: { monthlyMicroUsd: 100_000_000, monthlyTokens: 40_000_000 } }, { override: null }],
  pii: "none",
  tenancyScope: "platform",
  relations: [],
  permission: "platform.organization.update",
});
