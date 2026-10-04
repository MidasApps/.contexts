import { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY, RequestContext } from "@mastra/core/request-context";
import { describe, expect, it } from "vitest";
import { buildSupervisorHarness, MEMBER_PERMISSIONS, noteModule } from "../agents/supervisor.fixture.ts";
import { isAllowedRoute } from "../auth/route-allowlist-middleware.ts";
import { handleAbort, handleChatPost, handleMessages } from "../chat/chat-routes.ts";
import { buildAgentContextEntries, TEST_TENANT, TEST_UID } from "../testing/agent-context-fixture.ts";
import { createFakeAccessPort, createFakeAuditPort, createFakeCustomAgentsPort, createFakeUsagePort } from "../testing/fake-ports.ts";
import { buildCustomAgent, buildCustomSkill, CUSTOM_AGENT_TEST_ID, OTHER_TENANT } from "./custom-agent.fixture.ts";
import { CUSTOM_AGENT_ID_KEY } from "./custom-agent-loader.ts";
import { CUSTOM_AGENT_ID } from "./custom-agent-tools.ts";

const THREAD = "CustomThread00000001";
const OTHER_UID = "other-uid";
const silentLogger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };

const contextFor = (tenantId = TEST_TENANT, extra: [string, unknown][] = []): RequestContext<unknown> => {
  const uid = tenantId === TEST_TENANT ? TEST_UID : OTHER_UID;
  const entries = buildAgentContextEntries({ tenantId, permissions: MEMBER_PERMISSIONS, ...(tenantId === TEST_TENANT ? {} : { principal: { type: "user", uid, mfa: false } }) });
  const context = new RequestContext<unknown>(entries.map(([key, value]) => (key === "userId" ? [key, uid] : [key, value])));
  context.set(MASTRA_RESOURCE_ID_KEY, `${tenantId}:${uid}`);
  context.set(MASTRA_THREAD_ID_KEY, THREAD);
  for (const [key, value] of extra) context.set(key, value);
  return context;
};

const setup = (agents = [buildCustomAgent()], skills = [buildCustomSkill()]) => {
  const customAgents = createFakeCustomAgentsPort({ agents, skills });
  const usage = createFakeUsagePort();
  const audit = createFakeAuditPort();
  const access = createFakeAccessPort({
    memberships: [
      { tenantId: TEST_TENANT, uid: TEST_UID, permissions: MEMBER_PERMISSIONS },
      { tenantId: OTHER_TENANT, uid: OTHER_UID, permissions: MEMBER_PERMISSIONS },
    ],
  });
  const harness = buildSupervisorHarness({ ports: { customAgents, usage, audit, access } });
  let counter = 0;
  const deps = { ...harness.runtime.chat, logger: silentLogger, newRunId: () => `run-${++counter}` };
  return { harness, deps, customAgents, usage, audit };
};

