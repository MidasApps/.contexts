import { OrganizationIdSchema, ProjectIdSchema, RoleIdSchema, UserIdSchema } from "@core/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { CORE_COLLECTIONS } from "#/services/shared/firestore/collections.ts";
import {
  buildEmulatorServer,
  clearCoreCollections,
  emulatorFirebase,
  seedActiveUser,
} from "#/services/shared/testing/core-server-emulator.fixture.ts";

const firebase = emulatorFirebase();
const { firestore } = firebase;
const tenantId = OrganizationIdSchema.parse("org-a");
const harness = buildEmulatorServer({ firebase, uids: ["owner-1", "member-1", "stranger"] });

const seedGrant = (uid: string, key: "owner" | "member") =>
  firestore.runTransaction(async (tx) => {
    const plan = await harness.server.accessServices.prepareGrant(tx, {
      tenantId,
      principal: { type: "user", id: uid },
      node: { level: "organization", tenantId },
      roles: [{ kind: "system", key }],
      grantedBy: UserIdSchema.parse("seed"),
      actor: { type: "system", id: "system" },
      requestId: "seed",
    });
    if (!plan.ok) throw plan.error;
    await plan.data.commit();
  });

const body = async (response: Response) =>
  (await response.json()) as { data?: Record<string, unknown>; error?: { code: string }; meta?: unknown };

beforeEach(async () => {
  await clearCoreCollections(firestore);
  await firestore
    .collection(CORE_COLLECTIONS.organizations)
    .doc("org-a")
    .set({ tenantId, status: "active", deletedAt: null });
  await Promise.all(["owner-1", "member-1", "stranger"].map((uid) => seedActiveUser(firestore, uid)));
  await seedGrant("owner-1", "owner");
  await seedGrant("member-1", "member");
});

const createRole = (as: string, permissions: string[]) =>
  harness.call("access.createRole", {
    method: "POST",
    path: "/v1/organizations/org-a/roles",
    as,
    body: { name: "Editor", permissions },
  });

describe("roles routes (emulator)", () => {
  it("creates (201 + Location), reads (200), lists (200), updates (200) and deletes (204) a role", async () => {
    const created = await createRole("owner-1", ["core.project.read"]);
    expect(created.status).toBe(201);
    const role = (await body(created)).data as { id: string };
    expect(created.headers.get("location")).toBe(`/v1/roles/${role.id}`);

    const read = await harness.call("access.getRole", { method: "GET", path: `/v1/roles/${role.id}`, as: "member-1" });
    expect(read.status).toBe(200);
    const listed = await harness.call("access.listRoles", {
      method: "GET",
      path: "/v1/organizations/org-a/roles?limit=10",
      as: "owner-1",
    });
    expect(await body(listed)).toMatchObject({
      data: [{ id: role.id, name: "Editor" }],
      meta: { page: { hasMore: false, cursor: null, limit: 10 } },
    });

    const updated = await harness.call("access.updateRole", {
      method: "PATCH",
      path: `/v1/roles/${role.id}`,
      as: "owner-1",
      body: { name: "Viewer plus" },
    });
    expect(await body(updated)).toMatchObject({ data: { name: "Viewer plus" } });
    const deleted = await harness.call("access.deleteRole", {
      method: "DELETE",
      path: `/v1/roles/${role.id}`,
      as: "owner-1",
    });
    expect(deleted.status).toBe(204);
    expect(
      (await harness.call("access.getRole", { method: "GET", path: `/v1/roles/${role.id}`, as: "owner-1" })).status,
    ).toBe(404);
  });

  it("answers 403 to a member without core.role.create and 404 to a stranger", async () => {
    expect((await createRole("member-1", ["core.project.read"])).status).toBe(403);
    const stranger = await createRole("stranger", ["core.project.read"]);
    expect(stranger.status).toBe(404);
    expect((await body(stranger)).error?.code).toBe("NOT_FOUND");
  });

  it("answers 422 UNKNOWN_PERMISSION and 409 ROLE_IN_USE", async () => {
    const unknown = await createRole("owner-1", ["sample.thing.read"]);
    expect(unknown.status).toBe(422);
    expect((await body(unknown)).error?.code).toBe("UNKNOWN_PERMISSION");

    const role = (await body(await createRole("owner-1", ["core.project.read"]))).data as { id: string };
    await firestore.runTransaction(async (tx) => {
      const plan = await harness.server.accessServices.prepareGrant(tx, {
        tenantId,
        principal: { type: "user", id: "member-1" },
        node: { level: "project", tenantId, projectId: ProjectIdSchema.parse("p1") },
        roles: [{ kind: "custom", roleId: RoleIdSchema.parse(role.id) }],
        grantedBy: UserIdSchema.parse("seed"),
        actor: { type: "system", id: "system" },
        requestId: "seed",
      });
      if (plan.ok) await plan.data.commit();
    });
    const inUse = await harness.call("access.deleteRole", {
      method: "DELETE",
      path: `/v1/roles/${role.id}`,
      as: "owner-1",
    });
    expect(inUse.status).toBe(409);
    expect((await body(inUse)).error?.code).toBe("ROLE_IN_USE");
  });

  it("lists the registered tenant permissions", async () => {
    const response = await harness.call("access.listPermissions", {
      method: "GET",
      path: "/v1/permissions?limit=100",
      as: "member-1",
    });
    const listed = (await body(response)).data as unknown as { id: string; scope: string }[];
    expect(listed.some((permission) => permission.id === "core.project.read")).toBe(true);
    expect(listed.every((permission) => permission.scope === "tenant")).toBe(true);
  });
});
