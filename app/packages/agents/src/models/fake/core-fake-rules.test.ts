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

describe("core fake rules: a command named with its values", () => {
  const NOTE = { toolId: "command.example.CreateNoteCommand", commandId: "example.CreateNoteCommand", targetContractId: "example.Note" };
  const ARCHIVE = { toolId: "command.example.ArchiveNoteCommand", commandId: "example.ArchiveNoteCommand", targetContractId: "example.Note" };
  const withCommands = () => {
    const scenarios = createFakeScenarioRegistry();
    for (const [agentId, rule] of coreFakeRules([NOTE, ARCHIVE])) scenarios.register(agentId, rule);
    return scenarios;
  };
  const text = 'Go ahead and run example.ArchiveNoteCommand with {"noteId":"Xk2mQ9vLr3TnB7pWc1aZ"}';
  const tools = ["command_example_CreateNoteCommand", "command_example_ArchiveNoteCommand"];

  it("lets the supervisor hand a confirmed command to the action agent", () => {
    expect(resolveFakeTurn({ agentId: "assistant", text, toolNames: ["agent-action", "agent-data"] }, withCommands()).toolCalls).toEqual([
      { toolName: "agent-action", input: { prompt: text } },
    ]);
  });

  it("calls that command's tool with exactly those values", () => {
    expect(resolveFakeTurn({ agentId: "action", text, toolNames: tools }, withCommands()).toolCalls).toEqual([
      { toolName: "command_example_ArchiveNoteCommand", input: { noteId: "Xk2mQ9vLr3TnB7pWc1aZ" } },
    ]);
  });

  it("ignores an unknown command, a command without its tool and values that are not an object", () => {
    const registry = withCommands();
    for (const other of ["Go ahead and run example.Nope with {}", 'Go ahead and run example.ArchiveNoteCommand with ["x"]']) {
      expect(resolveFakeTurn({ agentId: "action", text: other, toolNames: tools }, registry).toolCalls).toBeUndefined();
    }
    expect(resolveFakeTurn({ agentId: "action", text, toolNames: ["command_example_CreateNoteCommand"] }, registry).toolCalls).toBeUndefined();
  });
});

describe("core fake rules: conversation title", () => {
  it("names the conversation after the member's first message, without directives or the answer", () => {
    const text = 'User: How long are files kept? [[fake:slow {"delayMs":50}]] Assistant: Fake answer 1a2b3c4d: How long are files kept?';
    expect(resolveFakeTurn({ agentId: "memory", text, toolNames: [] }, registry()).text).toBe("How long are files kept?");
  });

  it("stops at the result of a delegation", () => {
    const text = 'User: How long are files kept? Tool Result agent-knowledge: {"text":"Fake summary"} Assistant: Fake summary of agent-knowledge';
    expect(resolveFakeTurn({ agentId: "memory", text, toolNames: [] }, registry()).text).toBe("How long are files kept?");
  });

  it("keeps the title short and leaves other memory prompts to the echo", () => {
    const long = `User: ${"word ".repeat(40)}Assistant: ok`;
    expect(resolveFakeTurn({ agentId: "memory", text: long, toolNames: [] }, registry()).text?.length).toBeLessThanOrEqual(60);
    expect(resolveFakeTurn({ agentId: "memory", text: "Summarize the observations.", toolNames: [] }, registry()).text).toMatch(/^Fake answer /);
  });
});

describe("core fake rules: submitted form (SP0 follow-up #40)", () => {
  const NOTE = { toolId: "command.example.CreateNoteCommand", commandId: "example.CreateNoteCommand", targetContractId: "example.Note" };
  const PROJECT = { toolId: "command.tenancy.CreateProjectInput", commandId: "tenancy.CreateProjectInput", targetContractId: "tenancy.Project" };
  const withCommands = () => {
    const scenarios = createFakeScenarioRegistry();
    for (const [agentId, rule] of coreFakeRules([PROJECT, NOTE])) scenarios.register(agentId, rule);
    return scenarios;
  };
  const FENCE = "```";
  // Exactly what the chat client sends (`formatUiSubmission` in @core/client).
  const payload = { commandId: "example.CreateNoteCommand", contractId: "example.Note", mode: "create", values: { title: "Supplier follow-up", body: "Call on Monday." } };
  const sentence = "The user submitted the form of command example.CreateNoteCommand (create). Confirm and run that command with exactly these values.";
  const turn = `[ui:schema-form] ${sentence}\n${FENCE}json\n${JSON.stringify(payload, null, 2)}\n${FENCE}`;
  const actionTools = ["command_tenancy_CreateProjectInput", "command_example_CreateNoteCommand"];

  it("makes the supervisor delegate a submitted form to the action agent", () => {
    const answer = resolveFakeTurn({ agentId: "assistant", text: turn, toolNames: ["agent-action", "agent-data", "agent-knowledge"] }, withCommands());
    expect(answer.toolCalls?.[0]?.toolName).toBe("agent-action");
  });

  it("runs the command the form names with exactly the submitted values, also after the supervisor flattened the prompt", () => {
    const delegated = resolveFakeTurn({ agentId: "assistant", text: turn, toolNames: ["agent-action"] }, withCommands()).toolCalls?.[0]?.input["prompt"];
    expect(typeof delegated).toBe("string");
    for (const text of [turn, delegated as string]) {
      const answer = resolveFakeTurn({ agentId: "action", text, toolNames: actionTools }, withCommands());
      expect(answer.toolCalls).toEqual([{ toolName: "command_example_CreateNoteCommand", input: { title: "Supplier follow-up", body: "Call on Monday." } }]);
    }
  });

  it("runs nothing for a command the agent does not have or a block that is not JSON", () => {
    const unknown = turn.replaceAll("example.CreateNoteCommand", "example.Missing");
    expect(resolveFakeTurn({ agentId: "action", text: unknown, toolNames: actionTools }, withCommands()).toolCalls).toBeUndefined();
    const broken = `[ui:schema-form] Confirm.\n${FENCE}json\n{not json\n${FENCE}`;
    expect(resolveFakeTurn({ agentId: "action", text: broken, toolNames: actionTools }, withCommands()).toolCalls).toBeUndefined();
  });
});
