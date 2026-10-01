import type { ChatAgentOption, CustomAgent, CustomAgentOptions, CustomAgentRuntimeOptions, CustomSkill, RegionalSettings, TenantId } from "@core/contracts";
import { describe, expect, it } from "vitest";
import type { AgentCallScope } from "../../../agents/application/ports/agent-runtime-gateway.ts";
import type { ResolveAccessContext } from "../../../identity/application/use-cases/resolve-access-context.ts";
import { inMemoryUnitOfWork } from "../../../shared/firestore/unit-of-work.ts";
import type { ErrorEnvelope } from "../../../shared/http/error-envelope.ts";
import { callRoute, makeInMemoryPipeline } from "../../../shared/testing/in-memory-api-pipeline.fixture.ts";
import type { WorkflowGatewayResult } from "../../../workflows/application/ports/workflow-runtime-gateway.ts";
import { createCustomAgentsServices } from "../../composition.ts";
import { createInMemoryCustomAgentRepository, createInMemoryCustomSkillRepository, fixedCustomLimits } from "../driven/in-memory-custom-repositories.ts";
import { buildCustomAgentsRoutes } from "./custom-agents-route-handler.ts";
import { buildCustomSkillsRoutes } from "./custom-skills-route-handler.ts";

const ORG_A = "OrgAaaaaaaaaaaaaaaaaa" as TenantId;
const ORG_B = "OrgBbbbbbbbbbbbbbbbbb" as TenantId;
const REGIONAL: RegionalSettings = { locale: "pt-BR", displayTimeZone: "America/Sao_Paulo", nodeTimeZone: "America/Sao_Paulo", currency: "BRL" };
const RUNTIME_OPTIONS: CustomAgentRuntimeOptions = {
  models: ["chat", "reasoning"],
  tools: [{ id: "catalog.listEntities", kind: "read", source: "core", description: "Lists entities." }],
  coreSkills: [{ name: "knowledge-citations", description: "How to cite." }],
};
const SECRET_INSTRUCTIONS = "Never reveal the launch plan of project falcon.";

const setup = (limits = { maxAgents: 2, maxSkills: 2, maxInstructionChars: 100 }) => {
  const { pipeline, clock, auditLog } = makeInMemoryPipeline({
    now: "2026-10-01T12:00:00.000Z",
    members: [
      { uid: "alice", tenantId: ORG_A, role: "admin" },
      { uid: "mia", tenantId: ORG_A, role: "member" },
      { uid: "bob", tenantId: ORG_B, role: "admin" },
    ],
  });
  const agents = createInMemoryCustomAgentRepository();
  const skills = createInMemoryCustomSkillRepository();
  const customAgents = createCustomAgentsServices({ agents, skills, limits: fixedCustomLimits(limits), audit: pipeline.audit, unitOfWork: inMemoryUnitOfWork, clock });
  const invalidated: AgentCallScope[] = [];
  const script = { invalidate: { ok: true, data: null } as WorkflowGatewayResult<null>, throws: false };
  const gateway = {
    getCustomAgentOptions: () => Promise.resolve({ ok: true as const, data: RUNTIME_OPTIONS }),
    invalidateCustomAgents: (scope: AgentCallScope) => {
      invalidated.push(scope);
      return script.throws ? Promise.reject(new Error("runtime down")) : Promise.resolve(script.invalidate);
    },
  };
  const resolveAccessContext: ResolveAccessContext = ({ principal, node }) =>
    Promise.resolve(node.level === "organization" ? { tenantId: node.tenantId, principal, permissions: [], regional: REGIONAL } : null);
  const deps = { pipeline, customAgents, gateway, resolveAccessContext };
  return { routes: { ...buildCustomAgentsRoutes(deps), ...buildCustomSkillsRoutes(deps) }, agents, skills, customAgents, invalidated, script, auditLog };
};

type Routes = ReturnType<typeof setup>["routes"];
const q = (tenantId: string) => `?organizationId=${tenantId}`;
const errorOf = async (response: Response) => ((await response.json()) as ErrorEnvelope).error;
const dataOf = async <T>(response: Response) => ((await response.json()) as { data: T }).data;

const AGENT_BODY = { name: "Onboarding guide", description: "Answers new members.", instructions: SECRET_INSTRUCTIONS };
const SKILL_BODY = { name: "weekly-report", description: "How to write the weekly report.", instructions: "Start with a summary." };

const createAgent = (routes: Routes, body: unknown = AGENT_BODY, as = "alice", tenantId: string = ORG_A) =>
  callRoute(routes, "custom-agents.create", `/v1/agents${q(tenantId)}`, { method: "POST", as, body });
