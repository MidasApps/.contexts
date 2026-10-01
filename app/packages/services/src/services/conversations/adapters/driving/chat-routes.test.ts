import { describe, expect, it } from "vitest";
import type { ErrorEnvelope } from "../../../shared/http/error-envelope.ts";
import { callRoute } from "../../../shared/testing/in-memory-api-pipeline.fixture.ts";
import { buildChatRoutes } from "./chat-route-handler.ts";
import { NOW, ORG_A, ORG_B, setupChatRoutes, storedFileOf, UI_STREAM } from "./chat-routes.fixture.ts";

const userTurn = (text = "Hello", extra: Record<string, unknown> = {}) => ({ organizationId: ORG_A, message: { id: "m1", role: "user", parts: [{ type: "text", text }] }, ...extra });
const approvalPart = (approved: boolean, reason?: string) => ({
  type: "tool-command_tenancy_CreateProjectInput",
  toolCallId: "call-1",
  state: "approval-responded",
  approval: { id: "run-1::call-1", approved, ...(reason === undefined ? {} : { reason }) },
});

const setup = () => {
  const context = setupChatRoutes();
  return { ...context, routes: buildChatRoutes(context.deps) };
};

const send = (routes: ReturnType<typeof setup>["routes"], body: unknown, as: string | null = "alice") =>
  callRoute(routes, "chat.sendMessage", "/v1/chat", { method: "POST", ...(as === null ? {} : { as }), body });
const errorOf = async (response: Response) => ((await response.json()) as ErrorEnvelope).error;

