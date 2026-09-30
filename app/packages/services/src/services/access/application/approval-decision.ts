import type { ApprovalRequest, ApprovalRequestId, Principal, UserPrincipal } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import { err, ok, type Result } from "../../shared/result/result.ts";
import type { RequestAccess } from "../composition.ts";
import { effectiveApprovalStatus, nextApprovalStatus, type ApprovalTransition } from "../domain/approval-state.ts";
import { AccessDeniedError } from "../domain/errors/access-denied-error.ts";
import { ApprovalNotFoundError, ApprovalNotPendingError } from "../domain/errors/approval-errors.ts";
import { SelfApprovalForbiddenError } from "../domain/errors/self-approval-forbidden-error.ts";
import { resolveRequester, type ApprovalDeps } from "./approval-deps.ts";

export type DecideCommand = {
  readonly actor: UserPrincipal;
  readonly access: RequestAccess;
  readonly approvalRequestId: ApprovalRequestId;
  readonly reason?: string | undefined;
  readonly requestId: string;
};

export type DecisionError = AccessDeniedError | ApprovalNotFoundError | SelfApprovalForbiddenError | ApprovalNotPendingError;

export type Decidable = { readonly request: ApprovalRequest; readonly requester: Principal | null };

// Four eyes: the requesting user, or the owner of the requesting API key, never decides.
const isRequester = (actor: UserPrincipal, request: ApprovalRequest, requester: Principal | null): boolean =>
  (request.requestedBy.type === "user" && request.requestedBy.id === actor.uid) || (requester?.type === "service" && requester.ownerUid === actor.uid);

const allowedAt = async (command: DecideCommand, request: ApprovalRequest, permission: string): Promise<boolean> =>
  (await command.access.authorize({ principal: command.actor, permission, node: request.node })).allowed;

/**
 * Checks everything a decision needs before its transaction (SP1 spec §6.5): not under
 * impersonation (read-only), the request visible (`core.approval.read`, else 404), the actor
 * is not the requester (403 SELF_APPROVAL_FORBIDDEN), and holds `core.approval.decide` and
 * the action's permission at the request's node (403 FORBIDDEN).
 */
export const loadDecidable = async (deps: ApprovalDeps, command: DecideCommand): Promise<Result<Decidable, DecisionError>> => {
  const { actor } = command;
  if (actor.impersonation !== undefined) return err(new AccessDeniedError("IMPERSONATION_READ_ONLY"));
  const request = await deps.approvals.get(undefined, command.approvalRequestId);
  if (request === null) return err(new ApprovalNotFoundError());
  const organization = { level: "organization", tenantId: request.tenantId } as const;
  if (!(await command.access.authorize({ principal: actor, permission: "core.approval.read", node: organization })).allowed) return err(new ApprovalNotFoundError());
  const requester = await resolveRequester(deps, request);
  if (isRequester(actor, request, requester)) return err(new SelfApprovalForbiddenError());
  const mayDecide = (await allowedAt(command, request, "core.approval.decide")) && (await allowedAt(command, request, request.permission));
  return mayDecide ? ok({ request, requester }) : err(new AccessDeniedError("PERMISSION_NOT_GRANTED"));
};

type Transition = {
  readonly id: ApprovalRequestId;
  readonly transition: Extract<ApprovalTransition, "approve" | "reject">;
  readonly decidedBy: UserPrincipal["uid"];
  readonly reason: string | null;
  readonly actorId: string;
};

/**
 * Inside `tx`: re-reads the request and moves it out of `pending` (409 when it is no longer
 * pending; a pending request found past its expiry is stored as `expired` first).
 * @returns the request as written.
 */
export const decidePending = async (tx: Transaction, deps: ApprovalDeps, args: Transition): Promise<Result<ApprovalRequest, ApprovalNotFoundError | ApprovalNotPendingError>> => {
  const current = await deps.approvals.get(tx, args.id);
  if (current === null) return err(new ApprovalNotFoundError());
  const now = deps.clock.now().toISOString();
  const effective = effectiveApprovalStatus(current, deps.clock.now());
  if (effective !== "pending") {
    if (current.status === "pending") deps.approvals.setStatus(tx, { id: current.id, status: "expired", updatedAt: now, actorId: args.actorId });
    return err(new ApprovalNotPendingError());
  }
  const status = nextApprovalStatus("pending", args.transition);
  if (status === null) return err(new ApprovalNotPendingError());
  deps.approvals.setStatus(tx, { id: current.id, status, decidedBy: args.decidedBy, reason: args.reason, updatedAt: now, actorId: args.actorId });
  return ok({ ...current, status, decidedBy: args.decidedBy, reason: args.reason, updatedAt: now });
};
