import { hashSessionSecret } from "../../domain/session-secret.ts";
import { recordSessionAudit, type SessionDeps } from "../session-deps.ts";

export type SignOutWebSession = (command: { cookie: string | undefined; requestId: string }) => Promise<void>;

/**
 * `signOut()` (SP1 spec §3.3 step 5): marks the cookie's record revoked. The record is found
 * by hash alone, so even an expired cookie closes its record; the caller deletes the cookie.
 */
export const makeSignOutWebSession =
  (deps: SessionDeps): SignOutWebSession =>
  async ({ cookie, requestId }) => {
    if (cookie === undefined || cookie === "") return;
    const record = await deps.sessions.findByCookieHash(hashSessionSecret(cookie));
    if (record === null || record.revokedAt !== null) return;
    await deps.sessions.revoke(undefined, { id: record.id, revokedAt: deps.clock.now().toISOString() });
    await recordSessionAudit(deps, { action: "SESSION_REVOKED", uid: record.uid, targetId: record.id, requestId });
  };
