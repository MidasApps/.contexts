import { createServer } from "node:net";
import type { RegionalSettings } from "@core/agents";
import {
  createAccessCore,
  createFirebaseAdmin,
  createInMemoryAccessStore,
  type ResolveAccessContext,
} from "@core/services";
import { Mastra } from "@mastra/core/mastra";
import { InMemoryStore } from "@mastra/core/storage";
import { createNodeServer } from "@mastra/deployer/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadMastraEnv } from "../mastra-env.schema.ts";
import { APP_MODULES } from "../modules.ts";
import { createAgentRuntime } from "../runtime/create-agent-runtime.ts";

// SP4 Task 2: the chat routes of the production composition (`createAgentRuntime`) over HTTP,
// with real Auth Emulator tokens, fake models and the durable supervisor (decision 0031).
const TENANT = "EmuTenantChat0000003";
const REQUEST_ID = "01J8Z3K4M5N6P7Q8R9S0T1V2W4";
const REGIONAL: RegionalSettings = {
  locale: "pt-BR",
  displayTimeZone: "America/Sao_Paulo",
  nodeTimeZone: "America/Manaus",
  currency: "BRL",
};

const resolveFromReaders = (readers: ReturnType<typeof createInMemoryAccessStore>): ResolveAccessContext => {
  const access = createAccessCore({ readers });
  return async ({ principal, node }) => {
    if (node.level === "platform") return null;
    const effective = await access.forRequest().getEffectivePermissions({ principal, node });
    if (!effective.ok || effective.permissions.size === 0) return null;
    return { tenantId: node.tenantId, principal, permissions: [...effective.permissions].sort(), regional: REGIONAL };
  };
};

const env = loadMastraEnv({
  APP_ENV: "local",
  AI_MODE: "fake",
  FIREBASE_PROJECT_ID: "demo-core",
  DATABASE_URL: process.env["DATABASE_URL"] ?? "postgresql://app:app@127.0.0.1:5432/app",
  FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
  FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
});

const signUp = async (label: string): Promise<{ uid: string; idToken: string }> => {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (host === undefined) throw new Error("FIREBASE_AUTH_EMULATOR_HOST is not set; run through pnpm test:emulators");
  const response = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `${label}-${Date.now()}@example.test`,
      password: "secret-password",
      returnSecureToken: true,
    }),
  });
  const body = (await response.json()) as { localId: string; idToken: string };
  return { uid: body.localId, idToken: body.idToken };
};

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });

const storage = new InMemoryStore();
let mastra: Mastra | undefined;
let baseUrl = "";
let closeServer: () => Promise<void> = () => Promise.resolve();
let member = { uid: "", idToken: "" };
let other = { uid: "", idToken: "" };

beforeAll(async () => {
  [member, other] = await Promise.all([signUp("chat-member"), signUp("chat-other")]);
  const readers = createInMemoryAccessStore();
  readers.putOrganization({ id: TENANT });
  // The first user is an admin (projects are created by admins); the second a plain member.
  for (const [uid, key] of [
    [member.uid, "admin"],
    [other.uid, "member"],
  ] as const) {
    readers.putUser(uid);
    readers.putGrant({ tenantId: TENANT, principalId: uid, nodeId: TENANT, roles: [{ kind: "system", key }] });
  }
  const runtime = createAgentRuntime({
    env,
    processEnv: process.env,
    modules: APP_MODULES,
    overrides: {
      firebase: createFirebaseAdmin({ env, processEnv: process.env }),
      storage,
      adapters: { accessReaders: readers, resolveAccessContext: resolveFromReaders(readers) },
    },
  });
  const port = await freePort();
  mastra = new Mastra({
    agents: runtime.agents,
    storage: runtime.storage,
    vectors: runtime.vectors,
    observability: runtime.observability,
    server: {
      port,
      host: "127.0.0.1",
      auth: runtime.auth,
      middleware: runtime.middleware,
      apiRoutes: runtime.apiRoutes,
    },
  });
  const server = await createNodeServer(mastra, { tools: {} });
  baseUrl = `http://127.0.0.1:${port}`;
  closeServer = () => new Promise((resolve) => server.close(() => resolve()));
}, 60_000);

afterAll(async () => {
  await closeServer();
  await mastra?.shutdown();
});

const headersOf = (user: { idToken: string }, conversationId?: string) => ({
  "content-type": "application/json",
  authorization: `Bearer ${user.idToken}`,
  "x-tenant-id": TENANT,
  "x-request-id": REQUEST_ID,
  ...(conversationId === undefined ? {} : { "x-conversation-id": conversationId }),
});

const userMessage = (text: string) => ({ id: `u-${Date.now()}`, role: "user", parts: [{ type: "text", text }] });
const chat = (user: { idToken: string }, body: unknown, conversationId?: string) =>
  fetch(`${baseUrl}/chat/assistant`, {
    method: "POST",
    headers: headersOf(user, conversationId),
    body: JSON.stringify(body),
  });

