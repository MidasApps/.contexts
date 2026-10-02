import { AuthError, type AuthPort, type AuthState, type AuthUser, type EnrolledFactor, type MfaChallenge } from "./auth-port.ts";

/** What the fake accepts: the current password, the one-time code and the enrolled factors. */
export type FakeAuthOptions = {
  /** Password `reauthenticate` accepts (default `correct-password`). */
  password?: string;
  /** Second factors already enrolled (they make `reauthenticate` answer `mfa-required`). */
  factors?: readonly EnrolledFactor[];
  /** Emails that already have an account (`createAccount` answers `EMAIL_ALREADY_IN_USE`). */
  takenEmails?: readonly string[];
};

export type FakeAuth = AuthPort & {
  /** Moves the fake to a new state and notifies subscribers (tests, stories, browser mode). */
  setState: (state: AuthState) => void;
  /** Replaces the claims `getIdTokenClaims` returns; a forced refresh applies `claimsAfterRefresh`. */
  setClaims: (claims: Readonly<Record<string, unknown>>, claimsAfterRefresh?: Readonly<Record<string, unknown>>) => void;
  /** The password after `updatePassword` calls. */
  currentPassword: () => string;
  /** Every `sendPasswordReset` call, oldest first. */
  passwordResets: () => readonly { email: string; locale: string }[];
  /** Accounts made by `createAccount`, oldest first. */
  createdAccounts: () => readonly { email: string; displayName: string }[];
};

/** The one code every fake second factor accepts (TOTP apps and SMS alike). */
export const FAKE_MFA_CODE = "123456";
export const FAKE_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
export const FAKE_TOTP_URI = `otpauth://totp/Core:ana%40example.com?secret=${FAKE_TOTP_SECRET}&issuer=Core`;
const FAKE_ENROLLED_AT = "2026-09-29T14:30:00.000Z";
const REAUTH_HANDLE = "reauth";

const notSupported = (): Promise<never> => Promise.reject(new AuthError("AUTH_FAILED"));

const checkCode = (code: string): void => {
  if (code !== FAKE_MFA_CODE) throw new AuthError("INVALID_MFA_CODE");
};

/** Enrollment, re-authentication and password change backed by in-memory state. */
const createFakeSecurity = (initial: FakeAuthOptions, isSignedIn: () => boolean) => {
  let password = initial.password ?? "correct-password";
  let factors: EnrolledFactor[] = [...(initial.factors ?? [])];
  let recentlyReauthenticated = false;
  const enroll = (factor: EnrolledFactor["factor"], displayName: string, phoneNumber: string | null): void => {
    factors = [...factors, { uid: `factor-${String(factors.length + 1)}`, factor, displayName, phoneNumber, enrolledAt: FAKE_ENROLLED_AT }];
  };
  const reauthChallenge = (): MfaChallenge => ({ hints: factors.map(({ enrolledAt: _enrolledAt, ...hint }) => hint), handle: REAUTH_HANDLE });
  return {
    currentPassword: () => password,
    getEnrolledFactors: () => (isSignedIn() ? [...factors] : []),
    unenrollMfa: (factorUid: string) => Promise.resolve(void (factors = factors.filter((factor) => factor.uid !== factorUid))),
    reauthenticate: async (candidate: string) => {
      if (candidate !== password) throw new AuthError("INVALID_CREDENTIALS");
      recentlyReauthenticated = true;
      return factors.length === 0 ? { kind: "signed-in" as const } : { kind: "mfa-required" as const, challenge: reauthChallenge() };
    },
    updatePassword: async (next: string) => {
      if (!recentlyReauthenticated) throw new AuthError("REQUIRES_RECENT_LOGIN");
      if (next.length < 8) throw new AuthError("WEAK_PASSWORD");
      password = next;
    },
    startTotpEnrollment: () => Promise.resolve({ secretKey: FAKE_TOTP_SECRET, uri: FAKE_TOTP_URI, handle: "totp" }),
    finishTotpEnrollment: async (_enrollment: unknown, code: string, displayName: string) => {
      checkCode(code);
      enroll("totp", displayName, null);
    },
    startSmsEnrollment: async (phoneNumber: string) => {
      if (!/^\+[1-9]\d{7,14}$/u.test(phoneNumber)) throw new AuthError("INVALID_PHONE_NUMBER");
      return `verification:${phoneNumber}`;
    },
    finishSmsEnrollment: async (verificationId: string, code: string, displayName: string) => {
      checkCode(code);
      enroll("phone", displayName, verificationId.replace(/^verification:/u, ""));
    },
  };
};

/** Account creation and password reset emails, recorded for assertions. */
const createFakeAccounts = (initial: FakeAuthOptions, signIn: (user: Pick<AuthUser, "email" | "displayName">) => void) => {
  const taken = new Set(initial.takenEmails ?? []);
  const resets: { email: string; locale: string }[] = [];
  const created: { email: string; displayName: string }[] = [];
  return {
    passwordResets: () => [...resets],
    createdAccounts: () => [...created],
    sendPasswordReset: (email: string, locale: string) => Promise.resolve(void resets.push({ email, locale })),
    createAccount: async ({ email, password, displayName }: { email: string; password: string; displayName: string }) => {
      if (taken.has(email)) throw new AuthError("EMAIL_ALREADY_IN_USE");
      if (password.length < 8) throw new AuthError("WEAK_PASSWORD");
      taken.add(email);
      created.push({ email, displayName });
      signIn({ email, displayName });
      return { kind: "signed-in" as const };
    },
  };
};

/**
 * In-memory `AuthPort` for tests: `signInWithEmail` signs `user` in, tokens are
 * `token-<uid>` (`-fresh` when forced), claims come from `setClaims`. Sign-in MFA rejects (tests
 * override it); enrollment and re-authentication accept `FAKE_MFA_CODE` and `options.password`.
 */
export const createFakeAuth = (user: AuthUser, initial: AuthState = { status: "signed-out" }, options: FakeAuthOptions = {}): FakeAuth => {
  let state = initial;
  let claims: Readonly<Record<string, unknown>> = {};
  let refreshedClaims: Readonly<Record<string, unknown>> | undefined;
  const listeners = new Set<() => void>();
  const setState = (next: AuthState): void => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    setState,
    signInWithEmail: () => {
      setState({ status: "signed-in", user });
      return Promise.resolve({ kind: "signed-in" });
    },
    signInWithCustomToken: () => Promise.resolve(setState({ status: "signed-in", user })),
    setClaims: (next, afterRefresh) => {
      claims = next;
      refreshedClaims = afterRefresh;
    },
    getIdToken: ({ forceRefresh }) => {
      if (forceRefresh && refreshedClaims !== undefined) claims = refreshedClaims;
      return Promise.resolve(state.status === "signed-in" ? `token-${state.user.uid}${forceRefresh ? "-fresh" : ""}` : null);
    },
    getIdTokenClaims: () => Promise.resolve(state.status === "signed-in" ? claims : null),
    signOut: () => Promise.resolve(setState({ status: "signed-out" })),
    // Only the re-authentication challenge of `reauthenticate` resolves here; sign-in MFA tests override these.
    sendMfaSmsCode: (challenge) => (challenge.handle === REAUTH_HANDLE ? Promise.resolve("verification-reauth") : notSupported()),
    resolveMfa: async (challenge, answer) => {
      if (challenge.handle !== REAUTH_HANDLE) return notSupported();
      checkCode(answer.code);
    },
    ...createFakeSecurity(options, () => state.status === "signed-in"),
    ...createFakeAccounts(options, (profile) => setState({ status: "signed-in", user: { ...user, ...profile } })),
  };
};
