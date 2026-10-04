import type { SessionId } from "@core/contracts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import { RecentSignInRequiredError, SessionInvalidError } from "../../domain/errors/session-errors.ts";
import { hashSessionSecret } from "../../domain/session-secret.ts";
import { summarizeUserAgent } from "../../domain/user-agent.ts";
import { DAY_MS, type SessionDeps } from "../session-deps.ts";

/** A sign-in older than this cannot open a web session (decision 0007 §1). */
export const RECENT_SIGN_IN_SECONDS = 5 * 60;

export type CreatedWebSession = {
  readonly sessionId: SessionId;
  /** The Firebase session cookie, for `__session` only; never logged or returned to scripts. */
  readonly cookie: string;
  /** `Max-Age` of the cookie (seconds), equal to the cookie's own lifetime. */
  readonly maxAgeSeconds: number;
  readonly expiresAt: string;
};

export type CreateWebSession = (command: {
  idToken: string;
  userAgent: string | null;
}) => Promise<Result<CreatedWebSession, SessionInvalidError | RecentSignInRequiredError>>;

/**
 * `createSession({ idToken })` (SP1 spec §3.3): verifies the ID token with revocation, needs
 * `auth_time` within 5 minutes, creates the session cookie (`SESSION_MAX_AGE_DAYS`) and a
 * `sessions` record holding only `sha256(cookie)`.
 */
export const makeCreateWebSession =
  (deps: SessionDeps): CreateWebSession =>
  async ({ idToken, userAgent }) => {
    const signIn = await deps.cookies.verifyIdToken(idToken);
    if (signIn === null) return err(new SessionInvalidError("ID_TOKEN_INVALID"));
    const now = deps.clock.now();
    if (now.getTime() / 1000 - signIn.authTimeSeconds > RECENT_SIGN_IN_SECONDS)
      return err(new RecentSignInRequiredError());
    const expiresInMs = deps.sessionMaxAgeDays * DAY_MS;
    const cookie = await deps.cookies.createSessionCookie(idToken, { expiresInMs });
    const sessionId = deps.sessions.newId();
    const expiresAt = new Date(now.getTime() + expiresInMs).toISOString();
    await deps.sessions.create({
      id: sessionId,
      uid: signIn.uid,
      kind: "web",
      mfa: signIn.mfa,
      userAgent: summarizeUserAgent(userAgent),
      cookieHash: hashSessionSecret(cookie),
      secretHash: null,
      previousSecretHashes: [],
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      expiresAt,
      revokedAt: null,
    });
    return ok({ sessionId, cookie, maxAgeSeconds: expiresInMs / 1000, expiresAt });
  };