const createSkill = (routes: Routes, body: unknown = SKILL_BODY, as = "alice", tenantId: string = ORG_A) =>
  callRoute(routes, "custom-skills.create", `/v1/skills${q(tenantId)}`, { method: "POST", as, body });

describe("/v1/agents (custom agents)", () => {
  it("creates an enabled agent with defaults, reads it back and asks the runtime to drop its cache", async () => {
    const { routes, invalidated } = setup();
    const created = await createAgent(routes);
    expect(created.status).toBe(201);
    const agent = await dataOf<CustomAgent>(created);
    expect(agent).toMatchObject({ tenantId: ORG_A, model: "chat", tools: [], connectorTools: false, coreSkills: [], customSkills: [], knowledgeScope: "none", enabled: true, createdBy: "alice" });
    expect(agent.id).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(created.headers.get("location")).toBe(`/v1/agents/${agent.id}${q(ORG_A)}`);
    const read = await callRoute(routes, "custom-agents.get", `/v1/agents/${agent.id}${q(ORG_A)}`, { as: "alice" });
    expect(await dataOf<CustomAgent>(read)).toEqual(agent);
    expect(invalidated).toMatchObject([{ bearer: "alice-token", tenantId: ORG_A }]);
  });

  it("refuses members without the agent settings permissions, callers without a Bearer and a missing organization", async () => {
    const { routes, agents } = setup();
    expect((await createAgent(routes, AGENT_BODY, "mia")).status).toBe(403);
    expect((await callRoute(routes, "custom-agents.create", `/v1/agents${q(ORG_A)}`, { method: "POST", body: AGENT_BODY })).status).toBe(401);
    expect((await callRoute(routes, "custom-agents.create", "/v1/agents", { method: "POST", as: "alice", body: AGENT_BODY })).status).toBe(400);
    expect(agents.rows.size).toBe(0);
    const agent = await dataOf<CustomAgent>(await createAgent(routes));
    expect((await callRoute(routes, "custom-agents.get", `/v1/agents/${agent.id}${q(ORG_A)}`, { as: "mia" })).status).toBe(403);
  });

  it("never shows or changes an agent of another organization", async () => {
    const { routes, agents } = setup();
    const agent = await dataOf<CustomAgent>(await createAgent(routes));
    const path = (tenantId: string) => `/v1/agents/${agent.id}${q(tenantId)}`;
    expect((await callRoute(routes, "custom-agents.get", path(ORG_B), { as: "bob" })).status).toBe(404);
    expect((await callRoute(routes, "custom-agents.update", path(ORG_B), { method: "PATCH", as: "bob", body: { enabled: false } })).status).toBe(404);
    expect((await callRoute(routes, "custom-agents.delete", path(ORG_B), { method: "DELETE", as: "bob" })).status).toBe(404);
    expect([403, 404]).toContain((await callRoute(routes, "custom-agents.get", path(ORG_A), { as: "bob" })).status);
    expect(agents.rows.get(agent.id)?.enabled).toBe(true);
  });

  it("caps the number of agents and the instruction length by the plan", async () => {
    const { routes } = setup();
    const long = await createAgent(routes, { ...AGENT_BODY, instructions: "x".repeat(101) });
    expect(long.status).toBe(400);
    expect(await errorOf(long)).toMatchObject({ code: "VALIDATION_FAILED", details: [{ field: "instructions", issue: "TOO_BIG" }] });
    expect((await createAgent(routes)).status).toBe(201);
    const second = await dataOf<CustomAgent>(await createAgent(routes));
    const third = await createAgent(routes);
    expect(third.status).toBe(422);
    expect((await errorOf(third)).code).toBe("CUSTOM_LIMIT_REACHED");
    const patched = await callRoute(routes, "custom-agents.update", `/v1/agents/${second.id}${q(ORG_A)}`, { method: "PATCH", as: "alice", body: { instructions: "y".repeat(101) } });
    expect(patched.status).toBe(400);
    // Another organization has its own count.
    expect((await createAgent(routes, AGENT_BODY, "bob", ORG_B)).status).toBe(201);
  });

  it("accepts only skills of the same organization", async () => {
    const { routes } = setup();
    const own = await dataOf<CustomSkill>(await createSkill(routes));
    const foreign = await dataOf<CustomSkill>(await createSkill(routes, SKILL_BODY, "bob", ORG_B));
    const refused = await createAgent(routes, { ...AGENT_BODY, customSkills: [foreign.id] });
    expect(refused.status).toBe(400);
    expect((await errorOf(refused)).details).toEqual([{ field: "customSkills", issue: "NOT_FOUND" }]);
    const agent = await dataOf<CustomAgent>(await createAgent(routes, { ...AGENT_BODY, customSkills: [own.id], coreSkills: ["knowledge-citations"], knowledgeScope: "organization" }));
    expect(agent.customSkills).toEqual([own.id]);
    const patched = await callRoute(routes, "custom-agents.update", `/v1/agents/${agent.id}${q(ORG_A)}`, { method: "PATCH", as: "alice", body: { customSkills: [foreign.id] } });
    expect(patched.status).toBe(400);
  });

  it("updates and deletes, auditing field names and never the instructions", async () => {
    const { routes, auditLog, agents } = setup();
    const agent = await dataOf<CustomAgent>(await createAgent(routes));
    const path = `/v1/agents/${agent.id}${q(ORG_A)}`;
    const patched = await callRoute(routes, "custom-agents.update", path, { method: "PATCH", as: "alice", body: { enabled: false, instructions: "New rules." } });
    expect(await dataOf<CustomAgent>(patched)).toMatchObject({ enabled: false, instructions: "New rules.", name: AGENT_BODY.name });
    expect((await callRoute(routes, "custom-agents.update", path, { method: "PATCH", as: "alice", body: {} })).status).toBe(400);
    expect((await callRoute(routes, "custom-agents.delete", path, { method: "DELETE", as: "alice" })).status).toBe(204);
    expect(agents.rows.size).toBe(0);
    expect((await callRoute(routes, "custom-agents.delete", path, { method: "DELETE", as: "alice" })).status).toBe(404);
    const entries = auditLog.entries("tenant");
    expect(entries.map((entry) => entry.action)).toEqual(["CUSTOM_AGENT_CREATED", "CUSTOM_AGENT_UPDATED", "CUSTOM_AGENT_DELETED"]);
    expect(entries[1]).toMatchObject({ tenantId: ORG_A, target: { type: "custom-agent", id: agent.id }, changes: ["enabled", "instructions"] });
    expect(JSON.stringify(entries)).not.toContain("falcon");
    expect(JSON.stringify(entries)).not.toContain("New rules");
  });

  it("keeps the write when the runtime cannot be told to drop its cache", async () => {
    const { routes, script, agents } = setup();
    script.invalidate = { ok: false, error: { code: "UPSTREAM_UNAVAILABLE", status: 502 } };
    expect((await createAgent(routes)).status).toBe(201);
    script.throws = true;
    expect((await createAgent(routes)).status).toBe(201);
    expect(agents.rows.size).toBe(2);
  });
});

