/** What the pipeline needs from a verified Firebase ID token. */
export type VerifiedToken = {
  readonly uid: string;
  /** Developer claims (`principalType`, `tenantId`, `imp`, `impBy`, `smfa`, …) at the token's top level. */
  readonly claims: Readonly<Record<string, unknown>>;
  /** `firebase.sign_in_provider` (`password`, `custom`, …). */
  readonly signInProvider: string | null;
  /** `firebase.sign_in_second_factor` (`totp`, `phone`) when the sign-in used MFA. */
  readonly secondFactor: string | null;
};

/**
 * Driven port over Firebase Auth token verification (SP1 spec §3.2).
 * `checkRevoked` is true for every method except GET/HEAD (umbrella §16.2).
 */
export type TokenVerifier = {
  /**
   * @returns `null` for a malformed, expired, revoked or disabled-user token (401);
   *   infrastructure failures reject (500), never resolve to a principal.
   */
  readonly verifyIdToken: (token: string, options: { checkRevoked: boolean }) => Promise<VerifiedToken | null>;
};
