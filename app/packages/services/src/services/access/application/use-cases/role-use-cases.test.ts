import { RoleIdSchema, type CreateRoleInput } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { makeAccessWriteWorld, nodes, REQUEST_ID, system, user } from "./access-write.fixture.ts";

const input = (permissions: string[], name = "Editor"): CreateRoleInput => ({ name, description: "", permissions });

const setup = async () => {
  const world = makeAccessWriteWorld();
  await world.grant("owner-1", nodes.orgA, [system("owner")]);
  const create = (permissions: string[], name?: string, actor = "owner-1") =>
    world.services.createRole({ actor: user(actor), access: world.access(), tenantId: nodes.orgA.tenantId, input: input(permissions, name), requestId: REQUEST_ID });
  return { ...world, create };
};

describe("createRole", () => {
  it("creates a role and audits it", async () => {
    const world = await setup();
    const result = await world.create(["core.project.read", "core.unit.read"]);
    expect(result).toMatchObject({ ok: true, data: { tenantId: "org-a", name: "Editor", permissions: ["core.project.read", "core.unit.read"] } });
    expect(world.auditLog.entries("tenant").at(-1)).toMatchObject({ action: "ROLE_CREATED" });
  });

  it("rejects unregistered or platform permissions (422 UNKNOWN_PERMISSION)", async () => {
    const world = await setup();
    const result = await world.create(["core.project.read", "sample.thing.read", "platform.user.read"]);
    expect(result).toMatchObject({ ok: false, error: { code: "UNKNOWN_PERMISSION", permissionIds: ["platform.user.read", "sample.thing.read"] } });
  });

  it("rejects permissions the actor does not hold (escalation)", async () => {
    const world = await setup();
    await world.grant("admin-1", nodes.orgA, [system("admin")]);
    const result = await world.create(["core.organization.delete"], "Deleter", "admin-1");
    expect(result).toMatchObject({ ok: false, error: { code: "ESCALATION_FORBIDDEN" } });
  });

  it("denies a member without core.role.create", async () => {
    const world = await setup();
    await world.grant("member-1", nodes.orgA, [system("member")]);
    const result = await world.create(["core.project.read"], "X", "member-1");
    expect(result).toMatchObject({ ok: false, error: { code: "ACCESS_DENIED", reason: "PERMISSION_NOT_GRANTED" } });
  });
});

describe("custom roles in grants", () => {
  it("grant permissions through a custom role, and a changed role changes access", async () => {
    const world = await setup();
    const role = await world.create(["core.project.read"]);
    if (!role.ok) throw role.error;
    await world.grant("u2", nodes.p1, [{ kind: "custom", roleId: role.data.id }]);
    const canUpdate = () => world.access().authorize({ principal: user("u2"), permission: "core.project.update", node: nodes.p1 });
    expect((await canUpdate()).allowed).toBe(false);

    const updated = await world.services.updateRole({ actor: user("owner-1"), access: world.access(), roleId: role.data.id, input: { permissions: ["core.project.read", "core.project.update"] }, requestId: REQUEST_ID });
    expect(updated).toMatchObject({ ok: true, data: { permissions: ["core.project.read", "core.project.update"] } });
    expect(world.auditLog.entries("tenant").at(-1)).toMatchObject({ action: "ROLE_UPDATED", changes: ["permissions"] });
    expect((await canUpdate()).allowed).toBe(true);
  });
});

describe("deleteRole", () => {
  it("refuses a role in use (409 ROLE_IN_USE)", async () => {
    const world = await setup();
    const role = await world.create(["core.project.read"]);
    if (!role.ok) throw role.error;
    await world.grant("u2", nodes.p1, [{ kind: "custom", roleId: role.data.id }]);
    const result = await world.services.deleteRole({ actor: user("owner-1"), access: world.access(), roleId: role.data.id, requestId: REQUEST_ID });
    expect(result).toMatchObject({ ok: false, error: { code: "ROLE_IN_USE" } });
  });

  it("soft-deletes an unused role; reading it then answers not found", async () => {
    const world = await setup();
    const role = await world.create(["core.project.read"]);
    if (!role.ok) throw role.error;
    const deleted = await world.services.deleteRole({ actor: user("owner-1"), access: world.access(), roleId: role.data.id, requestId: REQUEST_ID });
    expect(deleted.ok).toBe(true);
    expect(world.auditLog.entries("tenant").at(-1)).toMatchObject({ action: "ROLE_DELETED" });
    const read = await world.services.getRole({ actor: user("owner-1"), access: world.access(), roleId: role.data.id });
    expect(read).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("getRole and listRoles", () => {
  it("hides roles of an organization the caller is not a member of", async () => {
    const world = await setup();
    const role = await world.create(["core.project.read"]);
    if (!role.ok) throw role.error;
    world.store.putUser("stranger");
    const read = await world.services.getRole({ actor: user("stranger"), access: world.access(), roleId: role.data.id });
    expect(read).toMatchObject({ ok: false, error: { code: "ACCESS_DENIED", reason: "NOT_A_MEMBER" } });
    const missing = await world.services.getRole({ actor: user("owner-1"), access: world.access(), roleId: RoleIdSchema.parse("none") });
    expect(missing).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("lists roles by name with a cursor", async () => {
    const world = await setup();
    for (const name of ["Charlie", "Alpha", "Bravo"]) await world.create(["core.project.read"], name);
    const first = await world.services.listRoles({ actor: user("owner-1"), access: world.access(), tenantId: nodes.orgA.tenantId, page: { after: undefined, limit: 2 } });
    if (!first.ok) throw first.error;
    expect(first.data.items.map((role) => role.name)).toEqual(["Alpha", "Bravo"]);
    expect(first.data.nextCursor).not.toBeNull();
  });
});
