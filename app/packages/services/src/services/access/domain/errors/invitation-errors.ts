// Expected outcomes of previewing or accepting an invitation (SP1 spec §6.2). They share
// one file because they are the three states of one flow and carry nothing but a code.

/** The invitation passed its `expiresAt` → 410 INVITATION_EXPIRED. */
export class InvitationExpiredError extends Error {
  readonly code = "INVITATION_EXPIRED";

  constructor(options?: ErrorOptions) {
    super("invitation expired", options);
    this.name = "InvitationExpiredError";
  }
}

/** The invitation was already accepted → 409 INVITATION_ALREADY_USED. */
export class InvitationAlreadyUsedError extends Error {
  readonly code = "INVITATION_ALREADY_USED";

  constructor(options?: ErrorOptions) {
    super("invitation already used", options);
    this.name = "InvitationAlreadyUsedError";
  }
}

/** The caller's verified email is not the invited one (or is unverified) → 403 EMAIL_MISMATCH. */
export class EmailMismatchError extends Error {
  readonly code = "EMAIL_MISMATCH";

  constructor(options?: ErrorOptions) {
    super("verified email does not match the invitation", options);
    this.name = "EmailMismatchError";
  }
}
