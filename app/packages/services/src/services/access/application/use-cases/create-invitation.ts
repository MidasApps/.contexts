import { INVITATION_TTL_DAYS, type CreateInvitationInput, type CreateInvitationResponse, type Invitation, type TenantId, type UserPrincipal } from "@core/contracts";
import { auditActorOf } from "../../../audit/domain/audit-actor.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import type { RequestAccess } from "../../composition.ts";
import { normalizeEmail } from "../../domain/email.ts";
import { AccessDeniedError } from "../../domain/errors/access-denied-error.ts";
import { buildAcceptUrl, generateInvitationToken, hashInvitationToken } from "../../domain/invitation-token.ts";
import { checkGrantable, type GrantCheckError } from "../grant-checks.ts";
import { AppUrlMissingError, type MemberDeps } from "../member-deps.ts";

export type CreateInvitationCommand = {
  readonly actor: UserPrincipal;
  readonly access: RequestAccess;
  /** Organization named by the route; the node must be inside it. */
  readonly tenantId: TenantId;
  readonly input: CreateInvitationInput;
  readonly requestId: string;
};

export type CreateInvitation = (command: CreateInvitationCommand) => Promise<Result<CreateInvitationResponse, GrantCheckError>>;

const DAY_MS = 86_400_000;

type Deps = Pick<MemberDeps, "registry" | "roleReader" | "invitations" | "notifier" | "audit" | "unitOfWork" | "clock" | "randomBytes" | "appUrl" | "logger">;

const notify = async (deps: Deps, args: { invitation: Invitation; acceptUrl: string; requestId: string }): Promise<void> => {
  try {
    await deps.notifier.invitationCreated(args);
  } catch (e: unknown) {
    // The inviter already holds the link from the 201; delivery is best effort.
    deps.logger.error("invitation_notify_failed", { requestId: args.requestId, tenantId: args.invitation.tenantId, invitationId: args.invitation.id, err: e });
  }
};

/**
 * Invites an email at a node (SP1 spec §5.3, §6.2): `core.member.invite` at the node and
 * no escalation. Stores only the token's sha256 and returns the one-time accept link.
 * @throws {AppUrlMissingError} when the server has no `NEXT_PUBLIC_APP_URL` (bug).
 */
export const makeCreateInvitation =
  (deps: Deps): CreateInvitation =>
  async (command) => {
    const { tenantId, input, actor } = command;
    if (deps.appUrl === undefined) throw new AppUrlMissingError();
    if (input.node.tenantId !== tenantId) return err(new AccessDeniedError("NODE_NOT_FOUND"));
    const grantable = await checkGrantable(deps, { ...command, permission: "core.member.invite", node: input.node, roles: input.roles });
    if (!grantable.ok) return grantable;
    const now = deps.clock.now();
    const token = generateInvitationToken(deps.randomBytes);
    const invitation: Invitation = {
      id: deps.invitations.newId(),
      tenantId,
      email: normalizeEmail(input.email),
      node: input.node,
      roles: [...input.roles],
      status: "pending",
      expiresAt: new Date(now.getTime() + INVITATION_TTL_DAYS * DAY_MS).toISOString(),
      invitedBy: actor.uid,
      acceptedByUid: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    const auditActor = auditActorOf(actor);
    await deps.unitOfWork.run(async (tx) => {
      deps.invitations.create(tx, { invitation, tokenHash: hashInvitationToken(token), actorId: auditActor.id });
      await deps.audit.record(
        { log: "tenant", tenantId, action: "INVITATION_CREATED", actor: auditActor, target: { type: "invitation", id: invitation.id }, node: input.node, outcome: "success", requestId: command.requestId },
        tx,
      );
    });
    const acceptUrl = buildAcceptUrl({ appUrl: deps.appUrl, token });
    await notify(deps, { invitation, acceptUrl, requestId: command.requestId });
    return ok({ invitation, acceptUrl });
  };
