// Workflow runs and tenant schedules `/v1` descriptors (SP5 spec §3.5, §3.6; decisions 0037, 0040).
import { z } from "zod";
import { none } from "../field-docs.ts";
import { defineEndpoint, type EndpointDefinition } from "../http/endpoint.ts";
import { dataEnvelope, listEnvelope, PageQuerySchema } from "../http/envelopes.schema.ts";
import { OrganizationIdSchema } from "../tenancy/ids.schema.ts";
import { WorkflowIdSchema } from "./human-approval-resume.schema.ts";
import {
  CreateScheduleInputSchema,
  SchedulePreviewInputSchema,
  SchedulePreviewSchema,
  ScheduleSchema,
  UpdateScheduleInputSchema,
} from "./schedule.schema.ts";
import { StartWorkflowRunInputSchema, WorkflowRunSchema, WorkflowRunStatusSchema } from "./workflow-run.schema.ts";

const RunIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

/** The organization of the call: required for users, an API key's own one otherwise (like `/v1/mcp`). */
export const OrganizationQuerySchema = z.strictObject({
  organizationId: OrganizationIdSchema.optional().meta(
    none("Organization to act in; required for users, and when given it must be an API key's own organization."),
  ),
});

const runParams = z.object({ runId: RunIdSchema.meta(none("Workflow run id.")) });

/** `202` of `POST /v1/workflows/{workflowId}/runs`: the run to follow. */
export const StartedWorkflowRunSchema = z.strictObject({
  runId: z.string().min(1).max(128).meta(none("Id of the started run.")),
});

/**
 * `200` of the progress stream: `text/event-stream` in the `api.md` §14 format, one
 * `event: data` per `workflows.WorkflowEvent` (SSE `id` = its index), then `done` or `error`.
 */
export const WorkflowRunStreamSchema = z.string().meta(none("Server-sent events of the run's progress (api.md §14)."));

export const listWorkflowRunsEndpoint = defineEndpoint({
  id: "workflows.listRuns",
  method: "GET",
  path: "/v1/workflows/runs",
  auth: "principal",
  query: OrganizationQuerySchema.extend(PageQuerySchema.shape).extend({
    workflowId: WorkflowIdSchema.optional().meta(none("Only runs of this workflow.")),
    status: WorkflowRunStatusSchema.optional().meta(none("Only runs in this status.")),
  }),
  responses: { 200: listEnvelope(WorkflowRunSchema) },
  errors: { 403: ["FORBIDDEN"] },
  summary: "Lists the organization's workflow runs, newest first (core.workflow-run.read).",
});

export const getWorkflowRunEndpoint = defineEndpoint({
  id: "workflows.getRun",
  method: "GET",
  path: "/v1/workflows/runs/{runId}",
  auth: "principal",
  params: runParams,
  query: OrganizationQuerySchema,
  responses: { 200: dataEnvelope(WorkflowRunSchema) },
  errors: { 403: ["FORBIDDEN"], 404: ["NOT_FOUND"] },
  summary: "Reads one workflow run of the organization (core.workflow-run.read).",
});

export const streamWorkflowRunEndpoint = defineEndpoint({
  id: "workflows.streamRun",
  method: "GET",
  path: "/v1/workflows/runs/{runId}/stream",
  auth: "principal",
  params: runParams,
  query: OrganizationQuerySchema,
  responses: { 200: WorkflowRunStreamSchema },
  errors: { 403: ["FORBIDDEN"], 404: ["NOT_FOUND"] },
  summary:
    "Streams the run's progress as server-sent events; Last-Event-Id resumes after an event index (core.workflow-run.read).",
});

export const cancelWorkflowRunEndpoint = defineEndpoint({
  id: "workflows.cancelRun",
  method: "POST",
  path: "/v1/workflows/runs/{runId}/cancel",
  auth: "principal",
  params: runParams,
  query: OrganizationQuerySchema,
  responses: { 204: null },
  errors: { 403: ["FORBIDDEN"], 404: ["NOT_FOUND"] },
  summary: "Cancels a run of the organization (core.workflow-run.cancel).",
});

export const startWorkflowRunEndpoint = defineEndpoint({
  id: "workflows.startRun",
  method: "POST",
  path: "/v1/workflows/{workflowId}/runs",
  auth: "principal",
  params: z.object({ workflowId: WorkflowIdSchema.meta(none("Workflow to start; it must be startable.")) }),
  query: OrganizationQuerySchema,
  body: StartWorkflowRunInputSchema,
  responses: { 202: dataEnvelope(StartedWorkflowRunSchema) },
  errors: { 403: ["FORBIDDEN"], 404: ["NOT_FOUND"], 422: ["WORKFLOW_NOT_STARTABLE"] },
  idempotency: "optional",
  summary: "Starts a run of a startable workflow in the organization (core.workflow-run.start).",
});

export const WORKFLOW_RUN_ENDPOINTS: readonly EndpointDefinition[] = [
  listWorkflowRunsEndpoint,
  getWorkflowRunEndpoint,
  streamWorkflowRunEndpoint,
  cancelWorkflowRunEndpoint,
  startWorkflowRunEndpoint,
];

