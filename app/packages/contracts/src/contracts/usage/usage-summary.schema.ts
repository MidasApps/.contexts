import { z } from "zod";
import { defineContract } from "../contract.ts";
import { TenantIdSchema } from "../primitives/ids.schema.ts";

const none = (description: string) => ({ description, pii: "none" as const });
const count = (description: string) => z.int().nonnegative().meta(none(description));

const UsageTotalsSchema = z.strictObject({
  calls: count("Model calls."),
  inputTokens: count("Prompt tokens."),
  outputTokens: count("Completion tokens."),
  costMicroUsd: count("Known cost in micro-USD (calls without a price are excluded)."),
  unpricedCalls: count("Calls whose model had no price; their tokens still count against the token cap."),
});

/** Month-to-date model usage of one organization against its caps (SP3 spec §12). */
export const UsageSummarySchema = z.strictObject({
  tenantId: TenantIdSchema.meta(none("Organization the summary is about.")),
  month: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/).meta(none("Calendar month in UTC, YYYY-MM.")),
  totals: UsageTotalsSchema.meta(none("Totals for the month.")),
  budget: z
    .strictObject({
      monthlyMicroUsd: count("Hard spend cap for the month in micro-USD."),
      monthlyTokens: count("Hard token cap for the month."),
      alertThresholdPercent: z.int().min(1).max(99).meta(none("Percent of a cap that triggers an alert; always below 100.")),
    })
    .meta(none("Caps in force for the month.")),
  byModel: z
    .array(
      z.strictObject({
        provider: z.string().min(1).meta(none("Model provider.")),
        model: z.string().min(1).meta(none("Provider model id.")),
        totals: UsageTotalsSchema.meta(none("Totals for this model.")),
      }),
    )
    .meta(none("Breakdown per model.")),
});
export type UsageSummary = z.infer<typeof UsageSummarySchema>;

export const UsageSummaryContract = defineContract(UsageSummarySchema, {
  id: "usage.UsageSummary",
  kind: "view",
  description: "Month-to-date model usage and cost of an organization compared with its budget caps.",
  examples: [
    {
      tenantId: "Jd8sK2lPq0WnR5tYu3bV",
      month: "2026-09",
      totals: { calls: 42, inputTokens: 50_000, outputTokens: 12_000, costMicroUsd: 61_000, unpricedCalls: 0 },
      budget: { monthlyMicroUsd: 50_000_000, monthlyTokens: 20_000_000, alertThresholdPercent: 80 },
      byModel: [
        {
          provider: "google",
          model: "gemini-3.5-flash",
          totals: { calls: 42, inputTokens: 50_000, outputTokens: 12_000, costMicroUsd: 61_000, unpricedCalls: 0 },
        },
      ],
    },
  ],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  permission: "core.usage.read",
});