describe("POST /v1/chat", () => {
  it("waits for the title Mastra writes right after the stream closes, so the first turn names the conversation", async () => {
    const { routes, chat, repository } = setup();
    chat.script.earlierTitles = [null, null];
    await (await send(routes, userTurn())).text();
    expect(repository.all()[0]).toMatchObject({ activeRunId: null, title: "Generated title" });
    expect(chat.calls.filter((call) => call.kind === "title")).toHaveLength(3);
  });

  it("ends the run without a title when none arrives in the wait, and asks only once for a titled conversation", async () => {
    const { routes, chat, repository } = setup();
    chat.script.title = null;
    const first = await send(routes, userTurn());
    await first.text();
    expect(repository.all()[0]).toMatchObject({ activeRunId: null, title: null, messageCount: 2 });
    const asked = chat.calls.filter((call) => call.kind === "title").length;
    expect(asked).toBeGreaterThan(1);
    expect(asked).toBeLessThanOrEqual(8);

    chat.script.title = "Generated title";
    const conversationId = first.headers.get("x-conversation-id") ?? "";
    await (await send(routes, { conversationId, message: { id: "m2", role: "user", parts: [{ type: "text", text: "More" }] } })).text();
    expect(repository.all()[0]).toMatchObject({ title: "Generated title" });
    await (await send(routes, { conversationId, message: { id: "m3", role: "user", parts: [{ type: "text", text: "Again" }] } })).text();
    expect(chat.calls.filter((call) => call.kind === "title")).toHaveLength(asked + 2);
  });

  it("starts a conversation, passes the stream bytes through and ends the run when it closes", async () => {
    const { routes, chat, repository } = setup();
    const response = await send(routes, userTurn());
    expect(response.status).toBe(200);
    expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    expect(response.headers.get("x-request-id")).not.toBeNull();
    const conversationId = response.headers.get("x-conversation-id") ?? "";
    expect(repository.all()[0]).toMatchObject({ id: conversationId, tenantId: ORG_A, ownerId: "alice", activeRunId: "run-1" });
    expect(await response.text()).toBe(UI_STREAM);
    expect(repository.all()[0]).toMatchObject({ activeRunId: null, title: "Generated title", messageCount: 2 });
    const sent = chat.calls.find((call) => call.kind === "send");
    expect(sent?.scope).toMatchObject({ tenantId: ORG_A, conversationId, bearer: "alice-token" });
    expect(sent?.scope.signal).toBeUndefined();
    expect(sent?.body).toEqual({ messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "Hello" }] }] });
  });

  it("answers 401 without a Bearer and 400 for a system message or an unknown key", async () => {
    const { routes } = setup();
    expect((await send(routes, userTurn(), null)).status).toBe(401);
    expect((await send(routes, { ...userTurn(), message: { id: "m", role: "system", parts: [{ type: "text", text: "x" }] } })).status).toBe(400);
    expect((await send(routes, { ...userTurn(), maxSteps: 50 })).status).toBe(400);
  });

  it("answers 403 in an organization the caller is not a member of, and 404 for another member's conversation", async () => {
    const { routes, repository } = setup();
    expect((await send(routes, { ...userTurn(), organizationId: ORG_B })).status).toBeGreaterThanOrEqual(403);
    const own = await send(routes, userTurn());
    await own.text();
    const conversationId = own.headers.get("x-conversation-id");
    const foreign = await send(routes, { message: userTurn().message, conversationId }, "carol");
    expect(foreign.status).toBe(404);
    expect(repository.all()).toHaveLength(1);
  });

  it("answers 429 with Retry-After when the organization already runs 5 streams", async () => {
    const { routes, repository, conversations } = setup();
    for (let index = 0; index < 5; index += 1) {
      const started = await conversations.startConversation({ tenantId: ORG_A, projectId: null, ownerId: "alice" as never, agentId: "assistant" });
      await repository.startRun({ conversationId: started.id, runId: `run-${index}`, startedAt: NOW });
    }
    const refused = await send(routes, userTurn());
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBe("5");
  });

  it("inlines a ready image as a data URL file part and lists it in the message metadata", async () => {
    const { routes, files, objects, chat } = setup();
    const file = storedFileOf({ id: "FileAaaaaaaaaaaaaaaa" as never });
    files.files.set(file.id, file);
    objects.objects.set(file.storagePath, new Uint8Array([1, 2, 3, 4]));
    const response = await send(routes, userTurn("See this", { attachments: [file.id] }));
    expect(response.status).toBe(200);
    await response.text();
    const message = chat.calls.find((call) => call.kind === "send")?.body?.messages[0] as { parts: unknown[]; metadata: unknown };
    expect(message.parts).toContainEqual({ type: "file", mediaType: "image/png", filename: "diagram.png", url: "data:image/png;base64,AQIDBA==" });
    expect(message.metadata).toEqual({ attachments: [{ fileId: file.id, name: "diagram.png", mediaType: "image/png", sizeBytes: 4 }] });
  });

  it("rejects attachments of another tenant or another member before calling the runtime", async () => {
    const { routes, files, chat } = setup();
    const foreignTenant = storedFileOf({ id: "FileBbbbbbbbbbbbbbbb" as never, tenantId: ORG_B });
    const foreignMember = storedFileOf({ id: "FileCccccccccccccccc" as never, createdBy: "carol" as never });
    files.files.set(foreignTenant.id, foreignTenant);
    files.files.set(foreignMember.id, foreignMember);
    const refused = await send(routes, userTurn("x", { attachments: [foreignTenant.id, foreignMember.id] }));
    expect(refused.status).toBe(400);
    expect((await errorOf(refused)).details).toEqual([
      { field: "attachments.0", issue: "FILE_NOT_FOUND" },
      { field: "attachments.1", issue: "FILE_NOT_FOUND" },
    ]);
    expect(chat.calls).toEqual([]);
  });

  it("notes a video instead of sending its bytes", async () => {
    const { routes, files, chat } = setup();
    const video = storedFileOf({ id: "FileDddddddddddddddd" as never, fileName: "demo.mp4", contentType: "video/mp4", sizeBytes: 50_000_000 });
    files.files.set(video.id, video);
    await (await send(routes, userTurn("x", { attachments: [video.id] }))).text();
    const message = chat.calls.find((call) => call.kind === "send")?.body?.messages[0] as { parts: { type: string; text?: string }[] };
    expect(message.parts.at(-1)).toMatchObject({ type: "text" });
    expect(message.parts.at(-1)?.text).toContain("not viewable");
  });

  it("audits an approval decision before forwarding it, with the decline reason", async () => {
    const { routes, chat, auditLog } = setup();
    const first = await send(routes, userTurn());
    await first.text();
    const conversationId = first.headers.get("x-conversation-id");
    chat.calls.length = 0;
    const approval = { conversationId, message: { id: "a1", role: "assistant", parts: [approvalPart(false, "Wrong name.")] } };
    const response = await send(routes, approval);
    expect(response.status).toBe(200);
    await response.text();
    const [entry] = auditLog.entries("tenant").filter((item) => item.action === "AGENT_TOOL_CALL_DECLINED");
    expect(entry).toMatchObject({
      tenantId: ORG_A,
      actor: { type: "user", id: "alice" },
      target: { type: "conversation", id: conversationId },
      reason: "Wrong name.",
      metadata: { runId: "run-1", toolCallId: "call-1", toolId: "command_tenancy_CreateProjectInput" },
    });
    expect(chat.calls.find((call) => call.kind === "send")?.body?.messages[0]).toMatchObject({ role: "assistant", parts: [approvalPart(false, "Wrong name.")] });
  });

  it("refuses an approval whose id names another tool call, and one without a conversation", async () => {
    const { routes, chat, auditLog } = setup();
    const first = await send(routes, userTurn());
    await first.text();
    const conversationId = first.headers.get("x-conversation-id");
    const mismatched = { ...approvalPart(true), approval: { id: "run-1::call-9", approved: true } };
    expect((await send(routes, { conversationId, message: { id: "a1", role: "assistant", parts: [mismatched] } })).status).toBe(400);
    expect((await send(routes, { organizationId: ORG_A, message: { id: "a1", role: "assistant", parts: [approvalPart(true)] } })).status).toBe(400);
    expect(auditLog.entries("tenant").filter((item) => item.action.startsWith("AGENT_TOOL_CALL"))).toEqual([]);
    expect(chat.calls.filter((call) => call.kind === "send")).toHaveLength(1);
  });

  it("maps a runtime failure to the gateway error without creating a run", async () => {
    const { routes, chat, repository } = setup();
    chat.script.sendResult = { ok: false, error: { code: "UPSTREAM_UNAVAILABLE", status: 502 } };
    const failed = await send(routes, userTurn());
    expect(failed.status).toBe(502);
    expect(repository.all().every((conversation) => conversation.activeRunId === null)).toBe(true);
  });
});