const scheduleParams = z.object({
  scheduleId: z
    .string()
    .regex(/^schedule_[a-z0-9-]{1,120}$/)
    .meta(none("Schedule id.")),
});

/** `202` of `POST /v1/schedules/{scheduleId}/run`: the schedule whose run was queued. */
export const ScheduleRunQueuedSchema = z.strictObject({
  scheduleId: z.string().min(1).meta(none("Schedule that will start a run now.")),
});

const scheduleErrors = { 403: ["FORBIDDEN"], 404: ["NOT_FOUND"] } as const;
const scheduleWriteErrors = {
  ...scheduleErrors,
  409: ["CONFLICT"],
  422: ["WORKFLOW_NOT_SCHEDULABLE", "SCHEDULE_INTERVAL_TOO_SHORT"],
} as const;

export const listSchedulesEndpoint = defineEndpoint({
  id: "schedules.list",
  method: "GET",
  path: "/v1/schedules",
  auth: "principal",
  query: OrganizationQuerySchema,
  responses: { 200: dataEnvelope(z.array(ScheduleSchema)) },
  errors: { 403: ["FORBIDDEN"] },
  summary: "Lists the organization's schedules with their next fire (core.schedule.read).",
});

export const createScheduleEndpoint = defineEndpoint({
  id: "schedules.create",
  method: "POST",
  path: "/v1/schedules",
  auth: "principal",
  query: OrganizationQuerySchema,
  body: CreateScheduleInputSchema,
  responses: { 201: dataEnvelope(ScheduleSchema) },
  errors: scheduleWriteErrors,
  idempotency: "optional",
  summary:
    "Schedules a schedulable workflow on a 5-field cron in an IANA time zone; runs re-authorize the creator (core.schedule.write).",
});

export const getScheduleEndpoint = defineEndpoint({
  id: "schedules.get",
  method: "GET",
  path: "/v1/schedules/{scheduleId}",
  auth: "principal",
  params: scheduleParams,
  query: OrganizationQuerySchema,
  responses: { 200: dataEnvelope(ScheduleSchema) },
  errors: scheduleErrors,
  summary: "Reads one schedule of the organization (core.schedule.read).",
});

export const updateScheduleEndpoint = defineEndpoint({
  id: "schedules.update",
  method: "PATCH",
  path: "/v1/schedules/{scheduleId}",
  auth: "principal",
  params: scheduleParams,
  query: OrganizationQuerySchema,
  body: UpdateScheduleInputSchema,
  responses: { 200: dataEnvelope(ScheduleSchema) },
  errors: scheduleWriteErrors,
  summary: "Changes a schedule's cron, time zone or input (core.schedule.write).",
});

export const deleteScheduleEndpoint = defineEndpoint({
  id: "schedules.delete",
  method: "DELETE",
  path: "/v1/schedules/{scheduleId}",
  auth: "principal",
  params: scheduleParams,
  query: OrganizationQuerySchema,
  responses: { 204: null },
  errors: scheduleErrors,
  summary: "Deletes a schedule (core.schedule.write).",
});

const scheduleActionEndpoint = <A extends "pause" | "resume">(action: A, summary: string) =>
  defineEndpoint({
    id: `schedules.${action}`,
    method: "POST",
    path: `/v1/schedules/{scheduleId}/${action}`,
    auth: "principal",
    params: scheduleParams,
    query: OrganizationQuerySchema,
    responses: { 200: dataEnvelope(ScheduleSchema) },
    errors: scheduleErrors,
    summary,
  });

export const pauseScheduleEndpoint = scheduleActionEndpoint(
  "pause",
  "Pauses a schedule; it does not fire until resumed (core.schedule.write).",
);
export const resumeScheduleEndpoint = scheduleActionEndpoint(
  "resume",
  "Resumes a schedule from now on; missed fires are not replayed (core.schedule.write).",
);

export const runScheduleNowEndpoint = defineEndpoint({
  id: "schedules.runNow",
  method: "POST",
  path: "/v1/schedules/{scheduleId}/run",
  auth: "principal",
  params: scheduleParams,
  query: OrganizationQuerySchema,
  responses: { 202: dataEnvelope(ScheduleRunQueuedSchema) },
  errors: scheduleErrors,
  idempotency: "optional",
  summary: "Starts a run of the schedule now, with the creator re-authorized (core.schedule.write).",
});

export const previewScheduleEndpoint = defineEndpoint({
  id: "schedules.preview",
  method: "POST",
  path: "/v1/schedules/preview",
  auth: "principal",
  query: OrganizationQuerySchema,
  body: SchedulePreviewInputSchema,
  responses: { 200: dataEnvelope(SchedulePreviewSchema) },
  errors: { 403: ["FORBIDDEN"] },
  summary:
    "The next five fires of an unsaved cron expression in its time zone, from the scheduler's own engine (core.schedule.read).",
});

export const SCHEDULE_ENDPOINTS: readonly EndpointDefinition[] = [
  listSchedulesEndpoint,
  createScheduleEndpoint,
  previewScheduleEndpoint,
  getScheduleEndpoint,
  updateScheduleEndpoint,
  deleteScheduleEndpoint,
  pauseScheduleEndpoint,
  resumeScheduleEndpoint,
  runScheduleNowEndpoint,
];
