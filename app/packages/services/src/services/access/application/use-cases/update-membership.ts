import { type Membership, type MembershipId, type RoleRef, UserIdSchema, type UserPrincipal } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import { auditActorOf } from "#/services/audit/domain/audit-actor.ts";
import { err, ok, type Result } from "#/services/shared/result/result.ts";
import type { RequestAccess } from "../../composition.ts";
import { AccessNotFoundError } from "../../domain/errors/access-not-found-error.ts";
import { LastOwnerError } from "../../domain/errors/last-owner-error.ts";
import { holdsOwner } from "../../domain/role-permissions.ts";
import type { AccessWriteDeps } from "../access-write-deps.ts";
import { checkGrantable, type GrantCheckError, requireWithinActor } from "../grant-checks.ts";
import { organizationGone, readPrincipalState, writePrincipalState } from "../membership-writes.ts";
import { wouldLoseLastOwner } from "./last-owner-guard.ts";

export type UpdateMembershipCommand = {
  readonly actor: UserPrincipal;
  readonly access: RequestAccess;
  readonly membershipId: MembershipId;
  readonly roles: readonly RoleRef[];
  readonly requestId: string;
};

export type UpdateMembershipError = GrantCheckError | AccessNotFoundError | LastOwnerError;

export type UpdateMembership = (command: UpdateMembershipCommand) => Promise<Result<Membership, UpdateMembershipError>>;

const applyUpdate = async (
  tx: Transaction,
  deps: AccessWriteDeps,
  command: UpdateMembershipCommand,
): Promise<Result<Membership, UpdateMembershipError>> => {
  const membership = await deps.memberships.get(tx, command.membershipId);
  if (membership === null) return err(new AccessNotFoundError("membership"));
  const principal = { type: membership.principalType, id: membership.principalId };
  const [state, losesOwner] = await Promise.all([
    readPrincipalState(tx, deps, { tenantId: membership.tenantId, principal }),
    holdsOwner(command.roles) ? Promise.resolve(false) : wouldLoseLastOwner(tx, deps, membership),
  ]);
  if (!state.tenantLive) return err(organizationGone());
  if (losesOwner) return err(new LastOwnerError(membership.tenantId));
  const now = deps.clock.now().toISOString();
  const next: Membership = { ...membership, roles: [...command.roles], updatedAt: now };
  const actor = auditActorOf(command.actor);
  deps.memberships.updateRoles(tx, { id: membership.id, roles: next.roles, updatedAt: now, actorId: actor.id });
  const grants = state.live.map((grant) => (grant.id === next.id ? next : grant));
  writePrincipalState(tx, deps, { tenantId: membership.tenantId, principal, state, grants, actorId: actor.id, now });
  await deps.audit.record(
    {
      log: "tenant",
      tenantId: membership.tenantId,
      action: "MEMBERSHIP_UPDATED",
      actor,
      target: { type: "membership", id: membership.id },
      node: membership.node,
      outcome: "success",
      requestId: command.requestId,
      changes: ["roles"],
    },
    tx,
  );
  return ok(next);
};

/**
 * Replaces the roles of a grant: `core.member.update` at its node, no escalation, and
 * the organization keeps at least one owner (422 LAST_OWNER). Same transaction shape as
 * a grant; claims are synced after commit.
 */
export const makeUpdateMembership =
  (deps: AccessWriteDeps): UpdateMembership =>
  async (command) => {
    const current = await deps.memberships.get(undefined, command.membershipId);
    if (current === null) return err(new AccessNotFoundError("membership"));
    const grantable = await checkGrantable(deps, { ...command, permission: "core.member.update", node: current.node });
    if (!grantable.ok) return grantable;
    const within = await requireWithinActor(deps, { ...command, grants: [current] });
    if (!within.ok) return within;
    const updated = await deps.unitOfWork.run((tx) => applyUpdate(tx, deps, command));
    if (updated.ok && updated.data.principalType === "user")
      await deps.syncClaims(UserIdSchema.parse(updated.data.principalId));
    return updated;
  };
