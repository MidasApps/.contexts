// Public API of the workflow-run entity (SP5 Task 13): workflow runs as platform staff list them.
export {
  ADMIN_RUNS_PAGE_LIMIT,
  adminWorkflowRunsQuery,
  isRunCancelable,
  useAdminWorkflowRuns,
  workflowRunKeys,
  type AdminRunFilters,
} from "./api/workflow-run-queries.ts";
export { RunStatusPill } from "./ui/RunStatusPill.tsx";
