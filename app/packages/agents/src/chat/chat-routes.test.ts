import { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY, RequestContext } from "@mastra/core/request-context";
import { describe, expect, it } from "vitest";
import { buildSupervisorHarness, MEMBER_PERMISSIONS } from "../agents/supervisor.fixture.ts";
import { buildAgentContextEntries, TEST_TENANT, TEST_UID } from "../testing/agent-context-fixture.ts";
import { createFakeProjectsPort } from "../testing/fake-ports.ts";
import {
  ABORT_ROUTE_PATH,
  CHAT_ROUTE_PATH,
  createChatRoutes,
  handleAbort,
  handleChatPost,
  handleObserve,
  MESSAGES_ROUTE_PATH,
  OBSERVE_ROUTE_PATH,
  SUMMARY_ROUTE_PATH,
} from "./chat-routes.ts";

const THREAD = "ChatThread0000000001";
const RESOURCE = `${TEST_TENANT}:${TEST_UID}`;
const silentLogger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };

/** `null` leaves the key out (the middleware wrote none). */
const contextFor = (resource: string | null = RESOURCE, thread: string | null = THREAD): RequestContext<unknown> => {
  const context = new RequestContext<unknown>(buildAgentContextEntries({ permissions: MEMBER_PERMISSIONS }));
  if (resource !== null) context.set(MASTRA_RESOURCE_ID_KEY, resource);
  if (thread !== null) context.set(MASTRA_THREAD_ID_KEY, thread);
  return context;
};

const setup = () => {
  const projects = createFakeProjectsPort();
  const harness = buildSupervisorHarness({ ports: { projects } });
  let counter = 0;
  const deps = { ...harness.runtime.chat, logger: silentLogger, newRunId: () => `run-${++counter}` };
  return { harness, projects, deps };
};

const chatRequest = (body: unknown) => new Request("http://mastra.internal/chat/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const userMessage = (text: string) => ({ id: "m-1", role: "user", parts: [{ type: "text", text }] });

type Chunk = { type: string; [key: string]: unknown };
const readChunks = async (response: Response): Promise<Chunk[]> => {
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => JSON.parse(line.slice(6)) as Chunk);
};

