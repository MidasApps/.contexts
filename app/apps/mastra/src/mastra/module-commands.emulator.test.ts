import { randomBytes } from "node:crypto";
import { buildAgentContextEntries, TEST_UID } from "@core/agents/testing";
import { ApprovalRequestIdSchema, UserIdSchema, type UserPrincipal } from "@core/contracts";
import { createExampleCommands } from "@core/module-example/server";
import { createCoreAgentCommandExecutors, createFirebaseAdmin, createInMemoryAccessStore, type FirebaseAdmin, processLogger, registerAgentCommandApprovals } from "@core/services";
import { createCoreServer } from "@core/services/composition";
import { Mastra } from "@mastra/core/mastra";
import { RequestContext } from "@mastra/core/request-context";
import { InMemoryStore } from "@mastra/core/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadMastraEnv } from "../mastra-env.schema.ts";
import { APP_MODULES } from "../modules.ts";
import { createAgentRuntime } from "../runtime/create-agent-runtime.ts";

// Runs inside `firebase emulators:exec` (root `pnpm test:emulators`). SP3 Task 19: the example
// module's commands as agent tools in the production composition (`createAgentRuntime` with
// `APP_MODULES`): the same contract schema, SP1 `authorize()`, audit, idempotency per
// `runId:toolCallId`, and four eyes through SP1 approval requests decided on the `/v1` side.
// Access readers are in memory (roles → the module's default permissions); notes, audit,
// idempotency records and approval requests are real Firestore emulator documents.
const RUN = randomBytes(4).toString("hex");
const TENANT = `EmuModuleCmd${RUN}`.slice(0, 20);
const ADMIN_UID = "admin-uid";
const VIEWER_UID = "viewer-uid";
const CREATE = "command.example.CreateNoteCommand";
const ARCHIVE = "command.example.ArchiveNoteCommand";
const NOTE_PERMISSIONS = ["core.chat.use", "core.project.create", "example.note.read", "example.note.create", "example.note.archive"];

const env = loadMastraEnv({
  APP_ENV: "local",
  AI_MODE: "fake",
  FIREBASE_PROJECT_ID: "demo-core",
  DATABASE_URL: "postgresql://app:app@127.0.0.1:5432/app",
  FIREBASE_AUTH_EMULATOR_HOST: process.env["FIREBASE_AUTH_EMULATOR_HOST"],
  FIRESTORE_EMULATOR_HOST: process.env["FIRESTORE_EMULATOR_HOST"],
});

let firebase: FirebaseAdmin;
let runtime: ReturnType<typeof createAgentRuntime>;
let mastra: Mastra;
let web: ReturnType<typeof createCoreServer>;

beforeAll(() => {
  const readers = createInMemoryAccessStore();
  readers.putOrganization({ id: TENANT });
  for (const [uid, key] of [[TEST_UID, "member"], [ADMIN_UID, "admin"], [VIEWER_UID, "viewer"]] as const) {
    readers.putUser(uid);
    readers.putGrant({ tenantId: TENANT, principalId: uid, nodeId: TENANT, roles: [{ kind: "system", key }] });
  }
  firebase = createFirebaseAdmin({ env, processEnv: process.env });
  runtime = createAgentRuntime({ env, processEnv: process.env, modules: APP_MODULES, overrides: { firebase, storage: new InMemoryStore(), adapters: { accessReaders: readers } } });
  mastra = new Mastra({ workflows: runtime.workflows, storage: runtime.storage });
  // The `/v1` side (apps/web composition): its own core server over the same Firestore, deciding approvals
  // with the same command registry (core commands + the module's).
  const manifests = APP_MODULES.map((module) => module.manifest);
  web = createCoreServer({ env: { API_KEY_PREFIX: "core_test" }, firebase, logger: processLogger, modules: manifests, adapters: { accessReaders: readers } });
  const moduleDeps = { firestore: firebase.firestore, access: web.access, audit: web.audit };
  registerAgentCommandApprovals({
    approvals: web.approvals,
    executors: [...createCoreAgentCommandExecutors({ tenancy: web.tenancy, access: web.access }), ...createExampleCommands(moduleDeps)],
    access: web.access,
    idempotency: web.pipeline.idempotency,
  });
});

afterAll(async () => {
  await mastra.shutdown();
});

// The context as the middleware writes it for `uid` (the fixture names one user; `userId` must match the principal).
const contextOf = (uid: string = TEST_UID) =>
  new RequestContext<unknown>(
    buildAgentContextEntries({ tenantId: TENANT, permissions: NOTE_PERMISSIONS, principal: { type: "user", uid, mfa: false } }).map(([key, value]) => [key, key === "userId" ? uid : value]),
  );

// The bound Mastra tool of the registry, called as the action agent calls it.
const callTool = (toolId: string, input: unknown, toolCallId: string, uid: string = TEST_UID): Promise<unknown> => {
  const tool = runtime.tools.toMastraTools([toolId])[toolId];
  if (tool?.execute === undefined) throw new Error(`tool ${toolId} is not registered`);
  return Promise.resolve(tool.execute(input as never, { requestContext: contextOf(uid), agent: { agentId: "action", toolCallId } } as never));
};

