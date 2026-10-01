import type { ApprovalRequest, ApprovalRequestId } from "@core/contracts";
import { approvalView, effectiveApprovalStatus, nextApprovalStatus } from "../../domain/approval-state.ts";
import type { ApprovalDeps } from "../approval-deps.ts";

/** Requests a sweep handles per run; the next scheduled run picks up the rest. */
export const APPROVAL_SWEEP_BATCH = 200;
/** Decision 0030 A3: `approved` for longer than this means the execution was interrupted. */
export const INTERRUPTED_AFTER_MS = 15 * 60_000;
export const EXECUTION_INTERRUPTED = "EXECUTION_INTERRUPTED";

const SYSTEM = { type: "system", id: "system" } as const;

export type GetApprovalRequest = (id: ApprovalRequestId) => Promise<ApprovalRequest | null>;
export type ExpireApprovalRequests = (args: { requestId: string; limit?: number }) => Promise<{ expired: number }>;
export type FailInterruptedApprovals = (args: { requestId: string; limit?: number }) => Promise<{ failed: number }>;

/**
 * System read of one request with its effective status (decision 0036). The workflow HITL step
 * and the settle route verify decisions against it. No authorization: the callers are server
 * code that only act on what SP1 already decided.
 */
export const makeGetApprovalRequest =
  (deps: Pick<ApprovalDeps, "approvals" | "clock">): GetApprovalRequest =>
  async (id) => {
    const request = await deps.approvals.get(undefined, id);
    return request === null ? null : approvalView(request, deps.clock.now());
  };

/**
 * `approval-expiry-sweep` (SP5 spec §3.3): stores `expired` on pending requests past
 * `expiresAt`, one transaction each after a re-read, so a decision that won the race is kept,
 * with an `APPROVAL_EXPIRED` audit entry by the system in the same transaction (SP5 Task 7).
 * The settle trigger then resumes a `workflow-resume` request's run with `expired`.
 */
export const makeExpireApprovalRequests =
  (deps: ApprovalDeps): ExpireApprovalRequests =>
  async ({ requestId, limit = APPROVAL_SWEEP_BATCH }) => {
    const now = deps.clock.now();
    const candidates = await deps.approvals.listByStatusBefore({ status: "pending", field: "expiresAt", before: now.toISOString(), limit });
    let expired = 0;
    for (const candidate of candidates) {
      const changed = await deps.unitOfWork.run(async (tx) => {
        const current = await deps.approvals.get(tx, candidate.id);
        if (current === null || current.status !== "pending" || effectiveApprovalStatus(current, now) !== "expired") return false;
        deps.approvals.setStatus(tx, { id: current.id, status: "expired", updatedAt: now.toISOString(), actorId: SYSTEM.id });
        await deps.audit.record(
          {
            log: "tenant",
            tenantId: current.tenantId,
            action: "APPROVAL_EXPIRED",
            actor: SYSTEM,
            target: { type: "approval-request", id: current.id },
            node: current.node,
            outcome: "success",
            requestId,
          },
          tx,
        );
        return true;
      });
      if (changed) expired += 1;
    }
    return { expired };
  };

/**
 * Decision 0030 A3: a request still `approved` 15 min after `updatedAt` was interrupted between
 * its approval and its execution record. It becomes `failed` with `EXECUTION_INTERRUPTED` and an
 * `APPROVAL_FAILED` audit entry, in one transaction; its handler never runs again.
 */
export const makeFailInterruptedApprovals =
  (deps: ApprovalDeps): FailInterruptedApprovals =>
  async ({ requestId, limit = APPROVAL_SWEEP_BATCH }) => {
    const now = deps.clock.now();
    const cutoff = new Date(now.getTime() - INTERRUPTED_AFTER_MS).toISOString();
    const candidates = await deps.approvals.listByStatusBefore({ status: "approved", field: "updatedAt", before: cutoff, limit });
    let failed = 0;
    for (const candidate of candidates) {
      const changed = await deps.unitOfWork.run(async (tx) => {
        const current = await deps.approvals.get(tx, candidate.id);
        if (current === null || Date.parse(current.updatedAt) > Date.parse(cutoff)) return false;
        const status = nextApprovalStatus(current.status, "fail");
        if (status === null) return false;
        deps.approvals.setStatus(tx, { id: current.id, status, updatedAt: now.toISOString(), actorId: SYSTEM.id });
        await deps.audit.record(
          {
            log: "tenant",
            tenantId: current.tenantId,
            action: "APPROVAL_FAILED",
            actor: SYSTEM,
            target: { type: "approval-request", id: current.id },
            node: current.node,
            outcome: "failed",
            requestId,
            metadata: { errorCode: EXECUTION_INTERRUPTED },
          },
          tx,
        );
        return true;
      });
      if (changed) failed += 1;
    }
    return { failed };
  };
