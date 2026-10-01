import { describe, expect, it } from "vitest";
import { CORE_ENDPOINTS } from "../../composition.ts";
import { AUDIT_ACTIONS } from "../audit/audit-action.schema.ts";
import { ChatAgentIdSchema } from "../conversations/conversation.schema.ts";
import { PlanLimitsSchema } from "../platform/plan.schema.ts";
import { AgentCatalogEntrySchema } from "./agent-catalog.schema.ts";
import { ChatAgentOptionSchema, CUSTOM_AGENT_LIMIT_DEFAULTS, CustomAgentOptionsSchema } from "./custom-agent-options.schema.ts";
import {
  CreateCustomAgentInputSchema,
  CUSTOM_AGENT_MODELS,
  CUSTOM_AGENT_RUNTIME_ID,
  CustomAgentIdSchema,
  CustomAgentSchema,
  EXAMPLE_CUSTOM_AGENT_ID,
  UpdateCustomAgentInputSchema,
} from "./custom-agent.schema.ts";
import { CUSTOM_AGENT_ENDPOINTS } from "./custom-endpoints.ts";
import { CreateCustomSkillInputSchema, CustomSkillNameSchema, MAX_CUSTOM_INSTRUCTION_CHARS, UpdateCustomSkillInputSchema } from "./custom-skill.schema.ts";

const AGENT_INPUT = { name: "Guide", description: "Helps new members.", instructions: "Be brief." };

