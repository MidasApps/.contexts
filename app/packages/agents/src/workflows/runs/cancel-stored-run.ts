import type { Logger } from "@core/services";
import type { Mastra } from "@mastra/core/mastra";
import type { WorkflowApprovalPort } from "../../runtime/runtime-ports.ts";
import { type StoredRun, waitingApprovalRequestIdOf } from "./workflow-run-view.ts";

export type CancelStoredRunOptions = {
  readonly approvals: Pick<WorkflowApprovalPort, "cancelWorkflowApproval">;
  /** Correlation of the cancel; the approval's audit entry carries it. */
  readonly requestId: string;
  readonly logger: Pick<Logger, "error">;
};

/**
 * Cancels a stored run and then the SP1 approval request it waits for, if any (follow-up 82), so
 * approvers stop seeing it and a later decision answers 409. The run goes first: the settle
 * trigger reacts to the `cancelled` request by resuming the run, and finds it no longer suspended.
 * The run cancel cannot be undone, so a failed request cancel is logged, not thrown; the request
 * then expires on its own (approval-expiry-sweep) and its settle is skipped the same way.
 */
export const cancelStoredRun = async (
  mastra: Mastra,
  run: StoredRun,
  options: CancelStoredRunOptions,
): Promise<{ readonly approvalRequestCancelled: boolean }> => {
  const live = await mastra
    .getWorkflow(run.workflowName)
    .createRun({ runId: run.runId, ...(run.resourceId === undefined ? {} : { resourceId: run.resourceId }) });
  await live.cancel();
  const approvalRequestId = waitingApprovalRequestIdOf(run);
  if (approvalRequestId === null) return { approvalRequestCancelled: false };
  try {
    const { cancelled } = await options.approvals.cancelWorkflowApproval({
      approvalRequestId,
      runId: run.runId,
      requestId: options.requestId,
    });
    return { approvalRequestCancelled: cancelled };
  } catch (error: unknown) {
    options.logger.error("workflow_run_approval_cancel_failed", {
      requestId: options.requestId,
      runId: run.runId,
      approvalRequestId,
      err: error,
    });
    return { approvalRequestCancelled: false };
  }
};