describe("chat routes (fake mode, in-process Mastra)", { timeout: 30_000 }, () => {
  it("registers the chat, observe, abort, messages and summary routes as authenticated routes outside the API prefix", () => {
    const { deps } = setup();
    const routes = createChatRoutes(deps);
    expect(routes.map((route) => [route.method, route.path, route.requiresAuth])).toEqual([
      ["POST", CHAT_ROUTE_PATH, true],
      ["GET", OBSERVE_ROUTE_PATH, true],
      ["POST", ABORT_ROUTE_PATH, true],
      ["GET", MESSAGES_ROUTE_PATH, true],
      ["POST", SUMMARY_ROUTE_PATH, true],
    ]);
  });

  it("answers 404 for an agent that is not a chat agent", async () => {
    const { harness, deps } = setup();
    const response = await handleChatPost({ request: chatRequest({ messages: [userMessage("hi")] }), agentId: "ping", requestContext: contextFor(), mastra: harness.mastra }, deps);
    expect(response.status).toBe(404);
  });

  it("answers 400 VALIDATION_FAILED for a body without exactly one message", async () => {
    const { harness, deps } = setup();
    const response = await handleChatPost({ request: chatRequest({ messages: [] }), agentId: "assistant", requestContext: contextFor(), mastra: harness.mastra }, deps);
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("VALIDATION_FAILED");
  });

  it("answers 400 without a conversation thread and 403 without a resource", async () => {
    const { harness, deps } = setup();
    const body = { messages: [userMessage("hi")] };
    expect((await handleChatPost({ request: chatRequest(body), agentId: "assistant", requestContext: contextFor(RESOURCE, null), mastra: harness.mastra }, deps)).status).toBe(400);
    expect((await handleChatPost({ request: chatRequest(body), agentId: "assistant", requestContext: contextFor(null, THREAD), mastra: harness.mastra }, deps)).status).toBe(403);
  });

  it("streams the ai sdk ui message stream with the run id header and records the owner", async () => {
    const { harness, deps } = setup();
    const response = await handleChatPost(
      { request: chatRequest({ messages: [userMessage('[[fake:reasoning {"text":"thinking"}]] What is our onboarding policy?')], maxSteps: 99 }), agentId: "assistant", requestContext: contextFor(), mastra: harness.mastra },
      deps,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    expect(response.headers.get("x-run-id")).toBe("run-1");
    const types = (await readChunks(response)).map((chunk) => chunk.type);
    expect(types).toEqual(expect.arrayContaining(["start", "reasoning-delta", "tool-input-available", "text-delta", "finish"]));
    expect(deps.owners.ownerOf("run-1")).toMatchObject({ resourceId: RESOURCE, threadId: THREAD, state: "finished" });
  });

  it("refuses an approval of a run that belongs to another owner", async () => {
    const { harness, deps } = setup();
    deps.owners.record("run-x", { resourceId: "other:uid", threadId: THREAD, agentId: "assistant" });
    const approval = { id: "a-1", role: "assistant", parts: [{ type: "tool-agent-action", toolCallId: "c-1", state: "approval-responded", approval: { id: "run-x::c-1", approved: true } }] };
    const response = await handleChatPost({ request: chatRequest({ messages: [approval] }), agentId: "assistant", requestContext: contextFor(), mastra: harness.mastra }, deps);
    expect(response.status).toBe(403);
  });

  it("refuses an assistant message without an approval response", async () => {
    const { harness, deps } = setup();
    const message = { id: "a-1", role: "assistant", parts: [{ type: "text", text: "hi" }] };
    const response = await handleChatPost({ request: chatRequest({ messages: [message] }), agentId: "assistant", requestContext: contextFor(), mastra: harness.mastra }, deps);
    expect(response.status).toBe(400);
  });

  it("stops at the approval with a preview, then runs the command once after the approval round trip", async () => {
    const { harness, deps, projects } = setup();
    const first = await handleChatPost({ request: chatRequest({ messages: [userMessage('Confirm: create the project named "Launch"')] }), agentId: "assistant", requestContext: contextFor(), mastra: harness.mastra }, deps);
    const chunks = await readChunks(first);
    const request = chunks.find((chunk) => chunk.type === "tool-approval-request") as { approvalId: string; toolCallId: string } | undefined;
    expect(request?.approvalId).toBe(`run-1::${request?.toolCallId}`);
    expect(chunks.find((chunk) => chunk.type === "data-tool-preview")).toMatchObject({ data: { toolId: "command.tenancy.CreateProjectInput", permission: "core.project.create" } });
    expect(deps.owners.ownerOf("run-1")?.state).toBe("suspended");
    expect(projects.created).toEqual([]);
    const approved = { id: "a-1", role: "assistant", parts: [{ type: "tool-agent-action", toolCallId: request?.toolCallId, state: "approval-responded", input: {}, approval: { id: request?.approvalId, approved: true } }] };
    const second = await handleChatPost({ request: chatRequest({ messages: [approved] }), agentId: "assistant", requestContext: contextFor(), mastra: harness.mastra }, deps);
    expect(second.headers.get("x-run-id")).toBe("run-1");
    const types = (await readChunks(second)).map((chunk) => chunk.type);
    expect(types).toContain("tool-output-available");
    expect(projects.created.map((call) => call.input.name)).toEqual(["Launch"]);
  });

  it("observe answers 204 for an unknown run and for a run of another owner", async () => {
    const { harness, deps } = setup();
    deps.owners.record("run-x", { resourceId: "other:uid", threadId: THREAD, agentId: "assistant" });
    expect((await handleObserve({ agentId: "assistant", runId: "missing", requestContext: contextFor(), mastra: harness.mastra }, deps)).status).toBe(204);
    expect((await handleObserve({ agentId: "assistant", runId: "run-x", requestContext: contextFor(), mastra: harness.mastra }, deps)).status).toBe(204);
  });

  it("observe replays a run of the caller from the start", async () => {
    const { harness, deps } = setup();
    const first = await handleChatPost({ request: chatRequest({ messages: [userMessage("hello there")] }), agentId: "assistant", requestContext: contextFor(), mastra: harness.mastra }, deps);
    const original = await readChunks(first);
    const replay = await handleObserve({ agentId: "assistant", runId: "run-1", requestContext: contextFor(), mastra: harness.mastra }, deps);
    expect(replay.status).toBe(200);
    const replayed = await readChunks(replay);
    expect(replayed[0]?.type).toBe("start");
    expect(replayed.at(-1)?.type).toBe("finish");
    const text = (chunks: Chunk[]) => chunks.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta).join("");
    expect(text(replayed)).toBe(text(original));
  });

  it("observe ends at the approval of a run whose client disconnected, then answers 204", async () => {
    const { harness, deps } = setup();
    const response = await handleChatPost({ request: chatRequest({ messages: [userMessage('Confirm: create the project named "Launch"')] }), agentId: "assistant", requestContext: contextFor(), mastra: harness.mastra }, deps);
    const reader = response.body?.getReader();
    await reader?.read();
    await reader?.cancel();
    expect(deps.owners.ownerOf("run-1")?.state).toBe("running");
    const replay = await handleObserve({ agentId: "assistant", runId: "run-1", requestContext: contextFor(), mastra: harness.mastra }, deps);
    expect(replay.status).toBe(200);
    const types = (await readChunks(replay)).map((chunk) => chunk.type);
    expect(types).toEqual(expect.arrayContaining(["start", "tool-approval-request", "data-tool-call-approval", "data-tool-preview"]));
    expect(types.at(-1)).toBe("data-tool-preview");
    expect(deps.owners.ownerOf("run-1")?.state).toBe("suspended");
    expect((await handleObserve({ agentId: "assistant", runId: "run-1", requestContext: contextFor(), mastra: harness.mastra }, deps)).status).toBe(204);
  });

  it("abort answers 204 and stops a slow run of the caller; another owner's run keeps going", async () => {
    const { harness, deps } = setup();
    const slow = `[[fake:slow {"delayMs":60}]] [[fake:text {"text":"${"S".repeat(640)}"}]]`;
    const response = await handleChatPost({ request: chatRequest({ messages: [userMessage(slow)] }), agentId: "assistant", requestContext: contextFor(), mastra: harness.mastra }, deps);
    const reading = readChunks(response);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect((await handleAbort({ runId: "run-1", requestContext: contextFor("other:uid"), mastra: harness.mastra }, deps)).status).toBe(204);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(deps.owners.ownerOf("run-1")?.state).toBe("running");
    const started = Date.now();
    expect((await handleAbort({ runId: "run-1", requestContext: contextFor(), mastra: harness.mastra }, deps)).status).toBe(204);
    const chunks = await reading;
    expect(Date.now() - started).toBeLessThan(1_500);
    const deltas = chunks.filter((chunk) => chunk.type === "text-delta").map((chunk) => String(chunk.delta)).join("");
    // The aborted durable run closes the UI stream early (no `finish` chunk is written for it).
    expect(deltas.length).toBeGreaterThan(0);
    expect(deltas.length).toBeLessThan(640);
  });
});
