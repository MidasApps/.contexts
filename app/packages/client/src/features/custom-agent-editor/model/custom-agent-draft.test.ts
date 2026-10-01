import { describe, expect, it } from "vitest";
import { buildCustomAgent } from "#/entities/custom-agent/custom-agent.fixture.ts";
import { agentInputOf, agentProblemsFromDetails, draftFromAgent, emptyAgentDraft, toggleItem } from "./custom-agent-draft.ts";

const SKILL_ID = "Sk7cX9zA1sD3fG5hJ7kL";

describe("agentInputOf", () => {
  it("builds the wire input of a valid draft", () => {
    const draft = { ...emptyAgentDraft(), name: " Guide ", description: "Helps.", instructions: "Be brief.", tools: ["catalog.listEntities"], customSkills: [SKILL_ID], knowledgeScope: "all" as const };
    expect(agentInputOf(draft, 8000)).toEqual({
      ok: true,
      input: { name: "Guide", description: "Helps.", instructions: "Be brief.", model: "chat", tools: ["catalog.listEntities"], connectorTools: false, coreSkills: [], customSkills: [SKILL_ID], knowledgeScope: "all", enabled: true },
    });
  });

  it("points at every field that breaks its rule", () => {
    expect(agentInputOf(emptyAgentDraft(), 8000)).toEqual({ ok: false, problems: { name: "invalid", description: "invalid", instructions: "invalid" } });
    expect(agentInputOf({ ...draftFromAgent(buildCustomAgent()), customSkills: ["not-an-id"] }, 8000)).toEqual({ ok: false, problems: { customSkills: "invalid" } });
  });

  it("refuses instructions longer than the plan allows", () => {
    const draft = { ...draftFromAgent(buildCustomAgent()), instructions: "x".repeat(11) };
    expect(agentInputOf(draft, 10)).toEqual({ ok: false, problems: { instructions: "tooLong" } });
    expect(agentInputOf(draft, 11).ok).toBe(true);
  });
});

describe("agent draft helpers", () => {
  it("maps API details to form fields", () => {
    expect(agentProblemsFromDetails([{ field: "instructions", issue: "TOO_BIG" }, { field: "tools.0", issue: "TOO_SMALL" }, { field: "body", issue: "X" }])).toEqual({ instructions: "tooLong", tools: "invalid" });
  });

  it("adds and removes a value of a multi-select once", () => {
    expect(toggleItem(["a"], "b", true)).toEqual(["a", "b"]);
    expect(toggleItem(["a", "b"], "a", true)).toEqual(["b", "a"]);
    expect(toggleItem(["a", "b"], "a", false)).toEqual(["b"]);
  });
});
