import type { UserPrincipal } from "@core/contracts";
import type { AccessDeniedError } from "../../../access/domain/errors/access-denied-error.ts";
import { ok, type Result } from "../../../shared/result/result.ts";
import { recordSessionAudit, refuseImpersonation, type SessionDeps } from "../session-deps.ts";

export type RevokeAllSessions = (command: {
  actor: UserPrincipal;
  requestId: string;
}) => Promise<Result<number, AccessDeniedError>>;

/**
 * "Sign out everywhere" (`POST /v1/me/sessions/revoke-all`, SP1 spec §3.3 step 5):
 * `revokeRefreshTokens(uid)` first (every cookie, ID token and future desktop exchange dies
 * even if marking the records fails midway), then every open record is marked revoked.
 * @returns how many records were closed.
 */
export const makeRevokeAllSessions =
  (deps: SessionDeps): RevokeAllSessions =>
  async ({ actor, requestId }) => {
    const refused = refuseImpersonation(actor);
    if (!refused.ok) return refused;
    await deps.authUsers.revokeRefreshTokens(actor.uid);
    const closed = await deps.sessions.revokeAllOf({ uid: actor.uid, revokedAt: deps.clock.now().toISOString() });
    await recordSessionAudit(deps, { action: "ALL_SESSIONS_REVOKED", uid: actor.uid, targetId: actor.uid, requestId });
    return ok(closed);
  };
