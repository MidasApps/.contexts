import { describe, expect, it } from "vitest";
import { nodes, REQUEST_ID, system, user } from "./access-write.fixture.ts";
import { makeMemberWorld } from "./member.fixture.ts";

const setup = async () => {
  const world = makeMemberWorld();
  await world.grant("owner-1", nodes.orgA, [system("owner")]);
  await world.grant("bruno", nodes.p1, [system("member")]);
  await world.grant("bruno", nodes.u1, [system("viewer")]);
  world.account("owner-1", "owner@example.com", { displayName: "Olivia" });
  world.account("bruno", "bruno@example.com", { displayName: "Bruno" });
  return world;
};

type World = Awaited<ReturnType<typeof setup>>;

const remove = (world: World, actor: string, userId: string) =>
  world.members.removeMember({
    actor: user(actor),
    access: world.access(),
    tenantId: nodes.orgA.tenantId,
    userId: world.uid(userId),
    requestId: REQUEST_ID,
  });

describe("listMembers", () => {
  it("lists each user once with every grant, by uid", async () => {
    const world = await setup();
    const result = await world.members.listMembers({
      actor: user("owner-1"),
      access: world.access(),
      tenantId: nodes.orgA.tenantId,
      page: { after: undefined, limit: 10 },
    });
    expect(result.ok ? result.data.items : []).toMatchObject([
      {
        uid: "bruno",
        displayName: "Bruno",
        email: "bruno@example.com",
        grants: [{ node: nodes.p1 }, { node: nodes.u1 }],
      },
      { uid: "owner-1", grants: [{ node: nodes.orgA, roles: [system("owner")] }] },
    ]);
  });

  it("pages with a cursor and refuses a caller without core.member.read", async () => {
    const world = await setup();
    const first = await world.members.listMembers({
      actor: user("owner-1"),
      access: world.access(),
      tenantId: nodes.orgA.tenantId,
      page: { after: undefined, limit: 1 },
    });
    expect(first.ok ? [first.data.items.length, first.data.nextCursor !== null] : []).toEqual([1, true]);
    await world.grant("viewer-1", nodes.orgA, [system("viewer")]);
    const denied = await world.members.listMembers({
      actor: user("viewer-1"),
      access: world.access(),
      tenantId: nodes.orgA.tenantId,
      page: { after: undefined, limit: 1 },
    });
    expect(denied).toMatchObject({ ok: false, error: { reason: "PERMISSION_NOT_GRANTED" } });
  });
});

describe("removeMember", () => {
  it("revokes every grant, the projection and the API keys the member owns, then syncs claims", async () => {
    const world = await setup();
    const result = await remove(world, "owner-1", "bruno");

    expect(result.ok).toBe(true);
    expect(
      world.writes
        .allMemberships()
        .filter((m) => m.principalId === "bruno")
        .every((m) => m.deletedAt !== null),
    ).toBe(true);
    expect(world.writes.projectionOf("org-a", "bruno")).toMatchObject({ isRevoked: true, projectIds: [], unitIds: [] });
    expect(world.revoked).toEqual([{ tenantId: "org-a", ownerUid: "bruno" }]);
    expect(world.auditLog.entries("tenant").at(-1)).toMatchObject({
      action: "MEMBER_REMOVED",
      target: { type: "user", id: "bruno" },
    });
    expect(world.writes.claims.claimsOf("bruno")).toEqual({ accessVersion: 3 });
    const decision = await world
      .access()
      .authorize({ principal: user("bruno"), permission: "core.project.read", node: nodes.p1 });
    expect(decision).toEqual({ allowed: false, reason: "NOT_A_MEMBER" });
  });

  it("keeps the last owner (422 LAST_OWNER) and answers NOT_FOUND for a non-member", async () => {
    const world = await setup();
    expect(await remove(world, "owner-1", "owner-1")).toMatchObject({ ok: false, error: { code: "LAST_OWNER" } });
    expect(await remove(world, "owner-1", "stranger")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(world.revoked).toEqual([]);
  });

  it("refuses an admin removing an owner (owner hierarchy)", async () => {
    const world = await setup();
    await world.grant("owner-2", nodes.orgA, [system("owner")]);
    await world.grant("admin-1", nodes.orgA, [system("admin")]);
    expect(await remove(world, "admin-1", "owner-2")).toMatchObject({
      ok: false,
      error: { code: "ESCALATION_FORBIDDEN" },
    });
    expect(await remove(world, "admin-1", "bruno")).toMatchObject({ ok: true });
  });

  it("lets an owner leave once another owner exists", async () => {
    const world = await setup();
    await world.grant("owner-2", nodes.orgA, [system("owner")]);
    expect((await remove(world, "owner-1", "owner-1")).ok).toBe(true);
  });

  it("logs and swallows a key revocation failure after the removal committed", async () => {
    const world = await setup();
    const failing = { ...world.deps, apiKeys: { revokeOwnedKeys: () => Promise.reject(new Error("keys store down")) } };
    const { makeRemoveMember } = await import("./remove-member.ts");
    const result = await makeRemoveMember(failing)({
      actor: user("owner-1"),
      access: world.access(),
      tenantId: nodes.orgA.tenantId,
      userId: world.uid("bruno"),
      requestId: REQUEST_ID,
    });
    expect(result.ok).toBe(true);
    expect(world.logs.some((record) => record.message === "member_api_keys_revoke_failed")).toBe(true);
  });
});

describe("listMemberships", () => {
  it("lists the organization's grants oldest first, optionally of one principal", async () => {
    const world = await setup();
    const all = await world.members.listMemberships({
      actor: user("owner-1"),
      access: world.access(),
      tenantId: nodes.orgA.tenantId,
      page: { after: undefined, limit: 10 },
    });
    expect(all.ok ? all.data.items.length : 0).toBe(3);
    const own = await world.members.listMemberships({
      actor: user("owner-1"),
      access: world.access(),
      tenantId: nodes.orgA.tenantId,
      principalId: "bruno",
      page: { after: undefined, limit: 10 },
    });
    expect(own.ok ? own.data.items.map((m) => m.principalId) : []).toEqual(["bruno", "bruno"]);
  });
});
