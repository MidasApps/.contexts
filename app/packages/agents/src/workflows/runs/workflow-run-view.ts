import {
  type AdminWorkflowRun,
  AdminWorkflowRunSchema,
  type WorkflowEvent,
  type WorkflowRun as WorkflowRunView,
  type WorkflowRunFailure,
  WorkflowRunSchema,
  type WorkflowRunStatus,
  WorkflowRunStatusSchema,
} from "@core/contracts";

/**
 * Read model of Mastra workflow runs for `/v1` (SP5 spec §3.6, decision 0040): the tenant of a
 * run is the prefix of its `resourceId` (`tenantId:uid`, set by the context middleware), and its
 * progress events are derived from the stored snapshot, so every reconnection sees the same
 * indexes (`Last-Event-Id`). Step outputs never leave the runtime.
 */

/** Request-context key of the schedule that started a run (written on the schedule row). */
export const SCHEDULE_ID_CONTEXT_KEY = "coreScheduleId";

/** The part of a stored Mastra run the views read (`WorkflowRun` of `@mastra/core/storage`). */
export type StoredRun = {
  readonly workflowName: string;
  readonly runId: string;
  readonly resourceId?: string | undefined;
  readonly snapshot: unknown;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

type StepRecord = {
  readonly status?: unknown;
  readonly startedAt?: unknown;
  readonly endedAt?: unknown;
  readonly suspendedAt?: unknown;
  readonly resumedAt?: unknown;
  readonly suspendPayload?: unknown;
  /** Set by Mastra when a processor (guardrail) stopped the step. */
  readonly tripwire?: unknown;
};

type Snapshot = {
  readonly status: WorkflowRunStatus;
  readonly steps: readonly (readonly [string, StepRecord])[];
  readonly requestContext: Readonly<Record<string, unknown>>;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const parseSnapshot = (raw: unknown): Snapshot => {
  const value = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
  const snapshot = isRecord(value) ? value : {};
  const status = WorkflowRunStatusSchema.safeParse(snapshot["status"]);
  const context = isRecord(snapshot["context"]) ? snapshot["context"] : {};
  // `input` is the run input, not a step; steps without a start time never ran.
  const steps = Object.entries(context)
    .filter((entry): entry is [string, StepRecord] => entry[0] !== "input" && isRecord(entry[1]) && typeof entry[1]["startedAt"] === "number")
    .sort((a, b) => (a[1].startedAt as number) - (b[1].startedAt as number) || a[0].localeCompare(b[0]));
  return { status: status.success ? status.data : "pending", steps, requestContext: isRecord(snapshot["requestContext"]) ? snapshot["requestContext"] : {} };
};

/** Whether the run belongs to the tenant (`resourceId` = `tenantId:uid`). */
export const isTenantRun = (run: { readonly resourceId?: string | undefined }, tenantId: string): boolean =>
  typeof run.resourceId === "string" && run.resourceId.startsWith(`${tenantId}:`);

const tenantOf = (resourceId: string | undefined): string | null => {
  const separator = resourceId?.indexOf(":") ?? -1;
  return resourceId === undefined || separator <= 0 ? null : resourceId.slice(0, separator);
};

const stringOrNull = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

const approvalRequestIdOf = (steps: Snapshot["steps"]): string | null => {
  const suspended = steps.find(([, step]) => step.status === "suspended");
  const payload = suspended?.[1].suspendPayload;
  return isRecord(payload) ? stringOrNull(payload["approvalRequestId"]) : null;
};

// Steps that ended the run; a guardrail stop may carry `tripwire` on a step marked failed.
const STOPPING_STEP = new Set(["failed", "tripwire"]);

/**
 * Why a failed or stopped run ended, as a code and the step (the last one that failed), never
 * the error message or the guardrail's reason: those may name hosts, data or prompts (rule
 * `error-handling`) and stay in logs and traces.
 */
const failureOf = (snapshot: Snapshot): WorkflowRunFailure | null => {
  if (snapshot.status !== "failed" && snapshot.status !== "tripwire") return null;
  const stopped = snapshot.steps.findLast(([, step]) => (typeof step.status === "string" && STOPPING_STEP.has(step.status)) || step.tripwire !== undefined);
  const stepId = stopped?.[0] ?? null;
  if (snapshot.status === "tripwire") return { code: "TRIPWIRE", stepId };
  return stepId === null ? { code: "RUN_FAILED", stepId: null } : { code: "STEP_FAILED", stepId };
};

/** The approval request a run suspended in the HITL step waits for, or `null`. */
export const waitingApprovalRequestIdOf = (run: Pick<StoredRun, "snapshot">): string | null => approvalRequestIdOf(parseSnapshot(run.snapshot).steps);

const viewFieldsOf = (run: StoredRun, tenantId: string | null) => {
  const snapshot = parseSnapshot(run.snapshot);
  return {
    runId: run.runId,
    workflowId: run.workflowName,
    tenantId,
    status: snapshot.status,
    startedBy: stringOrNull(snapshot.requestContext["userId"]),
    scheduleId: stringOrNull(snapshot.requestContext[SCHEDULE_ID_CONTEXT_KEY]),
    approvalRequestId: snapshot.status === "suspended" ? approvalRequestIdOf(snapshot.steps) : null,
    failure: failureOf(snapshot),
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
};

/** `/v1` view of a run; `null` when the run has no tenant resource (platform runs) or does not fit the contract. */
export const toWorkflowRunView = (run: StoredRun): WorkflowRunView | null => {
  const tenantId = tenantOf(run.resourceId);
  if (tenantId === null) return null;
  const view = WorkflowRunSchema.safeParse(viewFieldsOf(run, tenantId));
  return view.success ? view.data : null;
};

/** Staff view of any run: a platform run (no tenant resource) has `tenantId: null`; `null` when it does not fit the contract. */
export const toAdminWorkflowRunView = (run: StoredRun): AdminWorkflowRun | null => {
  const view = AdminWorkflowRunSchema.safeParse(viewFieldsOf(run, tenantOf(run.resourceId)));
  return view.success ? view.data : null;
};

type Draft = Omit<WorkflowEvent, "index">;

const at = (value: unknown, fallback: Date): string => new Date(typeof value === "number" ? value : fallback.getTime()).toISOString();

const FINISHED_STEP = new Set(["success", "failed", "canceled", "skipped"]);

const stepEvents = (stepId: string, step: StepRecord, fallback: Date): Draft[] => {
  const status = WorkflowRunStatusSchema.safeParse(step.status);
  const events: Draft[] = [{ type: "workflow-step-start", stepId, status: "running", occurredAt: at(step.startedAt, fallback) }];
  // A step that suspended once keeps its suspended event after it resumes, so indexes never move.
  if (typeof step.suspendedAt === "number" || step.status === "suspended") {
    events.push({ type: "workflow-step-suspended", stepId, status: "suspended", occurredAt: at(step.suspendedAt, fallback) });
  }
  if (typeof step.status === "string" && FINISHED_STEP.has(step.status)) {
    events.push({ type: "workflow-step-result", stepId, status: status.success ? status.data : null, occurredAt: at(step.endedAt, fallback) });
  }
  return events;
};

const TERMINAL: Readonly<Partial<Record<WorkflowRunStatus, WorkflowEvent["type"]>>> = {
  success: "workflow-finish",
  failed: "workflow-finish",
  tripwire: "workflow-finish",
  canceled: "workflow-canceled",
};

/** Run statuses after which no event follows (the SSE stream then sends `done`). */
export const isSettledStatus = (status: WorkflowRunStatus): boolean => TERMINAL[status] !== undefined;

/** Progress events of a run, oldest first, numbered from 0. */
export const eventsOfRun = (run: StoredRun): WorkflowEvent[] => {
  const snapshot = parseSnapshot(run.snapshot);
  const drafts: Draft[] = [{ type: "workflow-start", stepId: null, status: "running", occurredAt: run.createdAt.toISOString() }];
  for (const [stepId, step] of snapshot.steps) drafts.push(...stepEvents(stepId, step, run.updatedAt));
  const terminal = TERMINAL[snapshot.status];
  if (terminal !== undefined) drafts.push({ type: terminal, stepId: null, status: snapshot.status, occurredAt: run.updatedAt.toISOString() });
  return drafts.map((draft, index) => ({ index, ...draft }));
};

/** The run's status from its snapshot. */
export const statusOfRun = (run: StoredRun): WorkflowRunStatus => parseSnapshot(run.snapshot).status;
