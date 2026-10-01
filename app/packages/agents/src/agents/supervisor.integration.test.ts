import { describe, expect, it } from "vitest";
import { createFakeProjectCommands } from "../testing/fake-ports.ts";
import { SUPERVISOR_AGENT_ID, SUPERVISOR_MAX_STEPS } from "./supervisor-agent.ts";
import { buildSupervisorHarness, collectChunks, memberContext, toolNamesCalled } from "./supervisor.fixture.ts";

const supervisorOf = (harness: ReturnType<typeof buildSupervisorHarness>) => harness.mastra.getAgent(SUPERVISOR_AGENT_ID);

// Each case boots Mastra runs with several fake model calls; slow machines need more than the default.
describe("assistant supervisor (fake mode, in-process Mastra)", { timeout: 30_000 }, () => {
  it("is the entry agent over the knowledge, data, action and web subagents", async () => {
    const { runtime } = buildSupervisorHarness();
    expect(Object.keys(runtime.agents).sort()).toEqual([SUPERVISOR_AGENT_ID, "assistant-chat", "conversation-summarizer", "ping"]);
    expect(Object.keys(runtime.subagents).sort()).toEqual(["action", "data", "knowledge", "web"]);
    const supervisor = runtime.agents[SUPERVISOR_AGENT_ID];
    const options = await supervisor?.getDefaultOptions({ requestContext: memberContext() });
    expect(options?.maxSteps).toBe(SUPERVISOR_MAX_STEPS);
    expect(await supervisor?.getInstructions({ requestContext: memberContext() })).toContain("agent-knowledge");
  });

  it("delegates a question to the knowledge subagent", async () => {
    const harness = buildSupervisorHarness();
    const chunks = await collectChunks(await supervisorOf(harness).stream("What is our onboarding policy?", { requestContext: memberContext() }));
    expect(toolNamesCalled(chunks)).toContain("agent-knowledge");
    expect(chunks.some((chunk) => chunk.type === "tool-result" && chunk.payload?.toolName === "agent-knowledge")).toBe(true);
  });

  it("asks the data subagent to render the form of a create request", async () => {
    const harness = buildSupervisorHarness();
    const result = await supervisorOf(harness).generate("Please create a note for me", { requestContext: memberContext() });
    const serialized = JSON.stringify(result.steps);
    expect(serialized).toContain("agent-data");
    expect(serialized).toContain("schema-form");
    expect(serialized).toContain("example.CreateNoteCommand");
  });

  it("stops at a tool-call approval and runs the command once after approval", async () => {
    const projects = createFakeProjectCommands();
    const harness = buildSupervisorHarness({ ports: { commandRegistry: projects.commands } });
    const supervisor = supervisorOf(harness);
    const stream = await supervisor.stream('Confirm: create the project named "Launch"', { requestContext: memberContext() });
    const chunks = await collectChunks(stream);
    const approval = chunks.find((chunk) => chunk.type === "tool-call-approval");
    expect(String(approval?.payload?.toolName)).toMatch(/^command[._]tenancy[._]CreateProjectInput$/);
    expect(projects.created).toEqual([]);
    const resumed = await supervisor.approveToolCall({ runId: stream.runId, toolCallId: String(approval?.payload?.toolCallId), requestContext: memberContext() });
    await collectChunks(resumed);
    expect(projects.created.map((call) => call.input.name)).toEqual(["Launch"]);
  });

  it("does not run a declined command and feeds the reason back", async () => {
    const projects = createFakeProjectCommands();
    const harness = buildSupervisorHarness({ ports: { commandRegistry: projects.commands } });
    const supervisor = supervisorOf(harness);
    const stream = await supervisor.stream('Confirm: create the project named "Launch"', { requestContext: memberContext() });
    const approval = (await collectChunks(stream)).find((chunk) => chunk.type === "tool-call-approval");
    const declined = await supervisor.declineToolCall({
      runId: stream.runId,
      toolCallId: String(approval?.payload?.toolCallId),
      reason: "Wrong project name",
      requestContext: memberContext(),
    });
    const chunks = await collectChunks(declined);
    expect(projects.created).toEqual([]);
    expect(JSON.stringify(chunks)).toMatch(/declined|Wrong project name/i);
  });
});
