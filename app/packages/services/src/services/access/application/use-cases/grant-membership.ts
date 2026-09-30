import { UserIdSchema, type Membership, type RoleRef, type TenantId, type TenantNodeRef, type UserPrincipal } from "@core/contracts";
import { auditActorOf } from "../../../audit/domain/audit-actor.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import type { RequestAccess } from "../../composition.ts";
import type { ProjectionPrincipal } from "../../domain/access-projection.ts";
import { AccessDeniedError } from "../../domain/errors/access-denied-error.ts";
import type { MembershipExistsError } from "../../domain/errors/membership-exists-error.ts";
import type { AccessWriteDeps } from "../access-write-deps.ts";
import { checkGrantable, type GrantCheckError } from "../grant-checks.ts";
import { prepareGrant } from "../membership-writes.ts";

export type GrantMembershipCommand = {
  readonly actor: UserPrincipal;
  readonly access: RequestAccess;
  /** Organization named by the route; the node must be inside it. */
  readonly tenantId: TenantId;
  readonly principal: ProjectionPrincipal;
  readonly node: TenantNodeRef;
  readonly roles: readonly RoleRef[];
  readonly requestId: string;
};

export type GrantMembershipError = GrantCheckError | MembershipExistsError;

export type GrantMembership = (command: GrantMembershipCommand) => Promise<Result<Membership, GrantMembershipError>>;

/**
 * Grants roles to a principal at a node (SP1 spec §5.3): `core.member.update` at the
 * node, no escalation, one grant per (tenant, principal, node). One transaction writes
 * the membership, the projection, the `accessVersion` bump and the audit entry; claims
 * are synced after commit.
 */
export const makeGrantMembership =
  (deps: AccessWriteDeps): GrantMembership =>
  async (command) => {
    const { actor, tenantId, node } = command;
    if (node.tenantId !== tenantId) return err(new AccessDeniedError("NODE_NOT_FOUND"));
    const grantable = await checkGrantable(deps, { ...command, permission: "core.member.update" });
    if (!grantable.ok) return grantable;
    const granted = await deps.unitOfWork.run(async (tx): Promise<Result<Membership, GrantMembershipError>> => {
      const plan = await prepareGrant(tx, deps, { ...command, grantedBy: actor.uid, actor: auditActorOf(actor) });
      if (!plan.ok) return plan;
      await plan.data.commit();
      return ok(plan.data.membership);
    });
    if (granted.ok && command.principal.type === "user") await deps.syncClaims(UserIdSchema.parse(command.principal.id));
    return granted;
  };
