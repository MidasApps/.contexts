import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS, EXAMPLE_TIMES } from "../example-values.ts";
import { none, personal } from "../field-docs.ts";
import { TenantIdSchema, UserIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { hasUniqueItems } from "../primitives/refinements.ts";
import { CustomSkillIdSchema, EXAMPLE_CUSTOM_SKILL_ID, MAX_CUSTOM_INSTRUCTION_CHARS } from "./custom-skill.schema.ts";

/**
 * Firestore automatic id of a custom agent (20 letters and digits). It is also the agent's public
 * chat id (`/v1/chat` `agentId`), so the pattern keeps it apart from code-defined agent keys.
 */
export const CustomAgentIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9]{20}$/, { error: "Expected a custom agent id." })
  .brand<"CustomAgentId">();
export type CustomAgentId = z.infer<typeof CustomAgentIdSchema>;

/**
 * Id of the one Mastra agent that runs every custom agent (decision 0046). It is never a public
 * chat id: `/v1` maps a custom agent's memory calls to it.
 */
export const CUSTOM_AGENT_RUNTIME_ID = "custom-agent";

/**
 * Models a custom agent may use: the platform's model roles (decision 0021), never a provider
 * model id. `chat` is the default model; `reasoning` the stronger one.
 */
export const CUSTOM_AGENT_MODELS = ["chat", "reasoning"] as const;
export const CustomAgentModelSchema = z.enum(CUSTOM_AGENT_MODELS);
export type CustomAgentModel = z.infer<typeof CustomAgentModelSchema>;

/**
 * What the agent may search in the knowledge base: nothing, the organization's documents, those
 * plus the active project's, or everything the caller may search (the data catalog included).
 */
export const CUSTOM_AGENT_KNOWLEDGE_SCOPES = ["none", "organization", "project", "all"] as const;
export const CustomAgentKnowledgeScopeSchema = z.enum(CUSTOM_AGENT_KNOWLEDGE_SCOPES);
export type CustomAgentKnowledgeScope = z.infer<typeof CustomAgentKnowledgeScopeSchema>;

export const MAX_CUSTOM_AGENT_TOOLS = 50;
export const MAX_CUSTOM_AGENT_SKILLS = 20;

const unique = { error: "Items must be unique." };

const fields = {
  name: z.string().trim().min(1).max(100).meta(none("Display name of the agent.")),
  description: z.string().trim().min(1).max(1000).meta(none("What the agent is for.")),
  instructions: z
    .string()
    .min(1)
    .max(MAX_CUSTOM_INSTRUCTION_CHARS)
    .meta(personal("Markdown instructions written by the organization; untrusted input placed after the platform's own instructions.")),
  model: CustomAgentModelSchema.meta(none("Model role the agent runs on, from the platform's allowlist.")),
  tools: z
    .array(z.string().min(1).max(200))
    .max(MAX_CUSTOM_AGENT_TOOLS)
    .refine(hasUniqueItems, unique)
    .meta(none("Ids of the tools the agent may call, from `GET /v1/agent-options`; an id the runtime does not offer is refused on write (one that disappears later is ignored at run time).")),
  connectorTools: z.boolean().meta(none("Whether the agent also gets the read-only tools of the organization's connectors.")),
  coreSkills: z
    .array(z.string().min(1).max(100))
    .max(MAX_CUSTOM_AGENT_SKILLS)
    .refine(hasUniqueItems, unique)
    .meta(none("Names of the platform skills the agent loads, from `GET /v1/agent-options`; an unknown name is refused on write.")),
  customSkills: z
    .array(CustomSkillIdSchema)
    .max(MAX_CUSTOM_AGENT_SKILLS)
    .refine(hasUniqueItems, unique)
    .meta(none("Ids of the organization's own skills the agent loads; disabled or deleted ones are ignored.")),
  knowledgeScope: CustomAgentKnowledgeScopeSchema.meta(none("What the agent may search in the knowledge base.")),
  enabled: z.boolean().meta(none("Whether members can chat with the agent.")),
};

