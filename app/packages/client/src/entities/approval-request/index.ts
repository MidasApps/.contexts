// Public API of the approval-request entity (SP5 Task 3): data access, inbox state and preview.
export {
  type ApiTransport,
  type ApprovalApiError,
  type ApprovalApiResult,
  approvalErrorOf,
  type ApprovalPage,
  type ApprovalRequestsApi,
  createApprovalRequestsApi,
} from "./api/approval-requests-api.ts";
export {
  type ApprovalChangeSource,
  approvalRequestsQueryKey,
  APPROVALS_POLL_MS,
  useApprovalRequests,
  type UseApprovalRequestsArgs,
  type UseApprovalRequestsResult,
} from "./model/use-approval-requests.ts";
export { AGENT_COMMAND_KIND, type ApprovalPreview, approvalPreviewOf, WORKFLOW_RESUME_KIND, workflowRunHref } from "./lib/approval-preview.ts";
export { ApprovalRequestItem, type ApprovalRequestItemProps } from "./ui/approval-request-item.tsx";
