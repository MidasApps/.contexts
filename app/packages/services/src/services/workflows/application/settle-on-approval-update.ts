import { ApprovalStatusSchema, WORKFLOW_RESUME_ACTION_KIND } from "@core/contracts";
import { z } from "zod";
import type { Logger } from "../../shared/observability/logger.ts";
import type { WorkflowApprovalSettler } from "./ports/workflow-approval-settler.ts";
import { WorkflowApprovalError } from "./workflow-approval-error.ts";

/** Outcomes the trigger settles; approvals belong to the SP1 handler (decision 0036). */
export const TRIGGER_SETTLED_STATUSES: readonly string[] = ["rejected", "expired", "cancelled"];

// Only the two fields the decision needs; the rest of the document is not read.
const SettledDocSchema = z.looseObject({ status: ApprovalStatusSchema, action: z.looseObject({ kind: z.string() }) });

export type ApprovalUpdate = {
  readonly approvalRequestId: string;
  /** Raw Firestore data before and after the write (undefined for a create or a delete). */
  readonly before: unknown;
  readonly after: unknown;
  /** Correlation of the trigger event. */
  readonly requestId: string;
};

export type SettleOnUpdateOutcome = "settled" | "skipped" | "ignored";

/**
 * Body of the `onApprovalRequestSettled` Functions trigger: when a `workflow-resume` request moves
 * to `rejected`, `expired` or `cancelled`, asks the agent runtime to settle it (the run resumes on
 * `record`). Idempotent (a run that no longer waits is `skipped`); a gateway failure throws, so
 * the event is retried.
 */
export const makeSettleOnApprovalUpdate =
  (deps: { readonly settler: WorkflowApprovalSettler; readonly logger: Pick<Logger, "info"> }) =>
  async (update: ApprovalUpdate): Promise<SettleOnUpdateOutcome> => {
    const after = SettledDocSchema.safeParse(update.after);
    if (!after.success || after.data.action.kind !== WORKFLOW_RESUME_ACTION_KIND) return "ignored";
    const before = SettledDocSchema.safeParse(update.before);
    if (before.success && before.data.status === after.data.status) return "ignored";
    if (!TRIGGER_SETTLED_STATUSES.includes(after.data.status)) return "ignored";
    const result = await deps.settler.settle({ approvalRequestId: update.approvalRequestId, requestId: update.requestId });
    if (!result.ok) throw new WorkflowApprovalError("UPSTREAM_UNAVAILABLE", update.approvalRequestId);
    const outcome = result.data.settled ? "settled" : "skipped";
    deps.logger.info("workflow_approval_trigger_settled", { requestId: update.requestId, approvalRequestId: update.approvalRequestId, status: after.data.status, outcome });
    return outcome;
  };
