// Public API of the approval-request entity (SP5 Tasks 3 and 14): data access, inbox state and preview.
export {
  APPROVAL_HISTORY_PAGE_SIZE,
  approvalHistoryQuery,
  approvalRequestKeys,
  approvalRequestQuery,
  approvalRequestsQuery,
  APPROVALS_MAX_PAGES,
} from "./api/approval-request-queries.ts";
export {
  type ApprovalChangeSource,
  APPROVALS_POLL_MS,
  useApprovalHistory,
  useApprovalRequest,
  useApprovalRequests,
  type UseApprovalRequestsArgs,
  type UseApprovalRequestsResult,
  waitingForDecision,
} from "./model/use-approval-requests.ts";
export {
  AGENT_COMMAND_KIND,
  type ApprovalPreview,
  approvalPreviewOf,
  approvalRequestRoute,
  WORKFLOW_RESUME_KIND,
  workflowRunRoute,
} from "./lib/approval-preview.ts";
export { ApprovalRequestItem, type ApprovalRequestItemProps, ApprovalStatusPill } from "./ui/approval-request-item.tsx";
