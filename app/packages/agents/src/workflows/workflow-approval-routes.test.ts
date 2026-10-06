import { describe, expect, it } from "vitest";
import { createFakeWorkflowApprovalPort } from "../testing/fake-ports.ts";
import { handleSettleWorkflowApproval } from "./workflow-approval-routes.ts";

type ResumeCall = { step: unknown; resumeData: unknown; hasContextKeys: boolean };

const fakeMastra = (behavior: { status?: string; error?: Error; unknownWorkflow?: boolean }) => {
  const resumes: ResumeCall[] = [];
  const mastra = {
    getWorkflow: (id: string) => {
      if (behavior.unknownWorkflow === true) throw new Error(`Workflow with ID ${id} not found`);
      return {
        createRun: () =>
          Promise.resolve({
            resume: (params: {
              step: unknown;
              resumeData: unknown;
              requestContext: { size?: number; entries: () => Iterable<unknown> };
            }) => {
              resumes.push({
                step: params.step,
                resumeData: params.resumeData,
                hasContextKeys: [...params.requestContext.entries()].length > 0,
              });
              if (behavior.error !== undefined) return Promise.reject(behavior.error);
              return Promise.resolve({ status: behavior.status ?? "success" });
            },
          }),
      };
    },
  };
  return { mastra: mastra as never, resumes };
};

const logger = { info: () => undefined, error: () => undefined };

const suspendedRequest = () => {
  const approvals = createFakeWorkflowApprovalPort();
  return approvals
    .requestWorkflowApproval({
      principal: { type: "user", uid: "member-uid", mfa: false },
      node: { level: "organization", tenantId: "Jd8sK2lPq0WnR5tYu3bV" },
      permission: "core.workflow-run.approve-demo",
      action: { workflowId: "approval-demo", runId: "run-1", stepId: "request-human-approval" },
      summary: "Create the note",
      requestId: "req",
    })
    .then(({ approvalId }) => ({ approvals, approvalId }));
};

const call = async (args: {
  mastra: never;
  approvals: ReturnType<typeof createFakeWorkflowApprovalPort>;
  id: string;
}) => {
  const response = await handleSettleWorkflowApproval({
    mastra: args.mastra,
    approvalRequestId: args.id,
    requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
    deps: { approvals: args.approvals, logger },
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
};

describe("POST /workflow-approvals/:id/settle", () => {
  it("resumes the named step with the stored decision and an empty request context", async () => {
    const { approvals, approvalId } = await suspendedRequest();
    approvals.settle(approvalId, "rejected", "approver-uid");
    const { mastra, resumes } = fakeMastra({});
    expect(await call({ mastra, approvals, id: approvalId })).toEqual({
      status: 200,
      body: { data: { settled: true, runStatus: "success" } },
    });
    expect(resumes).toEqual([
      {
        step: "request-human-approval",
        resumeData: { decision: "rejected", decidedBy: "approver-uid" },
        hasContextKeys: false,
      },
    ]);
  });

  it("maps executed to approved and skips pending or failed requests", async () => {
    const { approvals, approvalId } = await suspendedRequest();
    const { mastra, resumes } = fakeMastra({});
    expect(await call({ mastra, approvals, id: approvalId })).toEqual({
      status: 200,
      body: { data: { settled: false, reason: "NOT_SETTLED" } },
    });
    approvals.settle(approvalId, "failed");
    expect((await call({ mastra, approvals, id: approvalId })).body).toEqual({
      data: { settled: false, reason: "NOT_SETTLED" },
    });
    approvals.settle(approvalId, "executed", "approver-uid");
    await call({ mastra, approvals, id: approvalId });
    expect(resumes.at(-1)?.resumeData).toEqual({ decision: "approved", decidedBy: "approver-uid" });
  });

  it("answers NOT_SUSPENDED when the run was claimed or already moved on", async () => {
    const { approvals, approvalId } = await suspendedRequest();
    approvals.settle(approvalId, "approved", "approver-uid");
    for (const error of [
      Object.assign(new Error("claimed"), { id: "WORKFLOW_RESUME_ALREADY_CLAIMED" }),
      new Error("This workflow run was not suspended"),
    ]) {
      const { mastra } = fakeMastra({ error });
      expect((await call({ mastra, approvals, id: approvalId })).body).toEqual({
        data: { settled: false, reason: "NOT_SUSPENDED" },
      });
    }
  });

  it("answers 404 for unknown requests, other kinds, unknown workflows and malformed ids", async () => {
    const { approvals, approvalId } = await suspendedRequest();
    approvals.settle(approvalId, "approved");
    const record = approvals.records.get(approvalId);
    if (record === undefined) throw new Error("missing record");
    approvals.records.set("otherKind", { ...record, id: "otherKind", kind: "agent-command" });
    expect((await call({ mastra: fakeMastra({}).mastra, approvals, id: "missing" })).status).toBe(404);
    expect((await call({ mastra: fakeMastra({}).mastra, approvals, id: "otherKind" })).status).toBe(404);
    expect(
      (await call({ mastra: fakeMastra({ unknownWorkflow: true }).mastra, approvals, id: approvalId })).status,
    ).toBe(404);
    expect((await call({ mastra: fakeMastra({}).mastra, approvals, id: "../etc" })).status).toBe(404);
  });

  it("answers 500 without details on infrastructure errors", async () => {
    const { approvals, approvalId } = await suspendedRequest();
    approvals.settle(approvalId, "approved");
    const { mastra } = fakeMastra({ error: new Error("connection refused 10.0.0.3") });
    expect(await call({ mastra, approvals, id: approvalId })).toEqual({
      status: 500,
      body: { error: { code: "INTERNAL_ERROR", message: "Internal error.", requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3" } },
    });
  });
});
