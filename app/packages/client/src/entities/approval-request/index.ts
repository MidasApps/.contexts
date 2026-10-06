// Public API of the approval-request entity (SP5 Tasks 3 and 14): data access, inbox state and preview.
export {
  APPROVAL_HISTORY_PAGE_SIZE,
  APPROVALS_MAX_PAGES,
  approvalHistoryQuery,
  approvalRequestKeys,
  approvalRequestQuery,
  approvalRequestsQuery,
} from "./api/approval-request-queries.ts";
export {
  AGENT_COMMAND_KIND,
  type ApprovalPreview,
  approvalPreviewOf,
  approvalRequestRoute,
  WORKFLOW_RESUME_KIND,
  workflowRunRoute,
} from "./lib/approval-preview.ts";
export {
  APPROVALS_POLL_MS,
  type ApprovalChangeSource,
  type UseApprovalRequestsArgs,
  type UseApprovalRequestsResult,
  useApprovalHistory,
  useApprovalRequest,
  useApprovalRequests,
  waitingForDecision,
} from "./model/use-approval-requests.ts";
export { ApprovalRequestItem, type ApprovalRequestItemProps, ApprovalStatusPill } from "./ui/approval-request-item.tsx";
