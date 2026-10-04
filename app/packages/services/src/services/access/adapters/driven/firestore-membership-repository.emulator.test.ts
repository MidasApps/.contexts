import { OrganizationIdSchema, ProjectIdSchema, type TenantNodeRef, UnitIdSchema, UserIdSchema } from "@core/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryAuditLogWriter } from "../../../audit/adapters/driven/in-memory-audit-log-writer.ts";
import { makeRecordAudit } from "../../../audit/application/use-cases/record-audit.ts";
import { fixedClock } from "../../../shared/clock/clock.ts";
import { CORE_COLLECTIONS } from "../../../shared/firestore/collections.ts";
import { createFirestoreUnitOfWork } from "../../../shared/firestore/unit-of-work.ts";
import {
  clearCoreCollections,
  emulatorFirebase,
  seedActiveUser,
} from "../../../shared/testing/core-server-emulator.fixture.ts";
import type { AccessWriteDeps } from "../../application/access-write-deps.ts";
import { prepareGrant } from "../../application/membership-writes.ts";
import { createAccessCore } from "../../composition.ts";
import { createFirestoreAccessAdapters } from "./firestore-access-adapters.ts";

const firebase = emulatorFirebase();
const { firestore } = firebase;
const NOW = "2026-09-30T12:00:00.000Z";
const tenantId = OrganizationIdSchema.parse("org-a");
const org: TenantNodeRef = { level: "organization", tenantId };
const project = (id: string): TenantNodeRef => ({ level: "project", tenantId, projectId: ProjectIdSchema.parse(id) });
const unit = (id: string): TenantNodeRef => ({
  level: "unit",
  tenantId,
  projectId: ProjectIdSchema.parse("p1"),
  unitId: UnitIdSchema.parse(id),
});

const adapters = createFirestoreAccessAdapters(firebase);
const clock = fixedClock(NOW);
const core = createAccessCore({ readers: adapters.readers, clock });
const deps: AccessWriteDeps = {
  registry: core.registry,
  memberships: adapters.memberships,
  roles: adapters.roles,
  roleReader: adapters.readers.roles,
  projections: adapters.projections,
  users: adapters.users,
  tenantGuard: adapters.tenantGuard,
  audit: makeRecordAudit({ writer: createInMemoryAuditLogWriter(), clock }),
  unitOfWork: createFirestoreUnitOfWork({ firestore }),
  clock,
  syncClaims: () => Promise.resolve(true),
};

const grant = (uid: string, node: TenantNodeRef, key: "owner" | "member" = "member") =>
  deps.unitOfWork.run(async (tx) => {
    const plan = await prepareGrant(tx, deps, {
      tenantId,
      principal: { type: "user", id: uid },
      node,
      roles: [{ kind: "system", key }],
      grantedBy: UserIdSchema.parse("owner-1"),
      actor: { type: "user", id: "owner-1" },
      requestId: "req-1",
    });
    if (!plan.ok) return plan;
    await plan.data.commit();
    return plan;
  });

// Concurrent transactions on one principal serialize on its projection doc; the emulator
// resolves the contention with lock waits and retries, so these tests get more time.
const CONTENDED = { timeout: 30_000 };

const seedTree = async () => {
  const alive = { tenantId, deletedAt: null };
  await Promise.all([
    firestore
      .collection(CORE_COLLECTIONS.organizations)
      .doc("org-a")
      .set({ ...alive, status: "active" }),
    ...["p1", "p2", "p3"].map((id) => firestore.collection(CORE_COLLECTIONS.projects).doc(id).set(alive)),
    firestore
      .collection(CORE_COLLECTIONS.units)
      .doc("u1")
      .set({ ...alive, projectId: "p1", ancestorIds: [] }),
    firestore
      .collection(CORE_COLLECTIONS.units)
      .doc("u1a")
      .set({ ...alive, projectId: "p1", ancestorIds: ["u1"] }),
    seedActiveUser(firestore, "u2"),
    seedActiveUser(firestore, "u3"),
  ]);
};

