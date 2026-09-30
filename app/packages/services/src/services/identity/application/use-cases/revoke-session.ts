import type { SessionId, UserPrincipal } from "@core/contracts";
import type { AccessDeniedError } from "../../../access/domain/errors/access-denied-error.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import { SessionNotFoundError } from "../../domain/errors/session-errors.ts";
import { recordSessionAudit, refuseImpersonation, type SessionDeps } from "../session-deps.ts";

export type RevokeSession = (command: { actor: UserPrincipal; sessionId: SessionId; requestId: string }) => Promise<Result<void, SessionNotFoundError | AccessDeniedError>>;

/**
 * `DELETE /v1/me/sessions/{sessionId}`: closes one of the caller's own sessions (404 for
 * anyone else's). Revoking an already revoked session succeeds again (idempotent 204).
 */
export const makeRevokeSession =
  (deps: SessionDeps): RevokeSession =>
  async ({ actor, sessionId, requestId }) => {
    const refused = refuseImpersonation(actor);
    if (!refused.ok) return refused;
    const record = await deps.sessions.get(undefined, sessionId);
    if (record === null || record.uid !== actor.uid) return err(new SessionNotFoundError());
    if (record.revokedAt !== null) return ok(undefined);
    await deps.sessions.revoke(undefined, { id: sessionId, revokedAt: deps.clock.now().toISOString() });
    await recordSessionAudit(deps, { action: "SESSION_REVOKED", uid: actor.uid, targetId: sessionId, requestId });
    return ok(undefined);
  };
