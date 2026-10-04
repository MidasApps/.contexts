import { z } from "zod";
import { defineContract } from "../contract.ts";
import { none } from "../field-docs.ts";
import { BudgetCapsSchema } from "../platform/organization-admin.schema.ts";
import { hasUniqueItems } from "../primitives/refinements.ts";
import { AgentKeySchema } from "./agent-settings.schema.ts";

/**
 * Partial update of an organization's agent settings (SP5 spec §6, §7). `budget` is the tenant's
 * own lower cap: it may never exceed the plan (or staff override), and null removes it.
 */
export const UpdateAgentSettingsInputSchema = z
  .strictObject({
    enabledAgents: z
      .array(AgentKeySchema)
      .max(50)
      .refine(hasUniqueItems, { error: "Agents must be unique." })
      .optional()
      .meta(none("Subagents the supervisor may delegate to.")),
    webTools: z
      .strictObject({
        firecrawl: z.boolean().meta(none("Web search and scrape through Firecrawl.")),
        browser: z.boolean().meta(none("Browser automation through a Playwright MCP connector.")),
      })
      .optional()
      .meta(none("Web tool opt-ins (the platform flag ai.web-tools must also be on).")),
    guardrails: z
      .strictObject({ pii: z.enum(["warn", "redact"]).meta(none("`warn` or `redact`.")) })
      .optional()
      .meta(none("PII detector mode for user input.")),
    budget: BudgetCapsSchema.nullable()
      .optional()
      .meta(none("The organization's own lower monthly cap; null removes it.")),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    error: "Change at least one setting.",
  });
export type UpdateAgentSettingsInput = z.infer<typeof UpdateAgentSettingsInputSchema>;

export const UpdateAgentSettingsInputContract = defineContract(UpdateAgentSettingsInputSchema, {
  id: "agents.UpdateAgentSettingsInput",
  kind: "command",
  description: "Changes enabled agents, web opt-ins, the PII mode or the organization's own lower budget cap.",
  examples: [
    { enabledAgents: ["knowledge", "data"] },
    { guardrails: { pii: "redact" }, budget: { monthlyMicroUsd: 20_000_000, monthlyTokens: 10_000_000 } },
  ],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  permission: "core.agent-settings.update",
});