beforeEach(async () => {
  await clearCoreCollections(firestore);
  await seedTree();
});

describe("Firestore membership adapters", () => {
  it("keeps the projection equal to the grants under concurrent grants of one principal", CONTENDED, async () => {
    const nodes = [org, project("p1"), project("p3"), unit("u1a")];
    const results = await Promise.all(nodes.map((node) => grant("u2", node)));
    expect(results.every((result) => result.ok)).toBe(true);

    const projection = await adapters.projections.get(undefined, { tenantId, principalId: "u2" });
    expect(projection).toMatchObject({
      orgWide: true,
      projectIds: ["p1", "p3"],
      unitIds: ["u1a"],
      visibleProjectIds: ["p1", "p3"],
      isRevoked: false,
      version: nodes.length,
    });
    expect((await adapters.users.read(undefined, UserIdSchema.parse("u2")))?.accessVersion).toBe(nodes.length);
  });

  it("lets exactly one of two concurrent grants at the same node win", CONTENDED, async () => {
    const [first, second] = await Promise.all([grant("u2", project("p1")), grant("u2", project("p1"))]);
    expect([first.ok, second.ok].sort()).toEqual([false, true]);
    const stored = await firestore.collection(CORE_COLLECTIONS.memberships).where("principalId", "==", "u2").get();
    expect(stored.size).toBe(1);
    expect(stored.docs[0]?.data()).toMatchObject({
      nodeType: "project",
      nodeId: "p1",
      projectId: "p1",
      schemaVersion: 1,
      deletedAt: null,
    });
  });

  it("feeds authorize(): inherited grants allow, siblings and soft-deleted grants deny", async () => {
    const granted = await grant("u2", unit("u1"));
    if (!granted.ok) throw granted.error;
    const membershipId = granted.data.membership.id;
    const { authorize } = core.forRequest();
    const u2 = { type: "user", uid: UserIdSchema.parse("u2"), mfa: false } as const;
    expect(await authorize({ principal: u2, permission: "core.unit.read", node: unit("u1a") })).toMatchObject({
      allowed: true,
    });
    expect(await authorize({ principal: u2, permission: "core.project.read", node: project("p2") })).toEqual({
      allowed: false,
      reason: "NOT_A_MEMBER",
    });

    await deps.unitOfWork.run((tx) => {
      deps.memberships.softDelete(tx, { id: membershipId, deletedAt: NOW, actorId: "owner-1" });
      return Promise.resolve();
    });
    expect(
      await core.forRequest().authorize({ principal: u2, permission: "core.unit.read", node: unit("u1a") }),
    ).toEqual({ allowed: false, reason: "NOT_A_MEMBER" });
    expect(await adapters.memberships.get(undefined, membershipId)).toBeNull();
  });

  it("finds organization owners and custom roles in use", async () => {
    await grant("u2", org, "owner");
    expect(
      (await deps.unitOfWork.run((tx) => adapters.memberships.listOrganizationOwners(tx, tenantId))).map(
        (m) => m.principalId,
      ),
    ).toEqual(["u2"]);
    const roleId = adapters.roles.newId();
    const inUse = () => deps.unitOfWork.run((tx) => adapters.memberships.isRoleInUse(tx, { tenantId, roleId }));
    expect(await inUse()).toBe(false);
    await deps.unitOfWork.run(async (tx) => {
      const plan = await prepareGrant(tx, deps, {
        tenantId,
        principal: { type: "user", id: "u3" },
        node: project("p1"),
        roles: [{ kind: "custom", roleId }],
        grantedBy: UserIdSchema.parse("owner-1"),
        actor: { type: "user", id: "owner-1" },
        requestId: "req-1",
      });
      if (plan.ok) await plan.data.commit();
    });
    expect(await inUse()).toBe(true);
  });
});
