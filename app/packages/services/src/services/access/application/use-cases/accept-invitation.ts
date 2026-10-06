import {
  type AcceptInvitationResponse,
  type Invitation,
  OrganizationIdSchema,
  type UserPrincipal,
} from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import { auditActorOf } from "#/services/audit/domain/audit-actor.ts";
import { err, ok, type Result } from "#/services/shared/result/result.ts";
import type { RequestAccess } from "../../composition.ts";
import { sameEmail } from "../../domain/email.ts";
import { AccessDeniedError } from "../../domain/errors/access-denied-error.ts";
import { AccessNotFoundError } from "../../domain/errors/access-not-found-error.ts";
import { EmailMismatchError } from "../../domain/errors/invitation-errors.ts";
import { checkInvitationUsable, type InvitationUseError } from "../../domain/invitation-state.ts";
import { checkGrantable } from "../grant-checks.ts";
import type { MemberDeps } from "../member-deps.ts";
import { prepareGrant } from "../membership-writes.ts";
import type { NewUserProfile } from "../ports/driven/user-access-version.ts";
import { findUsableInvitation } from "./preview-invitation.ts";

export type AcceptInvitationCommand = {
  readonly actor: UserPrincipal;
  readonly access: RequestAccess;
  readonly token: string;
  readonly requestId: string;
};

export type AcceptInvitationError = InvitationUseError | EmailMismatchError | AccessDeniedError;

export type AcceptInvitation = (
  command: AcceptInvitationCommand,
) => Promise<Result<AcceptInvitationResponse, AcceptInvitationError>>;

type Deps = Omit<MemberDeps, "notifier" | "apiKeys" | "randomBytes" | "appUrl">;

/** The caller's verified Auth email must be the invited one (NFC, lower-case). */
const verifiedProfile = async (
  deps: Deps,
  command: AcceptInvitationCommand,
  invitation: Invitation,
): Promise<NewUserProfile | null> => {
  const account = await deps.directory.getAccount(command.actor.uid);
  if (account === null || !account.emailVerified || !sameEmail(account.email, invitation.email)) return null;
  return {
    email: account.email,
    displayName: account.displayName,
    ...(account.photoUrl === undefined ? {} : { photoUrl: account.photoUrl }),
  };
};

// The inviter's rights are checked again: an invitation must not outlive the inviter's
// ability to grant its roles (a demoted admin's pending invitations stop working).
const inviterCanStillGrant = async (
  deps: Deps,
  command: AcceptInvitationCommand,
  invitation: Invitation,
): Promise<boolean> => {
  const inviter: UserPrincipal = { type: "user", uid: invitation.invitedBy, mfa: false };
  const check = await checkGrantable(deps, {
    access: command.access,
    actor: inviter,
    permission: "core.member.invite",
    node: invitation.node,
    roles: invitation.roles,
  });
  return check.ok;
};

const applyAccept = async (
  tx: Transaction,
  deps: Deps,
  command: AcceptInvitationCommand,
  args: { invitation: Invitation; profile: NewUserProfile },
) => {
  const current = checkInvitationUsable(await deps.invitations.get(tx, args.invitation.id), deps.clock.now());
  if (!current.ok) return current;
  const invitation = current.data;
  const actor = auditActorOf(command.actor);
  const principal = { type: "user" as const, id: command.actor.uid };
  const common = { tenantId: invitation.tenantId, node: invitation.node, requestId: command.requestId };
  const plan = await prepareGrant(tx, deps, {
    ...common,
    principal,
    roles: invitation.roles,
    grantedBy: invitation.invitedBy,
    actor,
    newUser: args.profile,
  });
  // Already granted at that node: the invitation is consumed without a second grant.
  if (plan.ok) await plan.data.commit();
  else if (plan.error instanceof AccessNotFoundError) return err(new AccessNotFoundError("invitation"));
  deps.invitations.setStatus(tx, {
    id: invitation.id,
    status: "accepted",
    acceptedByUid: command.actor.uid,
    updatedAt: deps.clock.now().toISOString(),
    actorId: actor.id,
  });
  await deps.audit.record(
    {
      log: "tenant",
      ...common,
      action: "INVITATION_ACCEPTED",
      actor,
      target: { type: "invitation", id: invitation.id },
      outcome: "success",
    },
    tx,
  );
  return ok(invitation);
};

/**
 * Accepts an invitation (SP1 spec §6.2): the caller's verified email must match (403
 * EMAIL_MISMATCH), the invitation must be usable (404/409/410) and its inviter must still
 * be able to grant it (else 404). One transaction creates the grant, the projection, the
 * `users/{uid}` doc when missing (the invitation's organization becomes the active one),
 * marks the invitation accepted and audits; claims are synced after commit.
 */
export const makeAcceptInvitation =
  (deps: Deps): AcceptInvitation =>
  async (command) => {
    // Impersonation is read-only (SP1 spec §6.6): staff never joins an organization as the user.
    if (command.actor.impersonation !== undefined) return err(new AccessDeniedError("IMPERSONATION_READ_ONLY"));
    const found = await findUsableInvitation(deps, command.token);
    if (!found.ok) return found;
    const { invitation } = found.data;
    const profile = await verifiedProfile(deps, command, invitation);
    if (profile === null) return err(new EmailMismatchError());
    if (!(await inviterCanStillGrant(deps, command, invitation))) return err(new AccessNotFoundError("invitation"));
    const accepted = await deps.unitOfWork.run((tx) => applyAccept(tx, deps, command, { invitation, profile }));
    if (!accepted.ok) return accepted;
    await deps.syncClaims(command.actor.uid);
    return ok({ organizationId: OrganizationIdSchema.parse(invitation.tenantId) });
  };