/**
 * An agent an organization configured (Firestore `custom-agents/{id}`, decision 0046).
 * Configuration only: the platform runs it through the same pipeline as its own agents.
 */
export const CustomAgentSchema = z.strictObject({
  id: CustomAgentIdSchema.meta(none("Firestore automatic id; also the agent's chat id.")),
  tenantId: TenantIdSchema.meta(none("Owning organization.")),
  ...fields,
  createdBy: UserIdSchema.meta(personal("Uid of the admin who created it.")),
  createdAt: IsoDateTimeSchema.meta(none("When the agent was created (UTC).")),
  updatedAt: IsoDateTimeSchema.meta(none("When the agent last changed (UTC).")),
});
export type CustomAgent = z.infer<typeof CustomAgentSchema>;

export const EXAMPLE_CUSTOM_AGENT_ID = "Ag4sK2lPq0WnR5tYu3bV";

const AGENT_EXAMPLE = {
  name: "Onboarding guide",
  description: "Answers questions of new members from the organization's handbook.",
  instructions: "Answer from the handbook. Keep answers short and link the page you used.",
  model: "chat",
  tools: [],
  connectorTools: false,
  coreSkills: ["knowledge-citations"],
  customSkills: [EXAMPLE_CUSTOM_SKILL_ID],
  knowledgeScope: "organization",
} as const;

export const CustomAgentContract = defineContract(CustomAgentSchema, {
  id: "agents.CustomAgent",
  kind: "entity",
  description: "An agent an organization configured: instructions, a model role, tools, skills and a knowledge scope.",
  examples: [
    {
      ...AGENT_EXAMPLE,
      id: EXAMPLE_CUSTOM_AGENT_ID,
      tenantId: EXAMPLE_IDS.organization,
      enabled: true,
      createdBy: EXAMPLE_IDS.user,
      createdAt: EXAMPLE_TIMES.created,
      updatedAt: EXAMPLE_TIMES.created,
    },
  ],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "core.agent-settings.read",
});

/** Body of `POST /v1/agents`: absent lists are empty, the model defaults to `chat`, the knowledge scope to `none`. */
export const CreateCustomAgentInputSchema = z.strictObject({
  name: fields.name,
  description: fields.description,
  instructions: fields.instructions,
  model: fields.model.optional(),
  tools: fields.tools.optional(),
  connectorTools: fields.connectorTools.optional(),
  coreSkills: fields.coreSkills.optional(),
  customSkills: fields.customSkills.optional(),
  knowledgeScope: fields.knowledgeScope.optional(),
  enabled: fields.enabled.optional(),
});
export type CreateCustomAgentInput = z.infer<typeof CreateCustomAgentInputSchema>;

export const CreateCustomAgentInputContract = defineContract(CreateCustomAgentInputSchema, {
  id: "agents.CreateCustomAgentInput",
  kind: "command",
  description: "Creates an agent of the organization.",
  examples: [AGENT_EXAMPLE],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "core.agent-settings.update",
});

/** Body of `PATCH /v1/agents/{agentId}`: absent fields keep their value; lists are replaced whole. */
export const UpdateCustomAgentInputSchema = z
  .strictObject({
    name: fields.name.optional(),
    description: fields.description.optional(),
    instructions: fields.instructions.optional(),
    model: fields.model.optional(),
    tools: fields.tools.optional(),
    connectorTools: fields.connectorTools.optional(),
    coreSkills: fields.coreSkills.optional(),
    customSkills: fields.customSkills.optional(),
    knowledgeScope: fields.knowledgeScope.optional(),
    enabled: fields.enabled.optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), { error: "Change at least one field." });
export type UpdateCustomAgentInput = z.infer<typeof UpdateCustomAgentInputSchema>;

export const UpdateCustomAgentInputContract = defineContract(UpdateCustomAgentInputSchema, {
  id: "agents.UpdateCustomAgentInput",
  kind: "command",
  description: "Changes an agent's configuration or enabled state.",
  examples: [{ enabled: false }, { tools: ["catalog.listEntities"], knowledgeScope: "all" }],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "core.agent-settings.update",
});
