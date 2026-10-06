import type { Invitation, InvitationPreview } from "@core/contracts";
import { err, ok, type Result } from "#/services/shared/result/result.ts";
import { maskEmail } from "../../domain/email.ts";
import { AccessNotFoundError } from "../../domain/errors/access-not-found-error.ts";
import { checkInvitationUsable, type InvitationUseError } from "../../domain/invitation-state.ts";
import { hashInvitationToken } from "../../domain/invitation-token.ts";
import type { MemberDeps } from "../member-deps.ts";

export type PreviewInvitation = (command: {
  readonly token: string;
}) => Promise<Result<InvitationPreview, InvitationUseError>>;

type Deps = Pick<MemberDeps, "invitations" | "organizations" | "clock">;

/**
 * Finds a usable invitation by its token: unknown, revoked or of a deleted organization
 * → 404, accepted → 409, expired → 410.
 * @returns the invitation and its organization's name.
 */
export const findUsableInvitation = async (
  deps: Deps,
  token: string,
): Promise<Result<{ invitation: Invitation; organizationName: string }, InvitationUseError>> => {
  const usable = checkInvitationUsable(
    await deps.invitations.findByTokenHash(hashInvitationToken(token)),
    deps.clock.now(),
  );
  if (!usable.ok) return usable;
  const organizationName = await deps.organizations.getName(usable.data.tenantId);
  return organizationName === null
    ? err(new AccessNotFoundError("invitation"))
    : ok({ invitation: usable.data, organizationName });
};

/**
 * What an invitee sees before accepting (SP1 spec §6.2): organization name, inviter
 * display name, masked email and expiry. Any signed-in user holding the token may look.
 */
export const makePreviewInvitation =
  (deps: Deps & Pick<MemberDeps, "directory">): PreviewInvitation =>
  async ({ token }) => {
    const found = await findUsableInvitation(deps, token);
    if (!found.ok) return found;
    const { invitation, organizationName } = found.data;
    const inviter = (await deps.directory.getMany([invitation.invitedBy])).get(invitation.invitedBy);
    return ok({
      organizationName,
      inviterDisplayName: inviter?.displayName ?? "",
      maskedEmail: maskEmail(invitation.email),
      expiresAt: invitation.expiresAt,
    });
  };
