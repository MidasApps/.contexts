import { MembershipIdSchema, RoleIdSchema } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { createAccessServices } from "../../composition.ts";
import { makeAccessWriteWorld, nodes, REQUEST_ID, system, user } from "./access-write.fixture.ts";

const setup = async () => {
  const world = makeAccessWriteWorld();
  const owner = await world.grant("owner-1", nodes.orgA, [system("owner")]);
  world.store.putUser("u2");
  world.writes.putUser("u2", { accessVersion: 3 });
  return { ...world, owner };
};

const grantCommand = (world: Awaited<ReturnType<typeof setup>>, overrides: Record<string, unknown> = {}) => ({
  actor: user("owner-1"),
  access: world.access(),
  tenantId: nodes.orgA.tenantId,
  principal: { type: "user", id: "u2" } as const,
  node: nodes.p1,
  roles: [system("member")],
  requestId: REQUEST_ID,
  ...overrides,
});

describe("grantMembership", () => {
  it("writes the grant, rebuilds the projection, bumps accessVersion, audits and syncs claims", async () => {
    const world = await setup();
    const result = await world.services.grantMembership(grantCommand(world));

    expect(result).toMatchObject({ ok: true, data: { principalId: "u2", node: nodes.p1, grantedBy: "owner-1" } });
    expect(world.writes.projectionOf("org-a", "u2")).toMatchObject({ orgWide: false, projectIds: ["p1"], visibleProjectIds: ["p1"], isRevoked: false, version: 1 });
    expect(world.writes.userOf("u2")?.accessVersion).toBe(4);
    expect(world.auditLog.entries("tenant").at(-1)).toMatchObject({ action: "MEMBERSHIP_GRANTED", actor: { type: "user", id: "owner-1" }, node: nodes.p1 });
    expect(world.writes.claims.claimsOf("u2")).toEqual({ accessVersion: 4 });
    const decision = await world.access().authorize({ principal: user("u2"), permission: "core.unit.read", node: nodes.u1 });
    expect(decision.allowed).toBe(true);
  });

  it("refuses a second grant for the same principal and node (409 MEMBERSHIP_EXISTS)", async () => {
    const world = await setup();
    await world.services.grantMembership(grantCommand(world));
    const again = await world.services.grantMembership(grantCommand(world, { access: world.access(), roles: [system("viewer")] }));
    expect(again).toMatchObject({ ok: false, error: { code: "MEMBERSHIP_EXISTS" } });
    expect(world.writes.allMemberships().filter((m) => m.principalId === "u2")).toHaveLength(1);
  });

  it("refuses roles beyond the actor's own permissions (escalation)", async () => {
    const world = await setup();
    await world.grant("admin-1", nodes.p1, [system("admin")]);
    const result = await world.services.grantMembership(grantCommand(world, { actor: user("admin-1"), roles: [system("owner")] }));
    expect(result).toMatchObject({ ok: false, error: { code: "ESCALATION_FORBIDDEN" } });
    expect(result.ok ? [] : (result.error as unknown as { missing: string[] }).missing).toContain("core.organization.delete");
  });

  it("refuses an actor without core.member.update at the node", async () => {
    const world = await setup();
    await world.grant("viewer-1", nodes.orgA, [system("viewer")]);
    const result = await world.services.grantMembership(grantCommand(world, { actor: user("viewer-1") }));
    expect(result).toMatchObject({ ok: false, error: { code: "ACCESS_DENIED", reason: "PERMISSION_NOT_GRANTED" } });
  });

  it("refuses a node outside the route's organization", async () => {
    const world = await setup();
    const result = await world.services.grantMembership(grantCommand(world, { node: nodes.orgB }));
    expect(result).toMatchObject({ ok: false, error: { code: "ACCESS_DENIED", reason: "NODE_NOT_FOUND" } });
  });

  it("refuses an unknown custom role", async () => {
    const world = await setup();
    const result = await world.services.grantMembership(grantCommand(world, { roles: [{ kind: "custom", roleId: RoleIdSchema.parse("missing") }] }));
    expect(result).toMatchObject({ ok: false, error: { code: "UNKNOWN_ROLE", roleIds: ["missing"] } });
  });

  it("keeps the grant when the claims sync fails, and logs it", async () => {
    const world = await setup();
    world.writes.claims.failNext();
    const result = await world.services.grantMembership(grantCommand(world));
    expect(result.ok).toBe(true);
    expect(world.logs).toMatchObject([{ level: "error", message: "claims_sync_failed", userId: "u2" }]);
  });
});

