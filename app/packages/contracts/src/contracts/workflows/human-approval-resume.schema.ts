import { z } from "zod";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS } from "../example-values.ts";
import { none, personal } from "../field-docs.ts";
import { UserIdSchema } from "../primitives/ids.schema.ts";

/** Kind of the SP1 approval action that resumes a suspended workflow run (decision 0036). */
export const WORKFLOW_RESUME_ACTION_KIND = "workflow-resume";

/** Settled outcomes of an approval request a suspended run can resume with (SP5 spec §3.3). */
export const HUMAN_APPROVAL_DECISIONS = ["approved", "rejected", "expired", "cancelled"] as const;
export const HumanApprovalDecisionSchema = z.enum(HUMAN_APPROVAL_DECISIONS);
export type HumanApprovalDecision = z.infer<typeof HumanApprovalDecisionSchema>;

/** Workflow and step ids: kebab-case, as Mastra ids of the core. */
export const WorkflowIdSchema = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, { error: "Expected a kebab-case workflow id." });

/**
 * `resumeSchema` of the `requestHumanApproval` step. The step never trusts it: it re-reads the
 * SP1 request and requires that its stored status matches `decision` (decision 0036).
 */
export const HumanApprovalResumeSchema = z.strictObject({
  decision: HumanApprovalDecisionSchema.meta(none("How the approval request was settled.")),
  decidedBy: UserIdSchema.optional().meta(personal("Uid of the approver or rejecter, when a person decided.")),
  reason: z.string().trim().min(1).max(500).optional().meta(personal("Reason given with the decision.")),
});
export type HumanApprovalResume = z.infer<typeof HumanApprovalResumeSchema>;

export const HumanApprovalResumeContract = defineContract(HumanApprovalResumeSchema, {
  id: "workflows.HumanApprovalResume",
  kind: "command",
  description: "Data a suspended human-approval step resumes with; checked against the stored approval request.",
  examples: [{ decision: "approved", decidedBy: EXAMPLE_IDS.user }, { decision: "rejected", decidedBy: EXAMPLE_IDS.user, reason: "Wrong project." }, { decision: "expired" }],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
});

/** `suspendSchema` of the step: the SP1 request the run waits for. */
export const HumanApprovalSuspendSchema = z.strictObject({
  approvalRequestId: z.string().min(1).meta(none("SP1 approval request the run waits for.")),
});
export type HumanApprovalSuspend = z.infer<typeof HumanApprovalSuspendSchema>;

/** `action.input` of an SP1 approval request of kind `workflow-resume`. */
export const WorkflowResumeActionInputSchema = z.strictObject({
  workflowId: WorkflowIdSchema.meta(none("Workflow of the suspended run.")),
  runId: z.string().min(1).max(128).meta(none("Suspended run.")),
  stepId: WorkflowIdSchema.meta(none("Step the run is suspended on.")),
});
export type WorkflowResumeActionInput = z.infer<typeof WorkflowResumeActionInputSchema>;

export const WorkflowResumeActionInputContract = defineContract(WorkflowResumeActionInputSchema, {
  id: "workflows.WorkflowResumeActionInput",
  kind: "command",
  description: "Input of an approval action that resumes a suspended workflow run once the request is settled.",
  examples: [{ workflowId: "approval-demo", runId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3", stepId: "request-human-approval" }],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
});
