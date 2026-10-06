import { z } from "zod";
import { defineContract } from "../contract.ts";
import { none } from "../field-docs.ts";
import { AgentKeySchema } from "./agent-settings.schema.ts";
import { CustomAgentIdSchema } from "./custom-agent.schema.ts";

/** A tool an agent may call in this organization (the runtime resolves connector tools per tenant). */
export const AgentCatalogToolSchema = z.strictObject({
  id: z.string().min(1).max(200).meta(none("Tool id, e.g. knowledge.search or command.tenancy.CreateProjectInput.")),
  kind: z
    .enum(["read", "mutation"])
    .meta(none("Whether the tool only reads or changes data (mutations are confirmed or approved).")),
  source: z
    .enum(["core", "module", "connector"])
    .meta(none("Where the tool comes from: the core, an installed module or one of the organization's connectors.")),
});
export type AgentCatalogTool = z.infer<typeof AgentCatalogToolSchema>;

/** An Agent Skill attached to an agent (decision 0029): shipped with the code, or written by the organization (decision 0046). */
export const AgentCatalogSkillSchema = z.strictObject({
  name: z
    .string()
    .min(1)
    .max(100)
    .meta(
      none("Skill name (its SKILL.md directory, <module>-<skill>, or org-<name> for an organization's own skill)."),
    ),
  description: z.string().max(1024).meta(none("What the skill teaches the agent, from its SKILL.md.")),
  source: z
    .enum(["core", "module", "custom"])
    .meta(none("Shipped with the core or an installed module, or written by the organization.")),
});
export type AgentCatalogSkill = z.infer<typeof AgentCatalogSkillSchema>;

/**
 * One agent as the organization sees it (SP5 spec §7): whether it is enabled, and the tools and
 * skills it has there. `core` and `module` agents are defined in code and are the supervisor's
 * subagents; `custom` ones are the organization's own (decision 0046), chosen directly in chat.
 */
export const AgentCatalogEntrySchema = z.strictObject({
  key: z
    .union([AgentKeySchema, CustomAgentIdSchema])
    .meta(none("Agent key used in agent-settings.enabledAgents; for a custom agent, its id.")),
  name: z.string().min(1).max(100).meta(none("Display name of the agent.")),
  description: z.string().max(1000).meta(none("What the agent does.")),
  source: z
    .enum(["core", "module", "custom"])
    .meta(none("Shipped with the core or an installed module, or configured by the organization.")),
  moduleId: z.string().min(1).max(100).nullable().meta(none("Module that ships the agent; null for core agents.")),
  enabled: z
    .boolean()
    .meta(
      none(
        "Whether the supervisor may delegate to it in this organization; for a custom agent, whether members can chat with it.",
      ),
    ),
  tools: z
    .array(AgentCatalogToolSchema)
    .max(500)
    .meta(none("Tools the agent has in this organization, connector tools included.")),
  skills: z.array(AgentCatalogSkillSchema).max(100).meta(none("Skills attached to the agent in this organization.")),
});
export type AgentCatalogEntry = z.infer<typeof AgentCatalogEntrySchema>;

export const AgentCatalogEntryContract = defineContract(AgentCatalogEntrySchema, {
  id: "agents.AgentCatalogEntry",
  kind: "view",
  description:
    "An agent available to an organization (code-defined or its own) with its enabled state, tools and skills.",
  examples: [
    {
      key: "knowledge",
      name: "Knowledge",
      description: "Answers from the organization's knowledge base with citations.",
      source: "core",
      moduleId: null,
      enabled: true,
      tools: [{ id: "knowledge.search", kind: "read", source: "core" }],
      skills: [{ name: "knowledge-citations", description: "How to cite knowledge base passages.", source: "core" }],
    },
  ],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  permission: "core.agent-settings.read",
});
