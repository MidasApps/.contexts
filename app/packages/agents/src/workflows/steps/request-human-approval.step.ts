import {
  type HumanApprovalDecision,
  HumanApprovalResumeSchema,
  HumanApprovalSuspendSchema,
  WORKFLOW_RESUME_ACTION_KIND,
  WorkflowResumeActionInputSchema,
} from "@core/contracts";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { nodeOfContext, readAgentContext } from "../../context/agent-request-context.ts";
import type { WorkflowApprovalPort, WorkflowApprovalRecord } from "../../runtime/runtime-ports.ts";

export const REQUEST_HUMAN_APPROVAL_STEP_ID = "request-human-approval";

/** Bug or tampering: the step cannot know which request it waits for, or runs without a context. */
export class HumanApprovalStepError extends Error {
  readonly code: "CONTEXT_MISSING" | "APPROVAL_REQUEST_MISSING";

  constructor(code: HumanApprovalStepError["code"]) {
    super(`${code}: the human approval step cannot continue`);
    this.name = "HumanApprovalStepError";
    this.code = code;
  }
}

/** What the step adds to its input once the SP1 request is settled. */
export const HumanApprovalOutcomeSchema = z.strictObject({
  approvalRequestId: z.string().min(1),
  decision: HumanApprovalResumeSchema.shape.decision,
  decidedBy: z.string().nullable(),
  reason: z.string().nullable(),
  /** Stored requester: later steps act only for this principal. */
  requestedBy: z.strictObject({ type: z.enum(["user", "device", "service"]), id: z.string().min(1) }),
});
export type HumanApprovalOutcome = z.infer<typeof HumanApprovalOutcomeSchema>;

// `approved` is released by a request SP1 moved to approved (handler running) or executed.
const STATUSES_OF: Readonly<Record<HumanApprovalDecision, readonly string[]>> = {
  approved: ["approved", "executed"],
  rejected: ["rejected"],
  expired: ["expired"],
  cancelled: ["cancelled"],
};

type RunRef = { readonly workflowId: string; readonly runId: string; readonly stepId: string };

/** The stored request must be settled with this decision and name this very run and step. */
export const confirmsDecision = (record: WorkflowApprovalRecord | null, decision: HumanApprovalDecision, run: RunRef): record is WorkflowApprovalRecord => {
  if (record === null || record.kind !== WORKFLOW_RESUME_ACTION_KIND) return false;
  if (!STATUSES_OF[decision].includes(record.status)) return false;
  const action = WorkflowResumeActionInputSchema.safeParse(record.input);
  return action.success && action.data.workflowId === run.workflowId && action.data.runId === run.runId && action.data.stepId === run.stepId;
};

export type RequestHumanApprovalStepOptions<Input extends z.ZodObject> = {
  readonly approvals: WorkflowApprovalPort;
  /** Permission of the action; it must have `requiresApproval` (SP1 refuses otherwise). */
  readonly permission: string;
  /** The step's input (the data the approver judges). */
  readonly inputSchema: Input;
  /** Human-readable summary shown to approvers (≤ 500 chars, no secrets). */
  readonly summarize: (input: z.infer<Input>) => string;
};

/**
 * `requestHumanApproval` (SP5 spec §3.3, decision 0036): creates an SP1 approval request of
 * kind `workflow-resume` as the run's principal, then suspends with its id. On resume it never
 * trusts `resumeData`: the stored request must be settled with the same decision and name this
 * run and step, else the step suspends again. Output: `{ input, approval }`.
 */
export const createRequestHumanApprovalStep = <Input extends z.ZodObject>(options: RequestHumanApprovalStepOptions<Input>) =>
  createStep({
    id: REQUEST_HUMAN_APPROVAL_STEP_ID,
    description: "Asks for a four-eyes approval (SP1 approval request) and waits for its decision.",
    inputSchema: options.inputSchema,
    outputSchema: z.strictObject({ input: options.inputSchema, approval: HumanApprovalOutcomeSchema }),
    suspendSchema: HumanApprovalSuspendSchema,
    resumeSchema: HumanApprovalResumeSchema,
    execute: async ({ inputData, resumeData, suspendData, suspend, requestContext, workflowId, runId }) => {
      const run: RunRef = { workflowId, runId, stepId: REQUEST_HUMAN_APPROVAL_STEP_ID };
      if (resumeData === undefined) {
        const snapshot = readAgentContext(requestContext);
        if (!snapshot.ok) throw new HumanApprovalStepError("CONTEXT_MISSING");
        const { context, principal } = snapshot.data;
        const { approvalId } = await options.approvals.requestWorkflowApproval({
          principal,
          node: nodeOfContext(context),
          permission: options.permission,
          action: run,
          summary: options.summarize(options.inputSchema.parse(inputData)).slice(0, 500),
          requestId: context.requestId,
        });
        return await suspend({ approvalRequestId: approvalId });
      }
      const approvalRequestId = suspendData?.approvalRequestId;
      if (approvalRequestId === undefined) throw new HumanApprovalStepError("APPROVAL_REQUEST_MISSING");
      const record = await options.approvals.getApprovalRequest({ approvalRequestId });
      if (!confirmsDecision(record, resumeData.decision, run)) return await suspend({ approvalRequestId });
      const approval = { approvalRequestId, decision: resumeData.decision, decidedBy: record.decidedBy, reason: record.reason, requestedBy: record.requestedBy };
      return { input: inputData, approval };
    },
  });
