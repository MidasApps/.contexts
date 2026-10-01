import { Mastra } from "@mastra/core/mastra";
import { RequestContext } from "@mastra/core/request-context";
import { PostgresStore } from "@mastra/pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildAgentContextEntries, TEST_TENANT, TEST_UID } from "../testing/agent-context-fixture.ts";
import { createFakeAccessPort, createFakeWorkflowApprovalPort, createFakeWorkflowCommandPort } from "../testing/fake-ports.ts";
import { APPROVAL_DEMO_COMMAND_ID, APPROVAL_DEMO_PERMISSION, APPROVAL_DEMO_WORKFLOW_ID, type ApprovalDemoResult, createApprovalDemoWorkflow } from "./approval-demo.workflow.ts";
import { settleWorkflowApproval } from "./settle-workflow-approval.ts";
import { REQUEST_HUMAN_APPROVAL_STEP_ID } from "./steps/request-human-approval.step.ts";

// Mastra on the local Postgres (schema `mastra`, created by `pnpm -F @core/mastra db:init`):
// PostgresStore supports the atomic resume claim that de-duplicates concurrent resumes.
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://app:app@127.0.0.1:5432/app";
const MEMBER = ["core.chat.use", "core.workflow-run.start", APPROVAL_DEMO_PERMISSION];
const INTRUDER_UID = "intruder-uid";

const storage = new PostgresStore({ id: "approval-demo-store", connectionString: DATABASE_URL, schemaName: "mastra" });
const approvals = createFakeWorkflowApprovalPort();
let commands = createFakeWorkflowCommandPort();
const access = createFakeAccessPort({
  memberships: [
    { tenantId: TEST_TENANT, uid: TEST_UID, permissions: MEMBER },
    { tenantId: TEST_TENANT, uid: INTRUDER_UID, permissions: MEMBER },
  ],
  approvalPermissions: [APPROVAL_DEMO_PERMISSION],
});
const workflow = createApprovalDemoWorkflow({ approvals, access, commands: { run: (input) => commands.run(input) } });
let mastra: Mastra;

const contextOf = (uid = TEST_UID) =>
  new RequestContext<unknown>(buildAgentContextEntries({ permissions: MEMBER, principal: { type: "user", uid, mfa: false } }).map(([key, value]) => [key, key === "userId" ? uid : value]));

const startSuspended = async () => {
  const run = await mastra.getWorkflow(APPROVAL_DEMO_WORKFLOW_ID).createRun();
  const started = await run.start({ inputData: { title: "Supplier follow-up", body: "Call about the invoice." }, requestContext: contextOf() });
  expect(started.status).toBe("suspended");
  const request = approvals.requests.at(-1);
  if (request === undefined) throw new Error("no approval request");
  expect(request.action).toEqual({ workflowId: APPROVAL_DEMO_WORKFLOW_ID, runId: run.runId, stepId: REQUEST_HUMAN_APPROVAL_STEP_ID });
  const approvalRequestId = [...approvals.records.keys()].at(-1) ?? "";
  return { run, approvalRequestId };
};

const settle = (approvalRequestId: string) => settleWorkflowApproval({ mastra, approvals, approvalRequestId });

const outcomeOf = async (runId: string): Promise<ApprovalDemoResult | undefined> => {
  const state = await mastra.getWorkflow(APPROVAL_DEMO_WORKFLOW_ID).getWorkflowRunById(runId);
  return state?.result as ApprovalDemoResult | undefined;
};

beforeAll(async () => {
  mastra = new Mastra({ workflows: { [workflow.id]: workflow }, storage, logger: false });
  await storage.init();
});

beforeEach(() => {
  commands = createFakeWorkflowCommandPort();
});

afterAll(async () => {
  await storage.close?.();
});

