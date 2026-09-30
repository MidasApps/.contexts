/**
 * A verified token whose Firebase Auth account is gone or has no email (the core signs in
 * with email only) → 401 UNAUTHORIZED: there is no user to describe.
 */
export class AccountMissingError extends Error {
  readonly code = "ACCOUNT_MISSING";

  constructor(options?: ErrorOptions) {
    super("the Firebase Auth account of the token is missing or has no email", options);
    this.name = "AccountMissingError";
  }
}
