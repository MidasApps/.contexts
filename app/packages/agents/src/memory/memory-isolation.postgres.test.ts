import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import { Agent } from "@mastra/core/agent";
import { Mastra } from "@mastra/core/mastra";
import { createNodeServer } from "@mastra/deployer/server";
import { PgVector, PostgresStore } from "@mastra/pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AgentRuntimeContextSchema } from "../context/write-agent-context.ts";
import { type AgentModels, createModelProvider } from "../models/model-factory.ts";
import { defineAgentModule } from "../runtime/agent-module.ts";
import { composeAgentRuntime, type RuntimeParts } from "../runtime/compose-agent-runtime.ts";
import { createFakeAccessPort, createFakeRuntimePorts } from "../testing/fake-ports.ts";
import { FIXTURE_AI_CATALOG } from "../tools/catalog/catalog-fixture.ts";

// Needs the compose container (schema `mastra`, pgvector). Two organizations, one person:
// the same uid is a member of both, and memory must never cross between them.
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://app:app@127.0.0.1:5432/app";
const RUN = randomBytes(4).toString("hex");
const TENANT_A = `memTenantA${RUN}`;
const TENANT_B = `memTenantB${RUN}`;
const UID = `memUser${RUN}`;
const TOKEN = "memory-member-token";
const AGENT_ID = "memtest-chat";
const THREADS = { a1: `thrA1${RUN}`, a2: `thrA2${RUN}`, b1: `thrB1${RUN}` };
const FACT = `ultramarine${RUN}`;
const GOAL = `goal-${RUN}`;

const ENV = {
  APP_ENV: "local",
  AI_MODE: "fake",
  AI_MODEL_CHAT: "google/gemini-3.5-flash",
  AI_MODEL_FAST: "google/gemini-3.5-flash-lite",
  AI_MODEL_REASONING: "google/gemini-3.5-flash",
  AI_MODEL_JUDGE: "google/gemini-3.5-flash",
  AI_MODEL_EMBEDDING: "google/gemini-embedding-2",
  AI_MODEL_TRANSCRIPTION: "openai/gpt-4o-mini-transcribe",
  AI_MODEL_SPEECH: "openai/gpt-4o-mini-tts",
  GOOGLE_AI_BACKEND: "ai-studio",
} as const;

// Every prompt the chat model receives, so a test can see what memory put in it.
const prompts: string[] = [];
const recordingModels = (): AgentModels => {
  const models = createModelProvider(ENV);
  const record = (model: LanguageModelV4): LanguageModelV4 => ({
    ...model,
    doGenerate: (options) => (prompts.push(JSON.stringify(options.prompt)), model.doGenerate(options)),
    doStream: (options) => (prompts.push(JSON.stringify(options.prompt)), model.doStream(options)),
  });
  return { ...models, language: (role, options) => (role === "chat" ? record(models.language(role, options)) : models.language(role, options)) };
};

const memoryAgentModule = defineAgentModule({
  id: "memtest",
  agents: [
    {
      id: AGENT_ID,
      role: "entry",
      ceiling: ["core.chat.use"],
      create: ({ models, memory }) =>
        new Agent({
          id: AGENT_ID,
          name: "Memory test",
          instructions: "Answer briefly.",
          model: models.language("chat", { agentId: AGENT_ID }),
          ...(memory === undefined ? {} : { memory }),
          requestContextSchema: AgentRuntimeContextSchema,
        }),
    },
  ],
});

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

const storage = new PostgresStore({ id: "memory-isolation-store", connectionString: DATABASE_URL, schemaName: "mastra" });
const vector = new PgVector({ id: "memory-isolation-vector", connectionString: DATABASE_URL, schemaName: "mastra" });
let runtime: RuntimeParts | undefined;
let mastra: Mastra | undefined;
let baseUrl = "";
let closeServer: () => Promise<void> = () => Promise.resolve();

