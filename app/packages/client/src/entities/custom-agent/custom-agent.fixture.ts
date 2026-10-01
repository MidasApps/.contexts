import type { CustomAgent, CustomAgentOptions } from "@core/contracts";

export const CUSTOM_AGENT_ID = "Ag4sK2lPq0WnR5tYu3bV";

/** A record in the shape of `agents.CustomAgent` (test data by factory). */
export const buildCustomAgent = (overrides: Partial<Record<keyof CustomAgent, unknown>> = {}): CustomAgent =>
  ({
    id: CUSTOM_AGENT_ID,
    tenantId: "Jd8sK2lPq0WnR5tYu3bV",
    name: "Onboarding guide",
    description: "Answers questions of new members.",
    instructions: "Answer from the handbook.",
    model: "chat",
    tools: [],
    connectorTools: false,
    coreSkills: [],
    customSkills: [],
    knowledgeScope: "organization",
    enabled: true,
    createdBy: "uA1b2C3d4E5f6G7h8I9j",
    createdAt: "2026-09-29T14:30:00.000Z",
    updatedAt: "2026-09-29T14:30:00.000Z",
    ...overrides,
  }) as CustomAgent;

/** Options in the shape of `agents.CustomAgentOptions`. */
export const buildCustomAgentOptions = (overrides: Partial<CustomAgentOptions> = {}): CustomAgentOptions => ({
  models: ["chat", "reasoning"],
  tools: [
    { id: "catalog.listEntities", kind: "read", source: "core", description: "Lists the data entities." },
    { id: "command.tenancy.CreateProjectInput", kind: "mutation", source: "core", description: "Creates a project." },
  ],
  coreSkills: [{ name: "knowledge-citations", description: "How to cite knowledge base passages." }],
  limits: { maxAgents: 5, maxSkills: 10, maxInstructionChars: 8000 },
  usage: { agents: 1, skills: 1 },
  ...overrides,
});
