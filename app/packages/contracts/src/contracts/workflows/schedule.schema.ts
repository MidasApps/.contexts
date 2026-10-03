import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS, EXAMPLE_TIMES } from "../example-values.ts";
import { none, personal } from "../field-docs.ts";
import { TenantIdSchema, UserIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { HAS_ANY_FIELD_ERROR, hasAnyField } from "../primitives/refinements.ts";
import { TimeZoneSchema } from "../primitives/time-zone.schema.ts";
import { WorkflowIdSchema } from "./human-approval-resume.schema.ts";

// One cron field: numbers, ranges, steps, lists, `*`, `?` and month/day names. Croner checks
// the semantics and the minimum interval on the server (decision 0037).
const CRON_FIELD = /^(?:\*|\?|[0-9A-Za-z]+(?:-[0-9A-Za-z]+)?)(?:\/[0-9]+)?(?:,(?:\*|[0-9A-Za-z]+(?:-[0-9A-Za-z]+)?)(?:\/[0-9]+)?)*$/;

/** A 5-field cron expression (minute hour day-of-month month day-of-week); no seconds, no years, no macros. */
export const CronExpressionSchema = z
  .string()
  .max(120)
  .refine((value) => {
    const fields = value.trim().split(/\s+/);
    return fields.length === 5 && fields.every((field) => CRON_FIELD.test(field));
  }, { error: "Expected a 5-field cron expression." });

/** Slug of a tenant schedule: its id is `schedule_<tenant key>-<slug>` (decision 0037 amendment). */
export const ScheduleSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: "Expected a kebab-case slug." }).max(60);

export const ScheduleStatusSchema = z.enum(["active", "paused"]);
export type ScheduleStatus = z.infer<typeof ScheduleStatusSchema>;

// Opaque here; the workflow's input schema validates it through the gateway (SP5 spec §3.5).
const inputDataField = () => z.record(z.string(), z.unknown()).meta(personal("Workflow input; validated by the workflow's own schema on the server."));

