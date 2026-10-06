import { describe, expect, it } from "vitest";
import { DEFAULTS, makeTenancyWorld } from "./tenancy.fixture.ts";

describe("createOrganization", () => {
  it("creates the organization, the owner grant, the projection, the user doc and audits, then syncs claims", async () => {
    const world = makeTenancyWorld();
    const organization = await world.organizationOf("u1");

    expect(organization).toMatchObject({
      tenantId: organization.id,
      name: "Northwind",
      status: "active",
      defaults: DEFAULTS,
    });
    expect(world.writes.allMemberships()).toMatchObject([
      { tenantId: organization.id, principalId: "u1", roles: [{ kind: "system", key: "owner" }] },
    ]);
    expect(world.writes.projectionOf(organization.id, "u1")).toMatchObject({ orgWide: true, isRevoked: false });
    expect(world.writes.userOf("u1")).toMatchObject({
      accessVersion: 1,
      activeOrganizationId: organization.id,
      profile: { email: "u1@example.com" },
    });
    expect(world.auditLog.entries("tenant").map((entry) => entry.action)).toEqual([
      "MEMBERSHIP_GRANTED",
      "ORGANIZATION_CREATED",
    ]);
    expect(world.writes.claims.claimsOf("u1")).toEqual({ accessVersion: 1, tenantId: organization.id });
    const read = await world.tenancy.getOrganization({ ...world.command("u1"), organizationId: organization.id });
    expect(read).toMatchObject({ ok: true, data: { id: organization.id } });
  });

  it("keeps the active organization of a user who already has one", async () => {
    const world = makeTenancyWorld();
    const first = await world.organizationOf("u1");
    await world.organizationOf("u1", "Second");
    expect(world.writes.userOf("u1")).toMatchObject({ accessVersion: 2, activeOrganizationId: first.id });
  });

  it("refuses non-staff when self-serve is off", async () => {
    const world = makeTenancyWorld({ selfServe: false });
    world.store.putUser("u1");
    const result = await world.tenancy.createOrganization({
      ...world.command("u1"),
      input: { name: "X", defaults: DEFAULTS },
    });
    expect(result).toMatchObject({ ok: false, error: { code: "ACCESS_DENIED", reason: "PERMISSION_NOT_GRANTED" } });
  });

  it("lets MFA staff create organizations when self-serve is off", async () => {
    const world = makeTenancyWorld({ selfServe: false });
    world.store.putUser("staff-1");
    world.store.putPlatformStaff("staff-1", { role: "platform-support", isActive: true });
    const result = await world.tenancy.createOrganization({
      ...world.command("staff-1"),
      actor: { ...world.command("staff-1").actor, mfa: true },
      input: { name: "X", defaults: DEFAULTS },
    });
    expect(result.ok).toBe(true);
  });

  it("refuses an impersonated caller (read-only) even when self-serve is on", async () => {
    const world = makeTenancyWorld();
    world.store.putUser("u1");
    const command = world.command("u1");
    const actor = {
      ...command.actor,
      impersonation: { sessionId: "imp-1", staffUid: "staff-1" },
    } as unknown as typeof command.actor;
    const result = await world.tenancy.createOrganization({
      ...command,
      actor,
      input: { name: "X", defaults: DEFAULTS },
    });
    expect(result).toMatchObject({ ok: false, error: { code: "ACCESS_DENIED", reason: "IMPERSONATION_READ_ONLY" } });
  });
});

describe("mayCreateOrganization", () => {
  it("answers the rule createOrganization enforces: self-serve, else MFA staff; never under impersonation", async () => {
    const open = makeTenancyWorld();
    const closed = makeTenancyWorld({ selfServe: false });
    closed.store.putUser("u1");
    closed.store.putUser("staff-1");
    closed.store.putPlatformStaff("staff-1", { role: "platform-support", isActive: true });
    const staff = { ...closed.command("staff-1"), actor: { ...closed.command("staff-1").actor, mfa: true } };
    const impersonated = {
      ...open.command("u1").actor,
      impersonation: { sessionId: "imp-1", staffUid: "staff-1" },
    } as unknown as ReturnType<typeof open.command>["actor"];

    expect(await open.tenancy.mayCreateOrganization(open.command("u1"))).toBe(true);
    expect(await open.tenancy.mayCreateOrganization({ ...open.command("u1"), actor: impersonated })).toBe(false);
    expect(await closed.tenancy.mayCreateOrganization(closed.command("u1"))).toBe(false);
    expect(await closed.tenancy.mayCreateOrganization(staff)).toBe(true);
  });
});

describe("get, update and delete an organization", () => {
  it("hides the organization from outsiders", async () => {
    const world = makeTenancyWorld();
    const organization = await world.organizationOf("u1");
    world.store.putUser("outsider");
    const read = await world.tenancy.getOrganization({ ...world.command("outsider"), organizationId: organization.id });
    expect(read).toMatchObject({ ok: false, error: { reason: "NOT_A_MEMBER" } });
  });

  it("merges regional defaults and audits the changed fields", async () => {
    const world = makeTenancyWorld();
    const organization = await world.organizationOf("u1");
    const result = await world.tenancy.updateOrganization({
      ...world.command("u1"),
      organizationId: organization.id,
      input: { defaults: { timeZone: "America/Recife" } },
    });
    expect(result).toMatchObject({ ok: true, data: { defaults: { ...DEFAULTS, timeZone: "America/Recife" } } });
    expect(world.auditLog.entries("tenant").at(-1)).toMatchObject({
      action: "ORGANIZATION_UPDATED",
      changes: ["defaults.timeZone"],
    });
  });

  it("soft-deletes the organization and revokes every projection of the tenant", async () => {
    const world = makeTenancyWorld();
    const organization = await world.organizationOf("u1");
    await world.grant("u2", { level: "organization", tenantId: organization.id }, [{ kind: "system", key: "member" }]);

    const denied = await world.tenancy.deleteOrganization({ ...world.command("u2"), organizationId: organization.id });
    expect(denied).toMatchObject({ ok: false, error: { reason: "PERMISSION_NOT_GRANTED" } });

    const deleted = await world.tenancy.deleteOrganization({ ...world.command("u1"), organizationId: organization.id });
    expect(deleted.ok).toBe(true);
    expect(world.writes.projectionOf(organization.id, "u1")?.isRevoked).toBe(true);
    expect(world.writes.projectionOf(organization.id, "u2")?.isRevoked).toBe(true);
    expect(world.auditLog.entries("tenant").at(-1)).toMatchObject({ action: "ORGANIZATION_DELETED" });
    const read = await world.tenancy.getOrganization({ ...world.command("u1"), organizationId: organization.id });
    expect(read).toMatchObject({ ok: false, error: { reason: "NODE_NOT_FOUND" } });
  });
});