describe("approval-demo workflow on SP1 approval requests (Postgres)", () => {
  it("suspends after creating a workflow-resume approval request as the requester", async () => {
    const { approvalRequestId } = await startSuspended();
    const request = approvals.requests.at(-1);
    expect(request).toMatchObject({ permission: APPROVAL_DEMO_PERMISSION, node: { level: "organization", tenantId: TEST_TENANT }, principal: { uid: TEST_UID } });
    expect(request?.summary).toContain("Supplier follow-up");
    expect(await settle(approvalRequestId)).toEqual({ ok: true, data: { settled: false, reason: "NOT_SETTLED" } });
    expect(commands.runs).toEqual([]);
  });

  it("approve resumes once, as the requester, even with two concurrent settles", async () => {
    // Mastra de-duplicates concurrent resumes only on stores with atomic updates.
    expect((await storage.getStore("workflows"))?.supportsConcurrentUpdates()).toBe(true);
    const { run, approvalRequestId } = await startSuspended();
    approvals.settle(approvalRequestId, "approved", "approver-uid");
    const results = await Promise.all([settle(approvalRequestId), settle(approvalRequestId)]);
    const settled = results.filter((result) => result.ok && result.data.settled);
    expect(settled).toHaveLength(1);
    expect(results.filter((result) => result.ok && !result.data.settled)).toEqual([{ ok: true, data: { settled: false, reason: "NOT_SUSPENDED" } }]);
    expect(commands.runs).toHaveLength(1);
    expect(commands.runs[0]).toMatchObject({
      commandId: APPROVAL_DEMO_COMMAND_ID,
      idempotencyKey: run.runId,
      tenantId: TEST_TENANT,
      principal: { type: "user", uid: TEST_UID },
      input: { title: "Supplier follow-up", body: "Call about the invoice." },
    });
    expect(await outcomeOf(run.runId)).toMatchObject({ outcome: "applied", approvalRequestId, decidedBy: "approver-uid", code: null });
    expect(await settle(approvalRequestId)).toEqual({ ok: true, data: { settled: false, reason: "NOT_SUSPENDED" } });
  });

  it("reject ends on record and applies nothing", async () => {
    const { run, approvalRequestId } = await startSuspended();
    approvals.settle(approvalRequestId, "rejected", "approver-uid");
    expect(await settle(approvalRequestId)).toMatchObject({ ok: true, data: { settled: true, runStatus: "success" } });
    expect(await outcomeOf(run.runId)).toMatchObject({ outcome: "rejected", decidedBy: "approver-uid" });
    expect(commands.runs).toEqual([]);
  });

  it("expired ends on record", async () => {
    const { run, approvalRequestId } = await startSuspended();
    approvals.settle(approvalRequestId, "expired");
    expect(await settle(approvalRequestId)).toMatchObject({ ok: true, data: { settled: true } });
    expect(await outcomeOf(run.runId)).toMatchObject({ outcome: "expired", decidedBy: null });
    expect(commands.runs).toEqual([]);
  });

  it("a forged resume never releases the action: the step re-reads SP1 and suspends again", async () => {
    const { run, approvalRequestId } = await startSuspended();
    const forged = await run.resume({ step: REQUEST_HUMAN_APPROVAL_STEP_ID, resumeData: { decision: "approved" }, requestContext: new RequestContext() });
    expect(forged.status).toBe("suspended");
    expect(commands.runs).toEqual([]);
    approvals.settle(approvalRequestId, "approved", "approver-uid");
    expect(await settle(approvalRequestId)).toMatchObject({ ok: true, data: { settled: true, runStatus: "success" } });
    expect(commands.runs).toHaveLength(1);
  });

  it("a resume under another caller's context does not run the command as that caller", async () => {
    const { run, approvalRequestId } = await startSuspended();
    approvals.settle(approvalRequestId, "approved", "approver-uid");
    const hijacked = await run.resume({ step: REQUEST_HUMAN_APPROVAL_STEP_ID, resumeData: { decision: "approved" }, requestContext: contextOf(INTRUDER_UID) });
    expect(hijacked.status).toBe("success");
    expect(await outcomeOf(run.runId)).toMatchObject({ outcome: "failed", code: "REQUESTER_MISMATCH" });
    expect(commands.runs).toEqual([]);
  });

  it("reports a refused command as a failed outcome", async () => {
    commands = createFakeWorkflowCommandPort({ refuse: { [APPROVAL_DEMO_COMMAND_ID]: "UNKNOWN_COMMAND" } });
    const { run, approvalRequestId } = await startSuspended();
    approvals.settle(approvalRequestId, "approved", "approver-uid");
    await settle(approvalRequestId);
    expect(await outcomeOf(run.runId)).toMatchObject({ outcome: "failed", code: "UNKNOWN_COMMAND" });
  });

  it("answers NOT_FOUND for an unknown request", async () => {
    expect(await settle("missing")).toEqual({ ok: false, error: { code: "NOT_FOUND" } });
  });
});