/** A tenant schedule of a schedulable workflow (Mastra Schedules, decision 0037). */
export const ScheduleSchema = z.strictObject({
  id: z
    .string()
    .regex(/^schedule_[a-f0-9]{16}-[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .meta(none("`schedule_<tenant key>-<slug>`; the tenant key is the first 16 hex digits of SHA-256(tenantId), because Mastra slugifies ids.")),
  tenantId: TenantIdSchema.meta(none("Organization that owns the schedule.")),
  workflowId: WorkflowIdSchema.meta(none("Scheduled workflow.")),
  cron: CronExpressionSchema.meta(none("5-field cron expression, evaluated in `timezone`.")),
  timezone: TimeZoneSchema.meta(none("IANA time zone of the cron expression.")),
  inputData: inputDataField(),
  status: ScheduleStatusSchema.meta(none("`paused` schedules do not fire.")),
  nextFireAt: IsoDateTimeSchema.nullable().meta(none("Next fire (UTC); null while paused.")),
  lastFireAt: IsoDateTimeSchema.nullable().meta(none("Last fire (UTC); null before the first.")),
  createdBy: UserIdSchema.meta(personal("Creator; every run re-authorizes this user.")),
  createdAt: IsoDateTimeSchema.meta(none("When the schedule was created (UTC).")),
  updatedAt: IsoDateTimeSchema.meta(none("When the schedule last changed (UTC).")),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

export const ScheduleContract = defineContract(ScheduleSchema, {
  id: "workflows.Schedule",
  kind: "entity",
  description: "A tenant schedule that starts a schedulable workflow on a cron expression in an IANA time zone.",
  examples: [
    {
      id: "schedule_3fa9c0e1b2d4a6f8-daily-usage",
      tenantId: EXAMPLE_IDS.organization,
      workflowId: "usage-report",
      cron: "0 9 * * *",
      timezone: "America/Sao_Paulo",
      inputData: {},
      status: "active",
      nextFireAt: "2026-09-30T12:00:00.000Z",
      lastFireAt: null,
      createdBy: EXAMPLE_IDS.user,
      createdAt: EXAMPLE_TIMES.created,
      updatedAt: EXAMPLE_TIMES.created,
    },
  ],
  pii: "personal",
  tenancyScope: "organization",
  relations: [{ target: "tenancy.Organization", type: "belongs-to", field: "tenantId" }],
  permission: "core.schedule.read",
});

export const CreateScheduleInputSchema = z.strictObject({
  workflowId: WorkflowIdSchema.meta(none("Workflow to schedule; it must be schedulable.")),
  slug: ScheduleSlugSchema.meta(none("Unique per organization; part of the schedule id.")),
  cron: CronExpressionSchema.meta(none("5-field cron expression; at least 15 minutes between fires.")),
  timezone: TimeZoneSchema.meta(none("IANA time zone of the cron expression; required.")),
  inputData: inputDataField().optional(),
});
export type CreateScheduleInput = z.infer<typeof CreateScheduleInputSchema>;

export const CreateScheduleInputContract = defineContract(CreateScheduleInputSchema, {
  id: "workflows.CreateScheduleInput",
  kind: "command",
  description: "Creates a tenant schedule for a schedulable workflow.",
  examples: [{ workflowId: "usage-report", slug: "daily-usage", cron: "0 9 * * *", timezone: "America/Sao_Paulo", inputData: {} }],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "core.schedule.write",
});

/** How many fires `POST /v1/schedules/preview` returns. */
export const SCHEDULE_PREVIEW_FIRES = 5;

export const SchedulePreviewInputSchema = z.strictObject({
  cron: CronExpressionSchema.meta(none("5-field cron expression to preview; it need not be saved.")),
  timezone: TimeZoneSchema.meta(none("IANA time zone the cron is read in.")),
});
export type SchedulePreviewInput = z.infer<typeof SchedulePreviewInputSchema>;

export const SchedulePreviewInputContract = defineContract(SchedulePreviewInputSchema, {
  id: "workflows.SchedulePreviewInput",
  kind: "command",
  description: "A cron expression and time zone whose next fires the editor shows before saving.",
  examples: [{ cron: "0 9 * * 1-5", timezone: "America/Sao_Paulo" }],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  permission: "core.schedule.read",
});

export const SchedulePreviewSchema = z.strictObject({
  nextFireTimes: z.array(IsoDateTimeSchema).max(SCHEDULE_PREVIEW_FIRES).meta(none("The next five fires from now (UTC), computed by the scheduler's own cron engine.")),
});
export type SchedulePreview = z.infer<typeof SchedulePreviewSchema>;

export const SchedulePreviewContract = defineContract(SchedulePreviewSchema, {
  id: "workflows.SchedulePreview",
  kind: "view",
  description: "The next fires of a cron expression in its time zone, as the scheduler would fire them.",
  examples: [{ nextFireTimes: ["2026-10-01T12:00:00.000Z", "2026-10-02T12:00:00.000Z", "2026-10-05T12:00:00.000Z", "2026-10-06T12:00:00.000Z", "2026-10-07T12:00:00.000Z"] }],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  permission: "core.schedule.read",
});

export const UpdateScheduleInputSchema = z.strictObject({
  cron: CronExpressionSchema.optional().meta(none("New cron expression.")),
  timezone: TimeZoneSchema.optional().meta(none("New IANA time zone.")),
  inputData: inputDataField().optional(),
}).refine(hasAnyField, HAS_ANY_FIELD_ERROR);
export type UpdateScheduleInput = z.infer<typeof UpdateScheduleInputSchema>;

export const UpdateScheduleInputContract = defineContract(UpdateScheduleInputSchema, {
  id: "workflows.UpdateScheduleInput",
  kind: "command",
  description: "Changes the cron expression, time zone or input of a tenant schedule.",
  examples: [{ cron: "30 8 * * 1-5", timezone: "America/New_York" }],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "core.schedule.write",
});
