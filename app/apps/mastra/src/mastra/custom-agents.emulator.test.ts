import { createServer as createNetServer } from "node:net";
import type { RegionalSettings } from "@core/agents";
import {
  type ApiRouteDeps,
  buildChatRoutes,
  buildConversationsRoutes,
  buildCustomAgentsRoutes,
  buildCustomSkillsRoutes,
  buildTenantCatalogRoutes,
  createAccessCore,
  createFirebaseAdmin,
  createFirebaseCustomAgentsServices,
  createFirestoreConversationsServices,
  createInMemoryAccessStore,
  createInMemoryAuditLogWriter,
  createInMemoryIdempotencyStore,
  createInMemoryRateLimiter,
  createLogger,
  createMastraChatGateway,
  createMastraWorkflowGateway,
  makeRecordAudit,
  type ResolveAccessContext,
  systemClock,
} from "@core/services";
import { Mastra } from "@mastra/core/mastra";
import { InMemoryStore } from "@mastra/core/storage";
import { createNodeServer } from "@mastra/deployer/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadMastraEnv } from "../mastra-env.schema.ts";
import { APP_MODULES } from "../modules.ts";
import { createAgentRuntime } from "../runtime/create-agent-runtime.ts";
import { makeGateDatabase } from "./sp3-gate.fixture.ts";

// Decision 0046 end to end: the real `/v1` handlers of custom skills, custom agents, the catalog
// and the chat (Firestore and Auth emulators) over the gateway to a Mastra server of the
// production composition in fake mode, with the Postgres usage ledger. Two organizations.
const RUN = Date.now().toString(36).slice(-6).padStart(6, "0");
const TENANT_A = `EmuCustomAgentA${RUN}`.slice(0, 20);
const TENANT_B = `EmuCustomAgentB${RUN}`.slice(0, 20);
const REGIONAL: RegionalSettings = { locale: "pt-BR", displayTimeZone: "America/Sao_Paulo", nodeTimeZone: "America/Sao_Paulo", currency: "BRL" };

const env = loadMastraEnv({
  APP_ENV: "local",
  AI_MODE: "fake",
  FIREBASE_PROJECT_ID: "demo-core",
  DATABASE_URL: "postgresql://app:app@127.0.0.1:5432/app",
  FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
  FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
});
const firebase = createFirebaseAdmin({ env, processEnv: process.env });

const signUp = async (label: string): Promise<{ uid: string; idToken: string }> => {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (host === undefined) throw new Error("FIREBASE_AUTH_EMULATOR_HOST is not set; run through pnpm test:emulators");
  const response = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `${label}-${Date.now()}@example.test`, password: "secret-password", returnSecureToken: true }),
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

const auditLog = createInMemoryAuditLogWriter();
const audit = makeRecordAudit({ writer: auditLog, clock: systemClock });
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
  audit,
};

type Routes = Record<string, (request: Request) => Promise<Response>>;
type User = { uid: string; idToken: string };
let routes: Routes = {};
let server: { mastra: Mastra; close: () => Promise<void> } | undefined;
let baseUrl = "";
let adminA: User = { uid: "", idToken: "" };
let memberA: User = { uid: "", idToken: "" };
let adminB: User = { uid: "", idToken: "" };
const db = makeGateDatabase();

const startMastra = async () => {
  const runtime = createAgentRuntime({ env, processEnv: process.env, modules: APP_MODULES, overrides: { firebase, storage: new InMemoryStore(), adapters: { accessReaders: readers, resolveAccessContext } } });
  const port = await freePort();
  const mastra = new Mastra({
    agents: runtime.agents,
    storage: runtime.storage,
    vectors: runtime.vectors,
    observability: runtime.observability,
    server: { port, host: "127.0.0.1", auth: runtime.auth, middleware: runtime.middleware, apiRoutes: runtime.apiRoutes },
  });
  const node = await createNodeServer(mastra, { tools: {} });
  return { mastra, baseUrl: `http://127.0.0.1:${port}`, close: () => new Promise<void>((resolve) => node.close(() => resolve())) };
};

const routesFor = (baseUrl: string): Routes => {
  const gatewayOptions = { baseUrl, serverlessToken: null };
  const customAgents = createFirebaseCustomAgentsServices({ firebase, audit, clock: systemClock });
  const gateway = createMastraWorkflowGateway(gatewayOptions);
  const noFiles = () => Promise.resolve({ ok: false as const, error: { code: "FILE_NOT_FOUND" as const } });
  const chatDeps = {
    pipeline,
    chat: createMastraChatGateway(gatewayOptions),
    conversations: createFirestoreConversationsServices({ firestore: firebase.firestore }),
    resolveAccessContext,
    files: { getReadyFile: noFiles, readFileBytes: noFiles },
    isChatAgentEnabled: customAgents.isChatAgentEnabled,
  };
  const customDeps = { pipeline, customAgents, gateway, resolveAccessContext };
  return {
    ...buildChatRoutes(chatDeps),
    ...buildConversationsRoutes(chatDeps),
    ...buildCustomAgentsRoutes(customDeps),
    ...buildCustomSkillsRoutes(customDeps),
    ...buildTenantCatalogRoutes({ pipeline, gateway, resolveAccessContext }),
  };
};

