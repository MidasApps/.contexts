import { AuthError, type AuthPort } from "@core/client/shared/lib/auth";

const unavailable = (): Promise<never> => Promise.reject(new AuthError("NOT_SIGNED_IN"));

/**
 * Auth port used while React renders the client tree on the server (SSR/prerender): the Firebase
 * SDK only starts in the browser. It reports `loading` — the same first state the browser store
 * has before Firebase answers — so the markup hydrates without a mismatch; nothing calls the
 * async methods during a server render.
 */
export const createServerRenderAuth = (): AuthPort => ({
  getState: () => ({ status: "loading" }),
  subscribe: () => () => undefined,
  signInWithEmail: unavailable,
  sendMfaSmsCode: unavailable,
  resolveMfa: unavailable,
  startTotpEnrollment: unavailable,
  finishTotpEnrollment: unavailable,
  startSmsEnrollment: unavailable,
  finishSmsEnrollment: unavailable,
  getEnrolledFactors: () => [],
  unenrollMfa: unavailable,
  reauthenticate: unavailable,
  updatePassword: unavailable,
  signInWithCustomToken: unavailable,
  getIdToken: () => Promise.resolve(null),
  getIdTokenClaims: () => Promise.resolve(null),
  signOut: () => Promise.resolve(),
});
