import {
  WORKFLOW_RESUME_ACTION_KIND,
  type WorkflowResumeActionInput,
  WorkflowResumeActionInputSchema,
} from "@core/contracts";
import type { ApprovalActionHandler } from "../../access/application/ports/driven/approval-action-handler.ts";
import type { WorkflowApprovalSettler } from "./ports/workflow-approval-settler.ts";
import { WorkflowApprovalError } from "./workflow-approval-error.ts";

export const WORKFLOW_RESUME_HANDLER_KIND = WORKFLOW_RESUME_ACTION_KIND;

/**
 * SP1 `ApprovalActionHandler` of kind `workflow-resume` (decision 0036). It runs once, when a
 * second person approves: it asks the agent runtime to settle the request, which resumes the
 * suspended run as the requester after the step re-checks the stored decision. It lives in
 * `@core/services` because approvals are decided in `/v1` (decision 0025's amendment). Every
 * refusal throws a SCREAMING_SNAKE `code`, which SP1 audits on `APPROVAL_FAILED`.
 */
export const createWorkflowResumeApprovalHandler = (deps: {
  readonly settler: WorkflowApprovalSettler;
}): ApprovalActionHandler<WorkflowResumeActionInput> => ({
  kind: WORKFLOW_RESUME_HANDLER_KIND,
  inputSchema: WorkflowResumeActionInputSchema,
  execute: async (_action, context) => {
    const approvalRequestId = context.request.id;
    // The run continues as the requester; one that no longer resolves must not act.
    if (context.requester === null) throw new WorkflowApprovalError("REQUESTER_UNAVAILABLE", approvalRequestId);
    const result = await deps.settler.settle({ approvalRequestId, requestId: context.requestId });
    if (!result.ok)
      throw new WorkflowApprovalError(
        result.error.code === "NOT_FOUND" ? "WORKFLOW_RUN_NOT_FOUND" : "UPSTREAM_UNAVAILABLE",
        approvalRequestId,
      );
    if (result.data.settled) return;
    throw new WorkflowApprovalError(
      result.data.reason === "NOT_SUSPENDED" ? "WORKFLOW_NOT_SUSPENDED" : "APPROVAL_NOT_SETTLED",
      approvalRequestId,
    );
  },
});
