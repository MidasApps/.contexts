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
};
