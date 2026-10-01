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
// Workflow runs and progress stream (SP5 Task 4, decision 0040).
export type {
  FieldIssue as WorkflowFieldIssue,
  ListRunsQuery,
  PageMeta as WorkflowPageMeta,
  ScheduleAction,
  ScheduleWriteInput,
  WorkflowGatewayError,
  WorkflowGatewayResult,
  WorkflowRuntimeGateway,
} from "./application/ports/workflow-runtime-gateway.ts";
export { createMastraWorkflowGateway, DEFAULT_WORKFLOW_GATEWAY_TIMEOUT_MS, type MastraWorkflowGatewayOptions } from "./adapters/driven/mastra-workflow-gateway.ts";
export { encodeDone, encodeError, encodeWorkflowEvent, resumeIndexOf, SSE_HEADERS } from "./adapters/driven/workflow-event-sse.ts";
export { buildWorkflowRunsRoutes, WORKFLOW_RUN_PERMISSIONS, type WorkflowRunsRouteDeps } from "./adapters/driving/workflow-runs-route-handler.ts";
export { buildWorkflowRunStreamRoutes, STREAM_TIMING, type WorkflowRunStreamDeps } from "./adapters/driving/workflow-run-stream-route-handler.ts";
// Tenant schedules (SP5 Task 5, decision 0037).
export { buildSchedulesRoutes, SCHEDULE_PERMISSIONS, type SchedulesRouteDeps } from "./adapters/driving/schedules-route-handler.ts";