const chatRequest = (text: string) =>
  new Request(`http://mastra.internal/chat/${CUSTOM_AGENT_TEST_ID}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ id: "m-1", role: "user", parts: [{ type: "text", text }] }] }),
  });

type Chunk = { type: string; [key: string]: unknown };
const readChunks = async (response: Response): Promise<Chunk[]> =>
  (await response.text())
    .split("\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => JSON.parse(line.slice(6)) as Chunk);

const textOf = (chunks: Chunk[]) => chunks.filter((chunk) => chunk.type === "text-delta").map((chunk) => String(chunk.delta)).join("");

const post = (state: ReturnType<typeof setup>, text: string, requestContext = contextFor(), agentId: string = CUSTOM_AGENT_TEST_ID) =>
  handleChatPost({ request: chatRequest(text), agentId, requestContext, mastra: state.harness.mastra }, state.deps);

describe("custom agent chat (fake mode, in-process Mastra)", { timeout: 30_000 }, () => {
  it("answers a member of the organization through the generic durable agent and records usage for the tenant", async () => {
    const state = setup();
    const context = contextFor();
    const response = await post(state, "How do I request access?", context);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-run-id")).toBe("run-1");
    const chunks = await readChunks(response);
    expect(chunks.at(-1)?.type).toBe("finish");
    expect(textOf(chunks)).toContain("How do I request access?");
    expect(context.get(CUSTOM_AGENT_ID_KEY)).toBe(CUSTOM_AGENT_TEST_ID);
    expect(state.deps.owners.ownerOf("run-1")).toMatchObject({ agentId: CUSTOM_AGENT_TEST_ID, resourceId: `${TEST_TENANT}:${TEST_UID}` });
    await state.harness.runtime.observability.shutdown();
    const calls = state.usage.calls.filter((call) => call.agentId.startsWith(CUSTOM_AGENT_ID));
    expect(calls.length).toBeGreaterThan(0);
    expect(new Set(state.usage.calls.map((call) => call.tenantId))).toEqual(new Set([TEST_TENANT]));
  });

  it("runs on the model role the record chose", async () => {
    const state = setup([buildCustomAgent({ model: "reasoning" })]);
    await readChunks(await post(state, "hello"));
    await state.harness.runtime.observability.shutdown();
    const models = state.usage.calls.filter((call) => call.agentId.startsWith(CUSTOM_AGENT_ID)).map((call) => call.model);
    expect(models).toContain("fake-reasoning");
    expect(models).not.toContain("fake-chat");
  });

  it("answers 404 for a member of another organization, a disabled agent and an unknown id", async () => {
    const state = setup();
    expect((await post(state, "hi", contextFor(OTHER_TENANT))).status).toBe(404);
    expect((await post(state, "hi", contextFor(), "Ag000000000000000009")).status).toBe(404);
    expect((await post(setup([buildCustomAgent({ enabled: false })]), "hi")).status).toBe(404);
    expect(state.usage.calls).toEqual([]);
  });

  it("overwrites a context key a caller forged with the id it loaded for the caller's tenant", async () => {
    const state = setup();
    const forged = contextFor(TEST_TENANT, [[CUSTOM_AGENT_ID_KEY, "Ag000000000000000009"]]);
    const response = await post(state, "hi", forged);
    expect(response.status).toBe(200);
    await readChunks(response);
    expect(forged.get(CUSTOM_AGENT_ID_KEY)).toBe(CUSTOM_AGENT_TEST_ID);
  });

  it("serves the history route for the caller's own agent only", async () => {
    const state = setup();
    const url = new URL("http://mastra.internal/chat/x/messages");
    const own = await handleMessages({ agentId: CUSTOM_AGENT_TEST_ID, requestContext: contextFor(), mastra: state.harness.mastra, url }, state.deps);
    expect(own.status).toBe(200);
    const foreign = await handleMessages({ agentId: CUSTOM_AGENT_TEST_ID, requestContext: contextFor(OTHER_TENANT), mastra: state.harness.mastra, url }, state.deps);
    expect(foreign.status).toBe(404);
  });

  it("offers only the tools the record selected: an unselected tool call does not run", async () => {
    const state = setup([buildCustomAgent({ tools: [] })]);
    const chunks = await readChunks(await post(state, '[[fake:tool-call {"toolName":"catalog_listEntities","input":{}}]]'));
    expect(chunks.some((chunk) => chunk.type === "tool-output-available")).toBe(false);
    expect(state.audit.entries).toEqual([]);
  });

  it("runs a selected read tool under the record's ceiling", async () => {
    const state = setup([buildCustomAgent({ tools: ["catalog.listEntities"] })]);
    const chunks = await readChunks(await post(state, '[[fake:tool-call {"toolName":"catalog_listEntities","input":{}}]]'));
    expect(chunks.some((chunk) => chunk.type === "tool-output-available")).toBe(true);
  });

  it("drops a selected command of a module the organization did not enable", async () => {
    const executed: string[] = [];
    const customAgents = createFakeCustomAgentsPort({ agents: [buildCustomAgent({ tools: ["command.example.CreateNoteCommand"] })] });
    const harness = buildSupervisorHarness({ ports: { customAgents }, modules: [noteModule(executed)], settings: { enabledAgents: ["knowledge", "data", "action"] } });
    const deps = { ...harness.runtime.chat, logger: silentLogger, newRunId: () => "run-1" };
    const response = await handleChatPost(
      { request: chatRequest('[[fake:tool-call {"toolName":"command_example_CreateNoteCommand","input":{"text":"hello"}}]]'), agentId: CUSTOM_AGENT_TEST_ID, requestContext: contextFor(), mastra: harness.mastra },
      deps,
    );
    const chunks = await readChunks(response);
    expect(chunks.some((chunk) => chunk.type === "tool-approval-request")).toBe(false);
    expect(executed).toEqual([]);
  });

  it("asks for an approval before a selected mutation and does not run it", async () => {
    const executed: string[] = [];
    const customAgents = createFakeCustomAgentsPort({ agents: [buildCustomAgent({ tools: ["command.example.CreateNoteCommand"] })] });
    const harness = buildSupervisorHarness({ ports: { customAgents }, modules: [noteModule(executed)], settings: { enabledAgents: ["knowledge", "data", "action", "example"] } });
    const deps = { ...harness.runtime.chat, logger: silentLogger, newRunId: () => "run-1" };
    const response = await handleChatPost(
      { request: chatRequest('[[fake:tool-call {"toolName":"command_example_CreateNoteCommand","input":{"text":"hello"}}]]'), agentId: CUSTOM_AGENT_TEST_ID, requestContext: contextFor(), mastra: harness.mastra },
      deps,
    );
    const chunks = await readChunks(response);
    const request = chunks.find((chunk) => chunk.type === "tool-approval-request") as { approvalId: string; toolCallId: string } | undefined;
    expect(request?.approvalId).toBe(`run-1::${request?.toolCallId}`);
    expect(executed).toEqual([]);
    expect(deps.owners.ownerOf("run-1")?.state).toBe("suspended");
    // The approval response resumes the same run on the generic agent, still under the record's ceiling.
    const approved = {
      id: "a-1",
      role: "assistant",
      parts: [{ type: "tool-command_example_CreateNoteCommand", toolCallId: request?.toolCallId, state: "approval-responded", input: { text: "hello" }, approval: { id: request?.approvalId, approved: true } }],
    };
    const resumed = await handleChatPost(
      {
        request: new Request("http://mastra.internal/chat/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: [approved] }) }),
        agentId: CUSTOM_AGENT_TEST_ID,
        requestContext: contextFor(),
        mastra: harness.mastra,
      },
      deps,
    );
    expect(resumed.headers.get("x-run-id")).toBe("run-1");
    expect((await readChunks(resumed)).map((chunk) => chunk.type)).toContain("tool-output-available");
    expect(executed).toEqual(["hello"]);
  });

  it("refuses a selected tool the caller has no permission for", async () => {
    const customAgents = createFakeCustomAgentsPort({ agents: [buildCustomAgent({ tools: ["catalog.listEntities"] })] });
    const audit = createFakeAuditPort();
    const access = createFakeAccessPort({ memberships: [{ tenantId: TEST_TENANT, uid: TEST_UID, permissions: ["core.chat.use"] }] });
    const harness = buildSupervisorHarness({ ports: { customAgents, audit, access } });
    const deps = { ...harness.runtime.chat, logger: silentLogger, newRunId: () => "run-1" };
    const context = new RequestContext<unknown>(buildAgentContextEntries({ permissions: ["core.chat.use"] }));
    context.set(MASTRA_RESOURCE_ID_KEY, `${TEST_TENANT}:${TEST_UID}`);
    context.set(MASTRA_THREAD_ID_KEY, THREAD);
    const response = await handleChatPost(
      { request: chatRequest('[[fake:tool-call {"toolName":"catalog_listEntities","input":{}}]]'), agentId: CUSTOM_AGENT_TEST_ID, requestContext: context, mastra: harness.mastra },
      deps,
    );
    const chunks = await readChunks(response);
    expect(chunks.some((chunk) => chunk.type === "tool-output-available")).toBe(false);
    expect(JSON.stringify(chunks)).toContain("not allowed to use this tool");
  });

  it("lets the owner stop a run of an agent that was disabled meanwhile", async () => {
    const state = setup();
    const slow = `[[fake:slow {"delayMs":60}]] [[fake:text {"text":"${"S".repeat(640)}"}]]`;
    const response = await post(state, slow);
    const reading = readChunks(response);
    await new Promise((resolve) => setTimeout(resolve, 300));
    state.customAgents.agents[0] = buildCustomAgent({ enabled: false });
    const stopped = await handleAbort({ runId: "run-1", requestContext: contextFor(), mastra: state.harness.mastra }, state.deps);
    expect(stopped.status).toBe(204);
    const text = textOf(await reading);
    expect(text.length).toBeLessThan(640);
  });

  it("hides the generic agent and its durable wrapper from the built-in agent routes", () => {
    const state = setup();
    const hidden = Object.keys(state.harness.runtime.agents).filter((id) => id.startsWith(CUSTOM_AGENT_ID));
    expect(hidden.sort()).toEqual([CUSTOM_AGENT_ID, `${CUSTOM_AGENT_ID}-chat`]);
    expect(isAllowedRoute("POST", `/agents/${CUSTOM_AGENT_ID}/generate`, hidden)).toBe(false);
    expect(isAllowedRoute("POST", `/agents/${CUSTOM_AGENT_ID}-chat/stream`, hidden)).toBe(false);
    expect(state.harness.runtime.chat.chatAgents[CUSTOM_AGENT_ID]).toBeUndefined();
  });

  it("fails a direct run of the generic agent that names no record", async () => {
    const state = setup();
    const agent = state.harness.mastra.getAgentById(CUSTOM_AGENT_ID);
    await expect(agent.generate("hi", { requestContext: contextFor() })).rejects.toThrow();
    expect(state.usage.calls).toEqual([]);
  });
});
