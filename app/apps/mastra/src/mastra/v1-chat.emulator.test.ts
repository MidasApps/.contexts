import { createServer as createNetServer } from "node:net";
import type { RegionalSettings } from "@core/agents";
import {
  type ApiRouteDeps,
  buildChatRoutes,
  buildConversationsRoutes,
  buildVoiceRoutes,
  createAccessCore,
  createFirebaseAdmin,
  createFirestoreConversationsServices,
  createInMemoryAccessStore,
  createInMemoryAuditLogWriter,
  createInMemoryIdempotencyStore,
  createInMemoryRateLimiter,
  createLogger,
  createMastraChatGateway,
  createMastraVoiceGateway,
  makeRecordAudit,
  type ResolveAccessContext,
  systemClock,
} from "@core/services";
import { Mastra } from "@mastra/core/mastra";
import { InMemoryStore } from "@mastra/core/storage";
import { createNodeServer } from "@mastra/deployer/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadMastraEnv } from "../mastra-env.schema.ts";
import { APP_MODULES } from "../modules.ts";
import { createAgentRuntime } from "../runtime/create-agent-runtime.ts";

// SP4 Tasks 5-7 end to end: the real `/v1/chat`, `/v1/conversations` and `/v1/voice` handlers
// (Firestore Emulator conversations, Auth Emulator tokens) over the gateway to a Mastra server of
// the production composition in fake mode, and a second one with voice switched off.
const TENANT = "EmuTenantV1Chat00001";
const REGIONAL: RegionalSettings = {
  locale: "pt-BR",
  displayTimeZone: "America/Sao_Paulo",
  nodeTimeZone: "America/Sao_Paulo",
  currency: "BRL",
};

const baseEnv = {
  APP_ENV: "local",
  AI_MODE: "fake",
  FIREBASE_PROJECT_ID: "demo-core",
  DATABASE_URL: "postgresql://app:app@127.0.0.1:5432/app",
  FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
  FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
};
const env = loadMastraEnv(baseEnv);
const firebase = createFirebaseAdmin({ env, processEnv: process.env });

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
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });

const readers = createInMemoryAccessStore();
const resolveAccessContext: ResolveAccessContext = async ({ principal, node }) => {
  if (node.level === "platform") return null;
  const effective = await createAccessCore({ readers }).forRequest().getEffectivePermissions({ principal, node });
  if (!effective.ok || effective.permissions.size === 0) return null;
  return { tenantId: node.tenantId, principal, permissions: [...effective.permissions].sort(), regional: REGIONAL };
};