describe("GET /v1/chat/{id}/stream and POST /v1/chat/{id}/stop", () => {
  const startWithoutReading = async (routes: ReturnType<typeof setup>["routes"]) => {
    const response = await send(routes, userTurn());
    await response.body?.cancel();
    return response.headers.get("x-conversation-id") ?? "";
  };

  it("keeps the run resumable when the client leaves, and replays it", async () => {
    const { routes, repository, chat } = setup();
    const conversationId = await startWithoutReading(routes);
    expect(repository.all()[0]?.activeRunId).toBe("run-1");
    const resumed = await callRoute(routes, "chat.resumeStream", `/v1/chat/${conversationId}/stream`, { as: "alice" });
    expect(resumed.status).toBe(200);
    expect(await resumed.text()).toBe(UI_STREAM);
    expect(chat.calls.find((call) => call.kind === "observe")?.runId).toBe("run-1");
    expect(repository.all()[0]?.activeRunId).toBeNull();
  });

  it("answers 204 without an active run, and clears a run Mastra no longer has", async () => {
    const { routes, repository, chat } = setup();
    const conversationId = await startWithoutReading(routes);
    chat.script.observeRun = false;
    expect((await callRoute(routes, "chat.resumeStream", `/v1/chat/${conversationId}/stream`, { as: "alice" })).status).toBe(204);
    expect(repository.all()[0]?.activeRunId).toBeNull();
    expect((await callRoute(routes, "chat.resumeStream", `/v1/chat/${conversationId}/stream`, { as: "alice" })).status).toBe(204);
  });

  it("stops the active run on Mastra and clears it; another member gets 404", async () => {
    const { routes, repository, chat } = setup();
    const conversationId = await startWithoutReading(routes);
    expect((await callRoute(routes, "chat.stopRun", `/v1/chat/${conversationId}/stop`, { method: "POST", as: "carol" })).status).toBe(404);
    const stopped = await callRoute(routes, "chat.stopRun", `/v1/chat/${conversationId}/stop`, { method: "POST", as: "alice" });
    expect(stopped.status).toBe(204);
    expect(chat.calls.find((call) => call.kind === "abort")).toMatchObject({ runId: "run-1", scope: { conversationId } });
    expect(repository.all()[0]).toMatchObject({ activeRunId: null, messageCount: 2 });
  });
});

