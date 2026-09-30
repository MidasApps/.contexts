import { type AgentApprovalRequest, OrganizationIdSchema, type PermissionDefinition, type Principal } from "@core/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { AUDIT_LOG_COLLECTIONS } from "../../../audit/adapters/driven/firestore-audit-log-writer.ts";
import { createFirestoreIdempotencyStore, IDEMPOTENCY_RECORDS_COLLECTION } from "../../../shared/idempotency/firestore-idempotency-store.ts";
import { buildEmulatorServer, clearCoreCollections, emulatorFirebase, ensureAuthUser, seedActiveUser } from "../../../shared/testing/core-server-emulator.fixture.ts";
import { defineAgentCommandExecutor } from "./agent-command-executor.ts";
import { registerAgentCommandApprovals } from "./register-agent-command-approvals.ts";

// A module command that needs a second person: members may ask for it, admins approve it.
const ARCHIVE_NOTE: PermissionDefinition = {
  id: "sample.note.archive",
  descriptionKey: "permissions.sample.note.archive",
  kind: "write",
  scope: "tenant",
  requiresApproval: true,
  defaultRoles: ["member"],
};

const firebase = emulatorFirebase();
const { firestore, auth } = firebase;
const harness = buildEmulatorServer({ firebase, uids: ["agc-owner", "agc-admin", "agc-member"], modules: [{ id: "sample", permissions: [ARCHIVE_NOTE] }] });
const executed: { principal: Principal; input: unknown }[] = [];
const commands = registerAgentCommandApprovals({
  approvals: harness.server.approvals,
  executors: [
    defineAgentCommandExecutor({
      commandId: "sample.ArchiveNoteCommand",
      permission: "sample.note.archive",
      inputSchema: z.strictObject({ noteId: z.string().min(1) }),
      execute: ({ principal, input }) => Promise.resolve(void executed.push({ principal, input })),
    }),
  ],
  access: harness.server.access,
  idempotency: createFirestoreIdempotencyStore({ firestore }),
});
let tenantId = OrganizationIdSchema.parse("unset");

const MEMBER: Principal = { type: "user", uid: "agc-member", mfa: false } as Principal;

const actionFor = (runId: string): AgentApprovalRequest =>
  ({
    kind: "agent-command",
    tenantId,
    requestedBy: "agc-member",
    agentId: "action",
    toolId: "command.sample.ArchiveNoteCommand",
    commandId: "sample.ArchiveNoteCommand",
    permission: "sample.note.archive",
    input: { noteId: "Xk2mQ9vLr3TnB7pWc1aZ" },
    runId,
    toolCallId: "call-1",
    idempotencyKey: `${runId}:call-1`,
    summary: "Archive the note",
    preview: null,
  }) as unknown as AgentApprovalRequest;

const grant = async (uid: string, key: "admin" | "member") => {
  await seedActiveUser(firestore, uid);
  const response = await harness.call("access.grantMembership", {
    method: "POST",
    path: `/v1/organizations/${tenantId}/memberships`,
    as: "agc-owner",
    body: { userId: uid, node: { level: "organization", tenantId }, roles: [{ kind: "system", key }] },
  });
  expect(response.status).toBe(201);
};

beforeEach(async () => {
  executed.length = 0;
  await clearCoreCollections(firestore);
  await ensureAuthUser(auth, "agc-owner");
  const created = await harness.call("tenancy.createOrganization", {
    method: "POST",
    path: "/v1/organizations",
    as: "agc-owner",
    body: { name: "Agent Commands Inc", defaults: { locale: "pt-BR", timeZone: "America/Sao_Paulo", currency: "BRL" } },
  });
  tenantId = OrganizationIdSchema.parse(((await created.json()) as { data: { id: string } }).data.id);
  await grant("agc-admin", "admin");
  await grant("agc-member", "member");
}, 30_000);

describe("agent-command approvals (emulator)", () => {
  it("runs an agent command once after a second member approves, as the requester", { timeout: 60_000 }, async () => {
    const action = actionFor("run-approved");
    const requested = await harness.server.approvals.requestApproval({
      principal: MEMBER,
      input: { node: { level: "organization", tenantId }, permission: "sample.note.archive", action: { kind: "agent-command", input: action, summary: action.summary } },
      requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
    });
    if (!requested.ok) throw new Error(`request refused: ${requested.error.code}`);
    expect(executed).toEqual([]);

    const approved = await harness.call("access.approveApprovalRequest", { method: "POST", path: `/v1/approval-requests/${requested.data.id}/approve`, as: "agc-admin", body: {} });
    expect(approved.status).toBe(200);
    expect(((await approved.json()) as { data: { status: string } }).data.status).toBe("executed");
    expect(executed).toEqual([{ principal: MEMBER, input: { noteId: "Xk2mQ9vLr3TnB7pWc1aZ" } }]);

    // The stored result makes the same run:call key a replay, never a second execution.
    const replay = await commands.runOnce({ tenantId, commandId: "sample.ArchiveNoteCommand", idempotencyKey: action.idempotencyKey, input: action.input, run: () => Promise.reject(new Error("must not run")) });
    expect(replay.replayed).toBe(true);
    expect((await firestore.collection(IDEMPOTENCY_RECORDS_COLLECTION).get()).docs.some((doc) => doc.get("state") === "done")).toBe(true);
    const actions = (await firestore.collection(AUDIT_LOG_COLLECTIONS.tenant).where("target.id", "==", requested.data.id).get()).docs.map((doc) => doc.get("action") as string);
    expect(actions.sort()).toEqual(["APPROVAL_APPROVED", "APPROVAL_EXECUTED", "APPROVAL_REQUESTED"]);
  });

  it("records APPROVAL_FAILED with the handler code when the stored action names another requester", { timeout: 60_000 }, async () => {
    const action = { ...actionFor("run-forged"), requestedBy: "agc-admin" } as AgentApprovalRequest;
    const requested = await harness.server.approvals.requestApproval({
      principal: MEMBER,
      input: { node: { level: "organization", tenantId }, permission: "sample.note.archive", action: { kind: "agent-command", input: action, summary: action.summary } },
      requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
    });
    if (!requested.ok) throw new Error(`request refused: ${requested.error.code}`);
    const approved = await harness.call("access.approveApprovalRequest", { method: "POST", path: `/v1/approval-requests/${requested.data.id}/approve`, as: "agc-owner", body: {} });
    expect(((await approved.json()) as { data: { status: string } }).data.status).toBe("failed");
    expect(executed).toEqual([]);
    const failed = (await firestore.collection(AUDIT_LOG_COLLECTIONS.tenant).where("action", "==", "APPROVAL_FAILED").get()).docs.map((doc) => doc.get("metadata.errorCode") as string);
    expect(failed).toEqual(["REQUESTER_MISMATCH"]);
  });
});
