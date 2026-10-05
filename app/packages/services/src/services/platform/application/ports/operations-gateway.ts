import type {
  AdminAgent,
  AdminSchedule,
  AdminWorkflowRun,
  ModelSettings,
  PageMeta,
  PromptSeed,
  UpdateModelSettingsInput,
  WorkflowRunStatus,
} from "@core/contracts";
import type { Result } from "#/services/shared/result/result.ts";

/** A runtime call refused or failed upstream: the status and code `/v1` answers with. */
export type OperationsError = {
  readonly code: "NOT_FOUND" | "VALIDATION_FAILED" | "UPSTREAM_UNAVAILABLE";
  readonly status: 400 | 404 | 502;
};

export type OperationsResult<T> = Result<T, OperationsError>;

export type AdminRunsQuery = {
  /** `null` = every tenant and the platform runs. */
  readonly tenantId: string | null;
  readonly workflowId?: string | undefined;
  readonly status?: WorkflowRunStatus | undefined;
  readonly cursor?: string | undefined;
  readonly limit: number;
};

export type ScheduleAction = "pause" | "resume" | "run";

/**
 * Staff operations over the runtime's workflow storage and schedules (decision 0043): the
 * `/console/workflow-runs` and `/console/schedules` routes, which carry no user credential.
 * `/v1/admin` requires staff first; cancel and schedule actions return the affected row, so the
 * handler can audit with its tenant.
 */
export type OperationsGateway = {
  readonly listRuns: (
    query: AdminRunsQuery,
  ) => Promise<OperationsResult<{ readonly runs: AdminWorkflowRun[]; readonly page: PageMeta }>>;
  /** Cancels the run and returns it as it was read before the cancel. */
  readonly cancelRun: (input: {
    readonly runId: string;
    readonly requestId: string;
  }) => Promise<OperationsResult<AdminWorkflowRun>>;
  readonly listSchedules: (query: { readonly tenantId: string | null }) => Promise<OperationsResult<AdminSchedule[]>>;
  /** Pauses, resumes or fires the schedule and returns its row after the action. */
  readonly actOnSchedule: (input: {
    readonly scheduleId: string;
    readonly action: ScheduleAction;
    readonly requestId: string;
  }) => Promise<OperationsResult<AdminSchedule>>;
  /** The agents the runtime registered (`/console/agents`, decision 0044): registry data, no tenant data. */
  readonly listAgents: (input: { readonly requestId: string }) => Promise<OperationsResult<AdminAgent[]>>;
  /** The code seed of an agent's versioned prompt (`/console/agents/:agentId/prompt-seed`, follow-up 86). */
  readonly getPromptSeed: (input: {
    readonly agentId: string;
    readonly requestId: string;
  }) => Promise<OperationsResult<PromptSeed>>;
  /** The model of each runtime role and the model prices (`/console/models`, decision 0072). */
  readonly getModelSettings: (input: { readonly requestId: string }) => Promise<OperationsResult<ModelSettings>>;
  /** Saves the settings in the runtime, which validates them; `VALIDATION_FAILED` when it refuses. */
  readonly updateModelSettings: (input: {
    readonly settings: UpdateModelSettingsInput;
    readonly actorId: string;
    readonly requestId: string;
  }) => Promise<OperationsResult<ModelSettings>>;
};
