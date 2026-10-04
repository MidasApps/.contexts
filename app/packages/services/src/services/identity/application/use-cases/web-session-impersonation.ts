import type { ImpersonationSession, ImpersonationSessionId } from "@core/contracts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import { ImpersonationNotFoundError } from "../../domain/errors/impersonation-errors.ts";
import { NotPlatformStaffError, type SessionInvalidError } from "../../domain/errors/session-errors.ts";
import type { SessionRecord } from "../../domain/session-record.schema.ts";
import type { SessionDeps } from "../session-deps.ts";
import { auditEnd } from "./end-impersonation.ts";
import { loadWebSession } from "./require-web-session.ts";

type CustomToken = { customToken: string };

export type EnterImpersonation = (command: {
  cookie: string | undefined;
  impersonationSessionId: ImpersonationSessionId;
  requestId: string;
}) => Promise<Result<CustomToken, SessionInvalidError | NotPlatformStaffError | ImpersonationNotFoundError>>;

export type LeaveImpersonation = (command: {
  cookie: string | undefined;
  requestId: string;
}) => Promise<Result<CustomToken, SessionInvalidError>>;

const isOpen = (session: ImpersonationSession, now: Date): boolean =>
  session.endedAt === null && Date.parse(session.expiresAt) > now.getTime();

/** The staff account of the cookie, still active platform staff with MFA (as `/admin` requires). */
const isActiveStaff = async (deps: SessionDeps, record: SessionRecord): Promise<boolean> => {
  const [staff, user] = await Promise.all([
    deps.principals.getPlatformStaff(record.uid),
    deps.principals.getUser(record.uid),
  ]);
  return staff !== null && staff.isActive && user?.status === "active" && record.mfa;
};

/** The same claims the start of the session put in its one-time token (SP1 spec §6.6). */
const impersonatedToken = (deps: SessionDeps, session: ImpersonationSession): Promise<string> =>
  deps.customTokens.createCustomToken(session.targetUid, { imp: session.id, impBy: session.staffUid });

/** The staff member's own token, as a plain exchange gives it. */
export const staffToken = (deps: SessionDeps, record: SessionRecord): Promise<string> =>
  deps.customTokens.createCustomToken(record.uid, { smfa: record.mfa, sessionId: record.id });

const auditExpiry = (deps: SessionDeps, session: ImpersonationSession, requestId: string): Promise<unknown> =>
  deps.audit.record({
    log: "platform",
    action: "IMPERSONATION_EXPIRED",
    outcome: "success",
    requestId,
    actor: { type: "user", id: session.staffUid },
    target: { type: "user", id: session.targetUid },
    targetTenantId: session.tenantId,
  });

/**
 * Forgets the impersonation of a web session that can no longer be used (ended, expired, staff
 * role lost). An expiry nobody ended is audited once: the marker is cleared in the same step.
 */
const closeMarker = async (
  deps: SessionDeps,
  record: SessionRecord,
  session: ImpersonationSession | null,
  requestId: string,
): Promise<void> => {
  await deps.sessions.setImpersonation({ id: record.id, impersonationSessionId: null });
  if (session !== null && session.endedAt === null && !isOpen(session, deps.clock.now()))
    await auditExpiry(deps, session, requestId);
};

/**
 * The token a web session restores (decision 0047): the impersonated user while the session it
 * entered is open, belongs to the cookie's staff member and that member is still staff with MFA;
 * otherwise the staff account (fail closed, never the target user).
 */
export const restoreWebSessionToken = async (
  deps: SessionDeps,
  record: SessionRecord,
  requestId: string,
): Promise<string> => {
  const markerId = record.impersonationSessionId ?? null;
  if (markerId === null) return staffToken(deps, record);
  const session = await deps.impersonations.get(undefined, markerId);
  const usable =
    session !== null &&
    session.staffUid === record.uid &&
    isOpen(session, deps.clock.now()) &&
    (await isActiveStaff(deps, record));
  if (usable) return impersonatedToken(deps, session);
  await closeMarker(deps, record, session?.staffUid === record.uid ? session : null, requestId);
  return staffToken(deps, record);
};

/**
 * Server Action `enterImpersonation({ impersonationSessionId })`: the staff member of the cookie
 * opens the app as the user of one of their own open sessions. The web session remembers it, so a
 * reload restores the user until the session ends or expires. Writes nothing but the marker: the
 * start was audited, and every impersonated request is audited by `/v1`.
 */
export const makeEnterImpersonation =
  (deps: SessionDeps): EnterImpersonation =>
  async ({ cookie, impersonationSessionId }) => {
    const loaded = await loadWebSession(deps, cookie);
    if (!loaded.ok) return loaded;
    const { record } = loaded.data;
    if (!(await isActiveStaff(deps, record))) return err(new NotPlatformStaffError());
    const session = await deps.impersonations.get(undefined, impersonationSessionId);
    if (session?.staffUid !== record.uid || !isOpen(session, deps.clock.now()))
      return err(new ImpersonationNotFoundError());
    await deps.sessions.setImpersonation({ id: record.id, impersonationSessionId: session.id });
    return ok({ customToken: await impersonatedToken(deps, session) });
  };

/**
 * Server Action `leaveImpersonation()`: ends the impersonation session the web session is in
 * (audited on both logs, once), forgets it and returns the staff member's own token, so support
 * goes back to the staff account without signing in again. Idempotent.
 */
export const makeLeaveImpersonation =
  (deps: SessionDeps): LeaveImpersonation =>
  async ({ cookie, requestId }) => {
    const loaded = await loadWebSession(deps, cookie);
    if (!loaded.ok) return loaded;
    const { record } = loaded.data;
    const markerId = record.impersonationSessionId ?? null;
    if (markerId !== null) {
      const ended = await deps.unitOfWork.run(async (tx) => {
        const session = await deps.impersonations.get(tx, markerId);
        if (session?.staffUid !== record.uid || !isOpen(session, deps.clock.now()))
          return session?.staffUid === record.uid ? session : null;
        deps.impersonations.end(tx, { id: session.id, endedAt: deps.clock.now().toISOString(), actorId: record.uid });
        await auditEnd(tx, deps, session, requestId);
        return null;
      });
      await closeMarker(deps, record, ended, requestId);
    }
    return ok({ customToken: await staffToken(deps, record) });
  };
