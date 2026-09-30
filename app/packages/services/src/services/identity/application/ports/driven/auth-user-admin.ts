/** What sessions and devices need of a Firebase Auth account. */
export type AuthUserState = {
  readonly disabled: boolean;
  /** `tokensValidAfterTime` (ISO), or null when refresh tokens were never revoked. */
  readonly tokensValidAfter: string | null;
};

/** Firebase Auth user administration (revocation, disabling, device accounts). */
export type AuthUserAdmin = {
  /** @returns null when the account does not exist. */
  readonly getState: (uid: string) => Promise<AuthUserState | null>;
  /** Invalidates every refresh token, ID token and session cookie of the uid. */
  readonly revokeRefreshTokens: (uid: string) => Promise<void>;
  /** Creates an account without credentials (devices sign in with custom tokens). */
  readonly createAccount: (uid: string, args: { displayName: string }) => Promise<void>;
  /** Disables the account; a missing account is ignored. */
  readonly disable: (uid: string) => Promise<void>;
};
