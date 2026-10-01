import { type CustomAgent, CustomAgentSchema, type CustomSkill, CustomSkillSchema } from "@core/contracts";
import { TEST_TENANT, TEST_UID } from "../testing/agent-context-fixture.ts";

/** Test-only factories of tenant-defined agents and skills (decision 0046). */

export const CUSTOM_AGENT_TEST_ID = "Ag4sK2lPq0WnR5tYu3bV";
export const CUSTOM_SKILL_TEST_ID = "Sk7cX9zA1sD3fG5hJ7kL";
export const OTHER_TENANT = "Zz9yX8wV7uT6sR5qP4oN";

const TIME = "2026-10-01T12:00:00.000Z";

export const buildCustomAgent = (overrides: Partial<CustomAgent> = {}): CustomAgent =>
  CustomAgentSchema.parse({
    id: CUSTOM_AGENT_TEST_ID,
    tenantId: TEST_TENANT,
    name: "Onboarding guide",
    description: "Answers questions of new members.",
    instructions: "Answer in two sentences.",
    model: "chat",
    tools: [],
    connectorTools: false,
    coreSkills: [],
    customSkills: [],
    knowledgeScope: "none",
    enabled: true,
    createdBy: TEST_UID,
    createdAt: TIME,
    updatedAt: TIME,
    ...overrides,
  });

export const buildCustomSkill = (overrides: Partial<CustomSkill> = {}): CustomSkill =>
  CustomSkillSchema.parse({
    id: CUSTOM_SKILL_TEST_ID,
    tenantId: TEST_TENANT,
    name: "weekly-report",
    description: "How to write the weekly report.",
    instructions: "# Weekly report\n\nStart with a summary.",
    enabled: true,
    createdBy: TEST_UID,
    createdAt: TIME,
    updatedAt: TIME,
    ...overrides,
  });
