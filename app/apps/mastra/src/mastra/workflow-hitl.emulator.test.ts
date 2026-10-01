import { createServer } from "node:net";
import type { RegionalSettings } from "@core/agents";
import { ApprovalRequestIdSchema, TenantIdSchema, UserIdSchema, type UserPrincipal } from "@core/contracts";
import {
  createAccessCore,
  createFirebaseAdmin,
  createInMemoryAccessStore,
  createMastraWorkflowGateway,
  createMastraWorkflowApprovalSettler,
  defineAgentCommandExecutor,
  processLogger,
  registerWorkflowApprovals,
  type ResolveAccessContext,
} from "@core/services";
import { createCoreServer } from "@core/services/composition";
import { Mastra } from "@mastra/core/mastra";
import { InMemoryStore } from "@mastra/core/storage";
import { createNodeServer } from "@mastra/deployer/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { loadMastraEnv } from "../mastra-env.schema.ts";
import { APP_MODULES } from "../modules.ts";
import { createAgentRuntime } from "../runtime/create-agent-runtime.ts";

// Runs inside `firebase emulators:exec` (root `pnpm test:emulators`). Four-eyes workflow HITL end
// to end (decision 0036): real Auth Emulator tokens, SP1 approval requests in the Firestore
// emulator, the production runtime composition served by Mastra's Node server, the `/v1`
// gateway starting the run with the member's token, and SP1's approve/reject use cases with
// the `workflow-resume` handler calling the real settle route.
const TENANT = "EmuTenantWorkflowHitl";
const REGIONAL: RegionalSettings = { locale: "pt-BR", displayTimeZone: "America/Sao_Paulo", nodeTimeZone: "America/Sao_Paulo", currency: "BRL" };
const NOTE_COMMAND = "example.CreateNoteCommand";

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

// The module note command SP3 Task 19 will bring; here it records who ran it.
const notes: { title: string; principal: unknown; requestId: string }[] = [];
const noteExecutor = defineAgentCommandExecutor({
  commandId: NOTE_COMMAND,
  permission: "core.workflow-run.start",
  inputSchema: z.strictObject({ title: z.string().min(1), body: z.string().optional() }),
  execute: ({ input, principal, requestId }) => {
    notes.push({ title: input.title, principal, requestId });
    return Promise.resolve({ id: `note-${notes.length}` });
  },
});

let mastra: Mastra | undefined;
let baseUrl = "";
let closeServer: () => Promise<void> = () => Promise.resolve();
let member = { uid: "", idToken: "" };
let admin = { uid: "", idToken: "" };
let core: ReturnType<typeof createCoreServer>;

beforeAll(async () => {
  [member, admin] = await Promise.all([signUp("hitl-member"), signUp("hitl-admin")]);
  const readers = createInMemoryAccessStore();
  readers.putOrganization({ id: TENANT });
  for (const uid of [member.uid, admin.uid]) readers.putUser(uid);
  readers.putGrant({ tenantId: TENANT, principalId: admin.uid, nodeId: TENANT, roles: [{ kind: "system", key: "admin" }] });
  readers.putGrant({ tenantId: TENANT, principalId: member.uid, nodeId: TENANT, roles: [{ kind: "system", key: "member" }] });
  const firebase = createFirebaseAdmin({ env, processEnv: process.env });
  const runtime = createAgentRuntime({
    env,
    processEnv: process.env,
    modules: APP_MODULES,
    overrides: { firebase, storage: new InMemoryStore(), adapters: { accessReaders: readers, resolveAccessContext: resolveFromReaders(readers), commandExecutors: [noteExecutor] } },
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
  // The `/v1` side (apps/web): its own core server over the same Firestore, deciding approvals.
  core = createCoreServer({ env: { API_KEY_PREFIX: "core_test" }, firebase, logger: processLogger, adapters: { accessReaders: readers } });
  registerWorkflowApprovals({ approvals: core.approvals, settler: createMastraWorkflowApprovalSettler({ baseUrl, serverlessToken: null }) });
}, 60_000);

afterAll(async () => {
  await closeServer();
  await mastra?.shutdown();
});

const userOf = (uid: string): UserPrincipal => ({ type: "user", uid: UserIdSchema.parse(uid), mfa: false });

// The run route starts asynchronously (202): poll the stored run until it reaches the approval step.
const waitForStatus = async (runId: string, status: string): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if ((await mastra?.getWorkflow("approval-demo").getWorkflowRunById(runId))?.status === status) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`run ${runId} never reached ${status}`);
};

