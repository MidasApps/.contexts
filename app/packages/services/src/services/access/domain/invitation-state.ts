import type { Invitation, InvitationStatus } from "@core/contracts";
import { err, ok, type Result } from "../../shared/result/result.ts";
import { AccessNotFoundError } from "./errors/access-not-found-error.ts";
import { InvitationAlreadyUsedError, InvitationExpiredError } from "./errors/invitation-errors.ts";

/**
 * Status as callers see it: a stored `pending` invitation past `expiresAt` is `expired`
 * (nothing rewrites it when it expires).
 */
export const effectiveInvitationStatus = (
  invitation: Pick<Invitation, "status" | "expiresAt">,
  now: Date,
): InvitationStatus =>
  invitation.status === "pending" && Date.parse(invitation.expiresAt) <= now.getTime() ? "expired" : invitation.status;

/** The invitation as listed, with its effective status. */
export const invitationView = (invitation: Invitation, now: Date): Invitation => ({
  ...invitation,
  status: effectiveInvitationStatus(invitation, now),
});

export type InvitationUseError = AccessNotFoundError | InvitationAlreadyUsedError | InvitationExpiredError;

/**
 * Whether an invitation can still be previewed or accepted: a revoked one is gone (404),
 * an accepted one is used (409), an expired one is expired (410).
 */
export const checkInvitationUsable = (
  invitation: Invitation | null,
  now: Date,
): Result<Invitation, InvitationUseError> => {
  if (invitation === null) return err(new AccessNotFoundError("invitation"));
  const status = effectiveInvitationStatus(invitation, now);
  if (status === "revoked") return err(new AccessNotFoundError("invitation"));
  if (status === "accepted") return err(new InvitationAlreadyUsedError());
  if (status === "expired") return err(new InvitationExpiredError());
  return ok(invitation);
};