beforeAll(async () => {
  [adminA, memberA, adminB] = await Promise.all([signUp("custom-admin-a"), signUp("custom-member-a"), signUp("custom-admin-b")]);
  for (const [tenantId, user, key] of [[TENANT_A, adminA, "admin"], [TENANT_A, memberA, "member"], [TENANT_B, adminB, "admin"]] as const) {
    readers.putOrganization({ id: tenantId });
    readers.putUser(user.uid);
    readers.putGrant({ tenantId, principalId: user.uid, nodeId: tenantId, roles: [{ kind: "system", key }] });
  }
  const started = await startMastra();
  server = started;
  baseUrl = started.baseUrl;
  routes = routesFor(started.baseUrl);
}, 120_000);

afterAll(async () => {
  await server?.close();
  await server?.mastra.shutdown();
  await db.end();
});

const call = (endpointId: string, path: string, init: { method?: string; user: User; body?: unknown }) => {
  const handler = routes[endpointId];
  if (handler === undefined) throw new Error(`no route ${endpointId}`);
  const headers = { authorization: `Bearer ${init.user.idToken}`, ...(init.body === undefined ? {} : { "content-type": "application/json" }) };
  return handler(new Request(`http://localhost${path}`, { method: init.method ?? "GET", headers, ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }) }));
};
const dataOf = async <T>(response: Response): Promise<T> => ((await response.json()) as { data: T }).data;
const userMessage = (text: string) => ({ id: `u-${Date.now()}`, role: "user", parts: [{ type: "text", text }] });
const send = (user: User, body: unknown) => call("chat.sendMessage", "/v1/chat", { method: "POST", user, body });

