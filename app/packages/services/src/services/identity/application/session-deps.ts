import type { SessionSummary, UserPrincipal } from "@core/contracts";
import type { PrincipalStatusReader } from "../../access/application/ports/driven/principal-status-reader.ts";
import { AccessDeniedError } from "../../access/domain/errors/access-denied-error.ts";
import type { RandomBytes } from "../../access/domain/invitation-token.ts";
import type { AuditWriter } from "../../audit/application/use-cases/record-audit.ts";
import type { Clock } from "../../shared/clock/clock.ts";
import type { UnitOfWork } from "../../shared/firestore/unit-of-work.ts";
import type { Logger } from "../../shared/observability/logger.ts";
import { err, ok, type Result } from "../../shared/result/result.ts";
import type { SessionRecord } from "../domain/session-record.schema.ts";
import type { AuthUserAdmin } from "./ports/driven/auth-user-admin.ts";
import type { CustomTokenIssuer } from "./ports/driven/custom-token-issuer.ts";
import type { SessionCookieIssuer } from "./ports/driven/session-cookie-issuer.ts";
import type { SessionRepository } from "./ports/driven/session-repository.ts";

/** Dependencies of the session use cases (SP1 Task 13, decision 0007). */
export type SessionDeps = {
  readonly sessions: SessionRepository;
  readonly cookies: SessionCookieIssuer;
  readonly customTokens: CustomTokenIssuer;
  readonly authUsers: AuthUserAdmin;
  readonly principals: Pick<PrincipalStatusReader, "getPlatformStaff" | "getUser">;
  readonly audit: AuditWriter;
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
  readonly randomBytes: RandomBytes;
  readonly logger: Logger;
  /** `SESSION_MAX_AGE_DAYS` (1–14, default 5). */
  readonly sessionMaxAgeDays: number;
  /** `DESKTOP_SESSION_MAX_AGE_DAYS` (default 30, sliding). */
  readonly desktopSessionMaxAgeDays: number;
};

export const DAY_MS = 86_400_000;

/** A session is usable while not revoked and not expired. */
export const isSessionOpen = (record: SessionRecord, now: Date): boolean =>
  record.revokedAt === null && Date.parse(record.expiresAt) > now.getTime();

/** What the owner sees of a record: never the hashes; `current` marks the caller's own session. */
export const toSessionSummary = (record: SessionRecord, currentSessionId: string | undefined): SessionSummary => ({
  id: record.id,
  kind: record.kind,
  mfa: record.mfa,
  userAgent: record.userAgent,
  createdAt: record.createdAt,
  lastSeenAt: record.lastSeenAt,
  expiresAt: record.expiresAt,
  current: record.id === currentSessionId,
});

/** Session changes are writes: refused to impersonating staff (read-only, SP1 spec §6.6). */
export const refuseImpersonation = (actor: UserPrincipal): Result<void, AccessDeniedError> =>
  actor.impersonation === undefined ? ok(undefined) : err(new AccessDeniedError("IMPERSONATION_READ_ONLY"));

/** Audit entry of a session change; sessions have no tenant, so they go to the platform log. */
export const recordSessionAudit = (
  deps: Pick<SessionDeps, "audit">,
  args: { action: "SESSION_REVOKED" | "ALL_SESSIONS_REVOKED" | "DESKTOP_SESSION_REUSE_DETECTED"; uid: string; targetId: string; requestId: string; actorType?: "user" | "system" },
): Promise<unknown> =>
  deps.audit.record({
    log: "platform",
    action: args.action,
    actor: args.actorType === "system" ? { type: "system", id: "system" } : { type: "user", id: args.uid },
    target: { type: args.action === "ALL_SESSIONS_REVOKED" ? "user" : "session", id: args.targetId },
    outcome: "success",
    requestId: args.requestId,
  });