const startDemo = async (title: string) => {
  // Like `/v1/workflows/approval-demo/runs`: the custom run route, which re-authorizes the caller (SP5 Task 4).
  const gateway = createMastraWorkflowGateway({ baseUrl, serverlessToken: null });
  const scope = { bearer: member.idToken, tenantId: TENANT, regional: REGIONAL, requestId: `01J8Z3K4M5N6P7Q8R9S0T1V2${String(notes.length).padStart(2, "0")}` };
  const started = await gateway.startRun(scope, { workflowId: "approval-demo", inputData: { title } });
  if (!started.ok) throw new Error(`start failed: ${JSON.stringify(started.error)}`);
  await waitForStatus(started.data.runId, "suspended");
  const pending = await core.approvals.listApprovalRequests({ actor: userOf(admin.uid), access: core.access.forRequest(), tenantId: TenantIdSchema.parse(TENANT), status: "pending", page: { after: undefined, limit: 50 } });
  if (!pending.ok) throw new Error("list failed");
  const request = pending.data.items.find((item) => (item.action.input as { runId?: string }).runId === started.data.runId);
  if (request === undefined) throw new Error("no approval request for the run");
  expect(request).toMatchObject({ permission: "core.workflow-run.approve-demo", requestedBy: { type: "user", id: member.uid }, action: { kind: "workflow-resume" } });
  return { runId: started.data.runId, approvalRequestId: ApprovalRequestIdSchema.parse(request.id) };
};

const decide = (verb: "approveRequest" | "rejectRequest", uid: string, approvalRequestId: ReturnType<typeof ApprovalRequestIdSchema.parse>) =>
  core.approvals[verb]({ actor: userOf(uid), access: core.access.forRequest(), approvalRequestId, requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3" });

const runResult = async (runId: string) => (await mastra?.getWorkflow("approval-demo").getWorkflowRunById(runId))?.result;

describe("workflow HITL with four eyes (Auth + Firestore emulators, real Mastra server)", () => {
  it("suspends, refuses the requester's own approval, resumes once approved by a second person", async () => {
    const { runId, approvalRequestId } = await startDemo("Supplier follow-up");
    expect(await decide("approveRequest", member.uid, approvalRequestId)).toMatchObject({ ok: false, error: { code: "SELF_APPROVAL_FORBIDDEN" } });
    expect(notes).toEqual([]);
    const approved = await decide("approveRequest", admin.uid, approvalRequestId);
    expect(approved).toMatchObject({ ok: true, data: { status: "executed", decidedBy: admin.uid } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ title: "Supplier follow-up", principal: { type: "user", uid: member.uid } });
    expect(await runResult(runId)).toMatchObject({ outcome: "applied", approvalRequestId, decidedBy: admin.uid });
    // A second approval is refused by SP1 and a replayed settle finds nothing to resume.
    expect(await decide("approveRequest", admin.uid, approvalRequestId)).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    const replay = await fetch(`${baseUrl}/workflow-approvals/${approvalRequestId}/settle`, { method: "POST" });
    expect(await replay.json()).toEqual({ data: { settled: false, reason: "NOT_SUSPENDED" } });
    expect(notes).toHaveLength(1);
  }, 60_000);

  it("a rejection ends the run on record (settled as the trigger does) and applies nothing", async () => {
    const before = notes.length;
    const { runId, approvalRequestId } = await startDemo("Rejected note");
    expect(await decide("rejectRequest", admin.uid, approvalRequestId)).toMatchObject({ ok: true, data: { status: "rejected" } });
    const settled = await createMastraWorkflowApprovalSettler({ baseUrl, serverlessToken: null }).settle({ approvalRequestId, requestId: "evt" });
    expect(settled).toEqual({ ok: true, data: { settled: true, runStatus: "success" } });
    expect(await runResult(runId)).toMatchObject({ outcome: "rejected", decidedBy: admin.uid });
    expect(notes).toHaveLength(before);
  }, 60_000);

  it("a forged resume through the built-in route leaves the run suspended", async () => {
    const { runId } = await startDemo("Forged");
    const headers = { "content-type": "application/json", authorization: `Bearer ${member.idToken}`, "x-tenant-id": TENANT };
    const forged = await fetch(`${baseUrl}/api/workflows/approval-demo/resume?runId=${runId}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ step: "request-human-approval", resumeData: { decision: "approved" } }),
    });
    // The built-in workflow routes are closed but for the knowledge ingestion (route allowlist).
    expect(forged.status).toBe(404);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const state = await mastra?.getWorkflow("approval-demo").getWorkflowRunById(runId);
    expect(state?.status).toBe("suspended");
    expect(notes.map((note) => note.title)).not.toContain("Forged");
  }, 60_000);
});
