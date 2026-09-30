import type { SessionId, UserPrincipal } from "@core/contracts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import { SessionInvalidError } from "../../domain/errors/session-errors.ts";
import type { SessionRecord } from "../../domain/session-record.schema.ts";
import { hashSessionSecret } from "../../domain/session-secret.ts";
import { isSessionOpen, type SessionDeps } from "../session-deps.ts";

export type WebSession = { readonly principal: UserPrincipal; readonly sessionId: SessionId; readonly record: SessionRecord };

/**
 * Cookie → `verifySessionCookie(cookie, true)` → the open `web` record with the same
 * `cookieHash` and uid (decision 0007 §2, §4). Our record is checked on every use because
 * Firebase cannot revoke one cookie alone.
 */
export const loadWebSession = async (deps: SessionDeps, cookie: string | undefined): Promise<Result<WebSession, SessionInvalidError>> => {
  if (cookie === undefined || cookie === "") return err(new SessionInvalidError("COOKIE_MISSING"));
  const verified = await deps.cookies.verifySessionCookie(cookie);
  if (verified === null) return err(new SessionInvalidError("COOKIE_INVALID"));
  const record = await deps.sessions.findByCookieHash(hashSessionSecret(cookie));
  const usable = record !== null && record.kind === "web" && record.uid === verified.uid && isSessionOpen(record, deps.clock.now());
  if (!usable) return err(new SessionInvalidError("SESSION_CLOSED"));
  return ok({ principal: { type: "user", uid: record.uid, mfa: record.mfa }, sessionId: record.id, record });
};

export type RequireWebSession = (command: { cookie: string | undefined }) => Promise<Result<Omit<WebSession, "record">, SessionInvalidError>>;

/** RSC guard of `(app)` layouts (SP1 spec §3.3 step 4): a principal, or sign in again. */
export const makeRequireWebSession =
  (deps: SessionDeps): RequireWebSession =>
  async ({ cookie }) => {
    const loaded = await loadWebSession(deps, cookie);
    return loaded.ok ? ok({ principal: loaded.data.principal, sessionId: loaded.data.sessionId }) : loaded;
  };
