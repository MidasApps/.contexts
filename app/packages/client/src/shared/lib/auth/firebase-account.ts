import type { Auth } from "firebase/auth";
import type { AuthPort, SignInResult } from "./auth-port.ts";
import { firebaseCodeOf, guardAuth } from "./firebase-errors.ts";
import type { FirebaseSdk } from "./firebase-sdk.ts";

/** The SDK functions account creation and password reset use (tests pass small fakes). */
export type FirebaseAccountSdk = Pick<
  FirebaseSdk,
  "createUserWithEmailAndPassword" | "updateProfile" | "sendPasswordResetEmail"
>;

// Answered like a success: the reset page must not tell which emails have an account.
const SILENT_RESET_CODES = new Set(["auth/user-not-found", "auth/invalid-email", "auth/user-disabled"]);

/**
 * Account creation (an invitee without an account, or open sign-up when the app offers it,
 * decision 0050) and the password reset email. Creating an account signs it in, so the caller
 * continues with the session's `completeSignIn`, like an email sign-in.
 */
export const createFirebaseAccountActions = (
  sdk: FirebaseAccountSdk,
  auth: Auth,
): Pick<AuthPort, "createAccount" | "sendPasswordReset"> => ({
  createAccount: ({ email, password, displayName }) =>
    guardAuth(async (): Promise<SignInResult> => {
      const credential = await sdk.createUserWithEmailAndPassword(auth, email, password);
      // Before the session exists: `GET /v1/me` copies the Auth profile into the users doc on its first call.
      await sdk.updateProfile(credential.user, { displayName });
      return { kind: "signed-in" };
    }),
  sendPasswordReset: (email, locale) =>
    guardAuth(async () => {
      // The reset email follows the UI language (Firebase reads `languageCode` per request).
      auth.languageCode = locale;
      try {
        await sdk.sendPasswordResetEmail(auth, email);
      } catch (thrown: unknown) {
        if (!SILENT_RESET_CODES.has(firebaseCodeOf(thrown) ?? "")) throw thrown;
      }
    }),
});
