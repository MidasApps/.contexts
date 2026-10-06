import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS, EXAMPLE_TIMES } from "../example-values.ts";
import { none, personal } from "../field-docs.ts";
import { TenantIdSchema, UserIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { TimeZoneSchema } from "../primitives/time-zone.schema.ts";
import { WorkflowIdSchema } from "../workflows/human-approval-resume.schema.ts";
import { CronExpressionSchema, ScheduleStatusSchema } from "../workflows/schedule.schema.ts";
import { WorkflowRunSchema } from "../workflows/workflow-run.schema.ts";

/** A workflow run as staff list it: any tenant's, or a platform run (no tenant). */
export const AdminWorkflowRunSchema = z.strictObject({
  ...WorkflowRunSchema.shape,
  tenantId: TenantIdSchema.nullable().meta(none("Organization the run belongs to; null for platform runs.")),
});
export type AdminWorkflowRun = z.infer<typeof AdminWorkflowRunSchema>;

export const AdminWorkflowRunContract = defineContract(AdminWorkflowRunSchema, {
  id: "platform.AdminWorkflowRun",
  kind: "view",
  description: "A workflow run of any organization, or of the platform, as staff see it.",
  examples: [
    {
      runId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
      workflowId: "usage-report",
      tenantId: null,
      status: "success",
      startedBy: null,
      scheduleId: null,
      approvalRequestId: null,
      createdAt: EXAMPLE_TIMES.created,
      updatedAt: EXAMPLE_TIMES.updated,
    },
  ],
  pii: "personal",
  tenancyScope: "platform",
  relations: [],
  permission: "platform.workflow.manage",
});

/** A schedule as staff list it: a tenant schedule or a platform one (boot-time rows, UTC). */
export const AdminScheduleSchema = z.strictObject({
  id: z
    .string()
    .regex(/^schedule_[a-z0-9-]{1,120}$/)
    .meta(none("Schedule id.")),
  scope: z
    .enum(["platform", "tenant"])
    .meta(none("`platform` for the core crons, `tenant` for a schedule of an organization.")),
  tenantId: TenantIdSchema.nullable().meta(none("Organization that owns a tenant schedule; null for platform ones.")),
  workflowId: WorkflowIdSchema.meta(none("Scheduled workflow.")),
  cron: CronExpressionSchema.meta(none("5-field cron expression, evaluated in `timezone`.")),
  timezone: TimeZoneSchema.meta(none("IANA time zone of the cron expression.")),
  status: ScheduleStatusSchema.meta(none("`paused` schedules do not fire.")),
  nextFireAt: IsoDateTimeSchema.nullable().meta(none("Next fire (UTC); null while paused.")),
  lastFireAt: IsoDateTimeSchema.nullable().meta(none("Last fire (UTC); null before the first.")),
  createdBy: UserIdSchema.nullable().meta(personal("Creator of a tenant schedule; null for platform ones.")),
  createdAt: IsoDateTimeSchema.meta(none("When the schedule was created (UTC).")),
  updatedAt: IsoDateTimeSchema.meta(none("When the schedule last changed (UTC).")),
});
export type AdminSchedule = z.infer<typeof AdminScheduleSchema>;

export const AdminScheduleContract = defineContract(AdminScheduleSchema, {
  id: "platform.AdminSchedule",
  kind: "view",
  description: "A platform or tenant schedule as staff see it, with its state and next fire.",
  examples: [
    {
      id: "schedule_platform-usage-report",
      scope: "platform",
      tenantId: null,
      workflowId: "usage-report",
      cron: "15 * * * *",
      timezone: "UTC",
      status: "active",
      nextFireAt: "2026-09-30T12:15:00.000Z",
      lastFireAt: null,
      createdBy: null,
      createdAt: EXAMPLE_TIMES.created,
      updatedAt: EXAMPLE_TIMES.created,
    },
    {
      id: "schedule_3fa9c0e1b2d4a6f8-daily-usage",
      scope: "tenant",
      tenantId: EXAMPLE_IDS.organization,
      workflowId: "usage-report",
      cron: "0 9 * * *",
      timezone: "America/Sao_Paulo",
      status: "paused",
      nextFireAt: null,
      lastFireAt: "2026-09-29T12:00:00.000Z",
      createdBy: EXAMPLE_IDS.user,
      createdAt: EXAMPLE_TIMES.created,
      updatedAt: EXAMPLE_TIMES.updated,
    },
  ],
  pii: "personal",
  tenancyScope: "platform",
  relations: [],
  permission: "platform.workflow.manage",
});

export const LogLevelSchema = z.enum(["debug", "info", "warn", "error"]);
export type LogLineLevel = z.infer<typeof LogLevelSchema>;

/** One structured log line of the local ring buffer (rules/observability.md field names). */
export const LogLineSchema = z.strictObject({
  timestamp: IsoDateTimeSchema.meta(none("When the line was written (UTC).")),
  level: LogLevelSchema.meta(none("`debug`, `info`, `warn` or `error`.")),
  message: z.string().meta(none("Stable event name of the line.")),
  service: z.string().meta(none("Service that wrote the line.")),
  env: z.string().meta(none("Logical environment.")),
  requestId: z.string().nullable().meta(none("Request the line belongs to, if any.")),
  traceId: z.string().nullable().meta(none("Trace the line belongs to, if any.")),
  fields: z.record(z.string(), z.unknown()).meta(personal("The other structured fields of the line.")),
});
export type LogLine = z.infer<typeof LogLineSchema>;

export const LogLineContract = defineContract(LogLineSchema, {
  id: "platform.LogLine",
  kind: "view",
  description: "A structured log line kept in the ring buffer of the local environment for the staff console.",
  examples: [
    {
      timestamp: "2026-09-30T12:00:00.000Z",
      level: "info",
      message: "order_placed",
      service: "web",
      env: "local",
      requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
      traceId: null,
      fields: { durationMs: 42 },
    },
  ],
  pii: "personal",
  tenancyScope: "platform",
  relations: [],
  permission: "platform.trace.read",
});