type Chunk = { type: string; [key: string]: unknown };
const chunksOf = async (response: Response): Promise<Chunk[]> =>
  (await response.text())
    .split("\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => JSON.parse(line.slice(6)) as Chunk);

const threadMessages = async (threadId: string) =>
  (await (await storage.getStore("memory"))?.listMessages({ threadId }))?.messages ?? [];

describe("chat routes (Auth Emulator, production composition)", { timeout: 60_000 }, () => {
  it("answers 401 without a token and keeps the durable agent off /api", async () => {
    expect((await fetch(`${baseUrl}/chat/assistant`, { method: "POST", body: "{}" })).status).toBe(401);
    const direct = await fetch(`${baseUrl}/api/agents/assistant-chat/generate`, {
      method: "POST",
      headers: headersOf(member),
      body: JSON.stringify({ messages: "hi" }),
    });
    expect(direct.status).toBe(404);
  });

  it("streams a new conversation with delegation and reasoning parts and stores it in the caller's memory", async () => {
    const response = await chat(member, {
      messages: [userMessage('[[fake:reasoning {"text":"thinking"}]] What is our onboarding policy?')],
      maxSteps: 99,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    const conversationId = response.headers.get("x-conversation-id") ?? "";
    expect(conversationId).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(response.headers.get("x-run-id")).toBeTruthy();
    const chunks = await chunksOf(response);
    expect(chunks.map((chunk) => chunk.type)).toEqual(
      expect.arrayContaining([
        "start",
        "reasoning-delta",
        "tool-input-available",
        "tool-output-available",
        "text-delta",
        "finish",
      ]),
    );
    expect(chunks.some((chunk) => chunk.type === "tool-input-available" && chunk.toolName === "agent-knowledge")).toBe(
      true,
    );
    const thread = await (await storage.getStore("memory"))?.getThreadById({ threadId: conversationId });
    expect(thread?.resourceId).toBe(`${TENANT}:${member.uid}`);
    const roles = (await threadMessages(conversationId)).map((message) => message.role);
    expect(roles[0]).toBe("user");
    expect(roles).toContain("assistant");
    // Another member cannot use this conversation.
    expect((await chat(other, { messages: [userMessage("hi")] }, conversationId)).status).toBe(403);
  });

  it("stops a slow run through the abort route and keeps the partial answer", async () => {
    const slow = `[[fake:slow {"delayMs":60}]] [[fake:text {"text":"${"S".repeat(640)}"}]]`;
    const response = await chat(member, { messages: [userMessage(slow)] });
    const conversationId = response.headers.get("x-conversation-id") ?? "";
    const runId = response.headers.get("x-run-id") ?? "";
    const reading = chunksOf(response);
    await new Promise((resolve) => setTimeout(resolve, 500));
    // Another member's abort is a no-op.
    const foreign = await fetch(`${baseUrl}/chat/runs/${runId}/abort`, {
      method: "POST",
      headers: headersOf(other, conversationId),
    });
    expect(foreign.status).toBe(403);
    const stop = await fetch(`${baseUrl}/chat/runs/${runId}/abort`, {
      method: "POST",
      headers: headersOf(member, conversationId),
    });
    expect(stop.status).toBe(204);
    const text = (await reading)
      .filter((chunk) => chunk.type === "text-delta")
      .map((chunk) => String(chunk.delta))
      .join("");
    expect(text.length).toBeGreaterThan(0);
    expect(text.length).toBeLessThan(640);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const saved = JSON.stringify(
      (await threadMessages(conversationId)).filter((message) => message.role === "assistant"),
    );
    expect(saved).toContain("SSSS");
  });

  it("replays a run through observe and answers 204 for an unknown run", async () => {
    const response = await chat(member, { messages: [userMessage("hello there")] });
    const conversationId = response.headers.get("x-conversation-id") ?? "";
    const runId = response.headers.get("x-run-id") ?? "";
    const original = await chunksOf(response);
    const replay = await fetch(`${baseUrl}/chat/assistant/runs/${runId}/observe`, {
      headers: headersOf(member, conversationId),
    });
    expect(replay.status).toBe(200);
    const text = (chunks: Chunk[]) =>
      chunks
        .filter((chunk) => chunk.type === "text-delta")
        .map((chunk) => chunk.delta)
        .join("");
    expect(text(await chunksOf(replay))).toBe(text(original));
    const unknown = await fetch(`${baseUrl}/chat/assistant/runs/unknown-run/observe`, {
      headers: headersOf(member, conversationId),
    });
    expect(unknown.status).toBe(204);
  });

  it("round-trips a tool approval through the native ai sdk path and runs the command once", async () => {
    const first = await chat(member, { messages: [userMessage('Confirm: create the project named "Chat launch"')] });
    const conversationId = first.headers.get("x-conversation-id") ?? "";
    const chunks = await chunksOf(first);
    const request = chunks.find((chunk) => chunk.type === "tool-approval-request") as
      | { approvalId: string; toolCallId: string }
      | undefined;
    expect(request).toBeDefined();
    expect(chunks.find((chunk) => chunk.type === "data-tool-call-approval")).toMatchObject({
      data: { toolName: "command_tenancy_CreateProjectInput" },
    });
    expect(chunks.find((chunk) => chunk.type === "data-tool-preview")).toMatchObject({
      data: { toolId: "command.tenancy.CreateProjectInput", permission: "core.project.create" },
    });
    const approved = {
      id: "a-1",
      role: "assistant",
      parts: [
        {
          type: "tool-agent-action",
          toolCallId: request?.toolCallId,
          state: "approval-responded",
          input: {},
          approval: { id: request?.approvalId, approved: true },
        },
      ],
    };
    // Another member cannot answer this approval.
    expect((await chat(other, { messages: [approved] })).status).toBe(403);
    const second = await chat(member, { messages: [approved] }, conversationId);
    expect(second.status).toBe(200);
    const outputs = (await chunksOf(second)).filter((chunk) => chunk.type === "tool-output-available");
    const results = JSON.stringify(outputs);
    expect(results).toContain("command_tenancy_CreateProjectInput");
    expect(results).toContain("Chat launch");
    // Answering the same approval again never runs the command a second time.
    const replayed = await chunksOf(await chat(member, { messages: [approved] }, conversationId));
    expect(replayed.some((chunk) => chunk.type === "tool-output-available")).toBe(false);
  });
});
