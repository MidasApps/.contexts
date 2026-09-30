import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS, EXAMPLE_TIMES } from "../example-values.ts";
import { none, personal } from "../field-docs.ts";
import { TenantIdSchema, UserIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { WorkflowIdSchema } from "./human-approval-resume.schema.ts";

/** Mastra run statuses (`@mastra/core` 1.71) plus the in-flight ones. */
export const WORKFLOW_RUN_STATUSES = ["pending", "running", "waiting", "suspended", "paused", "success", "failed", "canceled", "tripwire"] as const;
export const WorkflowRunStatusSchema = z.enum(WORKFLOW_RUN_STATUSES);
export type WorkflowRunStatus = z.infer<typeof WorkflowRunStatusSchema>;

/** A workflow run as `/v1/workflows/runs` lists it (tenant from `resourceId`, decision 0040). */
export const WorkflowRunSchema = z.strictObject({
  runId: z.string().min(1).max(128).meta(none("Run id.")),
  workflowId: WorkflowIdSchema.meta(none("Workflow of the run.")),
  tenantId: TenantIdSchema.meta(none("Organization the run belongs to.")),
  status: WorkflowRunStatusSchema.meta(none("Run status.")),
  startedBy: UserIdSchema.nullable().meta(personal("User who started the run; null for platform schedules.")),
  scheduleId: z.string().min(1).nullable().meta(none("Schedule that started the run, if any.")),
  approvalRequestId: z.string().min(1).nullable().meta(none("Approval request a suspended run waits for, if any.")),
  createdAt: IsoDateTimeSchema.meta(none("When the run started (UTC).")),
  updatedAt: IsoDateTimeSchema.meta(none("When the run last changed (UTC).")),
});
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;

export const WorkflowRunContract = defineContract(WorkflowRunSchema, {
  id: "workflows.WorkflowRun",
  kind: "view",
  description: "A run of a workflow in an organization, with its status and what it waits for.",
  examples: [
    {
      runId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
      workflowId: "approval-demo",
      tenantId: EXAMPLE_IDS.organization,
      status: "suspended",
      startedBy: EXAMPLE_IDS.user,
      scheduleId: null,
      approvalRequestId: EXAMPLE_IDS.approvalRequest,
      createdAt: EXAMPLE_TIMES.created,
      updatedAt: EXAMPLE_TIMES.updated,
    },
  ],
  pii: "personal",
  tenancyScope: "organization",
  relations: [{ target: "tenancy.Organization", type: "belongs-to", field: "tenantId" }],
  permission: "core.workflow-run.read",
});

export const StartWorkflowRunInputSchema = z.strictObject({
  inputData: z.record(z.string(), z.unknown()).meta(personal("Workflow input; validated by the workflow's own schema on the server.")),
});
export type StartWorkflowRunInput = z.infer<typeof StartWorkflowRunInputSchema>;

export const StartWorkflowRunInputContract = defineContract(StartWorkflowRunInputSchema, {
  id: "workflows.StartWorkflowRunInput",
  kind: "command",
  description: "Starts a run of a startable workflow in the active organization.",
  examples: [{ inputData: { title: "Supplier follow-up", body: "Call about the invoice." } }],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "core.workflow-run.start",
});
