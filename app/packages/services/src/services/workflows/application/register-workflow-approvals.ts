import type { ApprovalServices } from "../../access/approval-composition.ts";
import type { WorkflowApprovalSettler } from "./ports/workflow-approval-settler.ts";
import { createWorkflowResumeApprovalHandler, WORKFLOW_RESUME_HANDLER_KIND } from "./workflow-resume-approval-handler.ts";

/**
 * Registers the `workflow-resume` approval handler on a core server's open registry (decision
 * 0036). `apps/web` (where approvals are decided) and `apps/mastra` (where the requests are
 * created, so SP1 knows the kind) both call it; a second call on one registry keeps the first.
 */
export const registerWorkflowApprovals = (deps: { readonly approvals: Pick<ApprovalServices, "handlers">; readonly settler: WorkflowApprovalSettler }): void => {
  if (deps.approvals.handlers.get(WORKFLOW_RESUME_HANDLER_KIND) !== undefined) return;
  deps.approvals.handlers.register(createWorkflowResumeApprovalHandler({ settler: deps.settler }));
};
