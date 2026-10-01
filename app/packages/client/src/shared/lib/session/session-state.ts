import type { MfaChallenge } from "#/shared/lib/auth/auth-port.ts";

/** Why the user is signed out: never signed in, the stored session could not be resumed, or an explicit sign-out. */
export type SignedOutReason = "none" | "session-expired" | "signed-out";

/**
 * Lifecycle of the client session (SP2 Task 10): boot resumes a stored session through the
 * session-bridge port (`exchanging`), or waits for an interactive sign-in that may need a second
 * factor. Server data (`me`, access context) is not here: it lives in TanStack Query.
 */
export type SessionState =
  | { readonly status: "booting" }
  | { readonly status: "exchanging" }
  | { readonly status: "signed-out"; readonly reason: SignedOutReason }
  | { readonly status: "mfa-required"; readonly challenge: MfaChallenge }
  | { readonly status: "signed-in"; readonly uid: string };

/** What views, widgets and features do with the session (provided by the app shell). */
export type SessionController = {
  readonly state: SessionState;
  /**
   * After an interactive sign-in (or a resolved MFA challenge): persists the session through the
   * session bridge and enters `signed-in`.
   * @throws {Error} when the bridge fails; Firebase is signed out again so the state stays consistent.
   */
  readonly completeSignIn: () => Promise<void>;
  /** The sign-in answered with a second-factor challenge. */
  readonly requireMfa: (challenge: MfaChallenge) => void;
  readonly cancelMfa: () => void;
  /** Ends the session server-side, signs Firebase out, clears the query cache and UI stores. */
  readonly signOut: () => Promise<void>;
};
