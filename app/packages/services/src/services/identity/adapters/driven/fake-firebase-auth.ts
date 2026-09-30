import type { UserId } from "@core/contracts";
import type { AuthUserAdmin, AuthUserState } from "../../application/ports/driven/auth-user-admin.ts";
import type { CustomTokenIssuer } from "../../application/ports/driven/custom-token-issuer.ts";
import type { SessionCookieIssuer, VerifiedSignIn } from "../../application/ports/driven/session-cookie-issuer.ts";

export type FakeFirebaseAuth = {
  readonly cookies: SessionCookieIssuer;
  readonly customTokens: CustomTokenIssuer;
  readonly authUsers: AuthUserAdmin;
  /** Registers an ID token the fake accepts. */
  readonly addIdToken: (token: string, signIn: VerifiedSignIn) => void;
  readonly setState: (uid: string, state: AuthUserState) => void;
  readonly revokedUids: () => readonly string[];
  readonly disabledUids: () => readonly string[];
  /** Accounts created with `createAccount` (devices). */
  readonly accounts: () => readonly string[];
};

/**
 * Test double of Firebase Auth for sessions and devices. Custom tokens are
 * `custom:<uid>:<claims JSON>`; `revokeRefreshTokens` kills every cookie issued so far.
 */
export const createFakeFirebaseAuth = (): FakeFirebaseAuth => {
  const idTokens = new Map<string, VerifiedSignIn>();
  const liveCookies = new Map<string, UserId>();
  const states = new Map<string, AuthUserState>();
  const revoked: string[] = [];
  const disabled: string[] = [];
  const accounts: string[] = [];
  let sequence = 0;
  return {
    cookies: {
      verifyIdToken: (token) => Promise.resolve(idTokens.get(token) ?? null),
      createSessionCookie: (idToken) => {
        const signIn = idTokens.get(idToken);
        if (signIn === undefined) return Promise.reject(new Error("auth/invalid-id-token"));
        sequence += 1;
        const cookie = `cookie-${sequence}-${signIn.uid}`;
        liveCookies.set(cookie, signIn.uid);
        return Promise.resolve(cookie);
      },
      verifySessionCookie: (cookie) => {
        const uid = liveCookies.get(cookie);
        return Promise.resolve(uid === undefined ? null : { uid });
      },
    },
    customTokens: { createCustomToken: (uid, claims) => Promise.resolve(`custom:${uid}:${JSON.stringify(claims)}`) },
    authUsers: {
      getState: (uid) => Promise.resolve(states.get(uid) ?? { disabled: disabled.includes(uid), tokensValidAfter: null }),
      revokeRefreshTokens: (uid) => {
        revoked.push(uid);
        for (const [cookie, owner] of liveCookies) if (owner === uid) liveCookies.delete(cookie);
        return Promise.resolve();
      },
      createAccount: (uid) => Promise.resolve(void accounts.push(uid)),
      disable: (uid) => Promise.resolve(void disabled.push(uid)),
    },
    addIdToken: (token, signIn) => void idTokens.set(token, signIn),
    setState: (uid, state) => void states.set(uid, state),
    revokedUids: () => [...revoked],
    disabledUids: () => [...disabled],
    accounts: () => [...accounts],
  };
};
