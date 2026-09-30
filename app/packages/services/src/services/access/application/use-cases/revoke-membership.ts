import { UserIdSchema, type MembershipId, type Principal } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import { auditActorOf } from "../../../audit/domain/audit-actor.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import type { RequestAccess } from "../../composition.ts";
import type { AccessDeniedError } from "../../domain/errors/access-denied-error.ts";
import type { EscalationForbiddenError } from "../../domain/errors/escalation-forbidden-error.ts";
import { AccessNotFoundError } from "../../domain/errors/access-not-found-error.ts";
import { LastOwnerError } from "../../domain/errors/last-owner-error.ts";
import type { AccessWriteDeps } from "../access-write-deps.ts";
import { requirePermission, requireWithinActor } from "../grant-checks.ts";
import { organizationGone, readPrincipalState, writePrincipalState } from "../membership-writes.ts";
import { wouldLoseLastOwner } from "./last-owner-guard.ts";

export type RevokeMembershipCommand = {
  readonly actor: Principal;
  readonly access: RequestAccess;
  readonly membershipId: MembershipId;
  readonly requestId: string;
};

export type RevokeMembershipError = AccessDeniedError | AccessNotFoundError | LastOwnerError | EscalationForbiddenError;

export type RevokeMembership = (command: RevokeMembershipCommand) => Promise<Result<void, RevokeMembershipError>>;

const applyRevoke = async (tx: Transaction, deps: AccessWriteDeps, command: RevokeMembershipCommand): Promise<Result<void, RevokeMembershipError>> => {
  const membership = await deps.memberships.get(tx, command.membershipId);
  if (membership === null) return err(new AccessNotFoundError("membership"));
  const principal = { type: membership.principalType, id: membership.principalId };
  const [state, losesOwner] = await Promise.all([
    readPrincipalState(tx, deps, { tenantId: membership.tenantId, principal }),
    wouldLoseLastOwner(tx, deps, membership),
  ]);
  if (!state.tenantLive) return err(organizationGone());
  if (losesOwner) return err(new LastOwnerError(membership.tenantId));
  const now = deps.clock.now().toISOString();
  const actor = auditActorOf(command.actor);
  deps.memberships.softDelete(tx, { id: membership.id, deletedAt: now, actorId: actor.id });
  const grants = state.live.filter((grant) => grant.id !== membership.id);
  writePrincipalState(tx, deps, { tenantId: membership.tenantId, principal, state, grants, actorId: actor.id, now });
  await deps.audit.record(
    {
      log: "tenant",
      tenantId: membership.tenantId,
      action: "MEMBERSHIP_REVOKED",
      actor,
      target: { type: "membership", id: membership.id },
      node: membership.node,
      outcome: "success",
      requestId: command.requestId,
    },
    tx,
  );
  return ok(undefined);
};

/**
 * Soft-deletes a grant (`core.member.remove` at its node); the last owner grant of an
 * organization cannot go (422 LAST_OWNER). Rebuilds the projection from the remaining
 * grants in the same transaction and syncs claims after commit.
 */
export const makeRevokeMembership =
  (deps: AccessWriteDeps): RevokeMembership =>
  async (command) => {
    const current = await deps.memberships.get(undefined, command.membershipId);
    if (current === null) return err(new AccessNotFoundError("membership"));
    const allowed = await requirePermission({ ...command, permission: "core.member.remove", node: current.node });
    if (!allowed.ok) return allowed;
    const within = await requireWithinActor(deps, { ...command, grants: [current] });
    if (!within.ok) return within;
    const revoked = await deps.unitOfWork.run((tx) => applyRevoke(tx, deps, command));
    if (revoked.ok && current.principalType === "user") await deps.syncClaims(UserIdSchema.parse(current.principalId));
    return revoked;
  };
