import { z } from "zod";
import { defineContract } from "../contract.ts";
import { none, personal } from "../field-docs.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { WorkflowRunStatusSchema } from "./workflow-run.schema.ts";

/** Mastra workflow stream events re-emitted by `/v1` (SP5 spec §2, §3.6). */
export const WORKFLOW_EVENT_TYPES = [
  "workflow-start",
  "workflow-step-start",
  "workflow-step-output",
  "workflow-step-progress",
  "workflow-step-result",
  "workflow-step-suspended",
  "workflow-finish",
  "workflow-canceled",
] as const;
export const WorkflowEventTypeSchema = z.enum(WORKFLOW_EVENT_TYPES);

/** One `event: data` line of the run progress SSE (`api.md` §14, decision 0040). */
export const WorkflowEventSchema = z.strictObject({
  index: z.int().nonnegative().meta(none("Position in the run's stream; the SSE `id`, used by `Last-Event-Id`.")),
  type: WorkflowEventTypeSchema.meta(none("Mastra event type.")),
  stepId: z.string().min(1).nullable().meta(none("Step the event is about; null for run-level events.")),
  status: WorkflowRunStatusSchema.nullable().meta(none("Step or run status carried by the event.")),
  output: z.unknown().optional().meta(personal("Step output, redacted by the workflow schema's pii meta.")),
  occurredAt: IsoDateTimeSchema.meta(none("When the event was emitted (UTC).")),
});
export type WorkflowEvent = z.infer<typeof WorkflowEventSchema>;

export const WorkflowEventContract = defineContract(WorkflowEventSchema, {
  id: "workflows.WorkflowEvent",
  kind: "event",
  description: "A progress event of a workflow run, streamed as server-sent events.",
  examples: [
    { index: 0, type: "workflow-start", stepId: null, status: "running", occurredAt: "2026-09-30T12:00:00.000Z" },
    { index: 3, type: "workflow-step-suspended", stepId: "request-human-approval", status: "suspended", occurredAt: "2026-09-30T12:00:01.000Z" },
  ],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "core.workflow-run.read",
});
