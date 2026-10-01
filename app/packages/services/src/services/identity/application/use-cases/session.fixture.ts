// Test world of the session use cases: in-memory sessions, a fake Firebase Auth, staff docs
// and an in-memory audit log, with a movable clock.
import type { PlatformStaffRecord } from "../../../access/application/ports/driven/principal-status-reader.ts";
import { createInMemoryAuditLogWriter } from "../../../audit/adapters/driven/in-memory-audit-log-writer.ts";
import { makeRecordAudit } from "../../../audit/application/use-cases/record-audit.ts";
import { inMemoryUnitOfWork } from "../../../shared/firestore/unit-of-work.ts";
import { createLogger } from "../../../shared/observability/logger.ts";
import { createFakeFirebaseAuth } from "../../adapters/driven/fake-firebase-auth.ts";
import { createInMemoryImpersonationSessionRepository } from "../../adapters/driven/in-memory-platform-repositories.ts";
import { createInMemorySessionRepository } from "../../adapters/driven/in-memory-session-repository.ts";
import { createSessionServices } from "../../session-composition.ts";
import type { SessionId, UserId } from "@core/contracts";

export const WORLD_NOW = "2026-09-30T12:00:00.000Z";

export const buildSessionWorld = () => {
  let now = new Date(WORLD_NOW);
  const clock = { now: () => new Date(now.getTime()) };
  const repository = createInMemorySessionRepository();
  const impersonations = createInMemoryImpersonationSessionRepository();
  const auth = createFakeFirebaseAuth();
  const staff = new Map<string, PlatformStaffRecord>();
  const writer = createInMemoryAuditLogWriter();
  let random = 0;
  const services = createSessionServices({
    sessions: repository,
    impersonations,
    cookies: auth.cookies,
    customTokens: auth.customTokens,
    authUsers: auth.authUsers,
    principals: {
      getPlatformStaff: (uid) => Promise.resolve(staff.get(uid) ?? null),
      getUser: () => Promise.resolve({ status: "active" }),
    },
    audit: makeRecordAudit({ writer, clock }),
    unitOfWork: inMemoryUnitOfWork,
    clock,
    randomBytes: (size) => new Uint8Array(size).fill((random += 1) % 256),
    logger: createLogger({ context: { service: "test", env: "local" }, sink: () => undefined }),
    sessionMaxAgeDays: 5,
    desktopSessionMaxAgeDays: 30,
  });
  let tokens = 0;
  /** A web session for `uid` created from a fresh sign-in. */
  const webSession = async (uid: UserId, options: { mfa: boolean }): Promise<{ cookie: string; sessionId: SessionId }> => {
    tokens += 1;
    const idToken = `id-${tokens}`;
    auth.addIdToken(idToken, { uid, authTimeSeconds: now.getTime() / 1000, mfa: options.mfa });
    const created = await services.createWebSession({ idToken, userAgent: null });
    if (!created.ok) throw created.error;
    return { cookie: created.data.cookie, sessionId: created.data.sessionId };
  };
  return {
    services,
    repository,
    impersonations,
    auth,
    staff,
    webSession,
    audited: () => writer.entries("platform").map((entry) => entry.action),
    tenantAudited: () => writer.entries("tenant").map((entry) => entry.action),
    setNow: (iso: string) => {
      now = new Date(iso);
    },
  };
};
