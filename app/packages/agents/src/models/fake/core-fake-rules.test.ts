import { describe, expect, it } from "vitest";
import { coreFakeRules, createFakeScenarioRegistry, resolveFakeTurn } from "./fake-scenarios.ts";

const registry = () => {
  const scenarios = createFakeScenarioRegistry();
  for (const [agentId, rule] of coreFakeRules([])) scenarios.register(agentId, rule);
  return scenarios;
};

describe("core fake rules: knowledge agent", () => {
  it("searches the knowledge base with the request (sanitized tool name)", () => {
    const turn = resolveFakeTurn({ agentId: "knowledge", text: "How long are files kept?", toolNames: ["knowledge_searchKnowledge", "skill"] }, registry());
    expect(turn.toolCalls).toEqual([{ toolName: "knowledge_searchKnowledge", input: { query: "How long are files kept?" } }]);
  });

  it("does nothing special without the search tool", () => {
    const turn = resolveFakeTurn({ agentId: "knowledge", text: "How long are files kept?", toolNames: [] }, registry());
    expect(turn.toolCalls).toBeUndefined();
  });

  it("lets an explicit directive win", () => {
    const text = '[[fake:text {"text":"scripted"}]] How long are files kept?';
    expect(resolveFakeTurn({ agentId: "knowledge", text, toolNames: ["knowledge_searchKnowledge"] }, registry()).text).toBe("scripted");
  });
});
