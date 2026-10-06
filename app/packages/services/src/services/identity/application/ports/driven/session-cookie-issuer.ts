import type { UserId } from "@core/contracts";

/** A verified, non-revoked ID token presented to `createSession`. */
export type VerifiedSignIn = {
  readonly uid: UserId;
  /** `auth_time`, in seconds since the epoch. */
  readonly authTimeSeconds: number;
  /** Second factor proven (`sign_in_second_factor`, or `smfa` on a custom sign-in). */
  readonly mfa: boolean;
};

/** Firebase session cookies (decision 0007 §1–§2). Every verification checks revocation. */
export type SessionCookieIssuer = {
  /** @returns null for an invalid, expired or revoked token; infrastructure errors reject. */
  readonly verifyIdToken: (idToken: string) => Promise<VerifiedSignIn | null>;
  readonly createSessionCookie: (idToken: string, options: { expiresInMs: number }) => Promise<string>;
  /** `verifySessionCookie(cookie, true)`. @returns null when invalid, expired or revoked. */
  readonly verifySessionCookie: (cookie: string) => Promise<{ readonly uid: UserId } | null>;
};
