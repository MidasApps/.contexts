import type { CreateDesktopSessionResponse, UserPrincipal } from "@core/contracts";
import type { AccessDeniedError } from "../../../access/domain/errors/access-denied-error.ts";
import { ok, type Result } from "../../../shared/result/result.ts";
import { generateSessionSecret, hashSessionSecret } from "../../domain/session-secret.ts";
import { summarizeUserAgent } from "../../domain/user-agent.ts";
import { DAY_MS, refuseImpersonation, type SessionDeps } from "../session-deps.ts";

export type CreateDesktopSession = (command: {
  actor: UserPrincipal;
  userAgent: string | null;
}) => Promise<Result<CreateDesktopSessionResponse, AccessDeniedError>>;

/**
 * `POST /v1/me/desktop-sessions` (SP1 spec §3.5): a 256-bit secret returned once (the
 * desktop keeps it in the OS keychain); the record stores its sha256 and the caller's MFA.
 */
export const makeCreateDesktopSession =
  (deps: SessionDeps): CreateDesktopSession =>
  async ({ actor, userAgent }) => {
    const refused = refuseImpersonation(actor);
    if (!refused.ok) return refused;
    const now = deps.clock.now();
    const secret = generateSessionSecret(deps.randomBytes);
    const sessionId = deps.sessions.newId();
    const expiresAt = new Date(now.getTime() + deps.desktopSessionMaxAgeDays * DAY_MS).toISOString();
    await deps.sessions.create({
      id: sessionId,
      uid: actor.uid,
      kind: "desktop",
      mfa: actor.mfa,
      userAgent: summarizeUserAgent(userAgent),
      cookieHash: null,
      secretHash: hashSessionSecret(secret),
      previousSecretHashes: [],
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      expiresAt,
      revokedAt: null,
    });
    return ok({ sessionId, secret, expiresAt });
  };
