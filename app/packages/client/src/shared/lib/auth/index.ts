// Public API of shared/lib/auth (SP2 spec §2.2). The Firebase adapter is exported for the apps'
// composition; views use `useAuth`/`useAuthState` only.
export { AuthProvider, useAuth } from "./auth-context.tsx";
export { authErrorCode } from "./auth-error-code.ts";
export {
  AUTH_ERROR_CODES,
  AuthError,
  type AuthErrorCode,
  type AuthPort,
  type AuthState,
  type AuthUser,
  type EnrolledFactor,
  type MfaChallenge,
  type MfaHint,
  type SignInResult,
  type TotpEnrollment,
} from "./auth-port.ts";
export { createFakeAuth, type FakeAuth } from "./fake-auth.ts";
export { createFirebaseAuthClient, initializeFirebaseAuth, type FirebaseInitSdk } from "./firebase-auth-client.ts";
export { useAuthState } from "./use-auth-state.ts";
