import { createServer } from "node:net";
import type { RegionalSettings } from "@core/agents";
import { ApprovalRequestIdSchema } from "@core/contracts";
import {
  createAccessCore,
  createFirebaseAdmin,
  createInMemoryAccessStore,
  createMastraWorkflowApprovalSettler,
  createMastraWorkflowGateway,
  processLogger,
  type ResolveAccessContext,
} from "@core/services";
import { createCoreServer } from "@core/services/composition";
import { Mastra } from "@mastra/core/mastra";
import { InMemoryStore } from "@mastra/core/storage";
import { createNodeServer } from "@mastra/deployer/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadMastraEnv } from "../mastra-env.schema.ts";
import { APP_MODULES } from "../modules.ts";
import { createAgentRuntime } from "../runtime/create-agent-runtime.ts";

// Runs inside `firebase emulators:exec`. The `approval-expiry-sweep` workflow (SP5 Task 7) on the
// production runtime composition: SP1 approval requests of `approval-demo` runs in the Firestore
// emulator, the sweep run in process like a platform schedule, then the settle the Functions
// trigger performs. Decision 0030 A3: a stale `approved` request becomes `failed`, its run stays
// suspended (decision 0036).
const TENANT = "EmuTenantExpirySweep";
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
let core: ReturnType<typeof createCoreServer>;
let firebase: ReturnType<typeof createFirebaseAdmin>;

beforeAll(async () => {
  [member, admin] = await Promise.all([signUp("sweep-member"), signUp("sweep-admin")]);
  const readers = createInMemoryAccessStore();
  readers.putOrganization({ id: TENANT });
  for (const uid of [member.uid, admin.uid]) readers.putUser(uid);
  readers.putGrant({ tenantId: TENANT, principalId: admin.uid, nodeId: TENANT, roles: [{ kind: "system", key: "admin" }] });
  readers.putGrant({ tenantId: TENANT, principalId: member.uid, nodeId: TENANT, roles: [{ kind: "system", key: "member" }] });
  firebase = createFirebaseAdmin({ env, processEnv: process.env });
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
  core = createCoreServer({ env: { API_KEY_PREFIX: "core_test" }, firebase, logger: processLogger, adapters: { accessReaders: readers } });
}, 60_000);

afterAll(async () => {
  await closeServer();
  await mastra?.shutdown();
});

const scope = () => ({ bearer: member.idToken, tenantId: TENANT, regional: REGIONAL, requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3" });

/** Starts `approval-demo` as the member and waits for its suspension on the SP1 request. */
const startSuspended = async (title: string) => {
  const gateway = createMastraWorkflowGateway({ baseUrl, serverlessToken: null });
  const started = await gateway.startRun(scope(), { workflowId: "approval-demo", inputData: { title } });
  if (!started.ok) throw new Error(`start failed: ${JSON.stringify(started.error)}`);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const run = await gateway.getRun(scope(), started.data.runId);
    if (run.ok && run.data.status === "suspended" && run.data.approvalRequestId !== null) {
      return { runId: started.data.runId, approvalRequestId: ApprovalRequestIdSchema.parse(run.data.approvalRequestId) };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("run never suspended");
};

const sweep = async (): Promise<unknown> => {
  const run = await mastra?.getWorkflow("approval-expiry-sweep").createRun();
  const result = await run?.start({ inputData: {} });
  return result?.status === "success" ? (result.result as unknown) : result?.status;
};

const requestDoc = (id: string) => firebase.firestore.collection("approval-requests").doc(id);
const runState = (runId: string) => mastra?.getWorkflow("approval-demo").getWorkflowRunById(runId);

describe("approval-expiry-sweep (Auth + Firestore emulators, real Mastra server)", () => {
  it("expires an overdue request, audited, and the trigger's settle ends the run as expired", async () => {
    const { runId, approvalRequestId } = await startSuspended("Expires");
    await requestDoc(approvalRequestId).update({ expiresAt: new Date(Date.now() - 60_000) });
    expect(await sweep()).toMatchObject({ status: "done", code: null });
    expect(await core.approvals.getApprovalRequest(approvalRequestId)).toMatchObject({ status: "expired" });
    const audit = await firebase.firestore.collection("audit-logs").where("tenantId", "==", TENANT).where("action", "==", "APPROVAL_EXPIRED").get();
    expect(audit.docs.map((doc) => doc.get("target") as unknown)).toContainEqual({ type: "approval-request", id: approvalRequestId });
    const settled = await createMastraWorkflowApprovalSettler({ baseUrl, serverlessToken: null }).settle({ approvalRequestId, requestId: "evt" });
    expect(settled).toEqual({ ok: true, data: { settled: true, runStatus: "success" } });
    expect((await runState(runId))?.result).toMatchObject({ outcome: "expired" });
  }, 60_000);

  it("fails a request left approved for 15 minutes and leaves its run suspended (0030 A3, 0036)", async () => {
    const { runId, approvalRequestId } = await startSuspended("Interrupted");
    await requestDoc(approvalRequestId).update({ status: "approved", decidedBy: admin.uid, updatedAt: new Date(Date.now() - 20 * 60_000) });
    expect(await sweep()).toMatchObject({ status: "done" });
    expect(await core.approvals.getApprovalRequest(approvalRequestId)).toMatchObject({ status: "failed" });
    const settled = await createMastraWorkflowApprovalSettler({ baseUrl, serverlessToken: null }).settle({ approvalRequestId, requestId: "evt" });
    expect(settled).toEqual({ ok: true, data: { settled: false, reason: "NOT_SETTLED" } });
    expect((await runState(runId))?.status).toBe("suspended");
  }, 60_000);
});
