import type { InvitationId, Principal } from "@core/contracts";
import { auditActorOf } from "../../../audit/domain/audit-actor.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import type { RequestAccess } from "../../composition.ts";
import type { AccessDeniedError } from "../../domain/errors/access-denied-error.ts";
import { AccessNotFoundError } from "../../domain/errors/access-not-found-error.ts";
import { requirePermission } from "../grant-checks.ts";
import type { MemberDeps } from "../member-deps.ts";

export type RevokeInvitationCommand = {
  readonly actor: Principal;
  readonly access: RequestAccess;
  readonly invitationId: InvitationId;
  readonly requestId: string;
};

export type RevokeInvitation = (
  command: RevokeInvitationCommand,
) => Promise<Result<void, AccessDeniedError | AccessNotFoundError>>;

/**
 * Revokes an invitation that was not accepted (`core.member.invite` at its node). An
 * accepted invitation has nothing left to revoke (404; the grant is revoked through its
 * membership); revoking twice is a no-op (204). Expired invitations can be revoked.
 */
export const makeRevokeInvitation =
  (deps: Pick<MemberDeps, "invitations" | "audit" | "unitOfWork" | "clock">): RevokeInvitation =>
  async (command) => {
    const invitation = await deps.invitations.get(undefined, command.invitationId);
    if (invitation === null) return err(new AccessNotFoundError("invitation"));
    const allowed = await requirePermission({ ...command, permission: "core.member.invite", node: invitation.node });
    if (!allowed.ok) return allowed;
    const actor = auditActorOf(command.actor);
    return deps.unitOfWork.run(async (tx): Promise<Result<void, AccessNotFoundError>> => {
      const current = await deps.invitations.get(tx, invitation.id);
      if (current === null || current.status === "accepted") return err(new AccessNotFoundError("invitation"));
      if (current.status === "revoked") return ok(undefined);
      deps.invitations.setStatus(tx, {
        id: current.id,
        status: "revoked",
        updatedAt: deps.clock.now().toISOString(),
        actorId: actor.id,
      });
      await deps.audit.record(
        {
          log: "tenant",
          tenantId: current.tenantId,
          action: "INVITATION_REVOKED",
          actor,
          target: { type: "invitation", id: current.id },
          node: current.node,
          outcome: "success",
          requestId: command.requestId,
        },
        tx,
      );
      return ok(undefined);
    });
  };
