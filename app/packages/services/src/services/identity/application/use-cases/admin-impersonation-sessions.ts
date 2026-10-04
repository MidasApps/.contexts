import {
  type AdminImpersonationSession,
  AdminImpersonationSessionSchema,
  type ImpersonationSession,
  type ImpersonationSessionId,
  type UserPrincipal,
} from "@core/contracts";
import type { Page, PageRequest } from "../../../shared/pagination/page.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import { ImpersonationNotFoundError } from "../../domain/errors/impersonation-errors.ts";
import type { PlatformDeps } from "../platform-deps.ts";

type SessionDeps = Pick<PlatformDeps, "impersonations" | "audit" | "unitOfWork" | "clock">;

/** Most open sessions one answer holds; a session lives at most an hour, so the open set is small. */
export const OPEN_IMPERSONATION_SESSIONS_MAX = 200;

const statusOf = (session: ImpersonationSession, now: Date): AdminImpersonationSession["status"] =>
  session.endedAt !== null ? "ended" : Date.parse(session.expiresAt) <= now.getTime() ? "expired" : "active";

// Parsed, not cast: the view is strict, so a stored field outside the contract never leaks.
const toView = (session: ImpersonationSession, now: Date): AdminImpersonationSession =>
  AdminImpersonationSessionSchema.parse({
    id: session.id,
    staffUid: session.staffUid,
    targetUid: session.targetUid,
    tenantId: session.tenantId,
    reason: session.reason,
    expiresAt: session.expiresAt,
    endedAt: session.endedAt,
    createdAt: session.createdAt,
    status: statusOf(session, now),
  });

export type ListImpersonationSessions = (query: {
  readonly activeOnly: boolean;
  readonly page: PageRequest;
}) => Promise<Page<AdminImpersonationSession>>;

/**
 * `GET /v1/admin/impersonation-sessions` (decision 0044): every staff member's sessions, newest
 * first and cursor paged; or only the ones still open, soonest expiry first, in one page.
 */
export const makeListImpersonationSessions =
  (deps: Pick<SessionDeps, "impersonations" | "clock">): ListImpersonationSessions =>
  async ({ activeOnly, page }) => {
    const now = deps.clock.now();
    if (activeOnly) {
      const open = await deps.impersonations.listOpen({ now, limit: OPEN_IMPERSONATION_SESSIONS_MAX });
      return { items: open.map((session) => toView(session, now)), nextCursor: null };
    }
    const listed = await deps.impersonations.listRecent(page);
    return { items: listed.items.map((session) => toView(session, now)), nextCursor: listed.nextCursor };
  };

export type EndImpersonationSession = (command: {
  readonly actor: UserPrincipal;
  readonly sessionId: ImpersonationSessionId;
  readonly requestId: string;
}) => Promise<Result<void, ImpersonationNotFoundError>>;

/**
 * `POST /v1/admin/impersonation-sessions/{sessionId}/end` (decision 0044): staff end any session,
 * their own or a colleague's (the handler already required `platform.user.impersonate` with MFA).
 * Idempotent: a session already ended or expired answers ok without a write or an audit entry.
 * The end is audited on the platform log with the staff member who ended it and on the tenant
 * log like every other end (SP1 spec §6.6).
 */
export const makeEndImpersonationSession =
  (deps: SessionDeps): EndImpersonationSession =>
  ({ actor, sessionId, requestId }) =>
    deps.unitOfWork.run(async (tx): Promise<Result<void, ImpersonationNotFoundError>> => {
      const session = await deps.impersonations.get(tx, sessionId);
      if (session === null) return err(new ImpersonationNotFoundError());
      const now = deps.clock.now();
      if (statusOf(session, now) !== "active") return ok(undefined);
      deps.impersonations.end(tx, { id: session.id, endedAt: now.toISOString(), actorId: actor.uid });
      const common = { action: "IMPERSONATION_ENDED", outcome: "success", requestId } as const;
      await deps.audit.record(
        {
          log: "platform",
          ...common,
          actor: { type: "user", id: actor.uid },
          target: { type: "impersonation-session", id: session.id },
          targetTenantId: session.tenantId,
        },
        tx,
      );
      await deps.audit.record(
        {
          log: "tenant",
          ...common,
          tenantId: session.tenantId,
          actor: { type: "user", id: session.targetUid, onBehalfOf: session.staffUid },
          target: { type: "impersonation-session", id: session.id },
          node: { level: "organization", tenantId: session.tenantId },
        },
        tx,
      );
      return ok(undefined);
    });
