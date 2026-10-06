import type { RoleRef, TenantNodeRef } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { userOf } from "#/services/tenancy/application/use-cases/tenancy.fixture.ts";
import { makeMeWorld } from "./me.fixture.ts";

const PAGE = { after: undefined, limit: 10 };
const viewer: readonly RoleRef[] = [{ kind: "system", key: "viewer" }];

// An organization owned by `owner` with one project, and a users doc for `pat`.
const setup = async () => {
  const world = makeMeWorld();
  const organization = await world.organizationOf("owner", "Shared");
  const project = await world.tenancy.createProject({
    ...world.command("owner"),
    tenantId: organization.id,
    input: { name: "Alpha" },
  });
  if (!project.ok) throw project.error;
  world.account("pat");
  await world.identity.getMe({ actor: userOf("pat") });
  const projectNode: TenantNodeRef = { level: "project", tenantId: organization.id, projectId: project.data.id };
  const list = (access = world.access()) =>
    world.identity.listMyOrganizations({ actor: userOf("pat"), access, page: PAGE });
  return { ...world, organization, project: project.data, projectNode, list };
};

describe("listMyOrganizations", () => {
  it("lists an organization where the caller holds a live grant below it", async () => {
    const world = await setup();
    await world.grant("pat", world.projectNode, viewer);
    expect((await world.list()).items.map((organization) => organization.name)).toEqual(["Shared"]);
  });

  it("drops an organization whose only live grant sits on a deleted project", async () => {
    const world = await setup();
    await world.grant("pat", world.projectNode, viewer);
    expect((await world.tenancy.deleteProject({ ...world.command("owner"), projectId: world.project.id })).ok).toBe(
      true,
    );

    const listed = await world.list();

    expect(listed.items).toEqual([]);
  });

  it("keeps a suspended organization listed (switching to it answers 403)", async () => {
    const world = await setup();
    await world.grant("pat", world.projectNode, viewer);
    world.store.putOrganization({ id: world.organization.id, status: "suspended" });
    expect((await world.list()).items.map((organization) => organization.id)).toEqual([world.organization.id]);
  });

  it("fails closed when a reader throws", async () => {
    const world = await setup();
    await world.grant("pat", world.projectNode, viewer);
    const failing = {
      ...world.access(),
      getEffectivePermissions: () => Promise.reject(new Error("firestore unavailable")),
    };
    await expect(world.list(failing)).rejects.toThrow("firestore unavailable");
  });
});
