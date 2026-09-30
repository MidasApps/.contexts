import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS } from "../example-values.ts";
import { none } from "../field-docs.ts";
import { TenantIdSchema } from "../primitives/ids.schema.ts";

const count = (description: string) => z.int().nonnegative().meta(none(description));

/** One row of `usage.daily_rollups` (SP5 spec §3.2): usage per tenant, UTC day, model and agent. */
export const UsageDailyRollupSchema = z.strictObject({
  tenantId: TenantIdSchema.meta(none("Organization.")),
  day: z.iso.date().meta(none("Calendar day in UTC, YYYY-MM-DD.")),
  model: z.string().min(1).meta(none("Provider model id.")),
  agentId: z.string().min(1).meta(none("Agent that made the calls.")),
  calls: count("Model calls."),
  inputTokens: count("Prompt tokens."),
  outputTokens: count("Completion tokens."),
  costMicroUsd: count("Known cost in micro-USD."),
});
export type UsageDailyRollup = z.infer<typeof UsageDailyRollupSchema>;

export const UsageDailyRollupContract = defineContract(UsageDailyRollupSchema, {
  id: "usage.UsageDailyRollup",
  kind: "view",
  description: "Daily model usage and cost of an organization per model and agent.",
  examples: [
    { tenantId: EXAMPLE_IDS.organization, day: "2026-09-30", model: "gemini-3.5-flash", agentId: "assistant", calls: 42, inputTokens: 50_000, outputTokens: 12_000, costMicroUsd: 61_000 },
  ],
  pii: "none",
  tenancyScope: "organization",
  relations: [{ target: "tenancy.Organization", type: "belongs-to", field: "tenantId" }],
  permission: "core.usage.read",
});
