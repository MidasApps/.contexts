import { z } from "zod";
import { defineContract } from "../contract.ts";
import { none } from "../field-docs.ts";
import { ChatAgentIdSchema } from "../conversations/conversation.schema.ts";
import { CustomAgentModelSchema, EXAMPLE_CUSTOM_AGENT_ID } from "./custom-agent.schema.ts";

/**
 * Limits of tenant-defined agents and skills when the organization's plan sets none (decision
 * 0046). A plan overrides each one (`PlanLimits.maxCustomAgents`, `maxCustomSkills`,
 * `maxCustomInstructionChars`).
 */
export const CUSTOM_AGENT_LIMIT_DEFAULTS = { maxAgents: 5, maxSkills: 10, maxInstructionChars: 8000 } as const;

export const CustomAgentLimitsSchema = z.strictObject({
  maxAgents: z.int().nonnegative().meta(none("Most custom agents the organization may have.")),
  maxSkills: z.int().nonnegative().meta(none("Most custom skills the organization may have.")),
  maxInstructionChars: z.int().nonnegative().meta(none("Longest instructions of one agent or skill, in characters.")),
});
export type CustomAgentLimits = z.infer<typeof CustomAgentLimitsSchema>;

/** What the runtime offers to a custom agent of this organization (no limits: the runtime does not know the plan). */
export const CustomAgentRuntimeOptionsSchema = z.strictObject({
  models: z.array(CustomAgentModelSchema).meta(none("Model roles an agent may run on.")),
  tools: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(200).meta(none("Tool id to store in the agent's tools.")),
        kind: z.enum(["read", "mutation"]).meta(none("Mutations ask the user for a confirmation or an approval.")),
        source: z.enum(["core", "module"]).meta(none("Shipped with the core or with an installed module.")),
        description: z.string().max(2000).meta(none("When the tool is used.")),
      }),
    )
    .max(500)
    .meta(none("Tools an agent may select; every call still needs the caller's own permission.")),
  coreSkills: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(100).meta(none("Skill name to store in the agent's coreSkills.")),
        description: z.string().max(1024).meta(none("What the skill teaches the agent.")),
      }),
    )
    .max(100)
    .meta(none("Platform skills an agent may load.")),
});
export type CustomAgentRuntimeOptions = z.infer<typeof CustomAgentRuntimeOptionsSchema>;

/** Everything the agent and skill forms need: the runtime options, the plan limits and what is used. */
export const CustomAgentOptionsSchema = CustomAgentRuntimeOptionsSchema.extend({
  limits: CustomAgentLimitsSchema.meta(none("Limits of the organization's plan.")),
  usage: z
    .strictObject({
      agents: z.int().nonnegative().meta(none("Custom agents the organization has.")),
      skills: z.int().nonnegative().meta(none("Custom skills the organization has.")),
    })
    .meta(none("How much of the limits is used.")),
});
export type CustomAgentOptions = z.infer<typeof CustomAgentOptionsSchema>;

export const CustomAgentOptionsContract = defineContract(CustomAgentOptionsSchema, {
  id: "agents.CustomAgentOptions",
  kind: "view",
  description: "The models, tools and platform skills an organization's agent may select, with the plan limits and their use.",
  examples: [
    {
      models: ["chat", "reasoning"],
      tools: [{ id: "catalog.listEntities", kind: "read", source: "core", description: "Lists the data entities the caller may read." }],
      coreSkills: [{ name: "knowledge-citations", description: "How to cite knowledge base passages." }],
      limits: { maxAgents: 5, maxSkills: 10, maxInstructionChars: 8000 },
      usage: { agents: 1, skills: 2 },
    },
  ],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  permission: "core.agent-settings.read",
});

/** An agent a member can chat with: the assistant, or an enabled agent of the organization. */
export const ChatAgentOptionSchema = z.strictObject({
  id: ChatAgentIdSchema.meta(none("Chat agent id to send as `agentId` of a new conversation.")),
  name: z.string().min(1).max(100).meta(none("Display name.")),
  description: z.string().max(1000).meta(none("What the agent is for.")),
  source: z.enum(["core", "custom"]).meta(none("Shipped with the platform, or configured by the organization.")),
});
export type ChatAgentOption = z.infer<typeof ChatAgentOptionSchema>;

export const ChatAgentOptionContract = defineContract(ChatAgentOptionSchema, {
  id: "agents.ChatAgentOption",
  kind: "view",
  description: "An agent a member of the organization can start a conversation with.",
  examples: [
    { id: "assistant", name: "Assistant", description: "Plans the work and delegates to the organization's specialists.", source: "core" },
    { id: EXAMPLE_CUSTOM_AGENT_ID, name: "Onboarding guide", description: "Answers questions of new members.", source: "custom" },
  ],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  permission: "core.chat.use",
});
