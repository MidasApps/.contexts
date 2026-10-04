import { describe, expect, it } from "vitest";
import { REQUEST_ID, userOf } from "#/services/tenancy/application/use-cases/tenancy.fixture.ts";
import { makeMeWorld } from "./me.fixture.ts";

describe("getMe", () => {
  it("creates the users doc from the Auth account on the first call, idempotently", async () => {
    const world = makeMeWorld();
    world.account("ana", { mfaEnrolled: true });

    const first = await world.identity.getMe({ actor: userOf("ana") });
    const second = await world.identity.getMe({ actor: userOf("ana") });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      ok: true,
      data: {
        uid: "ana",
        email: "ana@example.com",
        displayName: "ana",
        accessVersion: 0,
        isPlatformStaff: false,
        mfaEnrolled: true,
        preferences: { theme: "system" },
      },
    });
    expect(world.users.userOf("ana")).toMatchObject({ status: "active", lastContext: {} });
  });

  it("answers ACCOUNT_MISSING when the Auth account is gone", async () => {
    const world = makeMeWorld();
    expect(await world.identity.getMe({ actor: userOf("ghost") })).toMatchObject({
      ok: false,
      error: { code: "ACCOUNT_MISSING" },
    });
  });

  it("flags active platform staff with its role", async () => {
    const world = makeMeWorld();
    world.account("staff-1");
    world.store.putPlatformStaff("staff-1", { role: "platform-support", isActive: true });
    expect(await world.identity.getMe({ actor: userOf("staff-1") })).toMatchObject({
      ok: true,
      data: { isPlatformStaff: true, platformRole: "platform-support" },
    });
  });

  it("tells whether the caller may create organizations (self-serve, else MFA staff)", async () => {
    const open = makeMeWorld();
    open.account("ana");
    const closed = makeMeWorld({ selfServe: false });
    closed.account("ana");
    closed.account("staff-1");
    closed.store.putUser("staff-1"); // the access store reads users separately in this world
    closed.store.putPlatformStaff("staff-1", { role: "platform-support", isActive: true });

    expect(await open.identity.getMe({ actor: userOf("ana") })).toMatchObject({
      ok: true,
      data: { capabilities: { createOrganization: true } },
    });
    expect(await closed.identity.getMe({ actor: userOf("ana") })).toMatchObject({
      ok: true,
      data: { capabilities: { createOrganization: false } },
    });
    expect(await closed.identity.getMe({ actor: { ...userOf("staff-1"), mfa: true } })).toMatchObject({
      ok: true,
      data: { capabilities: { createOrganization: true } },
    });
    const updated = await open.identity.updateMe({ actor: userOf("ana"), input: { displayName: "Ana" } });
    expect(updated).toMatchObject({ ok: true, data: { capabilities: { createOrganization: true } } });
  });

  it("answers the last context while the caller is still a member, and an empty one once it is gone", async () => {
    const world = makeMeWorld();
    const organization = await world.organizationOf("owner");
    world.account("owner");
    await world.identity.getMe({ actor: userOf("owner") });
    await world.identity.setActiveOrganization({
      actor: userOf("owner"),
      access: world.access(),
      organizationId: organization.id,
      requestId: REQUEST_ID,
    });

    expect(await world.identity.getMe({ actor: userOf("owner") })).toMatchObject({
      ok: true,
      data: { lastContext: { organizationId: organization.id } },
    });

    const deleted = await world.tenancy.deleteOrganization({
      ...world.command("owner"),
      organizationId: organization.id,
    });
    expect(deleted.ok).toBe(true);
    const me = await world.identity.getMe({ actor: userOf("owner") });
    expect(me.ok ? me.data.lastContext : "error").toEqual({});
    const updated = await world.identity.updateMe({ actor: userOf("owner"), input: { displayName: "Owner" } });
    expect(updated.ok ? updated.data.lastContext : "error").toEqual({});
    // Answer-only: the stored context is left as it was (GET stays safe).
    expect(world.users.userOf("owner")?.lastContext).toEqual({ organizationId: organization.id });
  });
});

describe("updateMe", () => {
  it("changes the name and preferences; null removes a regional preference", async () => {
    const world = makeMeWorld();
    world.account("ana");
    await world.identity.updateMe({
      actor: userOf("ana"),
      input: { preferences: { timeZone: "America/Recife", locale: "en-US" } },
    });
    const updated = await world.identity.updateMe({
      actor: userOf("ana"),
      input: { displayName: "Ana S.", preferences: { locale: null, notifications: { productUpdates: true } } },
    });

    expect(updated).toMatchObject({
      ok: true,
      data: {
        displayName: "Ana S.",
        preferences: { timeZone: "America/Recife", notifications: { productUpdates: true, securityAlerts: true } },
      },
    });
    expect(updated.ok ? updated.data.preferences.locale : "kept").toBeUndefined();
  });

  it("is refused under impersonation (read-only)", async () => {
    const world = makeMeWorld();
    world.account("ana");
    const impersonated = {
      ...userOf("ana"),
      impersonation: { sessionId: "imp-1", staffUid: "staff-1" },
    } as unknown as ReturnType<typeof userOf>;
    expect(await world.identity.updateMe({ actor: impersonated, input: { displayName: "x" } })).toMatchObject({
      ok: false,
      error: { reason: "IMPERSONATION_READ_ONLY" },
    });
  });
});

describe("setActiveOrganization and listMyOrganizations", () => {
  it("switches to an organization the caller belongs to, audits and syncs claims", async () => {
    const world = makeMeWorld();
    const first = await world.organizationOf("owner", "First");
    const second = await world.organizationOf("owner", "Second");
    world.account("owner");
    await world.identity.getMe({ actor: userOf("owner") });

    const switched = await world.identity.setActiveOrganization({
      actor: userOf("owner"),
      access: world.access(),
      organizationId: first.id,
      requestId: REQUEST_ID,
    });

    expect(switched.ok).toBe(true);
    expect(world.users.userOf("owner")?.lastContext).toEqual({ organizationId: first.id });
    expect(world.auditLog.entries("tenant").at(-1)).toMatchObject({
      action: "ACTIVE_ORGANIZATION_CHANGED",
      tenantId: first.id,
      target: { type: "user", id: "owner" },
    });
    const listed = await world.identity.listMyOrganizations({
      actor: userOf("owner"),
      access: world.access(),
      page: { after: undefined, limit: 10 },
    });
    expect(listed.items.map((organization) => organization.name).sort()).toEqual(["First", "Second"]);
    expect(second.id).not.toBe(first.id);
  });

  it("refuses an organization the caller does not belong to (not found)", async () => {
    const world = makeMeWorld();
    const other = await world.organizationOf("owner");
    world.store.putUser("outsider");
    const refused = await world.identity.setActiveOrganization({
      actor: userOf("outsider"),
      access: world.access(),
      organizationId: other.id,
      requestId: REQUEST_ID,
    });
    expect(refused).toMatchObject({ ok: false, error: { reason: "NOT_A_MEMBER" } });
  });
});
