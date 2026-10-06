import { describe, expect, it } from "vitest";
import { buildSupervisorHarness, memberContext } from "./supervisor.fixture.ts";

const commandToolIds = async (harness: ReturnType<typeof buildSupervisorHarness>): Promise<string[]> => {
  const action = harness.runtime.subagents.action;
  return Object.keys((await action?.listTools({ requestContext: memberContext() })) ?? {})
    .filter((id) => id.startsWith("command"))
    .sort();
};

describe("action agent command tools and module enablement", () => {
  it("offers no command of a module the organization did not enable", async () => {
    const harness = buildSupervisorHarness({ settings: { enabledAgents: ["knowledge", "data", "action"] } });
    const ids = await commandToolIds(harness);
    expect(ids.some((id) => id.includes("CreateProjectInput"))).toBe(true);
    expect(ids.some((id) => id.includes("example"))).toBe(false);
  });

  it("offers the module's commands once enabledAgents names the module", async () => {
    const harness = buildSupervisorHarness({ settings: { enabledAgents: ["knowledge", "data", "action", "example"] } });
    const ids = await commandToolIds(harness);
    expect(ids.some((id) => id.includes("CreateProjectInput"))).toBe(true);
    expect(ids.some((id) => id.includes("example") && id.includes("CreateNoteCommand"))).toBe(true);
  });
});
