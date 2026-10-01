import type { Auth, MultiFactorError, User } from "firebase/auth";
import type { ClientConfig } from "#/shared/config/client-config.schema.ts";
import { AuthError, type AuthPort, type AuthState, type AuthUser, type SignInResult } from "./auth-port.ts";
import { firebaseCodeOf, guardAuth, toAuthError } from "./firebase-errors.ts";
import { createFirebaseMfa, toMfaChallenge } from "./firebase-mfa.ts";
import { FIREBASE_SDK, type FirebaseSdk } from "./firebase-sdk.ts";

type AuthSettingsHolder = { settings: { appVerificationDisabledForTesting: boolean } };

/** What initialization needs from the SDK (generic so tests pass small fakes). */
export type FirebaseInitSdk<App, A extends AuthSettingsHolder, Persistence> = {
  initializeApp: (options: ClientConfig["firebase"]) => App;
  initializeAuth: (app: App, deps: { persistence: Persistence }) => A;
  inMemoryPersistence: Persistence;
  connectAuthEmulator: (auth: A, url: string, options: { disableWarnings: boolean }) => void;
};

/**
 * Creates the Firebase app and Auth with `inMemoryPersistence` (SP1 decision 0007: no token in
 * web storage). Only in `local`: connects the Auth Emulator (follow-up #12c) and disables app
 * verification so SMS MFA works against it. Remote environments never touch either.
 */
export const initializeFirebaseAuth = <App, A extends AuthSettingsHolder, Persistence>(
  config: ClientConfig,
  sdk: FirebaseInitSdk<App, A, Persistence>,
): A => {
  const auth = sdk.initializeAuth(sdk.initializeApp(config.firebase), { persistence: sdk.inMemoryPersistence });
  if (config.appEnv === "local" && config.authEmulatorUrl !== undefined) {
    sdk.connectAuthEmulator(auth, config.authEmulatorUrl, { disableWarnings: true });
    auth.settings.appVerificationDisabledForTesting = true;
  }
  return auth;
};

const toAuthUser = (sdk: FirebaseSdk, user: User): AuthUser => ({
  uid: user.uid,
  email: user.email,
  displayName: user.displayName,
  emailVerified: user.emailVerified,
  mfaFactors: sdk.multiFactor(user).enrolledFactors.map((factor) => (factor.factorId === "totp" ? "totp" : "phone")),
});

/** Auth state as a small external store for `useSyncExternalStore`. */
const createAuthStateStore = (sdk: FirebaseSdk, auth: Auth) => {
  let state: AuthState = { status: "loading" };
  const listeners = new Set<() => void>();
  sdk.onAuthStateChanged(auth, (user) => {
    state = user === null ? { status: "signed-out" } : { status: "signed-in", user: toAuthUser(sdk, user) };
    listeners.forEach((listener) => listener());
  });
  return {
    getState: (): AuthState => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
};

const isMultiFactorRequired = (thrown: unknown): thrown is MultiFactorError => firebaseCodeOf(thrown) === "auth/multi-factor-auth-required";

/** Re-authentication with the current password; `mfa-required` when a second factor is enrolled. */
const reauthenticate =
  (sdk: FirebaseSdk, auth: Auth) =>
  async (password: string): Promise<SignInResult> => {
    const user = auth.currentUser;
    if (user === null || user.email === null) throw new AuthError("NOT_SIGNED_IN");
    try {
      await sdk.reauthenticateWithCredential(user, sdk.EmailAuthProvider.credential(user.email, password));
      return { kind: "signed-in" };
    } catch (thrown: unknown) {
      if (!isMultiFactorRequired(thrown)) throw toAuthError(thrown);
      return { kind: "mfa-required", challenge: toMfaChallenge(sdk, auth, thrown) };
    }
  };

const signInWithEmail =
  (sdk: FirebaseSdk, auth: Auth) =>
  async (email: string, password: string): Promise<SignInResult> => {
    try {
      await sdk.signInWithEmailAndPassword(auth, email, password);
      return { kind: "signed-in" };
    } catch (thrown: unknown) {
      if (!isMultiFactorRequired(thrown)) throw toAuthError(thrown);
      return { kind: "mfa-required", challenge: toMfaChallenge(sdk, auth, thrown) };
    }
  };

/**
 * `AuthPort` over the Firebase JS SDK (SP2 spec §2.2), used by both apps. Every SDK failure
 * becomes an `AuthError` with a stable code.
 */
export const createFirebaseAuthClient = (config: ClientConfig, sdk: FirebaseSdk = FIREBASE_SDK): AuthPort => {
  const auth = initializeFirebaseAuth(config, sdk);
  return {
    ...createAuthStateStore(sdk, auth),
    ...createFirebaseMfa(sdk, auth),
    signInWithEmail: signInWithEmail(sdk, auth),
    reauthenticate: reauthenticate(sdk, auth),
    updatePassword: (newPassword) =>
      guardAuth(async () => {
        if (auth.currentUser === null) throw new AuthError("NOT_SIGNED_IN");
        await sdk.updatePassword(auth.currentUser, newPassword);
      }),
    signInWithCustomToken: (token) => guardAuth(async () => void (await sdk.signInWithCustomToken(auth, token))),
    getIdToken: ({ forceRefresh }) =>
      guardAuth(async () => (auth.currentUser === null ? null : auth.currentUser.getIdToken(forceRefresh))),
    getIdTokenClaims: () => guardAuth(async () => (auth.currentUser === null ? null : (await auth.currentUser.getIdTokenResult()).claims)),
    signOut: () => guardAuth(() => sdk.signOut(auth)),
  };
};