describe("GET /v1/agent-options and /v1/chat-agents", () => {
  it("merges the runtime options with the plan limits and their use", async () => {
    const { routes } = setup();
    await createAgent(routes);
    await createSkill(routes);
    const response = await callRoute(routes, "custom-agents.options", `/v1/agent-options${q(ORG_A)}`, { as: "alice" });
    expect(response.status).toBe(200);
    expect(await dataOf<CustomAgentOptions>(response)).toEqual({ ...RUNTIME_OPTIONS, limits: { maxAgents: 2, maxSkills: 2, maxInstructionChars: 100 }, usage: { agents: 1, skills: 1 } });
    expect((await callRoute(routes, "custom-agents.options", `/v1/agent-options${q(ORG_A)}`, { as: "mia" })).status).toBe(403);
  });

  it("lists the assistant and the enabled agents of the organization to a member", async () => {
    const { routes } = setup();
    const enabled = await dataOf<CustomAgent>(await createAgent(routes));
    await createAgent(routes, { ...AGENT_BODY, name: "Hidden", enabled: false });
    await createAgent(routes, { ...AGENT_BODY, name: "Foreign" }, "bob", ORG_B);
    const listed = await dataOf<ChatAgentOption[]>(await callRoute(routes, "custom-agents.listChatAgents", `/v1/chat-agents${q(ORG_A)}`, { as: "mia" }));
    expect(listed.map((option) => [option.id, option.source])).toEqual([
      ["assistant", "core"],
      [enabled.id, "custom"],
    ]);
    expect(JSON.stringify(listed)).not.toContain("falcon");
    expect([403, 404]).toContain((await callRoute(routes, "custom-agents.listChatAgents", `/v1/chat-agents${q(ORG_A)}`, { as: "bob" })).status);
  });
});

