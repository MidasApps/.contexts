// Test world of the platform use cases: the access write world (org-a with an owner and a
// member), staff and impersonation repositories mirrored into the access store, a fake
// Firebase Auth, an in-memory audit log and a movable clock.
import { UserIdSchema, type UserPrincipal } from "@core/contracts";
import { makeAccessWriteWorld, nodes, system } from "#/services/access/application/use-cases/access-write.fixture.ts";
import { createAccessCore } from "#/services/access/composition.ts";
import { createInMemoryAuditLogWriter } from "#/services/audit/adapters/driven/in-memory-audit-log-writer.ts";
import { makeRecordAudit } from "#/services/audit/application/use-cases/record-audit.ts";
import { inMemoryUnitOfWork } from "#/services/shared/firestore/unit-of-work.ts";
import { createLogger, type LogRecord } from "#/services/shared/observability/logger.ts";
import { createFakeFirebaseAuth } from "../../adapters/driven/fake-firebase-auth.ts";
import {
  createInMemoryImpersonationSessionRepository,
  createInMemoryPlatformStaffRepository,
} from "../../adapters/driven/in-memory-platform-repositories.ts";
import { createPlatformServices } from "../../platform-composition.ts";

export const PLATFORM_NOW = "2026-09-30T12:00:00.000Z";

export const staffPrincipal = (uid: string, mfa = true): UserPrincipal => ({
  type: "user",
  uid: UserIdSchema.parse(uid),
  mfa,
});

export const buildPlatformWorld = async () => {
  let now = new Date(PLATFORM_NOW);
  const clock = { now: () => new Date(now.getTime()) };
  const world = makeAccessWriteWorld();
  await world.grant("owner", nodes.orgA, [system("owner")]);
  await world.grant("member", nodes.orgA, [system("member")]);
  world.store.putUser("staff");
  world.store.putUser("support-2");
  world.writes.putUser("staff");
  const core = createAccessCore({
    readers: { ...world.store, grants: world.writes.grantReader, roles: world.writes.roleReader },
    clock,
  });
  const writer = createInMemoryAuditLogWriter();
  const logs: LogRecord[] = [];
  const staff = createInMemoryPlatformStaffRepository({ onWrite: (row) => world.store.putPlatformStaff(row.uid, row) });
  const impersonations = createInMemoryImpersonationSessionRepository({
    onWrite: (row) => world.store.putImpersonationSession(row.id, row),
  });
  const auth = createFakeFirebaseAuth();
  const platform = createPlatformServices({
    staff,
    // Every uid the tests name is a user, but "ghost".
    users: { exists: (uid) => Promise.resolve(uid !== "ghost") },
    impersonations,
    customTokens: auth.customTokens,
    syncClaims: world.deps.syncClaims,
    audit: makeRecordAudit({ writer, clock }),
    unitOfWork: inMemoryUnitOfWork,
    clock,
    logger: createLogger({ context: { service: "test", env: "local" }, sink: (record) => logs.push(record) }),
  });
  return {
    ...world,
    platform,
    staff,
    impersonations,
    auth,
    logs,
    access: () => core.forRequest(),
    entries: (log: "tenant" | "platform") => (log === "tenant" ? writer.entries("tenant") : writer.entries("platform")),
    actions: (log: "tenant" | "platform") =>
      (log === "tenant" ? writer.entries("tenant") : writer.entries("platform")).map((entry) => entry.action),
    setNow: (iso: string) => {
      now = new Date(iso);
    },
  };
};
