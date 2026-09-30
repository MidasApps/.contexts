import type { RoleRef, TenantNodeRef } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { ids, userOf } from "../../../tenancy/application/use-cases/tenancy.fixture.ts";
import { makeMeWorld } from "./me.fixture.ts";

const PAGE = { after: undefined, limit: 10 };
const viewer: readonly RoleRef[] = [{ kind: "system", key: "viewer" }];
const member: readonly RoleRef[] = [{ kind: "system", key: "member" }];

// An organization owned by `owner` with two projects and a unit in the first, and a users doc for `uma`.
const setup = async () => {
  const world = makeMeWorld();
  const organization = await world.organizationOf("owner", "Shared");
  const createProject = async (name: string) => {
    const created = await world.tenancy.createProject({ ...world.command("owner"), tenantId: organization.id, input: { name } });
    if (!created.ok) throw created.error;
    return created.data;
  };
  const alpha = await createProject("Alpha");
  const beta = await createProject("Beta");
  const unit = await world.tenancy.createUnit({ ...world.command("owner"), projectId: alpha.id, input: { name: "Room", type: "sample.site", parentUnitId: null } });
  if (!unit.ok) throw unit.error;
  world.account("uma");
  await world.identity.getMe({ actor: userOf("uma") });
  const nodes = {
    organization: { level: "organization", tenantId: organization.id } as TenantNodeRef,
    beta: { level: "project", tenantId: organization.id, projectId: beta.id } as TenantNodeRef,
    unit: { level: "unit", tenantId: organization.id, projectId: alpha.id, unitId: unit.data.id } as TenantNodeRef,
  };
  const list = (args: { uid?: string; access?: ReturnType<typeof world.access>; page?: typeof PAGE } = {}) =>
    world.identity.listMyGrants({ actor: userOf(args.uid ?? "uma"), access: args.access ?? world.access(), organizationId: ids.tenant(organization.id), page: args.page ?? PAGE });
  return { ...world, organization, beta, nodes, list };
};

describe("listMyGrants (follow-up #33)", () => {
  it("lists the unit of a unit-only member with its roles", async () => {
    const world = await setup();
    await world.grant("uma", world.nodes.unit, member);

    expect(await world.list()).toEqual({ ok: true, data: { items: [{ node: world.nodes.unit, roles: member }], nextCursor: null } });
  });

  it("lists every live grant node, widest first", async () => {
    const world = await setup();
    await world.grant("uma", world.nodes.unit, member);
    await world.grant("uma", world.nodes.beta, viewer);

    const listed = await world.list();

    expect(listed.ok && listed.data.items).toEqual([
      { node: world.nodes.beta, roles: viewer },
      { node: world.nodes.unit, roles: member },
    ]);
  });

  it("skips a grant on a deleted project and pages the rest", async () => {
    const world = await setup();
    await world.grant("uma", world.nodes.unit, member);
    await world.grant("uma", world.nodes.beta, viewer);
    expect((await world.tenancy.deleteProject({ ...world.command("owner"), projectId: world.beta.id })).ok).toBe(true);

    const first = await world.list({ page: { after: undefined, limit: 1 } });

    expect(first).toMatchObject({ ok: true, data: { items: [{ node: world.nodes.unit }], nextCursor: null } });
  });

  it("pages with a cursor", async () => {
    const world = await setup();
    await world.grant("uma", world.nodes.unit, member);
    await world.grant("uma", world.nodes.beta, viewer);
    const first = await world.list({ page: { after: undefined, limit: 1 } });
    expect(first.ok && first.data.items.map((grant) => grant.node.level)).toEqual(["project"]);
    expect(first.ok && first.data.nextCursor).not.toBeNull();
  });

  it("answers NOT_A_MEMBER without a live grant, and the first node's reason otherwise", async () => {
    const world = await setup();
    world.store.putUser("outsider");
    expect(await world.list({ uid: "outsider" })).toMatchObject({ ok: false, error: { reason: "NOT_A_MEMBER" } });
    await world.grant("uma", world.nodes.beta, viewer);
    expect((await world.tenancy.deleteProject({ ...world.command("owner"), projectId: world.beta.id })).ok).toBe(true);
    expect(await world.list()).toMatchObject({ ok: false, error: { reason: "NODE_NOT_FOUND" } });
  });

  it("refuses a suspended organization", async () => {
    const world = await setup();
    await world.grant("uma", world.nodes.unit, member);
    world.store.putOrganization({ id: world.organization.id, status: "suspended" });
    expect(await world.list()).toMatchObject({ ok: false, error: { reason: "ORGANIZATION_SUSPENDED" } });
  });

  it("lists an owner's organization grant", async () => {
    const world = await setup();
    const listed = await world.list({ uid: "owner" });
    expect(listed.ok && listed.data.items).toEqual([{ node: world.nodes.organization, roles: [{ kind: "system", key: "owner" }] }]);
  });

  it("fails closed when a reader throws", async () => {
    const world = await setup();
    await world.grant("uma", world.nodes.unit, member);
    const failing = { ...world.access(), getEffectivePermissions: () => Promise.reject(new Error("firestore unavailable")) };
    await expect(world.list({ access: failing })).rejects.toThrow("firestore unavailable");
  });
});
