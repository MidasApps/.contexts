import type { RoleRef, TenantNodeRef } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { ids, REQUEST_ID, userOf } from "../../../tenancy/application/use-cases/tenancy.fixture.ts";
import { makeMeWorld } from "./me.fixture.ts";

const PAGE = { after: undefined, limit: 10 };
const viewer: readonly RoleRef[] = [{ kind: "system", key: "viewer" }];

// An organization owned by `owner` with one project and one unit, and a users doc for `uid`.
const setup = async (uid: string) => {
  const world = makeMeWorld();
  const organization = await world.organizationOf("owner", "Shared");
  const project = await world.tenancy.createProject({ ...world.command("owner"), tenantId: organization.id, input: { name: "Alpha" } });
  if (!project.ok) throw project.error;
  const unit = await world.tenancy.createUnit({ ...world.command("owner"), projectId: project.data.id, input: { name: "Room", type: "sample.site", parentUnitId: null } });
  if (!unit.ok) throw unit.error;
  world.account(uid);
  await world.identity.getMe({ actor: userOf(uid) });
  const nodes = {
    project: { level: "project", tenantId: organization.id, projectId: project.data.id } as TenantNodeRef,
    unit: { level: "unit", tenantId: organization.id, projectId: project.data.id, unitId: unit.data.id } as TenantNodeRef,
  };
  const switchTo = () => world.identity.setActiveOrganization({ actor: userOf(uid), access: world.access(), organizationId: organization.id, requestId: REQUEST_ID });
  return { ...world, organization, project: project.data, nodes, switchTo };
};

describe("setActiveOrganization for members below the organization (decision 0030 A5)", () => {
  it("lets a project-only member switch and lists the organization for it", async () => {
    const world = await setup("pat");
    await world.grant("pat", world.nodes.project, viewer);

    const listed = await world.identity.listMyOrganizations({ actor: userOf("pat"), access: world.access(), page: PAGE });
    expect(listed.items.map((organization) => organization.name)).toEqual(["Shared"]);
    expect(await world.switchTo()).toEqual({ ok: true, data: undefined });
    expect(world.users.userOf("pat")?.lastContext).toEqual({ organizationId: world.organization.id });
    expect(world.auditLog.entries("tenant").at(-1)).toMatchObject({ action: "ACTIVE_ORGANIZATION_CHANGED", target: { id: "pat" } });
  });

  it("lets a unit-only member switch", async () => {
    const world = await setup("uma");
    await world.grant("uma", world.nodes.unit, viewer);
    expect((await world.switchTo()).ok).toBe(true);
  });

  it("gives a project-only member no organization-level permission", async () => {
    const world = await setup("pat");
    await world.grant("pat", world.nodes.project, viewer);
    expect((await world.switchTo()).ok).toBe(true);
    const atOrganization = await world.access().authorize({ principal: userOf("pat"), permission: "core.organization.read", node: { level: "organization", tenantId: world.organization.id } });
    expect(atOrganization).toEqual({ allowed: false, reason: "NOT_A_MEMBER" });
  });

  it("refuses a member whose only grant sits on a deleted project (not found)", async () => {
    const world = await setup("pat");
    await world.grant("pat", world.nodes.project, viewer);
    expect((await world.tenancy.deleteProject({ ...world.command("owner"), projectId: world.project.id })).ok).toBe(true);
    expect(await world.switchTo()).toMatchObject({ ok: false, error: { reason: "NODE_NOT_FOUND" } });
    expect(world.users.userOf("pat")?.lastContext).toEqual({});
  });

  it("refuses a member whose grant was revoked", async () => {
    const world = await setup("pat");
    const membership = await world.grant("pat", world.nodes.project, viewer);
    const revoked = await world.services.revokeMembership({ ...world.command("owner"), membershipId: membership.id });
    expect(revoked.ok).toBe(true);
    expect(await world.switchTo()).toMatchObject({ ok: false, error: { reason: "NOT_A_MEMBER" } });
  });

  it("refuses a suspended organization and an inactive user", async () => {
    const world = await setup("pat");
    await world.grant("pat", world.nodes.project, viewer);
    world.store.putOrganization({ id: world.organization.id, status: "suspended" });
    expect(await world.switchTo()).toMatchObject({ ok: false, error: { reason: "ORGANIZATION_SUSPENDED" } });
    world.store.putOrganization({ id: world.organization.id });
    world.store.putUser("pat", "disabled");
    expect(await world.switchTo()).toMatchObject({ ok: false, error: { reason: "PRINCIPAL_INACTIVE" } });
  });

  it("ignores grants in other organizations", async () => {
    const world = await setup("pat");
    const other = await world.organizationOf("other-owner", "Other");
    await world.grant("pat", { level: "organization", tenantId: other.id }, viewer);
    expect(await world.switchTo()).toMatchObject({ ok: false, error: { reason: "NOT_A_MEMBER" } });
  });

  it("fails closed when a reader throws", async () => {
    const world = await setup("pat");
    await world.grant("pat", world.nodes.project, viewer);
    const access = world.access();
    const failing = { ...access, getEffectivePermissions: () => Promise.reject(new Error("firestore unavailable")) };
    await expect(world.identity.setActiveOrganization({ actor: userOf("pat"), access: failing, organizationId: ids.tenant(world.organization.id), requestId: REQUEST_ID })).rejects.toThrow("firestore unavailable");
    expect(world.users.userOf("pat")?.lastContext).toEqual({});
  });
});
