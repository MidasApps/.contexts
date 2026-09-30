import { createServer } from "node:net";
import type { RegionalSettings } from "@core/agents";
import { RoleIdSchema } from "@core/contracts";
import { createFirebaseAdmin, createInMemoryAccessStore } from "@core/services";
import { Mastra } from "@mastra/core/mastra";
import { InMemoryStore } from "@mastra/core/storage";
import { createNodeServer } from "@mastra/deployer/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadMastraEnv } from "../mastra-env.schema.ts";
import { APP_MODULES } from "../modules.ts";
import { createAgentRuntime } from "../runtime/create-agent-runtime.ts";

// Runs inside `firebase emulators:exec` (root `pnpm test:emulators`): real Auth Emulator
// tokens verified by SP1's `verifyBearer`, SP1 `authorize()` over in-memory readers, the
// production composition (`createAgentRuntime`), served by Mastra's Node server.
const TENANT = "EmuTenant0000000002";
const REQUEST_ID = "01J8Z3K4M5N6P7Q8R9S0T1V2W3";
const REGIONAL: RegionalSettings = { locale: "pt-BR", displayTimeZone: "America/Sao_Paulo", nodeTimeZone: "America/Manaus", currency: "BRL" };

const env = loadMastraEnv({
  APP_ENV: "local",
  AI_MODE: "fake",
  FIREBASE_PROJECT_ID: "demo-core",
  DATABASE_URL: "postgresql://app:app@127.0.0.1:5432/app",
  // Local requires both emulators; emulators:exec exports their hosts.
  FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
  FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
});

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
let viewer = { uid: "", idToken: "" };

beforeAll(async () => {
  [member, viewer] = await Promise.all([signUp("runtime-member"), signUp("runtime-viewer")]);
  const readers = createInMemoryAccessStore();
  readers.putOrganization({ id: TENANT });
  for (const uid of [member.uid, viewer.uid]) readers.putUser(uid);
  readers.putGrant({ tenantId: TENANT, principalId: member.uid, nodeId: TENANT, roles: [{ kind: "system", key: "member" }] });
  readers.putRole({ id: "no-chat", tenantId: TENANT, permissions: ["core.knowledge.read"] });
  readers.putGrant({ tenantId: TENANT, principalId: viewer.uid, nodeId: TENANT, roles: [{ kind: "custom", roleId: RoleIdSchema.parse("no-chat") }] });
  const runtime = createAgentRuntime({
    env,
    processEnv: process.env,
    modules: APP_MODULES,
    overrides: {
      firebase: createFirebaseAdmin({ env, processEnv: process.env }),
      storage,
      adapters: { accessReaders: readers, regional: () => Promise.resolve(REGIONAL) },
    },
  });
  const port = await freePort();
  mastra = new Mastra({
    agents: runtime.agents,
    storage: runtime.storage,
    observability: runtime.observability,
    server: { port, host: "127.0.0.1", auth: runtime.auth, middleware: runtime.middleware, apiRoutes: runtime.apiRoutes },
  });
  const server = await createNodeServer(mastra, { tools: {} });
  baseUrl = `http://127.0.0.1:${port}`;
  closeServer = () => new Promise((resolve) => server.close(() => resolve()));
}, 60_000);

afterAll(async () => {
  await closeServer();
  await mastra?.shutdown();
});

const generate = (headers: Record<string, string>, body: unknown = { messages: "ping" }) =>
  fetch(`${baseUrl}/api/agents/ping/generate`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

const memberHeaders = () => ({ authorization: `Bearer ${member.idToken}`, "x-tenant-id": TENANT, "x-request-id": REQUEST_ID });

const spanMetadata = async (): Promise<Record<string, unknown>[]> => {
  const observability = await storage.getStore("observability");
  if (observability === undefined) throw new Error("the in-memory store has no observability domain");
  const page = await observability.listTraces({});
  const traces = await Promise.all(page.spans.map((span) => observability.getTrace({ traceId: span.traceId })));
  return traces.flatMap((trace) => trace?.spans ?? []).map((span) => span.metadata ?? {});
};

describe("Mastra runtime composition (Auth Emulator)", () => {
  it("runs the ping agent for a member and stores spans with the tenant metadata", async () => {
    const response = await generate(memberHeaders());
    expect(response.status).toBe(200);
    expect(((await response.json()) as { text: string }).text.length).toBeGreaterThan(0);
    await vi.waitFor(async () => {
      const metadata = await spanMetadata();
      expect(metadata.some((entry) => entry.tenantId === TENANT && entry.requestId === REQUEST_ID)).toBe(true);
      // The context permissions never reach span metadata (Mastra itself adds resourceId = tenantId:uid).
      expect(JSON.stringify(metadata)).not.toContain("core.chat.use");
    }, { timeout: 15_000, interval: 200 });
  }, 30_000);

  it("ignores a client-sent requestContext: the tenant comes from the verified principal", async () => {
    const body = { messages: "ping", requestContext: { tenantId: "Intruder000000000000", permissions: ["platform.everything"] } };
    expect((await generate(memberHeaders(), body)).status).toBe(200);
    const metadata = await spanMetadata();
    expect(JSON.stringify(metadata)).not.toContain("Intruder000000000000");
  }, 30_000);

  it("answers 401 without a token and 403 for a member without core.chat.use or without a tenant", async () => {
    expect((await generate({ "x-tenant-id": TENANT })).status).toBe(401);
    expect((await generate({ authorization: `Bearer ${viewer.idToken}`, "x-tenant-id": TENANT })).status).toBe(403);
    expect((await generate({ authorization: `Bearer ${member.idToken}` })).status).toBe(403);
  });

  it("closes built-in routes the core does not serve", async () => {
    const response = await fetch(`${baseUrl}/api/vectors/x`, { headers: memberHeaders() });
    expect(response.status).toBe(404);
  });
});
