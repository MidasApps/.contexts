import { ApprovalFailureCodeSchema, type ApprovalRequest, type Principal, type UserPrincipal } from "@core/contracts";
import { auditActorOf } from "#/services/audit/domain/audit-actor.ts";
import { err, ok, type Result } from "#/services/shared/result/result.ts";
import { nextApprovalStatus } from "../../domain/approval-state.ts";
import { type DecideCommand, type DecisionError, decidePending, loadDecidable } from "../approval-decision.ts";
import type { ApprovalDeps } from "../approval-deps.ts";

export type ApproveRequest = (command: DecideCommand) => Promise<Result<ApprovalRequest, DecisionError>>;

type Execution = { readonly status: "executed" } | { readonly status: "failed"; readonly errorCode: string };

// Only a stable code reaches the request (decision 0067); anything else reads as the generic one.
const errorCodeOf = (error: unknown): string => {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  const parsed = ApprovalFailureCodeSchema.safeParse(code);
  return parsed.success ? parsed.data : "APPROVAL_HANDLER_FAILED";
};

// The one execution of an approved request; a handler error is recorded, never rethrown.
const execute = async (
  deps: ApprovalDeps,
  args: { request: ApprovalRequest; requester: Principal | null; approver: UserPrincipal; requestId: string },
): Promise<Execution> => {
  const handler = deps.handlers.get(args.request.action.kind);
  if (handler === undefined) return { status: "failed", errorCode: "UNKNOWN_APPROVAL_ACTION" };
  try {
    await handler.run(args.request.action.input, {
      request: args.request,
      requester: args.requester,
      approver: args.approver,
      requestId: args.requestId,
    });
    return { status: "executed" };
  } catch (error: unknown) {
    deps.logger.error("approval_execution_failed", {
      requestId: args.requestId,
      approvalRequestId: args.request.id,
      kind: args.request.action.kind,
      err: error,
    });
    return { status: "failed", errorCode: errorCodeOf(error) };
  }
};

// approved → executed|failed in a transaction, with its audit entry.
const recordExecution = (
  deps: ApprovalDeps,
  approved: ApprovalRequest,
  execution: Execution,
  requestId: string,
): Promise<ApprovalRequest> =>
  deps.unitOfWork.run(async (tx) => {
    const current = (await deps.approvals.get(tx, approved.id)) ?? approved;
    const status = nextApprovalStatus(current.status, execution.status === "executed" ? "execute" : "fail");
    if (status === null) return current;
    const updatedAt = deps.clock.now().toISOString();
    // Decision 0067: the failed request keeps its safe code and the request id that logged the error.
    const failure = execution.status === "failed" ? { failure: { code: execution.errorCode, requestId } } : {};
    deps.approvals.setStatus(tx, { id: current.id, status, ...failure, updatedAt, actorId: "system" });
    await deps.audit.record(
      {
        log: "tenant",
        tenantId: current.tenantId,
        action: execution.status === "executed" ? "APPROVAL_EXECUTED" : "APPROVAL_FAILED",
        actor: { type: "system", id: "system" },
        target: { type: "approval-request", id: current.id },
        node: current.node,
        outcome: execution.status === "executed" ? "success" : "failed",
        requestId,
        ...(execution.status === "failed" ? { metadata: { errorCode: execution.errorCode } } : {}),
      },
      tx,
    );
    return { ...current, status, ...failure, updatedAt };
  });

/**
 * `POST /v1/approval-requests/{approvalRequestId}/approve` (SP1 spec §6.5): four eyes and
 * `core.approval.decide` plus the action's permission (see `loadDecidable`), then one
 * transaction moves pending → approved (audited `APPROVAL_APPROVED`, 409 when no longer
 * pending) and only the caller that won it runs the handler, at most once; the outcome is
 * recorded as executed or failed. A crash between the two leaves the request `approved`
 * and never re-executes it.
 */
export const makeApproveRequest =
  (deps: ApprovalDeps): ApproveRequest =>
  async (command) => {
    const decidable = await loadDecidable(deps, command);
    if (!decidable.ok) return decidable;
    const { actor, requestId } = command;
    const auditActor = auditActorOf(actor);
    const approved = await deps.unitOfWork.run(async (tx) => {
      const decided = await decidePending(tx, deps, {
        id: command.approvalRequestId,
        transition: "approve",
        decidedBy: actor.uid,
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
          action: "APPROVAL_APPROVED",
          actor: auditActor,
          target: { type: "approval-request", id },
          node,
          outcome: "success",
          requestId,
          ...reason,
        },
        tx,
      );
      return decided;
    });
    if (!approved.ok) return err(approved.error);
    const execution = await execute(deps, {
      request: approved.data,
      requester: decidable.data.requester,
      approver: actor,
      requestId,
    });
    return ok(await recordExecution(deps, approved.data, execution, requestId));
  };