/** A Mastra server of the production composition; `voice: false` sets AI_VOICE_ENABLED=false. */
const startMastra = async (options: { voice: boolean }) => {
  const runtime = createAgentRuntime({
    env: options.voice ? env : loadMastraEnv({ ...baseEnv, AI_VOICE_ENABLED: "false" }),
    processEnv: process.env,
    modules: APP_MODULES,
    overrides: { firebase, storage: new InMemoryStore(), adapters: { accessReaders: readers, resolveAccessContext } },
  });
  const port = await freePort();
  const mastra = new Mastra({
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
  return {
    mastra,
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
};

const auditLog = createInMemoryAuditLogWriter();
const pipeline: ApiRouteDeps = {
  logger: createLogger({ context: { service: "test", env: "local" }, sink: () => undefined }),
  clock: systemClock,
  rateLimiter: createInMemoryRateLimiter({ clock: systemClock }),
  idempotency: createInMemoryIdempotencyStore({ clock: systemClock }),
  apiKeyPrefix: "core",
  verifyBearer: async ({ token }) => {
    const decoded = await firebase.auth.verifyIdToken(token).catch(() => null);
    return decoded === null ? null : { type: "user", uid: decoded.uid as never, mfa: false };
  },
  access: createAccessCore({ readers }),
  audit: makeRecordAudit({ writer: auditLog, clock: systemClock }),
};

type Routes = Record<string, (request: Request) => Promise<Response>>;
let routes: Routes = {};
let voiceOffRoutes: Routes = {};
const servers: Awaited<ReturnType<typeof startMastra>>[] = [];
let member = { uid: "", idToken: "" };
let other = { uid: "", idToken: "" };

const routesFor = (baseUrl: string): Routes => {
  const gatewayOptions = { baseUrl, serverlessToken: null };
  const noFiles = () => Promise.resolve({ ok: false as const, error: { code: "FILE_NOT_FOUND" as const } });
  const chatDeps = {
    pipeline,
    chat: createMastraChatGateway(gatewayOptions),
    conversations: createFirestoreConversationsServices({ firestore: firebase.firestore }),
    resolveAccessContext,
    files: { getReadyFile: noFiles, readFileBytes: noFiles },
  };
  return {
    ...buildChatRoutes(chatDeps),
    ...buildConversationsRoutes(chatDeps),
    ...buildVoiceRoutes({ pipeline, voice: createMastraVoiceGateway(gatewayOptions), resolveAccessContext }),
  };
};

beforeAll(async () => {
  [member, other] = await Promise.all([signUp("v1-chat-member"), signUp("v1-chat-other")]);
  readers.putOrganization({ id: TENANT });
  for (const [uid, key] of [
    [member.uid, "admin"],
    [other.uid, "member"],
  ] as const) {
    readers.putUser(uid);
    readers.putGrant({ tenantId: TENANT, principalId: uid, nodeId: TENANT, roles: [{ kind: "system", key }] });
  }
  servers.push(await startMastra({ voice: true }), await startMastra({ voice: false }));
  routes = routesFor(servers[0]?.baseUrl ?? "");
  voiceOffRoutes = routesFor(servers[1]?.baseUrl ?? "");
}, 90_000);

afterAll(async () => {
  for (const server of servers) {
    await server.close();
    await server.mastra.shutdown();
  }
});

const call = (
  table: Routes,
  endpointId: string,
  path: string,
  init: {
    method?: string;
    user?: { idToken: string };
    body?: RequestInit["body"];
    headers?: Record<string, string>;
  } = {},
) => {
  const handler = table[endpointId];
  if (handler === undefined) throw new Error(`no route ${endpointId}`);
  const headers = {
    ...(init.user === undefined ? {} : { authorization: `Bearer ${init.user.idToken}` }),
    ...init.headers,
  };
  return handler(
    new Request(`http://localhost${path}`, {
      method: init.method ?? "GET",
      headers,
      ...(init.body === undefined ? {} : { body: init.body }),
    }),
  );
};
const json = (body: unknown) => ({ body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const send = (user: { idToken: string }, body: unknown) =>
  call(routes, "chat.sendMessage", "/v1/chat", { method: "POST", user, ...json(body) });
const userMessage = (text: string) => ({ id: `u-${Date.now()}`, role: "user", parts: [{ type: "text", text }] });

type Chunk = { type: string; [key: string]: unknown };
const chunksOf = async (response: Response): Promise<Chunk[]> =>
  (await response.text())
    .split("\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => JSON.parse(line.slice(6)) as Chunk);

const conversationOf = async (id: string) =>
  (await firebase.firestore.collection("conversations").doc(id).get()).data();

describe("/v1 chat, history and voice end to end (fake mode)", { timeout: 90_000 }, () => {
  it("streams a first turn through /v1/chat and clears the active run when the stream closes", async () => {
    const response = await send(member, { organizationId: TENANT, message: userMessage("hello from v1") });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    const conversationId = response.headers.get("x-conversation-id") ?? "";
    expect(await conversationOf(conversationId)).toMatchObject({ tenantId: TENANT, ownerId: member.uid });
    const chunks = await chunksOf(response);
    expect(chunks.map((chunk) => chunk.type)).toEqual(expect.arrayContaining(["start", "text-delta", "finish"]));
    expect(await conversationOf(conversationId)).toMatchObject({ activeRunId: null, messageCount: 2 });
    // The history lists it, its messages come back as UI messages, and another member gets 404.
    const listed = (await (
      await call(routes, "conversations.list", `/v1/conversations?organizationId=${TENANT}`, { user: member })
    ).json()) as { data: { id: string }[] };
    expect(listed.data.map((item) => item.id)).toContain(conversationId);
    // Memory stores the answer right after the stream ends; under load it can lag a moment.
    const rolesOf = async () => {
      const page = (await (
        await call(routes, "conversations.listMessages", `/v1/conversations/${conversationId}/messages`, {
          user: member,
        })
      ).json()) as { data: { role: string }[] };
      return page.data.map((message) => message.role);
    };
    await expect.poll(rolesOf, { timeout: 10_000, interval: 250 }).toEqual(["user", "assistant"]);
    expect(
      (await call(routes, "conversations.get", `/v1/conversations/${conversationId}`, { user: other })).status,
    ).toBe(404);
  });

  it("keeps a run resumable after the client leaves, stops it, and answers 204 afterwards", async () => {
    const slow = `[[fake:slow {"delayMs":60}]] [[fake:text {"text":"${"S".repeat(640)}"}]]`;
    const response = await send(member, { organizationId: TENANT, message: userMessage(slow) });
    const conversationId = response.headers.get("x-conversation-id") ?? "";
    const reader = response.body?.getReader();
    await reader?.read();
    await reader?.cancel();
    expect((await conversationOf(conversationId))?.activeRunId).toBeTruthy();
    const resumed = await call(routes, "chat.resumeStream", `/v1/chat/${conversationId}/stream`, { user: member });
    expect(resumed.status).toBe(200);
    const replayReader = resumed.body?.getReader();
    expect((await replayReader?.read())?.done).toBe(false);
    await replayReader?.cancel();
    expect(
      (await call(routes, "chat.stopRun", `/v1/chat/${conversationId}/stop`, { method: "POST", user: other })).status,
    ).toBe(404);
    expect(
      (await call(routes, "chat.stopRun", `/v1/chat/${conversationId}/stop`, { method: "POST", user: member })).status,
    ).toBe(204);
    expect((await conversationOf(conversationId))?.activeRunId).toBeNull();
    expect(
      (await call(routes, "chat.resumeStream", `/v1/chat/${conversationId}/stream`, { user: member })).status,
    ).toBe(204);
  });

  it("audits an approval decision before forwarding it, and the command runs on approve", async () => {
    const first = await send(member, {
      organizationId: TENANT,
      message: userMessage('Confirm: create the project named "V1 launch"'),
    });
    const conversationId = first.headers.get("x-conversation-id") ?? "";
    const request = (await chunksOf(first)).find((chunk) => chunk.type === "tool-approval-request") as
      | { approvalId: string; toolCallId: string }
      | undefined;
    expect(request).toBeDefined();
    const part = {
      type: "tool-agent-action",
      toolCallId: request?.toolCallId,
      state: "approval-responded",
      approval: { id: request?.approvalId, approved: true },
    };
    const second = await send(member, { conversationId, message: { id: "a-1", role: "assistant", parts: [part] } });
    expect(second.status).toBe(200);
    expect(JSON.stringify(await chunksOf(second))).toContain("V1 launch");
    const decisions = auditLog.entries("tenant").filter((entry) => entry.action === "AGENT_TOOL_CALL_APPROVED");
    expect(decisions).toMatchObject([
      {
        tenantId: TENANT,
        target: { type: "conversation", id: conversationId },
        metadata: { toolCallId: request?.toolCallId },
      },
    ]);
  });

  it("renames, summarizes and deletes a conversation (memory thread included)", async () => {
    const response = await send(member, { organizationId: TENANT, message: userMessage("plan the onboarding") });
    const conversationId = response.headers.get("x-conversation-id") ?? "";
    await chunksOf(response);
    const path = `/v1/conversations/${conversationId}`;
    const renamed = await call(routes, "conversations.update", path, {
      method: "PATCH",
      user: member,
      ...json({ title: "Onboarding" }),
    });
    expect(((await renamed.json()) as { data: { titleSource: string } }).data.titleSource).toBe("user");
    const summarized = await call(routes, "conversations.summarize", `${path}/summary`, {
      method: "POST",
      user: member,
    });
    expect(summarized.status).toBe(200);
    expect(((await summarized.json()) as { data: { summary: string } }).data.summary.length).toBeGreaterThan(0);
    expect((await call(routes, "conversations.delete", path, { method: "DELETE", user: member })).status).toBe(204);
    expect((await conversationOf(conversationId))?.deletedAt).not.toBeNull();
    const messages = await call(routes, "conversations.listMessages", `${path}/messages`, { user: member });
    expect(messages.status).toBe(404);
    expect(
      auditLog
        .entries("tenant")
        .some((entry) => entry.action === "CONVERSATION_DELETED" && entry.target.id === conversationId),
    ).toBe(true);
  });

  it("transcribes through /v1/voice when voice is on and answers 503 when the platform flag is off", async () => {
    const wav = new Uint8Array(44);
    wav.set(new TextEncoder().encode("RIFF"), 0);
    wav.set(new TextEncoder().encode("WAVE"), 8);
    const upload = async (table: Routes) => {
      const form = new FormData();
      form.set("audio", new Blob([wav], { type: "audio/wav" }), "clip.wav");
      const encoded = new Response(form);
      const body = await encoded.arrayBuffer();
      const headers = {
        "content-type": encoded.headers.get("content-type") ?? "",
        "content-length": String(body.byteLength),
      };
      return call(table, "voice.transcribe", `/v1/voice/transcriptions?organizationId=${TENANT}`, {
        method: "POST",
        user: member,
        body,
        headers,
      });
    };
    const transcribed = await upload(routes);
    expect(transcribed.status).toBe(200);
    expect(((await transcribed.json()) as { data: { text: string } }).data.text).toContain("fake transcript");
    const gated = await upload(voiceOffRoutes);
    expect(gated.status).toBe(503);
    expect(((await gated.json()) as { error: { code: string } }).error.code).toBe("FEATURE_UNAVAILABLE");
    const realtime = await call(
      routes,
      "voice.createRealtimeSession",
      `/v1/voice/realtime-sessions?organizationId=${TENANT}`,
      { method: "POST", user: member },
    );
    expect(realtime.status).toBe(503);
  });
});
