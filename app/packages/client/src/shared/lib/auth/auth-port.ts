import type { MfaFactor } from "#/shared/config/client-config.schema.ts";

/** The signed-in Firebase user as views need it (no tokens, no provider data). */
export type AuthUser = {
  readonly uid: string;
  readonly email: string | null;
  readonly displayName: string | null;
  readonly emailVerified: boolean;
  /** Enrolled second factors. */
  readonly mfaFactors: readonly MfaFactor[];
};

export type AuthState =
  | { readonly status: "loading" }
  | { readonly status: "signed-out" }
  | { readonly status: "signed-in"; readonly user: AuthUser };

/** An enrolled factor offered in a sign-in challenge. */
export type MfaHint = { readonly uid: string; readonly factor: MfaFactor; readonly displayName: string | null; readonly phoneNumber: string | null };

/** A pending second-factor sign-in; `handle` is opaque (the SDK resolver). */
export type MfaChallenge = { readonly hints: readonly MfaHint[]; readonly handle: unknown };

export type SignInResult = { readonly kind: "signed-in" } | { readonly kind: "mfa-required"; readonly challenge: MfaChallenge };

/** Stable codes for auth failures (`auth.errors.<code>` copy); SDK messages never reach the UI. */
export const AUTH_ERROR_CODES = [
  "INVALID_CREDENTIALS",
  "INVALID_MFA_CODE",
  "RATE_LIMITED",
  "NETWORK_ERROR",
  "REQUIRES_RECENT_LOGIN",
  "WEAK_PASSWORD",
  "INVALID_PHONE_NUMBER",
  "NOT_SIGNED_IN",
  "AUTH_FAILED",
] as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode, options?: ErrorOptions) {
    super(`Authentication failed: ${code}`, options);
    this.name = "AuthError";
    this.code = code;
  }
}

/** An enrolled second factor as the security page lists it (`enrolledAt` is a UTC ISO string). */
export type EnrolledFactor = MfaHint & { readonly enrolledAt: string | null };

/** TOTP enrollment in progress: show `uri` as a QR code and `secretKey` for manual entry. */
export type TotpEnrollment = { readonly secretKey: string; readonly uri: string; readonly handle: unknown };

/**
 * Firebase Auth as the client sees it (SP2 spec §2.2; implemented by `createFirebaseAuthClient`,
 * faked in tests). Persistence is in memory only (SP1 decision 0007); sessions survive reloads
 * through the session-bridge port, never through web storage.
 */
export type AuthPort = {
  getState: () => AuthState;
  subscribe: (listener: () => void) => () => void;
  signInWithEmail: (email: string, password: string) => Promise<SignInResult>;
  /** SMS factor: sends the code; returns the verification id for `resolveMfa`. */
  sendMfaSmsCode: (challenge: MfaChallenge, hintUid: string, recaptchaContainer: HTMLElement) => Promise<string>;
  resolveMfa: (challenge: MfaChallenge, answer: { hintUid: string; code: string; verificationId?: string }) => Promise<void>;
  startTotpEnrollment: (issuer: string) => Promise<TotpEnrollment>;
  finishTotpEnrollment: (enrollment: TotpEnrollment, code: string, displayName: string) => Promise<void>;
  startSmsEnrollment: (phoneNumber: string, recaptchaContainer: HTMLElement) => Promise<string>;
  finishSmsEnrollment: (verificationId: string, code: string, displayName: string) => Promise<void>;
  /** Second factors of the signed-in user (`[]` when signed out); re-read after enroll/unenroll. */
  getEnrolledFactors: () => readonly EnrolledFactor[];
  unenrollMfa: (factorUid: string) => Promise<void>;
  /**
   * Confirms the password before a sensitive change (change password, MFA). Answers
   * `mfa-required` when a second factor is enrolled: resolve it with `resolveMfa`.
   */
  reauthenticate: (password: string) => Promise<SignInResult>;
  /** Needs a recent sign-in (`reauthenticate` first), else `REQUIRES_RECENT_LOGIN`. */
  updatePassword: (newPassword: string) => Promise<void>;
  signInWithCustomToken: (token: string) => Promise<void>;
  /** ID token for the `/v1` Bearer; `null` when signed out. */
  getIdToken: (options: { forceRefresh: boolean }) => Promise<string | null>;
  /** Claims of the current ID token (`accessVersion`, `tenantId`, …); `null` when signed out. */
  getIdTokenClaims: () => Promise<Readonly<Record<string, unknown>> | null>;
  signOut: () => Promise<void>;
};
