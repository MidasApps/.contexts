import { AuthError, type AuthErrorCode } from "./auth-port.ts";

const FIREBASE_CODES: Record<string, AuthErrorCode> = {
  "auth/invalid-credential": "INVALID_CREDENTIALS",
  "auth/wrong-password": "INVALID_CREDENTIALS",
  "auth/user-not-found": "INVALID_CREDENTIALS",
  "auth/invalid-email": "INVALID_CREDENTIALS",
  "auth/user-disabled": "INVALID_CREDENTIALS",
  "auth/invalid-verification-code": "INVALID_MFA_CODE",
  "auth/missing-verification-code": "INVALID_MFA_CODE",
  "auth/invalid-verification-id": "INVALID_MFA_CODE",
  "auth/code-expired": "INVALID_MFA_CODE",
  "auth/too-many-requests": "RATE_LIMITED",
  "auth/network-request-failed": "NETWORK_ERROR",
  "auth/requires-recent-login": "REQUIRES_RECENT_LOGIN",
  "auth/weak-password": "WEAK_PASSWORD",
  "auth/password-does-not-meet-requirements": "WEAK_PASSWORD",
  "auth/invalid-phone-number": "INVALID_PHONE_NUMBER",
  "auth/missing-phone-number": "INVALID_PHONE_NUMBER",
};

/** Firebase error `code` (`auth/...`), when the thrown value has one. */
export const firebaseCodeOf = (thrown: unknown): string | undefined =>
  typeof thrown === "object" && thrown !== null && "code" in thrown && typeof thrown.code === "string" ? thrown.code : undefined;

/** Maps an SDK failure to a stable `AuthError` (the SDK message is kept only as `cause`). */
export const toAuthError = (thrown: unknown): AuthError =>
  new AuthError(FIREBASE_CODES[firebaseCodeOf(thrown) ?? ""] ?? "AUTH_FAILED", { cause: thrown });

/** Runs an SDK call, rethrowing its failure as `AuthError`. */
export const guardAuth = async <T>(call: () => Promise<T>): Promise<T> => {
  try {
    return await call();
  } catch (thrown: unknown) {
    throw thrown instanceof AuthError ? thrown : toAuthError(thrown);
  }
};
