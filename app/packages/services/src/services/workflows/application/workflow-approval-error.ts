export type WorkflowApprovalErrorCode =
  | "REQUESTER_UNAVAILABLE"
  | "WORKFLOW_NOT_SUSPENDED"
  | "APPROVAL_NOT_SETTLED"
  | "WORKFLOW_RUN_NOT_FOUND"
  | "UPSTREAM_UNAVAILABLE";

/**
 * Why a settled approval did not reach its workflow run (decision 0036). SP1 audits `code` as the
 * `errorCode` of `APPROVAL_FAILED`; the Functions trigger rethrows it so the event is retried.
 */
export class WorkflowApprovalError extends Error {
  readonly code: WorkflowApprovalErrorCode;
  readonly approvalRequestId: string;

  constructor(code: WorkflowApprovalErrorCode, approvalRequestId: string, options?: ErrorOptions) {
    super(`${code}: ${approvalRequestId}`, options);
    this.name = "WorkflowApprovalError";
    this.code = code;
    this.approvalRequestId = approvalRequestId;
  }
}
