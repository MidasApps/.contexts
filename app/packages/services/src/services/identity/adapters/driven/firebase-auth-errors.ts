/**
 * firebase-admin reports credential problems (malformed, expired, revoked, disabled user…)
 * as `auth/*` codes; anything else (network, key fetch) is an infrastructure failure.
 */
export const isAuthRejection = (err: unknown): boolean =>
  typeof err === "object" &&
  err !== null &&
  "code" in err &&
  typeof err.code === "string" &&
  err.code.startsWith("auth/");

/** `auth/user-not-found`. */
export const isUserNotFound = (err: unknown): boolean =>
  typeof err === "object" && err !== null && "code" in err && err.code === "auth/user-not-found";
