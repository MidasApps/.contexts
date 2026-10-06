import { describe, expect, it } from "vitest";
import { buildAgentContextEntries, TEST_TENANT } from "../testing/agent-context-fixture.ts";
import { createFakeCustomAgentsPort } from "../testing/fake-ports.ts";
import { buildCustomAgent, buildCustomSkill, CUSTOM_AGENT_TEST_ID, OTHER_TENANT } from "./custom-agent.fixture.ts";
import { CUSTOM_AGENT_ID_KEY, createCustomAgentLoader } from "./custom-agent-loader.ts";

const contextOf = (entries: [string, unknown][]) => new Map<string, unknown>(entries);

describe("custom agent loader", () => {
  it("loads the tenant's enabled agent with the enabled skills it selected", async () => {
    const selected = buildCustomSkill();
    const disabled = buildCustomSkill({ id: "Sk000000000000000002" as never, name: "off", enabled: false });
    const unselected = buildCustomSkill({ id: "Sk000000000000000003" as never, name: "other" });
    const agent = buildCustomAgent({ customSkills: [selected.id, disabled.id] });
    const loader = createCustomAgentLoader(
      createFakeCustomAgentsPort({ agents: [agent], skills: [selected, disabled, unselected] }),
    );
    const loaded = await loader.load({ tenantId: TEST_TENANT, agentId: agent.id });
    expect(loaded?.agent.id).toBe(agent.id);
    expect(loaded?.skills.map((skill) => skill.name)).toEqual(["weekly-report"]);
  });

  it("answers null for a disabled agent, an unknown id, a malformed id and another tenant's agent", async () => {
    const port = createFakeCustomAgentsPort({
      agents: [
        buildCustomAgent({ enabled: false }),
        buildCustomAgent({ id: "Ag000000000000000002" as never, tenantId: OTHER_TENANT as never }),
      ],
    });
    const loader = createCustomAgentLoader(port);
    expect(await loader.load({ tenantId: TEST_TENANT, agentId: CUSTOM_AGENT_TEST_ID })).toBeNull();
    expect(await loader.load({ tenantId: TEST_TENANT, agentId: "Ag000000000000000009" })).toBeNull();
    expect(await loader.load({ tenantId: TEST_TENANT, agentId: "assistant" })).toBeNull();
    expect(await loader.load({ tenantId: TEST_TENANT, agentId: "Ag000000000000000002" })).toBeNull();
    // A malformed id never reaches the store.
    expect(port.reads).not.toContain(`${TEST_TENANT}:assistant`);
  });

  it("refuses a record whose tenant differs from the one asked for, whatever the port returns", async () => {
    const foreign = buildCustomAgent({ tenantId: OTHER_TENANT as never });
    const loader = createCustomAgentLoader({
      getAgent: () => Promise.resolve(foreign),
      listAgents: () => Promise.resolve([]),
      listSkills: () => Promise.resolve([]),
    });
    expect(await loader.load({ tenantId: TEST_TENANT, agentId: foreign.id })).toBeNull();
  });

  it("caches per tenant and agent until the TTL passes or the tenant is invalidated", async () => {
    let now = 1_000;
    const port = createFakeCustomAgentsPort({ agents: [buildCustomAgent()] });
    const loader = createCustomAgentLoader(port, { ttlMs: 60_000, now: () => now });
    const key = { tenantId: TEST_TENANT, agentId: CUSTOM_AGENT_TEST_ID };
    await loader.load(key);
    await loader.load(key);
    expect(port.reads).toHaveLength(1);
    now += 60_001;
    await loader.load(key);
    expect(port.reads).toHaveLength(2);
    loader.invalidate(OTHER_TENANT);
    await loader.load(key);
    expect(port.reads).toHaveLength(2);
    loader.invalidate(TEST_TENANT);
    await loader.load(key);
    expect(port.reads).toHaveLength(3);
  });

  it("serves a change after an invalidation: a disabled agent stops loading", async () => {
    const port = createFakeCustomAgentsPort({ agents: [buildCustomAgent()] });
    const loader = createCustomAgentLoader(port);
    const key = { tenantId: TEST_TENANT, agentId: CUSTOM_AGENT_TEST_ID };
    expect(await loader.load(key)).not.toBeNull();
    port.agents[0] = buildCustomAgent({ enabled: false });
    expect(await loader.load(key)).not.toBeNull();
    loader.invalidate(TEST_TENANT);
    expect(await loader.load(key)).toBeNull();
  });

  it("rejects on a store failure and does not cache it", async () => {
    let fail = true;
    const agent = buildCustomAgent();
    const loader = createCustomAgentLoader({
      getAgent: () => (fail ? Promise.reject(new Error("store down")) : Promise.resolve(agent)),
      listAgents: () => Promise.resolve([]),
      listSkills: () => Promise.resolve([]),
    });
    const key = { tenantId: TEST_TENANT, agentId: agent.id };
    await expect(loader.load(key)).rejects.toThrow("store down");
    fail = false;
    expect((await loader.load(key))?.agent.id).toBe(agent.id);
  });

  it("reads the agent of a run from the context key and the verified tenant only", async () => {
    const loader = createCustomAgentLoader(createFakeCustomAgentsPort({ agents: [buildCustomAgent()] }));
    const own = contextOf([...buildAgentContextEntries(), [CUSTOM_AGENT_ID_KEY, CUSTOM_AGENT_TEST_ID]]);
    const foreign = contextOf([
      ...buildAgentContextEntries({ tenantId: OTHER_TENANT }),
      [CUSTOM_AGENT_ID_KEY, CUSTOM_AGENT_TEST_ID],
    ]);
    const unnamed = contextOf(buildAgentContextEntries());
    const noTenant = contextOf([[CUSTOM_AGENT_ID_KEY, CUSTOM_AGENT_TEST_ID]]);
    expect((await loader.ofRun(own))?.agent.id).toBe(CUSTOM_AGENT_TEST_ID);
    expect(await loader.ofRun(foreign)).toBeNull();
    expect(await loader.ofRun(unnamed)).toBeNull();
    expect(await loader.ofRun(noTenant)).toBeNull();
    expect(await loader.ofRun(undefined)).toBeNull();
    expect(loader.isCustomRun(own)).toBe(true);
    expect(loader.isCustomRun(unnamed)).toBe(false);
  });
});
