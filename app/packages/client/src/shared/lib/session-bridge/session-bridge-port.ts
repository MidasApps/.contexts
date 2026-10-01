/**
 * Keeps a signed-in session across reloads and restarts without persisting Firebase tokens
 * (SP1 decision 0007, decision 0017). Web: Server Actions `createSession`/`exchangeSession`/
 * `signOut` (HttpOnly cookie). Desktop: `POST /v1/me/desktop-sessions`,
 * `POST /v1/desktop-sessions/exchange` and the OS keychain (secure-store port).
 */
export type SessionBridgePort = {
  /** After an interactive sign-in (fresh ID token, `auth_time` ≤ 5 min): persist the session. */
  establish: (input: { idToken: string }) => Promise<void>;
  /** On boot: a custom token for `signInWithCustomToken`, or `null` when no session survives. */
  restore: () => Promise<{ customToken: string } | null>;
  /** Sign-out: revoke the session server-side and forget local state. */
  end: () => Promise<void>;
  /**
   * Web only (decision 0047): the staff session enters one of its open impersonation sessions,
   * so `restore` gives the impersonated user until it ends; returns that user's custom token.
   * Absent where there is no `/admin` (desktop).
   */
  enterImpersonation?: (input: { impersonationSessionId: string }) => Promise<{ customToken: string }>;
  /** Web only (decision 0047): ends that impersonation server-side; returns the staff custom token. */
  leaveImpersonation?: () => Promise<{ customToken: string }>;
};

/** The platform's session bridge cannot enter or leave an impersonation (desktop). */
export class ImpersonationUnsupportedError extends Error {
  readonly code = "IMPERSONATION_UNSUPPORTED";
  constructor() {
    super("this session bridge cannot enter or leave an impersonation");
    this.name = "ImpersonationUnsupportedError";
  }
}
