import { describe, expect, it } from "vitest";
import { bindCustomAgentsPort } from "./custom-agents-port-binding.ts";

const TENANT = "Jd8sK2lPq0WnR5tYu3bV";
const AGENT = "Ag4sK2lPq0WnR5tYu3bV";

const setup = () => {
  const calls: unknown[] = [];
  const port = bindCustomAgentsPort({
    getAgent: (input) => {
      calls.push(["getAgent", input]);
      return Promise.resolve(null);
    },
    listAgents: (input) => {
      calls.push(["listAgents", input]);
      return Promise.resolve([]);
    },
    listSkills: (input) => {
      calls.push(["listSkills", input]);
      return Promise.resolve([]);
    },
  });
  return { port, calls };
};

describe("custom agents port binding", () => {
  it("reads through the context's services with the tenant it was given", async () => {
    const { port, calls } = setup();
    await port.getAgent({ tenantId: TENANT, agentId: AGENT });
    await port.listAgents({ tenantId: TENANT });
    await port.listSkills({ tenantId: TENANT });
    expect(calls).toEqual([
      ["getAgent", { tenantId: TENANT, agentId: AGENT }],
      ["listAgents", { tenantId: TENANT }],
      ["listSkills", { tenantId: TENANT }],
    ]);
  });

  it("answers null for an id that is not a custom agent id, without reading the store", async () => {
    const { port, calls } = setup();
    expect(await port.getAgent({ tenantId: TENANT, agentId: "assistant" })).toBeNull();
    expect(await port.getAgent({ tenantId: TENANT, agentId: "../other" })).toBeNull();
    expect(calls).toEqual([]);
  });
});
