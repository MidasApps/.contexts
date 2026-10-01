import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS } from "../example-values.ts";
import { none } from "../field-docs.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { OrganizationIdSchema } from "../tenancy/ids.schema.ts";

/** Longest range one `GET /v1/admin/usage` covers, in UTC days. */
export const ADMIN_USAGE_MAX_DAYS = 92;

/** A UTC calendar day (`2026-09-30`). */
export const UsageDaySchema = z.iso.date();

const count = (description: string) => z.int().nonnegative().meta(none(description));

const totalsShape = {
  calls: count("Model calls."),
  inputTokens: count("Prompt tokens."),
  outputTokens: count("Completion tokens."),
  costMicroUsd: count("Cost of the priced calls, in micro-USD."),
  unpricedCalls: count("Calls whose model had no verified price: their tokens count, their cost is unknown."),
};

export const AdminUsageTotalsSchema = z.strictObject(totalsShape);
export type AdminUsageTotals = z.infer<typeof AdminUsageTotalsSchema>;

/** Usage of the platform, or of one organization, by UTC day and by model (`/admin/costs`, decision 0044). */
export const AdminUsageSchema = z.strictObject({
  from: UsageDaySchema.meta(none("First UTC day of the range.")),
  to: UsageDaySchema.meta(none("Last UTC day of the range, included.")),
  organizationId: OrganizationIdSchema.nullable().meta(none("Organization the numbers are of; null = every live organization.")),
  totals: AdminUsageTotalsSchema.meta(none("Totals of the range.")),
  byDay: z
    .array(z.strictObject({ day: UsageDaySchema.meta(none("UTC day.")), ...totalsShape }))
    .max(ADMIN_USAGE_MAX_DAYS)
    .meta(none("One row per day of the range, in order; days without calls are zero.")),
  byModel: z
    .array(z.strictObject({ provider: z.string().min(1).meta(none("Model provider.")), model: z.string().min(1).meta(none("Model id.")), ...totalsShape }))
    .max(500)
    .meta(none("One row per provider and model, highest cost first.")),
  organizations: count("Organizations whose ledger was read."),
  truncated: z.boolean().meta(none("True when there are more organizations than one answer reads; the totals then cover only the ones read.")),
  generatedAt: IsoDateTimeSchema.meta(none("When the numbers were computed (UTC).")),
});
export type AdminUsage = z.infer<typeof AdminUsageSchema>;

const ROW = { calls: 240, inputTokens: 310_000, outputTokens: 42_000, costMicroUsd: 1_250_000, unpricedCalls: 0 } as const;

export const AdminUsageContract = defineContract(AdminUsageSchema, {
  id: "platform.AdminUsage",
  kind: "view",
  description: "Model usage and cost for staff, by UTC day and by model, of every organization or of one.",
  examples: [
    {
      from: "2026-09-29",
      to: "2026-09-30",
      organizationId: EXAMPLE_IDS.organization,
      totals: ROW,
      byDay: [
        { day: "2026-09-29", calls: 0, inputTokens: 0, outputTokens: 0, costMicroUsd: 0, unpricedCalls: 0 },
        { day: "2026-09-30", ...ROW },
      ],
      byModel: [{ provider: "google", model: "gemini-3.5-flash", ...ROW }],
      organizations: 1,
      truncated: false,
      generatedAt: "2026-09-30T12:00:00.000Z",
    },
  ],
  pii: "none",
  tenancyScope: "platform",
  relations: [],
  permission: "platform.usage.read",
});
