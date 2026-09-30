import { OrganizationIdSchema, UserIdSchema, type RoleRef, type TenantNodeRef } from "@core/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { CORE_COLLECTIONS } from "../../../shared/firestore/collections.ts";
import { buildEmulatorServer, clearCoreCollections, emulatorFirebase, ensureAuthUser, seedActiveUser } from "../../../shared/testing/core-server-emulator.fixture.ts";

const firebase = emulatorFirebase();
const { firestore, auth } = firebase;
const tenantId = OrganizationIdSchema.parse("org-mem");
const orgNode: TenantNodeRef = { level: "organization", tenantId };
const harness = buildEmulatorServer({ firebase, uids: ["mem-owner", "mem-bruno", "mem-viewer"] });

type Body = { data?: unknown; error?: { code: string }; meta?: { page: { hasMore: boolean } } };
const body = async (response: Response) => (await response.json()) as Body;

const seedGrant = (uid: string, node: TenantNodeRef, roles: RoleRef[]) =>
  firestore.runTransaction(async (tx) => {
    const plan = await harness.server.accessServices.prepareGrant(tx, {
      tenantId,
      principal: { type: "user", id: uid },
      node,
      roles,
      grantedBy: UserIdSchema.parse("seed"),
      actor: { type: "system", id: "system" },
      requestId: "seed",
    });
    if (!plan.ok) throw plan.error;
    await plan.data.commit();
    return plan.data.membership;
  });

beforeEach(async () => {
  await clearCoreCollections(firestore);
  await firestore.collection(CORE_COLLECTIONS.organizations).doc(tenantId).set({ tenantId, name: "Northwind", status: "active", deletedAt: null });
  await firestore.collection(CORE_COLLECTIONS.projects).doc("mem-p1").set({ tenantId, name: "Launch", status: "active", settings: {}, deletedAt: null });
  for (const uid of ["mem-owner", "mem-bruno", "mem-viewer"]) {
    await ensureAuthUser(auth, uid);
    await seedActiveUser(firestore, uid);
  }
  await seedGrant("mem-owner", orgNode, [{ kind: "system", key: "owner" }]);
  await seedGrant("mem-bruno", { level: "project", tenantId, projectId: "mem-p1" } as TenantNodeRef, [{ kind: "system", key: "member" }]);
  await seedGrant("mem-viewer", orgNode, [{ kind: "system", key: "viewer" }]);
}, 30_000);

const remove = (as: string, userId: string) =>
  harness.call("access.removeMember", { method: "DELETE", path: `/v1/organizations/${tenantId}/members/${userId}`, as });

describe("members routes (emulator)", () => {
  it("lists members by uid with their grants and profiles", { timeout: 30_000 }, async () => {
    const response = await harness.call("access.listMembers", { method: "GET", path: `/v1/organizations/${tenantId}/members?limit=2`, as: "mem-owner" });
    expect(response.status).toBe(200);
    const listed = await body(response);
    expect(listed.data).toMatchObject([
      { uid: "mem-bruno", email: "mem-bruno@example.com", grants: [{ node: { level: "project", projectId: "mem-p1" } }] },
      { uid: "mem-owner", grants: [{ node: orgNode, roles: [{ kind: "system", key: "owner" }] }] },
    ]);
    expect(listed.meta?.page.hasMore).toBe(true);
    expect((await harness.call("access.listMembers", { method: "GET", path: `/v1/organizations/${tenantId}/members`, as: "mem-viewer" })).status).toBe(403);
  });

  it("answers 422 LAST_OWNER when the only owner would go", { timeout: 30_000 }, async () => {
    const response = await remove("mem-owner", "mem-owner");
    expect(response.status).toBe(422);
    expect((await body(response)).error?.code).toBe("LAST_OWNER");
  });

  it("removes a member: every grant revoked, projection revoked, 404 afterwards", { timeout: 30_000 }, async () => {
    expect((await remove("mem-owner", "mem-bruno")).status).toBe(204);
    const live = await firestore.collection(CORE_COLLECTIONS.memberships).where("principalId", "==", "mem-bruno").where("deletedAt", "==", null).get();
    expect(live.empty).toBe(true);
    expect((await firestore.collection(CORE_COLLECTIONS.access).doc(`${tenantId}_mem-bruno`).get()).data()).toMatchObject({ isRevoked: true });
    expect((await remove("mem-owner", "mem-bruno")).status).toBe(404);
  });

  it("lists, grants (201), updates (200) and revokes (204) memberships", { timeout: 30_000 }, async () => {
    const granted = await harness.call("access.grantMembership", {
      method: "POST",
      path: `/v1/organizations/${tenantId}/memberships`,
      as: "mem-owner",
      body: { userId: "mem-viewer", node: { level: "project", tenantId, projectId: "mem-p1" }, roles: [{ kind: "system", key: "member" }] },
    });
    expect(granted.status).toBe(201);
    const membership = (await body(granted)).data as { id: string };
    expect(granted.headers.get("location")).toBe(`/v1/memberships/${membership.id}`);

    const own = await harness.call("access.listMemberships", { method: "GET", path: `/v1/organizations/${tenantId}/memberships?principalId=mem-viewer`, as: "mem-owner" });
    expect(((await body(own)).data as unknown[]).length).toBe(2);
    const updated = await harness.call("access.updateMembership", { method: "PATCH", path: `/v1/memberships/${membership.id}`, as: "mem-owner", body: { roles: [{ kind: "system", key: "viewer" }] } });
    expect(updated.status).toBe(200);
    expect((await harness.call("access.revokeMembership", { method: "DELETE", path: `/v1/memberships/${membership.id}`, as: "mem-owner" })).status).toBe(204);
  });
});
