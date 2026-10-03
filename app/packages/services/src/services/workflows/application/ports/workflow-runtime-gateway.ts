import type { AgentCatalogEntry, CustomAgentRuntimeOptions, Schedule, SchedulePreview, SchedulePreviewInput, WorkflowCatalogEntry, WorkflowEvent, WorkflowRun, WorkflowRunStatus } from "@core/contracts";
import type { AgentCallScope } from "../../../agents/application/ports/agent-runtime-gateway.ts";

/**
 * Driven port of `/v1` to the SP5 custom Mastra routes of workflow runs and tenant schedules
 * and of the tenant catalogs (`/workflow-runs/*`, `/tenant-schedules/*`, `/tenant-catalog/*`; decisions 0037 and 0040). The runtime reads the
 * tenant and the caller from the verified Bearer and authorizes again; these routes are ours, so
 * their envelope codes (an allowlist) pass through, unlike Mastra's built-in error bodies.
 */

export type FieldIssue = { readonly field: string; readonly issue: string };

export type WorkflowGatewayError = {
  /** `api.md` §6 code: the gateway codes plus `WORKFLOW_NOT_STARTABLE`, `WORKFLOW_NOT_SCHEDULABLE`, `SCHEDULE_INTERVAL_TOO_SHORT`. */
  readonly code: string;
  readonly status: number;
  readonly details?: readonly FieldIssue[];
};

export type WorkflowGatewayResult<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: WorkflowGatewayError };

export type PageMeta = { readonly cursor: string | null; readonly hasMore: boolean; readonly limit: number };

export type ListRunsQuery = {
  readonly workflowId?: string;
  readonly status?: WorkflowRunStatus;
  readonly cursor?: string;
  readonly limit: number;
};

export type ScheduleWriteInput = {
  readonly workflowId?: string | undefined;
  readonly slug?: string | undefined;
  readonly cron?: string | undefined;
  readonly timezone?: string | undefined;
  readonly inputData?: Readonly<Record<string, unknown>> | undefined;
};

export type ScheduleAction = "pause" | "resume" | "run";

export type WorkflowRuntimeGateway = {
  readonly listRuns: (scope: AgentCallScope, query: ListRunsQuery) => Promise<WorkflowGatewayResult<{ readonly runs: WorkflowRun[]; readonly page: PageMeta }>>;
  readonly getRun: (scope: AgentCallScope, runId: string) => Promise<WorkflowGatewayResult<WorkflowRun>>;
  readonly getRunEvents: (scope: AgentCallScope, runId: string) => Promise<WorkflowGatewayResult<{ readonly run: WorkflowRun; readonly events: WorkflowEvent[] }>>;
  readonly cancelRun: (scope: AgentCallScope, runId: string) => Promise<WorkflowGatewayResult<null>>;
  readonly startRun: (scope: AgentCallScope, input: { readonly workflowId: string; readonly inputData: Readonly<Record<string, unknown>> }) => Promise<WorkflowGatewayResult<{ readonly runId: string }>>;
  readonly listSchedules: (scope: AgentCallScope) => Promise<WorkflowGatewayResult<Schedule[]>>;
  readonly getSchedule: (scope: AgentCallScope, scheduleId: string) => Promise<WorkflowGatewayResult<Schedule>>;
  readonly createSchedule: (scope: AgentCallScope, input: ScheduleWriteInput) => Promise<WorkflowGatewayResult<Schedule>>;
  readonly updateSchedule: (scope: AgentCallScope, scheduleId: string, input: ScheduleWriteInput) => Promise<WorkflowGatewayResult<Schedule>>;
  readonly actOnSchedule: (scope: AgentCallScope, scheduleId: string, action: ScheduleAction) => Promise<WorkflowGatewayResult<Schedule | { readonly scheduleId: string }>>;
  readonly deleteSchedule: (scope: AgentCallScope, scheduleId: string) => Promise<WorkflowGatewayResult<null>>;
  /** The next fires of an unsaved cron, from the scheduler's own engine (`/tenant-schedules/preview`, decision 0061). */
  readonly previewSchedule: (scope: AgentCallScope, input: SchedulePreviewInput) => Promise<WorkflowGatewayResult<SchedulePreview>>;
  /** The subagents of the caller's tenant with their tools and skills (`/tenant-catalog/agents`, SP5 Task 14). */
  readonly listAgentCatalog: (scope: AgentCallScope) => Promise<WorkflowGatewayResult<AgentCatalogEntry[]>>;
  /** The workflows the tenant may start or schedule (`/tenant-catalog/workflows`, SP5 Task 14). */
  readonly listWorkflowCatalog: (scope: AgentCallScope) => Promise<WorkflowGatewayResult<WorkflowCatalogEntry[]>>;
  /** The models, tools and platform skills a custom agent may select (`/tenant-catalog/agent-options`, decision 0046). */
  readonly getCustomAgentOptions: (scope: AgentCallScope) => Promise<WorkflowGatewayResult<CustomAgentRuntimeOptions>>;
  /** Drops the runtime's cached custom agents of the caller's tenant (`/tenant-catalog/custom-agents/invalidate`). */
  readonly invalidateCustomAgents: (scope: AgentCallScope) => Promise<WorkflowGatewayResult<null>>;
};
