import { type ApprovalRequest, ApprovalRequestSchema, type UserPrincipal } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { createApprovalHandlerRegistry } from "../../access/application/approval-handler-registry.ts";
import type { WorkflowApprovalSettler } from "./ports/workflow-approval-settler.ts";
import { registerWorkflowApprovals } from "./register-workflow-approvals.ts";
import {
  createWorkflowResumeApprovalHandler,
  WORKFLOW_RESUME_HANDLER_KIND,
} from "./workflow-resume-approval-handler.ts";

const ACTION = { workflowId: "approval-demo", runId: "run-1", stepId: "request-human-approval" };

const approvedRequest = (): ApprovalRequest =>
  ApprovalRequestSchema.parse({
    id: "Ar9oP1lK3jH5gF7dS9aQ",
    tenantId: "Jd8sK2lPq0WnR5tYu3bV",
    node: { level: "organization", tenantId: "Jd8sK2lPq0WnR5tYu3bV" },
    permission: "core.workflow-run.approve-demo",
    requestedBy: { type: "user", id: "member-uid" },
    action: { kind: "workflow-resume", input: ACTION, summary: "Create the note" },
    status: "approved",
    decidedBy: "admin-uid",
    reason: null,
    expiresAt: "2026-10-07T12:00:00.000Z",
    createdAt: "2026-09-30T12:00:00.000Z",
    updatedAt: "2026-09-30T12:01:00.000Z",
  });

const approver = { type: "user", uid: "admin-uid", mfa: false } as UserPrincipal;
const requester = { type: "user" as const, uid: "member-uid", mfa: false } as UserPrincipal;

const recordingSettler = (answer: Awaited<ReturnType<WorkflowApprovalSettler["settle"]>>) => {
  const calls: Parameters<WorkflowApprovalSettler["settle"]>[0][] = [];
  const settler: WorkflowApprovalSettler = {
    settle: (input) => {
      calls.push(input);
      return Promise.resolve(answer);
    },
  };
  return { settler, calls };
};

const run = (settler: WorkflowApprovalSettler, context: { requester?: typeof requester | null } = {}) =>
  createWorkflowResumeApprovalHandler({ settler }).execute(ACTION, {
    request: approvedRequest(),
    requester: context.requester === undefined ? requester : context.requester,
    approver,
    requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
  });

describe("workflow-resume approval handler (decision 0036)", () => {
  it("settles the approved request through Mastra, correlated by request id", async () => {
    const { settler, calls } = recordingSettler({ ok: true, data: { settled: true, runStatus: "success" } });
    await run(settler);
    expect(calls).toEqual([{ approvalRequestId: "Ar9oP1lK3jH5gF7dS9aQ", requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3" }]);
  });

  it("validates the action input with the contract", () => {
    const handler = createWorkflowResumeApprovalHandler({
      settler: recordingSettler({ ok: true, data: { settled: true, runStatus: "success" } }).settler,
    });
    expect(handler.kind).toBe(WORKFLOW_RESUME_HANDLER_KIND);
    expect(handler.inputSchema.safeParse(ACTION).success).toBe(true);
    expect(handler.inputSchema.safeParse({ ...ACTION, extra: 1 }).success).toBe(false);
  });

  it.each([
    [{ ok: true, data: { settled: false, reason: "NOT_SUSPENDED" } }, "WORKFLOW_NOT_SUSPENDED"],
    [{ ok: true, data: { settled: false, reason: "NOT_SETTLED" } }, "APPROVAL_NOT_SETTLED"],
    [{ ok: false, error: { code: "NOT_FOUND", status: 404 } }, "WORKFLOW_RUN_NOT_FOUND"],
    [{ ok: false, error: { code: "UPSTREAM_UNAVAILABLE", status: 502 } }, "UPSTREAM_UNAVAILABLE"],
  ] as const)(
    "fails the approval with a SCREAMING_SNAKE code when the run is not resumed (%j)",
    async (answer, code) => {
      await expect(run(recordingSettler(answer).settler)).rejects.toMatchObject({ code });
    },
  );

  it("refuses when the requester no longer resolves, without calling Mastra", async () => {
    const { settler, calls } = recordingSettler({ ok: true, data: { settled: true, runStatus: "success" } });
    await expect(run(settler, { requester: null })).rejects.toMatchObject({ code: "REQUESTER_UNAVAILABLE" });
    expect(calls).toEqual([]);
  });

  it("registers once per registry", () => {
    const registry = createApprovalHandlerRegistry([]);
    const { settler } = recordingSettler({ ok: true, data: { settled: true, runStatus: "success" } });
    registerWorkflowApprovals({ approvals: { handlers: registry }, settler });
    registerWorkflowApprovals({ approvals: { handlers: registry }, settler });
    expect(registry.get(WORKFLOW_RESUME_HANDLER_KIND)).toBeDefined();
  });
});
