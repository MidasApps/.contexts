import { z } from "zod";
import { defineContract } from "../contract.ts";
import { TenantIdSchema, UserIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";

const none = (description: string) => ({ description, pii: "none" as const });

/** Key of a supervisor subagent: core (`knowledge`, `data`, `action`, `web`) or `<module>-<agent>`. */
export const AgentKeySchema = z.string().regex(/^[a-z][a-z0-9-]*$/, { error: "Expected a kebab-case agent key." });
export type AgentKey = z.infer<typeof AgentKeySchema>;

/** Tenant agent settings (SP3 spec §6, §12): enabled agents, web opt-ins, guardrail level and budget. */
export const AgentSettingsSchema = z.strictObject({
  tenantId: TenantIdSchema.meta(none("Organization the settings belong to (document id).")),
  enabledAgents: z.array(AgentKeySchema).meta(none("Subagents the supervisor may delegate to in this tenant.")),
  webTools: z
    .strictObject({
      firecrawl: z.boolean().meta(none("Web search and scrape through Firecrawl (off by default).")),
      browser: z.boolean().meta(none("Browser automation through a Playwright MCP connector (off by default).")),
    })
    .meta(none("Opt-ins for tools that reach the public web.")),
  guardrails: z
    .strictObject({
      pii: z.enum(["warn", "redact"]).meta(none("What the PII detector does with personal data in user input.")),
    })
    .meta(none("Tenant-tunable guardrail levels.")),
  budget: z
    .strictObject({
      monthlyMicroUsd: z.int().nonnegative().meta(none("Hard monthly model spend cap in micro-USD.")),
      monthlyTokens: z.int().nonnegative().meta(none("Hard monthly token cap (used when a price is unknown).")),
    })
    .meta(none("Monthly caps enforced by the tenant budget guard; alerts fire at 80 %.")),
  updatedBy: UserIdSchema.nullable().meta({ description: "Uid of the last editor; null for defaults.", pii: "personal" }),
  createdAt: IsoDateTimeSchema.meta(none("When the settings were created (UTC).")),
  updatedAt: IsoDateTimeSchema.meta(none("When the settings last changed (UTC).")),
});
export type AgentSettings = z.infer<typeof AgentSettingsSchema>;

export const AgentSettingsContract = defineContract(AgentSettingsSchema, {
  id: "agents.AgentSettings",
  kind: "settings",
  description: "Per-organization configuration of the agent runtime: enabled subagents, web tools, PII guardrail and budget caps.",
  examples: [
    {
      tenantId: "Jd8sK2lPq0WnR5tYu3bV",
      enabledAgents: ["knowledge", "data", "action"],
      webTools: { firecrawl: false, browser: false },
      guardrails: { pii: "warn" },
      budget: { monthlyMicroUsd: 50_000_000, monthlyTokens: 20_000_000 },
      updatedBy: "uA1b2C3d4E5f6G7h8I9j",
      createdAt: "2026-09-29T14:30:00.000Z",
      updatedAt: "2026-09-29T14:30:00.000Z",
    },
  ],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "core.agent-settings.read",
});