const notesOf = async () => (await firebase.firestore.collection("notes").where("tenantId", "==", TENANT).get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }));
const auditOf = async () => (await firebase.firestore.collection("audit-logs").where("tenantId", "==", TENANT).get()).docs.map((doc) => doc.data());
const userOf = (uid: string): UserPrincipal => ({ type: "user", uid: UserIdSchema.parse(uid), mfa: false });
const decide = (uid: string, approvalId: string) =>
  web.approvals.approveRequest({ actor: userOf(uid), access: web.access.forRequest(), approvalRequestId: ApprovalRequestIdSchema.parse(approvalId), requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3" });

describe("example module commands as agent tools (Firestore emulator, production composition)", () => {
  it("registers the module's command tools, skill and workflow from APP_MODULES", () => {
    expect(runtime.tools.ids()).toEqual(expect.arrayContaining(["command.tenancy.CreateProjectInput", CREATE, ARCHIVE]));
    expect(runtime.tools.get(CREATE)).toMatchObject({ kind: "mutation", permission: "example.note.create", commandId: "example.CreateNoteCommand" });
    expect(Object.keys(runtime.workflows)).toContain("example-note-intake");
    expect(runtime.workflowCatalog.get("example-note-intake")).toMatchObject({ startable: true });
  });

  it("creates a note once per tool call, with the tenant from the server context, and audits it", async () => {
    const first = await callTool(CREATE, { title: "Supplier follow-up", body: "Call Ana on Monday." }, `call-${RUN}-1`);
    const replay = await callTool(CREATE, { title: "Supplier follow-up", body: "Call Ana on Monday." }, `call-${RUN}-1`);
    expect(first).toMatchObject({ title: "Supplier follow-up" });
    expect(replay).toEqual(first);
    const notes = await notesOf();
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ id: (first as { noteId: string }).noteId, tenantId: TENANT, authorId: TEST_UID, title: "Supplier follow-up", body: "Call Ana on Monday." });
    const audit = await auditOf();
    expect(audit.filter((entry) => entry["action"] === "MODULE_RECORD_CREATED")).toHaveLength(1);
    expect(audit.filter((entry) => entry["action"] === "AGENT_TOOL_EXECUTED").length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(audit)).not.toContain("Call Ana");
  }, 60_000);

  it("refuses a caller without example.note.create and an input outside the contract", async () => {
    const before = (await notesOf()).length;
    const denied = await callTool(CREATE, { title: "Viewer note" }, `call-${RUN}-2`, VIEWER_UID).catch((error: unknown) => error);
    expect(JSON.stringify(denied) + String(denied)).toMatch(/FORBIDDEN|not allowed/);
    const invalid = await callTool(CREATE, { title: "x", tenantId: "OtherTenant000000001" }, `call-${RUN}-3`).catch((error: unknown) => error);
    expect(JSON.stringify(invalid) + String(invalid)).toMatch(/TOOL_INPUT_INVALID|validation|schema|Unrecognized/i);
    expect(await notesOf()).toHaveLength(before);
  }, 60_000);

  it("holds a four-eyes command until a different member approves it through SP1", async () => {
    const created = (await callTool(CREATE, { title: "To archive" }, `call-${RUN}-4`)) as { noteId: string };
    const pending = (await callTool(ARCHIVE, { noteId: created.noteId }, `call-${RUN}-5`)) as { status: string; approvalId: string };
    expect(pending).toMatchObject({ status: "pending-approval" });
    const archivedAtOf = async () => (await firebase.firestore.collection("notes").doc(created.noteId).get()).get("archivedAt") as unknown;
    expect(await archivedAtOf()).toBeUndefined();
    expect(await decide(TEST_UID, pending.approvalId)).toMatchObject({ ok: false, error: { code: "SELF_APPROVAL_FORBIDDEN" } });
    expect(await archivedAtOf()).toBeUndefined();
    expect(await decide(ADMIN_UID, pending.approvalId)).toMatchObject({ ok: true, data: { status: "executed", decidedBy: ADMIN_UID } });
    expect(await archivedAtOf()).toBeDefined();
    expect(await decide(ADMIN_UID, pending.approvalId)).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    const updates = (await auditOf()).filter((entry) => entry["action"] === "MODULE_RECORD_UPDATED");
    expect(updates).toHaveLength(1);
    // The command ran as the requester, after the admin's approval.
    expect(updates[0]).toMatchObject({ actor: { type: "user", id: TEST_UID }, target: { type: "example-note", id: created.noteId }, changes: ["archivedAt"] });
  }, 60_000);

  it("runs the module workflow through the same registry, as the caller", async () => {
    const run = await mastra.getWorkflow("example-note-intake").createRun();
    const result = await run.start({ inputData: { title: "From the workflow" }, requestContext: contextOf() });
    expect(result.status === "success" ? result.result : result.status).toMatchObject({ outcome: "created", code: null });
    expect((await notesOf()).map((note) => (note as { title?: string }).title)).toContain("From the workflow");
  }, 60_000);
});
