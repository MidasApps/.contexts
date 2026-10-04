import type { ExchangeDesktopSessionResponse } from "@core/contracts";
import { err, ok, type Result } from "#/services/shared/result/result.ts";
import { SessionInvalidError } from "../../domain/errors/session-errors.ts";
import { MAX_PREVIOUS_SECRET_HASHES, type SessionRecord } from "../../domain/session-record.schema.ts";
import { generateSessionSecret, hashSessionSecret, secretHashesMatch } from "../../domain/session-secret.ts";
import { DAY_MS, isSessionOpen, recordSessionAudit, type SessionDeps } from "../session-deps.ts";

export type ExchangeDesktopSession = (command: {
  secret: string;
  requestId: string;
}) => Promise<Result<ExchangeDesktopSessionResponse, SessionInvalidError>>;

// A rotated secret presented again means two holders: close the session (decision 0007 §5).
const handleReuse = async (deps: SessionDeps, secretHash: string, requestId: string): Promise<void> => {
  const stolen = await deps.sessions.findByPreviousSecretHash(secretHash);
  if (stolen === null || stolen.revokedAt !== null) return;
  await deps.sessions.revoke(undefined, { id: stolen.id, revokedAt: deps.clock.now().toISOString() });
  await recordSessionAudit(deps, {
    action: "DESKTOP_SESSION_REUSE_DETECTED",
    uid: stolen.uid,
    targetId: stolen.id,
    requestId,
    actorType: "system",
  });
  deps.logger.warn("desktop_session_reuse_detected", { requestId, sessionId: stolen.id });
};

// The Auth account must exist, be enabled, and not have revoked tokens after the session began.
const isAccountUsable = async (deps: SessionDeps, record: SessionRecord): Promise<boolean> => {
  const state = await deps.authUsers.getState(record.uid);
  if (state === null || state.disabled) return false;
  return state.tokensValidAfter === null || Date.parse(record.createdAt) > Date.parse(state.tokensValidAfter);
};

type Rotation = { readonly secret: string; readonly expiresAt: string };

// Commits the rotation only if the stored hash is still the presented one (a parallel exchange lost).
const rotate = (deps: SessionDeps, record: SessionRecord, secretHash: string): Promise<Rotation | null> =>
  deps.unitOfWork.run(async (tx) => {
    const current = await deps.sessions.get(tx, record.id);
    const now = deps.clock.now();
    if (
      current === null ||
      current.secretHash === null ||
      !secretHashesMatch(current.secretHash, secretHash) ||
      !isSessionOpen(current, now)
    )
      return null;
    const secret = generateSessionSecret(deps.randomBytes);
    const expiresAt = new Date(now.getTime() + deps.desktopSessionMaxAgeDays * DAY_MS).toISOString();
    const previousSecretHashes = [...current.previousSecretHashes, secretHash].slice(-MAX_PREVIOUS_SECRET_HASHES);
    deps.sessions.rotate(tx, {
      id: current.id,
      secretHash: hashSessionSecret(secret),
      previousSecretHashes,
      expiresAt,
      lastSeenAt: now.toISOString(),
    });
    return { secret, expiresAt };
  });

/**
 * `POST /v1/desktop-sessions/exchange` (SP1 spec §3.5): the secret's hash finds an open
 * desktop session of an enabled account created after `tokensValidAfterTime`; the secret is
 * rotated (sliding `DESKTOP_SESSION_MAX_AGE_DAYS`) and a custom token (with `smfa`) returned.
 * Every refusal is the same 401; a reused rotated secret also revokes its session.
 */
export const makeExchangeDesktopSession =
  (deps: SessionDeps): ExchangeDesktopSession =>
  async ({ secret, requestId }) => {
    const secretHash = hashSessionSecret(secret);
    const record = await deps.sessions.findBySecretHash(secretHash);
    if (record === null) {
      await handleReuse(deps, secretHash, requestId);
      return err(new SessionInvalidError("SECRET_UNKNOWN"));
    }
    const usable =
      record.kind === "desktop" && isSessionOpen(record, deps.clock.now()) && (await isAccountUsable(deps, record));
    if (!usable) return err(new SessionInvalidError("SESSION_CLOSED"));
    const rotation = await rotate(deps, record, secretHash);
    if (rotation === null) return err(new SessionInvalidError("SECRET_ROTATED"));
    const customToken = await deps.customTokens.createCustomToken(record.uid, {
      smfa: record.mfa,
      sessionId: record.id,
    });
    return ok({ customToken, secret: rotation.secret, expiresAt: rotation.expiresAt });
  };