type Chunk = { type: string; [key: string]: unknown };
const chunksOf = async (response: Response): Promise<Chunk[]> =>
  (await response.text())
    .split("\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => JSON.parse(line.slice(6)) as Chunk);
const textOf = (chunks: Chunk[]) => chunks.filter((chunk) => chunk.type === "text-delta").map((chunk) => String(chunk.delta)).join("");

describe("tenant-defined agents and skills end to end (fake mode)", { timeout: 120_000 }, () => {
  let skillId = "";
  let agentId = "";

  it("creates a skill, then an agent that uses it, and lists both for the organization", async () => {
    const skill = await call("custom-skills.create", `/v1/skills?organizationId=${TENANT_A}`, {
      method: "POST",
      user: adminA,
      body: { name: "weekly-report", description: "How to write the weekly report.", instructions: "# Weekly report\n\nStart with a summary." },
    });
    expect(skill.status).toBe(201);
    skillId = (await dataOf<{ id: string }>(skill)).id;
    const agent = await call("custom-agents.create", `/v1/agents?organizationId=${TENANT_A}`, {
      method: "POST",
      user: adminA,
      body: { name: "Report writer", description: "Writes weekly reports.", instructions: "Write short reports.", customSkills: [skillId], coreSkills: ["knowledge-citations"], knowledgeScope: "organization" },
    });
    expect(agent.status).toBe(201);
    const created = await dataOf<{ id: string; tenantId: string; enabled: boolean; model: string }>(agent);
    expect(created).toMatchObject({ tenantId: TENANT_A, enabled: true, model: "chat" });
    agentId = created.id;
    const catalog = await dataOf<{ key: string; source: string; tools: { id: string }[]; skills: { name: string; source: string }[] }[]>(
      await call("agents.listCatalog", `/v1/agents?organizationId=${TENANT_A}`, { user: adminA }),
    );
    const entry = catalog.find((item) => item.key === agentId);
    expect(entry).toMatchObject({ source: "custom", tools: [{ id: "knowledge.searchKnowledge" }] });
    expect(entry?.skills).toEqual([expect.objectContaining({ name: "knowledge-citations", source: "core" }), expect.objectContaining({ name: "org-weekly-report", source: "custom" })]);
    const options = await dataOf<{ models: string[]; usage: { agents: number; skills: number }; limits: { maxAgents: number } }>(
      await call("custom-agents.options", `/v1/agent-options?organizationId=${TENANT_A}`, { user: adminA }),
    );
    expect(options).toMatchObject({ models: ["chat", "reasoning"], usage: { agents: 1, skills: 1 }, limits: { maxAgents: 5 } });
    const actions = auditLog.entries("tenant").filter((entry) => entry.tenantId === TENANT_A).map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(["CUSTOM_SKILL_CREATED", "CUSTOM_AGENT_CREATED"]));
  });

  it("refuses a member without the update permission", async () => {
    const response = await call("custom-agents.create", `/v1/agents?organizationId=${TENANT_A}`, { method: "POST", user: memberA, body: { name: "x", description: "y", instructions: "z" } });
    expect(response.status).toBe(403);
  });

  it("lets a member chat with the agent, keeps the turn in memory and bills the organization", async () => {
    const listed = await dataOf<{ id: string; source: string }[]>(await call("custom-agents.listChatAgents", `/v1/chat-agents?organizationId=${TENANT_A}`, { user: memberA }));
    expect(listed.map((item) => item.id)).toEqual(["assistant", agentId]);
    const response = await send(memberA, { organizationId: TENANT_A, agentId, message: userMessage("status of the launch") });
    expect(response.status).toBe(200);
    const conversationId = response.headers.get("x-conversation-id") ?? "";
    expect(textOf(await chunksOf(response))).toContain("status of the launch");
    expect((await firebase.firestore.collection("conversations").doc(conversationId).get()).data()).toMatchObject({ tenantId: TENANT_A, ownerId: memberA.uid, agentId });
    const rolesOf = async () => {
      const page = await dataOf<{ role: string }[]>(await call("conversations.listMessages", `/v1/conversations/${conversationId}/messages`, { user: memberA }));
      return page.map((message) => message.role);
    };
    await expect.poll(rolesOf, { timeout: 15_000, interval: 250 }).toEqual(["user", "assistant"]);
    await vi.waitFor(
      async () => {
        const rows = await db.usageRows(TENANT_A);
        expect(rows.filter((row) => row.agent_id.startsWith("custom-agent") && row.user_id === memberA.uid && row.input_tokens > 0).length).toBeGreaterThan(0);
      },
      { timeout: 20_000, interval: 500 },
    );
    expect((await db.usageRows(TENANT_B)).some((row) => row.agent_id.startsWith("custom-agent"))).toBe(false);
  });

  it("hides the agent and the skill from another organization and refuses to run it there", async () => {
    expect((await call("custom-agents.get", `/v1/agents/${agentId}?organizationId=${TENANT_B}`, { user: adminB })).status).toBe(404);
    expect((await call("custom-skills.get", `/v1/skills/${skillId}?organizationId=${TENANT_B}`, { user: adminB })).status).toBe(404);
    // An admin of B cannot act in A either: a non-member is answered as if the organization did not exist.
    expect((await call("custom-agents.get", `/v1/agents/${agentId}?organizationId=${TENANT_A}`, { user: adminB })).status).toBe(404);
    const catalog = await dataOf<{ key: string }[]>(await call("agents.listCatalog", `/v1/agents?organizationId=${TENANT_B}`, { user: adminB }));
    expect(catalog.some((item) => item.key === agentId)).toBe(false);
    const skills = await dataOf<{ id: string }[]>(await call("custom-skills.list", `/v1/skills?organizationId=${TENANT_B}`, { user: adminB }));
    expect(skills).toEqual([]);
    expect((await send(adminB, { organizationId: TENANT_B, agentId, message: userMessage("hello") })).status).toBe(404);
    expect((await call("custom-agents.update", `/v1/agents/${agentId}?organizationId=${TENANT_B}`, { method: "PATCH", user: adminB, body: { enabled: false } })).status).toBe(404);
    expect((await call("custom-agents.delete", `/v1/agents/${agentId}?organizationId=${TENANT_B}`, { method: "DELETE", user: adminB })).status).toBe(404);
    // The runtime refuses it too, whatever /v1 decided: a direct call with B's token answers 404.
    const direct = await fetch(`${baseUrl}/chat/${agentId}`, {
      method: "POST",
      headers: { authorization: `Bearer ${adminB.idToken}`, "content-type": "application/json", "x-tenant-id": TENANT_B, "x-conversation-id": `CustomForeign${RUN}0`, "x-request-id": "01J8Z3K4M5N6P7Q8CUSTOM0001" },
      body: JSON.stringify({ messages: [userMessage("hello")] }),
    });
    expect(direct.status).toBe(404);
  });

  it("stops answering as soon as the agent is disabled, and deletes it", async () => {
    const disabled = await call("custom-agents.update", `/v1/agents/${agentId}?organizationId=${TENANT_A}`, { method: "PATCH", user: adminA, body: { enabled: false } });
    expect(disabled.status).toBe(200);
    // The write invalidated the runtime cache: no 60 s wait.
    expect((await send(memberA, { organizationId: TENANT_A, agentId, message: userMessage("still there?") })).status).toBe(404);
    expect((await call("custom-agents.delete", `/v1/agents/${agentId}?organizationId=${TENANT_A}`, { method: "DELETE", user: adminA })).status).toBe(204);
    expect((await call("custom-skills.delete", `/v1/skills/${skillId}?organizationId=${TENANT_A}`, { method: "DELETE", user: adminA })).status).toBe(204);
    expect((await call("custom-agents.get", `/v1/agents/${agentId}?organizationId=${TENANT_A}`, { user: adminA })).status).toBe(404);
    const actions = auditLog.entries("tenant").filter((entry) => entry.tenantId === TENANT_A).map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(["CUSTOM_AGENT_UPDATED", "CUSTOM_AGENT_DELETED", "CUSTOM_SKILL_DELETED"]));
  });
});