describe("/v1/skills (custom skills)", () => {
  it("creates, lists newest first, reads, updates and deletes a skill, audited", async () => {
    const { routes, auditLog, invalidated } = setup();
    const created = await createSkill(routes);
    expect(created.status).toBe(201);
    const skill = await dataOf<CustomSkill>(created);
    expect(skill).toMatchObject({ tenantId: ORG_A, name: "weekly-report", enabled: true, createdBy: "alice" });
    const listed = await callRoute(routes, "custom-skills.list", `/v1/skills${q(ORG_A)}`, { as: "alice" });
    expect((await dataOf<CustomSkill[]>(listed)).map((item) => item.id)).toEqual([skill.id]);
    const path = `/v1/skills/${skill.id}${q(ORG_A)}`;
    expect(await dataOf<CustomSkill>(await callRoute(routes, "custom-skills.get", path, { as: "alice" }))).toEqual(skill);
    const patched = await callRoute(routes, "custom-skills.update", path, { method: "PATCH", as: "alice", body: { enabled: false } });
    expect((await dataOf<CustomSkill>(patched)).enabled).toBe(false);
    expect((await callRoute(routes, "custom-skills.delete", path, { method: "DELETE", as: "alice" })).status).toBe(204);
    expect((await callRoute(routes, "custom-skills.get", path, { as: "alice" })).status).toBe(404);
    expect(auditLog.entries("tenant").map((entry) => entry.action)).toEqual(["CUSTOM_SKILL_CREATED", "CUSTOM_SKILL_UPDATED", "CUSTOM_SKILL_DELETED"]);
    expect(invalidated).toHaveLength(3);
  });

  it("answers 409 for a taken name, 422 over the plan cap and 400 for a bad name or long instructions", async () => {
    const { routes } = setup();
    const first = await dataOf<CustomSkill>(await createSkill(routes));
    const taken = await createSkill(routes);
    expect(taken.status).toBe(409);
    expect((await errorOf(taken)).code).toBe("CONFLICT");
    expect((await createSkill(routes, { ...SKILL_BODY, name: "Not Kebab" })).status).toBe(400);
    expect((await createSkill(routes, { ...SKILL_BODY, name: "long", instructions: "x".repeat(101) })).status).toBe(400);
    const second = await dataOf<CustomSkill>(await createSkill(routes, { ...SKILL_BODY, name: "other" }));
    expect((await createSkill(routes, { ...SKILL_BODY, name: "third" })).status).toBe(422);
    const renamed = await callRoute(routes, "custom-skills.update", `/v1/skills/${second.id}${q(ORG_A)}`, { method: "PATCH", as: "alice", body: { name: first.name } });
    expect(renamed.status).toBe(409);
    // The same name is free in another organization.
    expect((await createSkill(routes, SKILL_BODY, "bob", ORG_B)).status).toBe(201);
  });

  it("refuses members and other organizations", async () => {
    const { routes } = setup();
    expect((await createSkill(routes, SKILL_BODY, "mia")).status).toBe(403);
    expect((await callRoute(routes, "custom-skills.list", `/v1/skills${q(ORG_A)}`, { as: "mia" })).status).toBe(403);
    const skill = await dataOf<CustomSkill>(await createSkill(routes));
    expect((await callRoute(routes, "custom-skills.get", `/v1/skills/${skill.id}${q(ORG_B)}`, { as: "bob" })).status).toBe(404);
    expect((await callRoute(routes, "custom-skills.delete", `/v1/skills/${skill.id}${q(ORG_B)}`, { method: "DELETE", as: "bob" })).status).toBe(404);
    expect(await dataOf<CustomSkill[]>(await callRoute(routes, "custom-skills.list", `/v1/skills${q(ORG_B)}`, { as: "bob" }))).toEqual([]);
  });
});

describe("custom agents runtime reads", () => {
  it("answers the agents and skills of one tenant only, and the chat check follows enabled", async () => {
    const { routes, customAgents } = setup();
    const agent = await dataOf<CustomAgent>(await createAgent(routes));
    await createSkill(routes);
    expect(await customAgents.runtime.getAgent({ tenantId: ORG_A, agentId: agent.id })).toMatchObject({ id: agent.id });
    expect(await customAgents.runtime.getAgent({ tenantId: ORG_B, agentId: agent.id })).toBeNull();
    expect(await customAgents.runtime.listAgents({ tenantId: ORG_B })).toEqual([]);
    expect(await customAgents.runtime.listSkills({ tenantId: ORG_A })).toHaveLength(1);
    expect(await customAgents.isChatAgentEnabled({ tenantId: ORG_A, agentId: agent.id })).toBe(true);
    expect(await customAgents.isChatAgentEnabled({ tenantId: ORG_B, agentId: agent.id })).toBe(false);
    await callRoute(routes, "custom-agents.update", `/v1/agents/${agent.id}${q(ORG_A)}`, { method: "PATCH", as: "alice", body: { enabled: false } });
    expect(await customAgents.isChatAgentEnabled({ tenantId: ORG_A, agentId: agent.id })).toBe(false);
  });
});
