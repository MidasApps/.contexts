import type { Principal, TenantId, UserId } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import { auditActorOf } from "#/services/audit/domain/audit-actor.ts";
import { err, ok, type Result } from "#/services/shared/result/result.ts";
import type { RequestAccess } from "../../composition.ts";
import type { AccessDeniedError } from "../../domain/errors/access-denied-error.ts";
import { AccessNotFoundError } from "../../domain/errors/access-not-found-error.ts";
import type { EscalationForbiddenError } from "../../domain/errors/escalation-forbidden-error.ts";
import { LastOwnerError } from "../../domain/errors/last-owner-error.ts";
import { holdsOwner } from "../../domain/role-permissions.ts";
import { requirePermission, requireWithinActor } from "../grant-checks.ts";
import type { MemberDeps } from "../member-deps.ts";
import { organizationGone, readPrincipalState, writePrincipalState } from "../membership-writes.ts";

export type RemoveMemberCommand = {
  readonly actor: Principal;
  readonly access: RequestAccess;
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly requestId: string;
};

export type RemoveMemberError = AccessDeniedError | AccessNotFoundError | LastOwnerError | EscalationForbiddenError;

export type RemoveMember = (command: RemoveMemberCommand) => Promise<Result<void, RemoveMemberError>>;

// A member holds one grant per node; more than this many is not a real tenant shape.
const MAX_GRANTS_CHECKED = 100;

type Deps = Pick<
  MemberDeps,
  | "memberships"
  | "projections"
  | "users"
  | "tenantGuard"
  | "audit"
  | "clock"
  | "unitOfWork"
  | "syncClaims"
  | "apiKeys"
  | "logger"
  | "registry"
  | "roleReader"
>;

const applyRemoval = async (
  tx: Transaction,
  deps: Deps,
  command: RemoveMemberCommand,
): Promise<Result<void, RemoveMemberError>> => {
  const { tenantId, userId } = command;
  const principal = { type: "user" as const, id: userId };
  const [state, owners] = await Promise.all([
    readPrincipalState(tx, deps, { tenantId, principal }),
    deps.memberships.listOrganizationOwners(tx, tenantId),
  ]);
  if (!state.tenantLive) return err(organizationGone());
  const grants = state.live.filter((grant) => grant.principalType === "user");
  if (grants.length === 0) return err(new AccessNotFoundError("member"));
  const ownsTenant = grants.some((grant) => grant.node.level === "organization" && holdsOwner(grant.roles));
  if (ownsTenant && owners.every((owner) => owner.principalId === userId)) return err(new LastOwnerError(tenantId));
  const now = deps.clock.now().toISOString();
  const actor = auditActorOf(command.actor);
  for (const grant of grants) deps.memberships.softDelete(tx, { id: grant.id, deletedAt: now, actorId: actor.id });
  writePrincipalState(tx, deps, { tenantId, principal, state, grants: [], actorId: actor.id, now });
  await deps.audit.record(
    {
      log: "tenant",
      tenantId,
      action: "MEMBER_REMOVED",
      actor,
      target: { type: "user", id: userId },
      node: { level: "organization", tenantId },
      outcome: "success",
      requestId: command.requestId,
    },
    tx,
  );
  return ok(undefined);
};

// After commit: the keys are already useless (authorize() evaluates the owner's grants in
// the key's place), so a failure is logged for follow-up, never surfaced as a failed removal.
const revokeOwnedKeys = async (deps: Deps, command: RemoveMemberCommand): Promise<void> => {
  try {
    await deps.apiKeys.revokeOwnedKeys({
      tenantId: command.tenantId,
      ownerUid: command.userId,
      actor: auditActorOf(command.actor),
      requestId: command.requestId,
    });
  } catch (e: unknown) {
    deps.logger.error("member_api_keys_revoke_failed", {
      requestId: command.requestId,
      tenantId: command.tenantId,
      userId: command.userId,
      err: e,
    });
  }
};

/**
 * Removes a user from an organization (SP1 spec §5.3; `core.member.remove` at the
 * organization): one transaction soft-deletes every grant of the user there, revokes the
 * projection, bumps `accessVersion` and audits `MEMBER_REMOVED`; the last owner cannot go
 * (422). Then revokes the API keys the user owns there and syncs their claims.
 */
export const makeRemoveMember =
  (deps: Deps): RemoveMember =>
  async (command) => {
    const allowed = await requirePermission({
      ...command,
      permission: "core.member.remove",
      node: { level: "organization", tenantId: command.tenantId },
    });
    if (!allowed.ok) return allowed;
    // Owner hierarchy: every grant of the member must be within the actor's own permissions.
    const grants = await deps.memberships.list({
      tenantId: command.tenantId,
      principalId: command.userId,
      page: { after: undefined, limit: MAX_GRANTS_CHECKED },
    });
    const within = await requireWithinActor(deps, { ...command, grants: grants.items });
    if (!within.ok) return within;
    const removed = await deps.unitOfWork.run((tx) => applyRemoval(tx, deps, command));
    if (!removed.ok) return removed;
    await revokeOwnedKeys(deps, command);
    await deps.syncClaims(command.userId);
    return removed;
  };
