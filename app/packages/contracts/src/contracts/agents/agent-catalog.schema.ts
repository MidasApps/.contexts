import { z } from "zod";
import { defineContract } from "../contract.ts";
import { none } from "../field-docs.ts";
import { AgentKeySchema } from "./agent-settings.schema.ts";

const SourceSchema = z.enum(["core", "module"]);

/** A tool an agent may call in this organization (the runtime resolves connector tools per tenant). */
export const AgentCatalogToolSchema = z.strictObject({
  id: z.string().min(1).max(200).meta(none("Tool id, e.g. knowledge.search or command.tenancy.CreateProjectInput.")),
  kind: z.enum(["read", "mutation"]).meta(none("Whether the tool only reads or changes data (mutations are confirmed or approved).")),
  source: z.enum(["core", "module", "connector"]).meta(none("Where the tool comes from: the core, an installed module or one of the organization's connectors.")),
});
export type AgentCatalogTool = z.infer<typeof AgentCatalogToolSchema>;

/** An Agent Skill attached to an agent (decision 0029): read-only instructions shipped with the code. */
export const AgentCatalogSkillSchema = z.strictObject({
  name: z.string().min(1).max(100).meta(none("Skill name (its SKILL.md directory, or <module>-<skill>).")),
  description: z.string().max(1024).meta(none("What the skill teaches the agent, from its SKILL.md.")),
  source: SourceSchema.meta(none("Shipped with the core or with an installed module.")),
});
export type AgentCatalogSkill = z.infer<typeof AgentCatalogSkillSchema>;

/**
 * One subagent the supervisor can delegate to, as the organization sees it (SP5 spec §7): whether
 * it is enabled, and the tools and skills it has there. Agents and skills are defined in code (the
 * core and the installed modules); an organization enables, limits and instructs them.
 */
export const AgentCatalogEntrySchema = z.strictObject({
  key: AgentKeySchema.meta(none("Agent key used in agent-settings.enabledAgents.")),
  name: z.string().min(1).max(100).meta(none("Display name of the agent.")),
  description: z.string().max(1000).meta(none("What the agent does.")),
  source: SourceSchema.meta(none("Shipped with the core or with an installed module.")),
  moduleId: z.string().min(1).max(100).nullable().meta(none("Module that ships the agent; null for core agents.")),
  enabled: z.boolean().meta(none("Whether the supervisor may delegate to it in this organization.")),
  tools: z.array(AgentCatalogToolSchema).max(500).meta(none("Tools the agent has in this organization, connector tools included.")),
  skills: z.array(AgentCatalogSkillSchema).max(100).meta(none("Skills attached to the agent in this organization.")),
});
export type AgentCatalogEntry = z.infer<typeof AgentCatalogEntrySchema>;

export const AgentCatalogEntryContract = defineContract(AgentCatalogEntrySchema, {
  id: "agents.AgentCatalogEntry",
  kind: "view",
  description: "A subagent available to an organization with its enabled state, tools and skills.",
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
