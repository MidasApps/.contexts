import type { ApprovalRequest, ApprovalStatus } from "@core/contracts";
import { isAtOrBefore } from "../../shared/clock/clock.ts";

/** What can happen to an approval request (SP1 spec §6.5). */
export type ApprovalTransition = "approve" | "reject" | "cancel" | "expire" | "execute" | "fail";

// pending → approved|rejected|cancelled|expired; approved → executed|failed; the rest is terminal.
const TRANSITIONS: Readonly<Partial<Record<ApprovalStatus, Readonly<Partial<Record<ApprovalTransition, ApprovalStatus>>>>>> = {
  pending: { approve: "approved", reject: "rejected", cancel: "cancelled", expire: "expired" },
  approved: { execute: "executed", fail: "failed" },
};

/** The status after `transition`, or null when the transition is not allowed from `from`. */
export const nextApprovalStatus = (from: ApprovalStatus, transition: ApprovalTransition): ApprovalStatus | null =>
  TRANSITIONS[from]?.[transition] ?? null;

/**
 * Status as callers see it: a stored `pending` request past `expiresAt` is `expired` (nothing
 * rewrites it when it expires; a decision attempt does).
 */
export const effectiveApprovalStatus = (request: Pick<ApprovalRequest, "status" | "expiresAt">, now: Date): ApprovalStatus =>
  request.status === "pending" && isAtOrBefore(request.expiresAt, now) ? "expired" : request.status;

/** The request as listed, with its effective status. */
export const approvalView = (request: ApprovalRequest, now: Date): ApprovalRequest => ({ ...request, status: effectiveApprovalStatus(request, now) });
