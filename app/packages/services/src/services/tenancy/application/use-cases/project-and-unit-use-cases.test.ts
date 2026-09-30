import type { Organization, Project, TenantNodeRef, Unit } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { ids, makeTenancyWorld } from "./tenancy.fixture.ts";

const page = { after: undefined, limit: 20 };
const member = [{ kind: "system", key: "member" } as const];

const setup = async () => {
  const world = makeTenancyWorld();
  const organization = await world.organizationOf("owner");
  const project = async (name: string): Promise<Project> => {
    const created = await world.tenancy.createProject({ ...world.command("owner"), tenantId: organization.id, input: { name } });
    if (!created.ok) throw created.error;
    return created.data;
  };
  const unit = async (projectId: string, name: string, type: string, parentUnitId: string | null = null): Promise<Unit> => {
    const created = await world.tenancy.createUnit({
      ...world.command("owner"),
      projectId: ids.project(projectId),
      input: { name, type, parentUnitId: parentUnitId === null ? null : ids.unit(parentUnitId) },
    });
    if (!created.ok) throw created.error;
    return created.data;
  };
  const grantAt = (uid: string, node: TenantNodeRef) => world.grant(uid, node, member);
  return { ...world, organization, project, unit, grantAt };
};

const projectRef = (organization: Organization, project: Project): TenantNodeRef => ({ level: "project", tenantId: organization.id, projectId: project.id });
const unitRef = (unit: Unit): TenantNodeRef => ({ level: "unit", tenantId: unit.tenantId, projectId: unit.projectId, unitId: unit.id });

