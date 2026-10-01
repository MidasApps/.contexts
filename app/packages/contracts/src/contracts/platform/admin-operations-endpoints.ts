import { z } from "zod";
import { ConnectorSchema } from "../connectors/connector.schema.ts";
import { none } from "../field-docs.ts";
import { defineEndpoint, type EndpointDefinition } from "../http/endpoint.ts";
import { dataEnvelope, listEnvelope, PageQuerySchema } from "../http/envelopes.schema.ts";
import { OrganizationIdSchema } from "../tenancy/ids.schema.ts";
import { WorkflowIdSchema } from "../workflows/human-approval-resume.schema.ts";
import { WorkflowRunStatusSchema } from "../workflows/workflow-run.schema.ts";
import { AdminScheduleSchema, AdminWorkflowRunSchema, LogLevelSchema, LogLineSchema } from "./admin-operations.schema.ts";

const STAFF = { 403: ["FORBIDDEN", "MFA_REQUIRED"] } as const;
const UPSTREAM = { 502: ["UPSTREAM_UNAVAILABLE"] } as const;
const runParams = z.object({ runId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).meta(none("Workflow run id.")) });
const scheduleParams = z.object({ scheduleId: z.string().regex(/^schedule_[a-z0-9-]{1,120}$/).meta(none("Schedule id.")) });

export const adminListWorkflowRunsEndpoint = defineEndpoint({
  id: "admin.listWorkflowRuns",
  method: "GET",
  path: "/v1/admin/workflow-runs",
  auth: "user",
  query: PageQuerySchema.extend({
    organizationId: OrganizationIdSchema.optional().meta(none("Only the runs of this organization.")),
    workflowId: WorkflowIdSchema.optional().meta(none("Only runs of this workflow.")),
    status: WorkflowRunStatusSchema.optional().meta(none("Only runs in this status.")),
  }),
  responses: { 200: listEnvelope(AdminWorkflowRunSchema) },
  errors: { 400: ["VALIDATION_FAILED"], ...STAFF, ...UPSTREAM },
  summary: "Lists workflow runs of every organization and of the platform, newest first (staff, platform.workflow.manage).",
});

export const adminCancelWorkflowRunEndpoint = defineEndpoint({
  id: "admin.cancelWorkflowRun",
  method: "POST",
  path: "/v1/admin/workflow-runs/{runId}/cancel",
  auth: "user",
  params: runParams,
  responses: { 204: null },
  errors: { ...STAFF, 404: ["NOT_FOUND"], ...UPSTREAM },
  summary: "Cancels any workflow run (staff, platform.workflow.manage; audited with targetTenantId).",
});

export const adminListSchedulesEndpoint = defineEndpoint({
  id: "admin.listSchedules",
  method: "GET",
  path: "/v1/admin/schedules",
  auth: "user",
  query: z.object({
    organizationId: OrganizationIdSchema.optional().meta(none("Only the schedules of this organization; without it, platform schedules are listed too.")),
  }),
  responses: { 200: dataEnvelope(z.array(AdminScheduleSchema)) },
  errors: { ...STAFF, ...UPSTREAM },
  summary: "Lists platform and tenant schedules with their state and next fire (staff, platform.workflow.manage).",
});

const adminScheduleActionEndpoint = <A extends "pause" | "resume">(action: A, summary: string) =>
  defineEndpoint({
    id: `admin.${action}Schedule`,
    method: "POST",
    path: `/v1/admin/schedules/{scheduleId}/${action}`,
    auth: "user",
    params: scheduleParams,
    responses: { 200: dataEnvelope(AdminScheduleSchema) },
    errors: { ...STAFF, 404: ["NOT_FOUND"], ...UPSTREAM },
    summary,
  });

export const adminPauseScheduleEndpoint = adminScheduleActionEndpoint("pause", "Pauses any schedule (staff, platform.workflow.manage; audited).");
export const adminResumeScheduleEndpoint = adminScheduleActionEndpoint("resume", "Resumes any schedule from now on (staff, platform.workflow.manage; audited).");

export const adminRunScheduleNowEndpoint = defineEndpoint({
  id: "admin.runScheduleNow",
  method: "POST",
  path: "/v1/admin/schedules/{scheduleId}/run",
  auth: "user",
  params: scheduleParams,
  responses: { 202: dataEnvelope(z.strictObject({ scheduleId: z.string().min(1).meta(none("Schedule that will start a run now.")) })) },
  errors: { ...STAFF, 404: ["NOT_FOUND"], ...UPSTREAM },
  summary: "Starts a run of any schedule now; a tenant schedule still re-authorizes its creator (staff, platform.workflow.manage; audited).",
});

export const adminListConnectorsEndpoint = defineEndpoint({
  id: "admin.listConnectors",
  method: "GET",
  path: "/v1/admin/connectors",
  auth: "user",
  query: PageQuerySchema.extend({
    organizationId: OrganizationIdSchema.optional().meta(none("Organization whose connectors to list; required (400 without it).")),
  }),
  responses: { 200: listEnvelope(ConnectorSchema) },
  errors: { 400: ["VALIDATION_FAILED"], ...STAFF },
  summary: "Lists the connectors of one organization, never their secrets (staff, platform.connector.read).",
});

export const adminListLogsEndpoint = defineEndpoint({
  id: "admin.listLogs",
  method: "GET",
  path: "/v1/admin/logs",
  auth: "user",
  query: z.object({
    level: LogLevelSchema.optional().meta(none("Minimum level.")),
    q: z.string().min(1).max(200).optional().meta(none("Text the message contains.")),
    traceId: z.string().min(1).max(128).optional().meta(none("Only lines of this trace.")),
    requestId: z.string().min(1).max(128).optional().meta(none("Only lines of this request.")),
    limit: z.coerce.number().int().min(1).max(500).default(200).meta(none("Most lines to return, 1-500 (default 200).")),
  }),
  responses: { 200: dataEnvelope(z.array(LogLineSchema)) },
  errors: { 400: ["VALIDATION_FAILED"], ...STAFF, 404: ["NOT_FOUND"] },
  summary: "Latest structured log lines of the web process, newest first; local environment only, 404 elsewhere (staff, platform.trace.read).",
});

export const ADMIN_OPERATIONS_ENDPOINTS: readonly EndpointDefinition[] = [
  adminListWorkflowRunsEndpoint,
  adminCancelWorkflowRunEndpoint,
  adminListSchedulesEndpoint,
  adminPauseScheduleEndpoint,
  adminResumeScheduleEndpoint,
  adminRunScheduleNowEndpoint,
  adminListConnectorsEndpoint,
  adminListLogsEndpoint,
];
