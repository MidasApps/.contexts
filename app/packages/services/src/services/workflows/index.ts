// Public API of the workflows context (SP5): workflow HITL on SP1 approval requests (decision 0036).
export type { SettleOutcome, WorkflowApprovalSettler } from "./application/ports/workflow-approval-settler.ts";
export { WorkflowApprovalError, type WorkflowApprovalErrorCode } from "./application/workflow-approval-error.ts";
export { createWorkflowResumeApprovalHandler, WORKFLOW_RESUME_HANDLER_KIND } from "./application/workflow-resume-approval-handler.ts";
export { registerWorkflowApprovals } from "./application/register-workflow-approvals.ts";
export {
  makeSettleOnApprovalUpdate,
  TRIGGER_SETTLED_STATUSES,
  type ApprovalUpdate,
  type SettleOnUpdateOutcome,
} from "./application/settle-on-approval-update.ts";
export {
  createMastraWorkflowApprovalSettler,
  DEFAULT_SETTLE_TIMEOUT_MS,
  type MastraWorkflowApprovalSettlerOptions,
} from "./adapters/driven/mastra-workflow-approval-settler.ts";