describe("custom agent contracts (decision 0046)", () => {
  it("accepts a minimal agent and rejects server-owned and unknown fields", () => {
    expect(CreateCustomAgentInputSchema.safeParse(AGENT_INPUT).success).toBe(true);
    expect(CreateCustomAgentInputSchema.safeParse({ ...AGENT_INPUT, tenantId: "other" }).success).toBe(false);
    expect(CreateCustomAgentInputSchema.safeParse({ ...AGENT_INPUT, code: "process.exit()" }).success).toBe(false);
  });

  it("allows only the platform's model roles, never a provider model id", () => {
    expect(CUSTOM_AGENT_MODELS).toEqual(["chat", "reasoning"]);
    expect(CreateCustomAgentInputSchema.safeParse({ ...AGENT_INPUT, model: "reasoning" }).success).toBe(true);
    expect(CreateCustomAgentInputSchema.safeParse({ ...AGENT_INPUT, model: "openai/gpt-5" }).success).toBe(false);
  });

  it("caps instructions, tools and skills and refuses duplicates", () => {
    expect(CreateCustomAgentInputSchema.safeParse({ ...AGENT_INPUT, instructions: "x".repeat(MAX_CUSTOM_INSTRUCTION_CHARS + 1) }).success).toBe(false);
    expect(CreateCustomAgentInputSchema.safeParse({ ...AGENT_INPUT, tools: Array.from({ length: 51 }, (_, index) => `a.t${index}`) }).success).toBe(false);
    expect(CreateCustomAgentInputSchema.safeParse({ ...AGENT_INPUT, tools: ["a.b", "a.b"] }).success).toBe(false);
    expect(CreateCustomAgentInputSchema.safeParse({ ...AGENT_INPUT, customSkills: ["not-an-id"] }).success).toBe(false);
  });

  it("requires at least one field in an update", () => {
    expect(UpdateCustomAgentInputSchema.safeParse({}).success).toBe(false);
    expect(UpdateCustomAgentInputSchema.safeParse({ enabled: false }).success).toBe(true);
    expect(UpdateCustomSkillInputSchema.safeParse({}).success).toBe(false);
  });

  it("names skills in kebab-case, at most 60 characters", () => {
    expect(CustomSkillNameSchema.safeParse("weekly-report").success).toBe(true);
    for (const name of ["Weekly", "weekly_report", "-x", "x-", "a".repeat(61), "org skill"]) expect(CustomSkillNameSchema.safeParse(name).success).toBe(false);
    expect(CreateCustomSkillInputSchema.safeParse({ name: "weekly-report", description: "When.", instructions: "How." }).success).toBe(true);
  });

  it("keeps custom agent ids apart from code-defined agent keys", () => {
    expect(CustomAgentIdSchema.safeParse(EXAMPLE_CUSTOM_AGENT_ID).success).toBe(true);
    for (const id of ["assistant", "knowledge", CUSTOM_AGENT_RUNTIME_ID, "custom-agent-chat", "", "a/b"]) expect(CustomAgentIdSchema.safeParse(id).success).toBe(false);
  });

  it("accepts the assistant and a custom agent id as chat agent ids, nothing else", () => {
    expect(ChatAgentIdSchema.safeParse("assistant").success).toBe(true);
    expect(ChatAgentIdSchema.safeParse(EXAMPLE_CUSTOM_AGENT_ID).success).toBe(true);
    for (const id of ["ping", "knowledge", CUSTOM_AGENT_RUNTIME_ID, "assistant-chat"]) expect(ChatAgentIdSchema.safeParse(id).success).toBe(false);
    expect(ChatAgentOptionSchema.safeParse({ id: EXAMPLE_CUSTOM_AGENT_ID, name: "Guide", description: "", source: "custom" }).success).toBe(true);
  });

  it("lists custom agents and skills in the catalog next to code-defined ones", () => {
    const entry = { key: EXAMPLE_CUSTOM_AGENT_ID, name: "Guide", description: "Helps.", source: "custom", moduleId: null, enabled: true, tools: [], skills: [{ name: "org-weekly-report", description: "How.", source: "custom" }] };
    expect(AgentCatalogEntrySchema.safeParse(entry).success).toBe(true);
    expect(AgentCatalogEntrySchema.safeParse({ ...entry, key: "knowledge", source: "core" }).success).toBe(true);
    expect(AgentCatalogEntrySchema.safeParse({ ...entry, key: "Not A Key" }).success).toBe(false);
  });

  it("keeps plans stored before the custom limits valid and accepts the new limits", () => {
    const stored = { monthlyMicroUsd: 1, monthlyTokens: 1, maxConnectors: 1, features: [] };
    expect(PlanLimitsSchema.safeParse(stored).success).toBe(true);
    expect(PlanLimitsSchema.safeParse({ ...stored, maxCustomAgents: 20, maxCustomSkills: 40, maxCustomInstructionChars: 12_000 }).success).toBe(true);
    expect(CUSTOM_AGENT_LIMIT_DEFAULTS.maxInstructionChars).toBeLessThanOrEqual(MAX_CUSTOM_INSTRUCTION_CHARS);
  });

  it("describes the options with limits and usage", () => {
    const options = { models: ["chat"], tools: [], coreSkills: [], limits: { maxAgents: 5, maxSkills: 10, maxInstructionChars: 8000 }, usage: { agents: 0, skills: 0 } };
    expect(CustomAgentOptionsSchema.safeParse(options).success).toBe(true);
    expect(CustomAgentOptionsSchema.safeParse({ ...options, models: ["openai/gpt-5"] }).success).toBe(false);
  });

  it("declares the CRUD under /v1/agents and /v1/skills and registers every endpoint", () => {
    const routes = CUSTOM_AGENT_ENDPOINTS.map((endpoint) => `${endpoint.method} ${endpoint.path}`);
    expect(routes).toEqual([
      "POST /v1/agents",
      "GET /v1/agents/{agentId}",
      "PATCH /v1/agents/{agentId}",
      "DELETE /v1/agents/{agentId}",
      "GET /v1/agent-options",
      "GET /v1/chat-agents",
      "GET /v1/skills",
      "POST /v1/skills",
      "GET /v1/skills/{skillId}",
      "PATCH /v1/skills/{skillId}",
      "DELETE /v1/skills/{skillId}",
    ]);
    for (const endpoint of CUSTOM_AGENT_ENDPOINTS) expect(CORE_ENDPOINTS).toContain(endpoint);
    expect(CustomAgentSchema.shape.tenantId).toBeDefined();
  });

  it("has an audit action for every mutation", () => {
    for (const action of ["CUSTOM_AGENT_CREATED", "CUSTOM_AGENT_UPDATED", "CUSTOM_AGENT_DELETED", "CUSTOM_SKILL_CREATED", "CUSTOM_SKILL_UPDATED", "CUSTOM_SKILL_DELETED"]) {
      expect(AUDIT_ACTIONS).toContain(action);
    }
  });
});
