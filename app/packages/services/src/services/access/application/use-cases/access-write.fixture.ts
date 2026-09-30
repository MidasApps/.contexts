// Test world of the access write side: in-memory nodes and principals (Task 6 store),
// in-memory grants/roles/projections/users (Task 9 store), real use cases. Each call
// builds a fresh world (rule `testing`).
import {
  OrganizationIdSchema,
  ProjectIdSchema,
  UnitIdSchema,
  UserIdSchema,
  type RoleRef,
  type TenantNodeRef,
  type UserPrincipal,
} from "@core/contracts";
import { createInMemoryAuditLogWriter } from "../../../audit/adapters/driven/in-memory-audit-log-writer.ts";
import { makeRecordAudit } from "../../../audit/application/use-cases/record-audit.ts";
import { fixedClock } from "../../../shared/clock/clock.ts";
import { inMemoryUnitOfWork } from "../../../shared/firestore/unit-of-work.ts";
import { createLogger, type LogRecord } from "../../../shared/observability/logger.ts";
import { createInMemoryAccessStore } from "../../adapters/driven/in-memory-access-store.ts";
import { createInMemoryAccessWriteStore } from "../../adapters/driven/in-memory-access-write-store.ts";
import { createAccessCore, createAccessServices } from "../../composition.ts";
import type { AccessWriteDeps } from "../access-write-deps.ts";
import { prepareGrant } from "../membership-writes.ts";
import { makeSyncClaims } from "./sync-claims.ts";

export const NOW = "2026-09-30T12:00:00.000Z";
export const REQUEST_ID = "01K6B0000000000000000000RQ";

const tenantId = OrganizationIdSchema.parse("org-a");

export const nodes = {
  orgA: { level: "organization", tenantId } as TenantNodeRef,
  orgB: { level: "organization", tenantId: OrganizationIdSchema.parse("org-b") } as TenantNodeRef,
  p1: { level: "project", tenantId, projectId: ProjectIdSchema.parse("p1") } as TenantNodeRef,
  u1: { level: "unit", tenantId, projectId: ProjectIdSchema.parse("p1"), unitId: UnitIdSchema.parse("u1") } as TenantNodeRef,
};

export const user = (uid: string): UserPrincipal => ({ type: "user", uid: UserIdSchema.parse(uid), mfa: false });

export const system = (key: "owner" | "admin" | "member" | "viewer" | "device"): RoleRef => ({ kind: "system", key });

/** org-a (p1 > u1) and org-b; users are created active on demand by `grant`. */
export const makeAccessWriteWorld = () => {
  const clock = fixedClock(NOW);
  const store = createInMemoryAccessStore();
  store.putOrganization({ id: "org-a" });
  store.putOrganization({ id: "org-b" });
  store.putProject({ id: "p1", tenantId: "org-a" });
  store.putUnit({ id: "u1", tenantId: "org-a", projectId: "p1" });
  const writes = createInMemoryAccessWriteStore();
  const core = createAccessCore({ readers: { ...store, grants: writes.grantReader, roles: writes.roleReader }, clock });
  const auditLog = createInMemoryAuditLogWriter();
  const logs: LogRecord[] = [];
  const logger = createLogger({ context: { service: "test", env: "local" }, sink: (record) => logs.push(record) });
  const syncClaims = makeSyncClaims({ users: writes.users, projections: writes.projections, principals: store.principals, claims: writes.claims, logger });
  const deps: AccessWriteDeps = {
    registry: core.registry,
    memberships: writes.memberships,
    roles: writes.roles,
    roleReader: writes.roleReader,
    projections: writes.projections,
    users: writes.users,
    audit: makeRecordAudit({ writer: auditLog, clock }),
    unitOfWork: inMemoryUnitOfWork,
    clock,
    syncClaims,
  };
  /** Seeds a grant without authorization (as `createOrganization` does for the owner). */
  const grant = async (uid: string, node: TenantNodeRef, roles: readonly RoleRef[]) => {
    store.putUser(uid);
    if (writes.userOf(uid) === undefined) writes.putUser(uid);
    const membership = await deps.unitOfWork.run(async (tx) => {
      const plan = await prepareGrant(tx, deps, {
        tenantId: node.tenantId,
        principal: { type: "user", id: uid },
        node,
        roles,
        grantedBy: UserIdSchema.parse("seed"),
        actor: { type: "system", id: "system" },
        requestId: REQUEST_ID,
      });
      if (!plan.ok) throw plan.error;
      await plan.data.commit();
      return plan.data.membership;
    });
    return membership;
  };
  return { store, writes, core, deps, services: createAccessServices(deps), auditLog, logs, grant, access: () => core.forRequest() };
};
