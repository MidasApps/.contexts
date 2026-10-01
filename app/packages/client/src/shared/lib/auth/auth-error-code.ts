import { AUTH_ERROR_CODES, AuthError, type AuthErrorCode } from "./auth-port.ts";

/**
 * The `auth.errors.*` key of a sign-in failure. Anything that is not an `AuthError` (the session
 * bridge failing, an unexpected throw) is `AUTH_FAILED`, so no internal message reaches the user.
 */
export const authErrorCode = (error: unknown): AuthErrorCode =>
  error instanceof AuthError && (AUTH_ERROR_CODES as readonly string[]).includes(error.code) ? error.code : "AUTH_FAILED";