beforeAll(async () => {
  const access = createFakeAccessPort({
    credentials: { [TOKEN]: { type: "user", uid: UID, mfa: false } },
    memberships: [TENANT_A, TENANT_B].map((tenantId) => ({ tenantId, uid: UID, permissions: ["core.chat.use"] })),
  });
  runtime = composeAgentRuntime({
    env: ENV,
    ports: createFakeRuntimePorts({ access }),
    modules: [memoryAgentModule],
    storage,
    vector,
    serviceName: "mastra",
    models: recordingModels(),
    aiCatalog: FIXTURE_AI_CATALOG,
  });
  const port = await freePort();
  mastra = new Mastra({
    agents: runtime.agents,
    storage: runtime.storage,
    vectors: runtime.vectors,
    observability: runtime.observability,
    server: { port, host: "127.0.0.1", auth: runtime.auth, middleware: runtime.middleware, apiRoutes: runtime.apiRoutes },
  });
  const server = await createNodeServer(mastra, { tools: {} });
  baseUrl = `http://127.0.0.1:${port}`;
  closeServer = () => new Promise((resolve) => server.close(() => resolve()));
}, 60_000);

afterAll(async () => {
  for (const threadId of Object.values(THREADS)) await runtime?.memory?.deleteThread(threadId).catch(() => undefined);
  await closeServer();
  await mastra?.shutdown();
  await vector.disconnect();
  await storage.close();
});

const headers = (tenantId: string, threadId?: string): Record<string, string> => ({
  authorization: `Bearer ${TOKEN}`,
  "content-type": "application/json",
  "x-tenant-id": tenantId,
  ...(threadId === undefined ? {} : { "x-conversation-id": threadId }),
});

const say = async (tenantId: string, threadId: string, text: string): Promise<{ status: number; prompt: string }> => {
  const before = prompts.length;
  const response = await fetch(`${baseUrl}/api/agents/${AGENT_ID}/generate`, { method: "POST", headers: headers(tenantId, threadId), body: JSON.stringify({ messages: text }) });
  await response.body?.cancel();
  return { status: response.status, prompt: prompts.slice(before).join("\n") };
};

const workingMemoryDirective = `[[fake:tool-call ${JSON.stringify({ toolName: "updateWorkingMemory", input: { memory: { recurringGoals: [GOAL] } } })}]]`;

describe("memory isolation between organizations (same uid, Postgres + PgVector)", () => {
  it("keeps what the user told tenant A inside tenant A", async () => {
    expect((await say(TENANT_A, THREADS.a1, `Remember that my favorite color is ${FACT}.`)).status).toBe(200);
    expect((await say(TENANT_A, THREADS.a1, `${workingMemoryDirective} Please keep my goal.`)).status).toBe(200);

    // Positive control: another thread of the same resource (A:uid) recalls the fact and the goal.
    const inA = await say(TENANT_A, THREADS.a2, `What is my favorite color ${FACT}?`);
    expect(inA.status).toBe(200);
    expect(inA.prompt).toContain(FACT);
    expect(inA.prompt).toContain(GOAL);

    // Same uid in tenant B: neither semantic recall nor working memory crosses.
    const inB = await say(TENANT_B, THREADS.b1, `What is my favorite color ${FACT}?`);
    expect(inB.status).toBe(200);
    expect(inB.prompt).not.toContain(`is ${FACT}.`);
    expect(inB.prompt).not.toContain(GOAL);
  }, 60_000);

  it("lists only tenant B's threads for the user in tenant B, whatever resource the query names", async () => {
    const url = new URL(`${baseUrl}/api/memory/threads`);
    url.searchParams.set("agentId", AGENT_ID);
    url.searchParams.set("resourceId", `${TENANT_A}:${UID}`);
    const response = await fetch(url, { headers: headers(TENANT_B) });
    const body = (await response.json()) as { threads?: { id: string }[] };
    if (response.status === 200) {
      const ids = (body.threads ?? []).map((thread) => thread.id);
      expect(ids).not.toContain(THREADS.a1);
      expect(ids).not.toContain(THREADS.a2);
    } else {
      expect(response.status).toBe(403);
    }
  });

  it("answers 403 when tenant B names a thread of tenant A", async () => {
    expect((await say(TENANT_B, THREADS.a1, "What did I say here?")).status).toBe(403);
    const messages = new URL(`${baseUrl}/api/memory/threads/${THREADS.a1}/messages`);
    messages.searchParams.set("agentId", AGENT_ID);
    expect((await fetch(messages, { headers: headers(TENANT_B) })).status).toBe(403);
  });
});
