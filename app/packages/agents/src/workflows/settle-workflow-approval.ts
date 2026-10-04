import {
  type HumanApprovalDecision,
  type HumanApprovalResume,
  WORKFLOW_RESUME_ACTION_KIND,
  WorkflowResumeActionInputSchema,
} from "@core/contracts";
import type { Mastra } from "@mastra/core/mastra";
import { RequestContext } from "@mastra/core/request-context";
import type { WorkflowApprovalPort, WorkflowApprovalRecord } from "../runtime/runtime-ports.ts";

/** Why a settle did nothing: the request is still undecided (or failed), or the run no longer waits. */
export type SettleSkipReason = "NOT_SETTLED" | "NOT_SUSPENDED";

export type SettleWorkflowApprovalResult =
  | {
      readonly ok: true;
      readonly data:
        | { readonly settled: true; readonly runStatus: string }
        | { readonly settled: false; readonly reason: SettleSkipReason };
    }
  | { readonly ok: false; readonly error: { readonly code: "NOT_FOUND" } };

// Stored status → the decision the run resumes with; pending and failed requests settle nothing.
const DECISION_OF: Readonly<Partial<Record<WorkflowApprovalRecord["status"], HumanApprovalDecision>>> = {
  approved: "approved",
  executed: "approved",
  rejected: "rejected",
  expired: "expired",
  cancelled: "cancelled",
};

const resumeDataOf = (record: WorkflowApprovalRecord, decision: HumanApprovalDecision): HumanApprovalResume => ({
  decision,
  ...(record.decidedBy === null ? {} : { decidedBy: record.decidedBy as HumanApprovalResume["decidedBy"] & string }),
  ...(record.reason === null ? {} : { reason: record.reason }),
});

const NOT_SUSPENDED_MESSAGES = [/was not suspended/, /No suspended steps/];

// The run moved on (resumed, finished, cancelled) or another caller claimed this suspension.
const isNotSuspended = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  if ("id" in error && error.id === "WORKFLOW_RESUME_ALREADY_CLAIMED") return true;
  const message = error instanceof Error ? error.message : "";
  return NOT_SUSPENDED_MESSAGES.some((pattern) => pattern.test(message));
};

const ok = (
  data: { settled: true; runStatus: string } | { settled: false; reason: SettleSkipReason },
): SettleWorkflowApprovalResult => ({ ok: true, data });
const NOT_FOUND: SettleWorkflowApprovalResult = { ok: false, error: { code: "NOT_FOUND" } };

const workflowOf = (mastra: Pick<Mastra, "getWorkflow">, workflowId: string) => {
  try {
    return mastra.getWorkflow(workflowId);
  } catch {
    // Mastra throws for an unknown workflow id.
    return undefined;
  }
};

/**
 * Applies a settled SP1 approval request to its suspended run (decision 0036). The only input is
 * the request id: the decision and `decidedBy` come from the stored request, and the run resumes
 * in process with an **empty** request context, so Mastra restores the snapshot's context and the
 * remaining steps run as the requester. Idempotent: a run that no longer waits answers
 * `NOT_SUSPENDED`. Infrastructure errors reject.
 */
export const settleWorkflowApproval = async (args: {
  readonly mastra: Pick<Mastra, "getWorkflow">;
  readonly approvals: Pick<WorkflowApprovalPort, "getApprovalRequest">;
  readonly approvalRequestId: string;
}): Promise<SettleWorkflowApprovalResult> => {
  const record = await args.approvals.getApprovalRequest({ approvalRequestId: args.approvalRequestId });
  if (record === null || record.kind !== WORKFLOW_RESUME_ACTION_KIND) return NOT_FOUND;
  const action = WorkflowResumeActionInputSchema.safeParse(record.input);
  if (!action.success) return NOT_FOUND;
  const decision = DECISION_OF[record.status];
  if (decision === undefined) return ok({ settled: false, reason: "NOT_SETTLED" });
  const workflow = workflowOf(args.mastra, action.data.workflowId);
  if (workflow === undefined) return NOT_FOUND;
  const run = await workflow.createRun({ runId: action.data.runId });
  try {
    const result = await run.resume({
      step: action.data.stepId,
      resumeData: resumeDataOf(record, decision),
      requestContext: new RequestContext(),
    });
    return ok({ settled: true, runStatus: result.status });
  } catch (error: unknown) {
    if (isNotSuspended(error)) return ok({ settled: false, reason: "NOT_SUSPENDED" });
    throw error;
  }
};
