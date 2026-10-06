/**
 * The cookie, ID token or desktop secret is missing, invalid, expired or revoked. Callers
 * answer 401 / redirect to sign-in; the reason is logged, never returned.
 */
export class SessionInvalidError extends Error {
  readonly code = "UNAUTHORIZED";
  readonly reason: string;

  constructor(reason: string, options?: ErrorOptions) {
    super(`session invalid: ${reason}`, options);
    this.name = "SessionInvalidError";
    this.reason = reason;
  }
}

/** `createSession` needs a sign-in from the last 5 minutes (decision 0007 §1). */
export class RecentSignInRequiredError extends Error {
  readonly code = "RECENT_SIGN_IN_REQUIRED";

  constructor() {
    super("a recent sign-in is required");
    this.name = "RecentSignInRequiredError";
  }
}

/** The session does not exist or belongs to someone else (404, existence not revealed). */
export class SessionNotFoundError extends Error {
  readonly code = "NOT_FOUND";

  constructor() {
    super("session not found");
    this.name = "SessionNotFoundError";
  }
}

/** A valid web session whose user is not active platform staff with MFA (`/admin` answers 404). */
export class NotPlatformStaffError extends Error {
  readonly code = "NOT_PLATFORM_STAFF";

  constructor() {
    super("not platform staff with MFA");
    this.name = "NotPlatformStaffError";
  }
}