describe("updateMembership", () => {
  it("replaces the roles and audits the change", async () => {
    const world = await setup();
    const granted = await world.services.grantMembership(grantCommand(world));
    if (!granted.ok) throw granted.error;
    const result = await world.services.updateMembership({ actor: user("owner-1"), access: world.access(), membershipId: granted.data.id, roles: [system("viewer")], requestId: REQUEST_ID });
    expect(result).toMatchObject({ ok: true, data: { roles: [system("viewer")] } });
    expect(world.writes.projectionOf("org-a", "u2")?.version).toBe(2);
    expect(world.auditLog.entries("tenant").at(-1)).toMatchObject({ action: "MEMBERSHIP_UPDATED", changes: ["roles"] });
  });

  it("refuses to demote the last owner (422 LAST_OWNER)", async () => {
    const world = await setup();
    const result = await world.services.updateMembership({ actor: user("owner-1"), access: world.access(), membershipId: world.owner.id, roles: [system("admin")], requestId: REQUEST_ID });
    expect(result).toMatchObject({ ok: false, error: { code: "LAST_OWNER" } });
  });

  it("allows demoting an owner while another owner remains", async () => {
    const world = await setup();
    await world.grant("owner-2", nodes.orgA, [system("owner")]);
    const result = await world.services.updateMembership({ actor: user("owner-2"), access: world.access(), membershipId: world.owner.id, roles: [system("admin")], requestId: REQUEST_ID });
    expect(result.ok).toBe(true);
  });

  it("answers not found for a missing membership", async () => {
    const world = await setup();
    const result = await world.services.updateMembership({ actor: user("owner-1"), access: world.access(), membershipId: MembershipIdSchema.parse("nope"), roles: [system("viewer")], requestId: REQUEST_ID });
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("revokeMembership", () => {
  it("soft-deletes the grant, revokes the projection and removes access", async () => {
    const world = await setup();
    const granted = await world.services.grantMembership(grantCommand(world));
    if (!granted.ok) throw granted.error;
    const result = await world.services.revokeMembership({ actor: user("owner-1"), access: world.access(), membershipId: granted.data.id, requestId: REQUEST_ID });

    expect(result.ok).toBe(true);
    expect(world.writes.allMemberships().find((m) => m.id === granted.data.id)?.deletedAt).toBe("2026-09-30T12:00:00.000Z");
    expect(world.writes.projectionOf("org-a", "u2")).toMatchObject({ isRevoked: true, projectIds: [] });
    expect(world.auditLog.entries("tenant").at(-1)).toMatchObject({ action: "MEMBERSHIP_REVOKED" });
    const decision = await world.access().authorize({ principal: user("u2"), permission: "core.project.read", node: nodes.p1 });
    expect(decision).toEqual({ allowed: false, reason: "NOT_A_MEMBER" });
  });

  it("aborts grant changes when the organization was deleted after the authorization check", async () => {
    const world = await setup();
    const granted = await world.services.grantMembership(grantCommand(world));
    if (!granted.ok) throw granted.error;
    // The tenant guard runs inside the transaction; authorize() ran before and saw it live.
    const deleted = createAccessServices({ ...world.deps, tenantGuard: { isLive: () => Promise.resolve(false) } });

    const again = await deleted.grantMembership(grantCommand(world, { access: world.access(), node: nodes.u1 }));
    const updated = await deleted.updateMembership({ actor: user("owner-1"), access: world.access(), membershipId: granted.data.id, roles: [system("viewer")], requestId: REQUEST_ID });
    const revoked = await deleted.revokeMembership({ actor: user("owner-1"), access: world.access(), membershipId: granted.data.id, requestId: REQUEST_ID });

    for (const result of [again, updated, revoked]) expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND", resource: "organization" } });
    expect(world.writes.projectionOf("org-a", "u2")).toMatchObject({ projectIds: ["p1"], unitIds: [], version: 1 });
  });

  it("refuses to remove the last owner grant", async () => {
    const world = await setup();
    const result = await world.services.revokeMembership({ actor: user("owner-1"), access: world.access(), membershipId: world.owner.id, requestId: REQUEST_ID });
    expect(result).toMatchObject({ ok: false, error: { code: "LAST_OWNER" } });
    expect(world.writes.projectionOf("org-a", "owner-1")?.isRevoked).toBe(false);
  });
});