describe("projects", () => {
  it("lists every project to an organization-wide reader and only granted ones to project members", async () => {
    const world = await setup();
    const alpha = await world.project("Alpha");
    await world.project("Beta");
    expect((await world.tenancy.listProjects({ ...world.command("owner"), tenantId: world.organization.id, page }))).toMatchObject({ ok: true, data: { items: [{ name: "Alpha" }, { name: "Beta" }] } });

    await world.grantAt("u2", projectRef(world.organization, alpha));
    const visible = await world.tenancy.listProjects({ ...world.command("u2"), tenantId: world.organization.id, page });
    expect(visible).toMatchObject({ ok: true, data: { items: [{ name: "Alpha" }], nextCursor: null } });

    world.store.putUser("stranger");
    const hidden = await world.tenancy.listProjects({ ...world.command("stranger"), tenantId: world.organization.id, page });
    expect(hidden).toMatchObject({ ok: false, error: { reason: "NOT_A_MEMBER" } });
  });

  it("updates settings (null clears an override) and soft-deletes", async () => {
    const world = await setup();
    const alpha = await world.project("Alpha");
    const updated = await world.tenancy.updateProject({ ...world.command("owner"), projectId: alpha.id, input: { settings: { timeZone: "America/Manaus" }, description: "Rollout" } });
    expect(updated).toMatchObject({ ok: true, data: { settings: { timeZone: "America/Manaus" }, description: "Rollout" } });
    const cleared = await world.tenancy.updateProject({ ...world.command("owner"), projectId: alpha.id, input: { settings: { timeZone: null }, description: null } });
    expect(cleared.ok && cleared.data).toMatchObject({ settings: {} });
    expect(cleared.ok && "description" in cleared.data).toBe(false);

    expect((await world.tenancy.deleteProject({ ...world.command("owner"), projectId: alpha.id })).ok).toBe(true);
    expect(await world.tenancy.getProject({ ...world.command("owner"), projectId: alpha.id })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("soft-deletes every unit of a deleted project, so no unit outlives it", async () => {
    const world = await setup();
    const alpha = await world.project("Alpha");
    const site = await world.unit(alpha.id, "Site", "sample.site");
    const room = await world.unit(alpha.id, "Room", "sample.room", site.id);
    const beta = await world.project("Beta");
    const other = await world.unit(beta.id, "Other", "sample.site");

    expect((await world.tenancy.deleteProject({ ...world.command("owner"), projectId: alpha.id })).ok).toBe(true);

    expect(world.tenancyStore.unitRow(site.id)?.deletedAt).not.toBeNull();
    expect(world.tenancyStore.unitRow(room.id)?.deletedAt).not.toBeNull();
    expect(world.tenancyStore.unitRow(other.id)?.deletedAt).toBeNull();
  });
});

describe("units", () => {
  it("creates units under the project or a unit whose type allows it, within the depth limit", async () => {
    const world = await setup();
    const project = await world.project("Alpha");
    const site = await world.unit(project.id, "Site", "sample.site");
    expect(site).toMatchObject({ parentUnitId: null, ancestorIds: [], depth: 0 });

    const wrongParent = await world.tenancy.createUnit({ ...world.command("owner"), projectId: project.id, input: { name: "R", type: "sample.room", parentUnitId: null } });
    expect(wrongParent).toMatchObject({ ok: false, error: { code: "INVALID_UNIT_PARENT", reason: "TYPE_NOT_ALLOWED" } });

    let parent = site;
    for (let depth = 1; depth <= 6; depth += 1) parent = await world.unit(project.id, `Room ${depth}`, "sample.room", parent.id);
    expect(parent.depth).toBe(6);
    const tooDeep = await world.tenancy.createUnit({ ...world.command("owner"), projectId: project.id, input: { name: "R7", type: "sample.room", parentUnitId: parent.id } });
    expect(tooDeep).toMatchObject({ ok: false, error: { reason: "TOO_DEEP" } });
  });

  it("moves a subtree, rewriting descendants; a cycle is refused", async () => {
    const world = await setup();
    const project = await world.project("Alpha");
    const siteA = await world.unit(project.id, "A", "sample.site");
    const siteB = await world.unit(project.id, "B", "sample.site");
    const room = await world.unit(project.id, "Room", "sample.room", siteA.id);
    const inner = await world.unit(project.id, "Inner", "sample.room", room.id);

    const moved = await world.tenancy.updateUnit({ ...world.command("owner"), unitId: room.id, input: { parentUnitId: siteB.id } });
    expect(moved).toMatchObject({ ok: true, data: { parentUnitId: siteB.id, ancestorIds: [siteB.id], depth: 1 } });
    expect(world.tenancyStore.unitRow(inner.id)).toMatchObject({ ancestorIds: [siteB.id, room.id], depth: 2 });
    expect(world.auditLog.entries("tenant").at(-1)).toMatchObject({ action: "UNIT_MOVED", changes: ["parentUnitId"] });

    const cycle = await world.tenancy.updateUnit({ ...world.command("owner"), unitId: room.id, input: { parentUnitId: inner.id } });
    expect(cycle).toMatchObject({ ok: false, error: { reason: "CYCLE" } });
  });

  it("shows a unit-level member only its units, not siblings", async () => {
    const world = await setup();
    const project = await world.project("Alpha");
    const siteA = await world.unit(project.id, "A", "sample.site");
    const siteB = await world.unit(project.id, "B", "sample.site");
    await world.grantAt("u2", unitRef(siteA));

    const listed = await world.tenancy.listUnits({ ...world.command("u2"), projectId: project.id, parentUnitId: null, page });
    expect(listed).toMatchObject({ ok: true, data: { items: [{ id: siteA.id }] } });
    expect(await world.tenancy.getUnit({ ...world.command("u2"), unitId: siteB.id })).toMatchObject({ ok: false, error: { reason: "NOT_A_MEMBER" } });
  });

  it("soft-deletes a unit with its subtree", async () => {
    const world = await setup();
    const project = await world.project("Alpha");
    const site = await world.unit(project.id, "A", "sample.site");
    const room = await world.unit(project.id, "Room", "sample.room", site.id);
    expect((await world.tenancy.deleteUnit({ ...world.command("owner"), unitId: site.id })).ok).toBe(true);
    expect(world.tenancyStore.unitRow(room.id)?.deletedAt).not.toBeNull();
    expect(world.tenancyStore.unitRow(site.id)?.deletedAt).not.toBeNull();
  });

  it("resolves regional settings along the node chain", async () => {
    const world = await setup();
    const project = await world.project("Alpha");
    await world.tenancy.updateProject({ ...world.command("owner"), projectId: project.id, input: { settings: { currency: "USD" } } });
    const site = await world.unit(project.id, "A", "sample.site");
    await world.tenancy.updateUnit({ ...world.command("owner"), unitId: site.id, input: { settings: { timeZone: "America/Manaus" } } });
    const room = await world.unit(project.id, "Room", "sample.room", site.id);
    const settings = await world.tenancy.resolveRegionalSettings({ node: unitRef(room), preferences: { locale: "en-US" } });
    expect(settings).toEqual({ locale: "en-US", displayTimeZone: "America/Manaus", nodeTimeZone: "America/Manaus", currency: "USD" });
  });

  it("lists the registered unit types", async () => {
    const world = await setup();
    expect(world.tenancy.listUnitTypes(page).items.map((type) => type.id)).toEqual(["sample.room", "sample.site"]);
  });
});
