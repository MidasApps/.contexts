import { z } from "zod";
import { defineContract } from "../contract.ts";
import { none } from "../field-docs.ts";

/** `supervisor`: the chat entry point; `entry`: reachable on its own; `subagent`: reached only through the supervisor. */
export const AdminAgentRoleSchema = z.enum(["supervisor", "entry", "subagent"]);
export type AdminAgentRole = z.infer<typeof AdminAgentRoleSchema>;

/** `always`: every organization has it; `per-organization`: only organizations whose agent settings enable it. */
export const AdminAgentEnablementSchema = z.enum(["always", "per-organization"]);

const idList = (description: string) => z.array(z.string().min(1).max(200)).max(500).meta(none(description));

/** An agent registered in the runtime, as `/admin/agents` lists it (decision 0044). Registry data only: no prompt, no tenant data. */
export const AdminAgentSchema = z.strictObject({
  id: z.string().min(1).max(120).meta(none("Agent id (module agents are prefixed by the module id).")),
  name: z.string().min(1).max(120).meta(none("Name the runtime registered (English, from code).")),
  description: z.string().max(1000).meta(none("What the agent does, as registered (English, from code).")),
  role: AdminAgentRoleSchema.meta(none("`supervisor`, `entry` or `subagent`.")),
  enablement: AdminAgentEnablementSchema.meta(none("`always`, or `per-organization` when the organization's agent settings decide.")),
  subagents: idList("Ids of the agents it may delegate to (the supervisor); the organization's settings narrow them per run."),
  tools: idList("Ids of the tools it has in every organization."),
  toolsVaryByOrganization: z.boolean().meta(none("True when it also gets tools from the organization's connectors or web opt-ins.")),
  skills: idList("Names of the core skills it loads; skills of enabled modules come on top."),
  permissions: idList("Its ceiling: the permissions its tool calls may ever use (the caller's permissions narrow them)."),
});
export type AdminAgent = z.infer<typeof AdminAgentSchema>;

export const AdminAgentContract = defineContract(AdminAgentSchema, {
  id: "platform.AdminAgent",
  kind: "view",
  description: "A registered agent for staff: its role, subagents, tools, skills, permission ceiling and whether organizations enable it.",
  examples: [
    {
      id: "knowledge",
      name: "Knowledge",
      description: "Answers questions about the organization's documents and data catalog from the knowledge base, citing every claim.",
      role: "subagent",
      enablement: "per-organization",
      subagents: [],
      tools: ["knowledge.searchKnowledge"],
      toolsVaryByOrganization: false,
      skills: ["knowledge-citations"],
      permissions: ["core.chat.use", "core.knowledge.read", "core.catalog.read"],
    },
  ],
  pii: "none",
  tenancyScope: "platform",
  relations: [],
  permission: "platform.agent.manage",
});