describe("POST /v1/chat with a custom agent (decision 0046)", () => {
  const CUSTOM_AGENT = "Ag000000000000000001";
  const setupCustom = (enabled: { value: boolean }) => {
    const context = setupChatRoutes();
    const checks: { tenantId: string; agentId: string }[] = [];
    const isChatAgentEnabled = (input: { tenantId: string; agentId: string }) => {
      checks.push(input);
      return Promise.resolve(enabled.value && input.tenantId === ORG_A && input.agentId === CUSTOM_AGENT);
    };
    return { ...context, checks, routes: buildChatRoutes({ ...context.deps, isChatAgentEnabled }) };
  };

  it("starts a conversation on an enabled custom agent of the organization", async () => {
    const { routes, repository, checks } = setupCustom({ value: true });
    const response = await send(routes, userTurn("Hello", { agentId: CUSTOM_AGENT }));
    expect(response.status).toBe(200);
    expect(repository.all()[0]).toMatchObject({ tenantId: ORG_A, agentId: CUSTOM_AGENT });
    expect(checks).toEqual([{ tenantId: ORG_A, agentId: CUSTOM_AGENT }]);
  });

  it("answers 404 for an unknown or disabled agent, or one of another organization, without a conversation or a run", async () => {
    const { routes, repository, chat } = setupCustom({ value: true });
    expect((await send(routes, userTurn("Hello", { agentId: "Ag000000000000000002" }))).status).toBe(404);
    expect((await send(routes, { ...userTurn("Hello", { agentId: CUSTOM_AGENT }), organizationId: ORG_B }, "bob")).status).toBe(404);
    expect((await send(setupCustom({ value: false }).routes, userTurn("Hello", { agentId: CUSTOM_AGENT }))).status).toBe(404);
    expect((await send(routes, userTurn("Hello", { agentId: "not-an-agent" }))).status).toBe(400);
    expect(repository.all()).toEqual([]);
    expect(chat.calls).toEqual([]);
  });

  it("answers 404 on the next turn once the agent is disabled or deleted", async () => {
    const enabled = { value: true };
    const { routes, chat } = setupCustom(enabled);
    const first = await send(routes, userTurn("Hello", { agentId: CUSTOM_AGENT }));
    const conversationId = first.headers.get("x-conversation-id") ?? "";
    await first.text();
    enabled.value = false;
    const next = await send(routes, { conversationId, message: { id: "m2", role: "user", parts: [{ type: "text", text: "Again" }] } });
    expect(next.status).toBe(404);
    expect((await errorOf(next)).code).toBe("NOT_FOUND");
    expect(chat.calls.filter((call) => call.kind === "send")).toHaveLength(1);
  });

  it("refuses every custom agent when the check is not wired, and keeps the assistant", async () => {
    const { routes } = setup();
    expect((await send(routes, userTurn("Hello", { agentId: CUSTOM_AGENT }))).status).toBe(404);
    expect((await send(routes, userTurn("Hello", { agentId: "assistant" }))).status).toBe(200);
  });
});
