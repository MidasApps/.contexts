import { createServer } from "node:net";
import type { RegionalSettings } from "@core/agents";
import { createAccessCore, createFirebaseAdmin, createInMemoryAccessStore, createMastraWorkflowGateway, type ResolveAccessContext } from "@core/services";
import { Mastra } from "@mastra/core/mastra";
import { InMemoryStore } from "@mastra/core/storage";
import { createNodeServer } from "@mastra/deployer/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadMastraEnv } from "../mastra-env.schema.ts";
import { APP_MODULES } from "../modules.ts";
import { createAgentRuntime } from "../runtime/create-agent-runtime.ts";

// Runs inside `firebase emulators:exec` (root `pnpm test:emulators`). Workflow runs API of SP5
// (decision 0040) against the production runtime composition on Mastra's Node server: real Auth
// Emulator tokens, the custom `/workflow-runs/*` routes reached through the `/v1` gateway adapter.
const TENANT = "EmuTenantWorkflowRuns";
const OTHER_TENANT = "EmuTenantWorkflowRunsB";
const REGIONAL: RegionalSettings = { locale: "pt-BR", displayTimeZone: "America/Sao_Paulo", nodeTimeZone: "America/Sao_Paulo", currency: "BRL" };

const env = loadMastraEnv({
  APP_ENV: "local",
  AI_MODE: "fake",
  FIREBASE_PROJECT_ID: "demo-core",
  DATABASE_URL: "postgresql://app:app@127.0.0.1:5432/app",
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

const resolveFromReaders = (readers: ReturnType<typeof createInMemoryAccessStore>): ResolveAccessContext => {
  const access = createAccessCore({ readers });
  return async ({ principal, node }) => {
    if (node.level === "platform") return null;
    const effective = await access.forRequest().getEffectivePermissions({ principal, node });
    if (!effective.ok || effective.permissions.size === 0) return null;
    return { tenantId: node.tenantId, principal, permissions: [...effective.permissions].sort(), regional: REGIONAL };
  };
};

let mastra: Mastra | undefined;
let baseUrl = "";
let closeServer: () => Promise<void> = () => Promise.resolve();
let member = { uid: "", idToken: "" };
let admin = { uid: "", idToken: "" };
let outsider = { uid: "", idToken: "" };

beforeAll(async () => {
  [member, admin, outsider] = await Promise.all([signUp("runs-member"), signUp("runs-admin"), signUp("runs-outsider")]);
  const readers = createInMemoryAccessStore();
  readers.putOrganization({ id: TENANT });
  readers.putOrganization({ id: OTHER_TENANT });
  for (const uid of [member.uid, admin.uid, outsider.uid]) readers.putUser(uid);
  readers.putGrant({ tenantId: TENANT, principalId: admin.uid, nodeId: TENANT, roles: [{ kind: "system", key: "admin" }] });
  readers.putGrant({ tenantId: TENANT, principalId: member.uid, nodeId: TENANT, roles: [{ kind: "system", key: "member" }] });
  readers.putGrant({ tenantId: OTHER_TENANT, principalId: outsider.uid, nodeId: OTHER_TENANT, roles: [{ kind: "system", key: "admin" }] });
  const firebase = createFirebaseAdmin({ env, processEnv: process.env });
  const runtime = createAgentRuntime({
    env,
    processEnv: process.env,
    modules: APP_MODULES,
    overrides: { firebase, storage: new InMemoryStore(), adapters: { accessReaders: readers, resolveAccessContext: resolveFromReaders(readers) } },
  });
  const port = await freePort();
  mastra = new Mastra({
    agents: runtime.agents,
    workflows: runtime.workflows,
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

const scopeOf = (user: { idToken: string }, tenantId = TENANT) => ({ bearer: user.idToken, tenantId, regional: REGIONAL, requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3" });

const eventsUntil = async (runId: string, status: string) => {
  const gateway = createMastraWorkflowGateway({ baseUrl, serverlessToken: null });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const result = await gateway.getRunEvents(scopeOf(member), runId);
    if (result.ok && result.data.run.status === status) return result.data;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`run ${runId} never reached ${status}`);
};

describe("workflow runs API (Auth emulator, real Mastra server)", () => {
  it("starts a startable workflow, lists and streams it for the tenant only, and cancels it with the cancel permission", async () => {
    const gateway = createMastraWorkflowGateway({ baseUrl, serverlessToken: null });
    expect(await gateway.startRun(scopeOf(member), { workflowId: "catalog-reindex", inputData: {} })).toMatchObject({ ok: false, error: { code: "WORKFLOW_NOT_STARTABLE", status: 422 } });
    const started = await gateway.startRun(scopeOf(member), { workflowId: "approval-demo", inputData: { title: "Runs API" } });
    if (!started.ok) throw new Error(`start failed: ${JSON.stringify(started.error)}`);
    const { runId } = started.data;

    const suspended = await eventsUntil(runId, "suspended");
    expect(suspended.run).toMatchObject({ runId, workflowId: "approval-demo", tenantId: TENANT, startedBy: member.uid });
    expect(suspended.run.approvalRequestId).not.toBeNull();
    expect(suspended.events.map((event) => event.type)).toContain("workflow-step-suspended");

    const listed = await gateway.listRuns(scopeOf(member), { limit: 20 });
    expect(listed.ok && listed.data.runs.map((run) => run.runId)).toContain(runId);
    // Another tenant neither lists nor reads the run.
    const foreignList = await gateway.listRuns(scopeOf(outsider, OTHER_TENANT), { limit: 20 });
    expect(foreignList.ok && foreignList.data.runs).toEqual([]);
    expect(await gateway.getRun(scopeOf(outsider, OTHER_TENANT), runId)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });

    expect(await gateway.cancelRun(scopeOf(member), runId)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await gateway.cancelRun(scopeOf(admin), runId)).toEqual({ ok: true, data: null });
    const canceled = await eventsUntil(runId, "canceled");
    expect(canceled.events.at(-1)).toMatchObject({ type: "workflow-canceled", status: "canceled" });
  }, 60_000);
});
