import type { ApprovalRequest } from "@core/contracts";
import { auditActorOf } from "#/services/audit/domain/audit-actor.ts";
import type { Result } from "#/services/shared/result/result.ts";
import { type DecideCommand, type DecisionError, decidePending, loadDecidable } from "../approval-decision.ts";
import type { ApprovalDeps } from "../approval-deps.ts";

export type RejectRequest = (command: DecideCommand) => Promise<Result<ApprovalRequest, DecisionError>>;

/**
 * `POST /v1/approval-requests/{approvalRequestId}/reject` (SP1 spec §6.5): the same checks as
 * approving (four eyes, `core.approval.decide` plus the action's permission); pending →
 * rejected in one transaction with `APPROVAL_REJECTED` (409 when no longer pending).
 */
export const makeRejectRequest =
  (deps: ApprovalDeps): RejectRequest =>
  async (command) => {
    const decidable = await loadDecidable(deps, command);
    if (!decidable.ok) return decidable;
    const auditActor = auditActorOf(command.actor);
    return deps.unitOfWork.run(async (tx) => {
      const decided = await decidePending(tx, deps, {
        id: command.approvalRequestId,
        transition: "reject",
        decidedBy: command.actor.uid,
        reason: command.reason ?? null,
        actorId: auditActor.id,
      });
      if (!decided.ok) return decided;
      const { tenantId, node, id } = decided.data;
      const reason = command.reason === undefined ? {} : { reason: command.reason };
      await deps.audit.record(
        {
          log: "tenant",
          tenantId,
          action: "APPROVAL_REJECTED",
          actor: auditActor,
          target: { type: "approval-request", id },
          node,
          outcome: "success",
          requestId: command.requestId,
          ...reason,
        },
        tx,
      );
      return decided;
    });
  };
