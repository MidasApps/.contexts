import { describe, expect, it } from "vitest";
import { hashInvitationToken } from "../../domain/invitation-token.ts";
import { nodes, REQUEST_ID, system, user } from "./access-write.fixture.ts";
import { APP_URL, makeMemberWorld } from "./member.fixture.ts";

const setup = async () => {
  const world = makeMemberWorld();
  await world.grant("owner-1", nodes.orgA, [system("owner")]);
  world.account("owner-1", "owner@example.com", { displayName: "Olivia Owner" });
  return world;
};

type World = Awaited<ReturnType<typeof setup>>;

const invite = (world: World, overrides: Record<string, unknown> = {}) =>
  world.members.createInvitation({
    actor: user("owner-1"),
    access: world.access(),
    tenantId: nodes.orgA.tenantId,
    input: { email: "Carla@Example.com", node: nodes.p1, roles: [system("member")] },
    requestId: REQUEST_ID,
    ...overrides,
  });

const invited = async (world: World) => {
  const created = await invite(world);
  if (!created.ok) throw created.error;
  return { ...created.data, token: world.tokenOf(created.data.acceptUrl) };
};

const accept = (world: World, uid: string, token: string) =>
  world.members.acceptInvitation({ actor: user(uid), access: world.access(), token, requestId: REQUEST_ID });

describe("createInvitation", () => {
  it("stores only the token hash, normalizes the email and returns the accept link once", async () => {
    const world = await setup();
    const { invitation, acceptUrl, token } = await invited(world);

    expect(acceptUrl).toBe(`${APP_URL}/pt-BR/invite#token=${token}`);
    expect(invitation).toMatchObject({ email: "carla@example.com", status: "pending", invitedBy: "owner-1", expiresAt: "2026-10-07T12:00:00.000Z" });
    expect(world.invitations.rowOf(invitation.id)?.tokenHash).toBe(hashInvitationToken(token));
    expect(JSON.stringify(world.invitations.rowOf(invitation.id)?.invitation)).not.toContain(token);
    expect(world.auditLog.entries("tenant").at(-1)).toMatchObject({ action: "INVITATION_CREATED", target: { type: "invitation", id: invitation.id } });
    expect(world.notified).toEqual([acceptUrl]);
  });

  it("localizes the link to the inviter's supported preference, else the organization default (follow-up #32)", async () => {
    const world = await setup();
    world.locale("owner-1", "es-MX");
    const matched = await invited(world);
    expect(matched.acceptUrl).toBe(`${APP_URL}/es-419/invite#token=${matched.token}`);
    expect(world.notified.at(-1)).toBe(matched.acceptUrl);

    world.locale("owner-1", "ja-JP");
    world.organizationLocale("org-a", "en-US");
    const unsupported = await invited(world);
    expect(unsupported.acceptUrl).toBe(`${APP_URL}/en-US/invite#token=${unsupported.token}`);

    world.organizationLocale("org-a", "ja-JP");
    const fallback = await invited(world);
    expect(fallback.acceptUrl).toBe(`${APP_URL}/pt-BR/invite#token=${fallback.token}`);
  });

  it("refuses roles beyond the inviter's own permissions (escalation)", async () => {
    const world = await setup();
    await world.grant("admin-1", nodes.p1, [system("admin")]);
    const result = await invite(world, {
      actor: user("admin-1"),
      input: { email: "carla@example.com", node: nodes.p1, roles: [system("owner")] },
    });
    expect(result).toMatchObject({ ok: false, error: { code: "ESCALATION_FORBIDDEN" } });
  });

  it("refuses a member without core.member.invite and a node outside the organization", async () => {
    const world = await setup();
    await world.grant("member-1", nodes.orgA, [system("member")]);
    expect(await invite(world, { actor: user("member-1") })).toMatchObject({ ok: false, error: { reason: "PERMISSION_NOT_GRANTED" } });
    const outside = await invite(world, { input: { email: "carla@example.com", node: nodes.orgB, roles: [system("member")] } });
    expect(outside).toMatchObject({ ok: false, error: { reason: "NODE_NOT_FOUND" } });
  });
});

describe("acceptInvitation", () => {
  it("grants at the node when the verified email matches after NFC and case folding, and creates the users doc", async () => {
    const world = await setup();
    const { token } = await invited(world);
    world.account("carla", "CARLA@example.com");

    const result = await accept(world, "carla", token);

    expect(result).toEqual({ ok: true, data: { organizationId: "org-a" } });
    expect(world.writes.allMemberships().find((m) => m.principalId === "carla")).toMatchObject({ node: nodes.p1, grantedBy: "owner-1", deletedAt: null });
    expect(world.writes.projectionOf("org-a", "carla")).toMatchObject({ projectIds: ["p1"], isRevoked: false });
    expect(world.writes.userOf("carla")).toMatchObject({ accessVersion: 1, activeOrganizationId: "org-a", profile: { email: "CARLA@example.com" } });
    expect(world.auditLog.entries("tenant").map((entry) => entry.action).slice(-2)).toEqual(["MEMBERSHIP_GRANTED", "INVITATION_ACCEPTED"]);
    expect(world.writes.claims.claimsOf("carla")).toEqual({ accessVersion: 1, tenantId: "org-a" });
  });

  it("matches a decomposed email against the precomposed invitation", async () => {
    const world = await setup();
    const created = await invite(world, { input: { email: "josé@example.com", node: nodes.orgA, roles: [system("viewer")] } });
    if (!created.ok) throw created.error;
    world.account("jose", "JOSÉ@example.com");
    expect((await accept(world, "jose", world.tokenOf(created.data.acceptUrl))).ok).toBe(true);
  });

  it("answers EMAIL_MISMATCH for another email or an unverified one", async () => {
    const world = await setup();
    const { token } = await invited(world);
    world.account("mallory", "mallory@example.com");
    world.account("carla-unverified", "carla@example.com", { verified: false });
    expect(await accept(world, "mallory", token)).toMatchObject({ ok: false, error: { code: "EMAIL_MISMATCH" } });
    expect(await accept(world, "carla-unverified", token)).toMatchObject({ ok: false, error: { code: "EMAIL_MISMATCH" } });
    expect(world.writes.allMemberships().some((m) => m.principalId === "mallory")).toBe(false);
  });

  it("answers INVITATION_ALREADY_USED on reuse, INVITATION_EXPIRED after 7 days, NOT_FOUND when revoked or unknown", async () => {
    const world = await setup();
    world.account("carla", "carla@example.com");
    const first = await invited(world);
    await accept(world, "carla", first.token);
    expect(await accept(world, "carla", first.token)).toMatchObject({ ok: false, error: { code: "INVITATION_ALREADY_USED" } });

    const second = await invited(world);
    const revoked = await world.members.revokeInvitation({ actor: user("owner-1"), access: world.access(), invitationId: second.invitation.id, requestId: REQUEST_ID });
    expect(revoked.ok).toBe(true);
    expect(await accept(world, "carla", second.token)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await accept(world, "carla", "A".repeat(43))).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });

    const third = await invited(world);
    world.clock.set("2026-10-07T12:00:00.000Z");
    expect(await accept(world, "carla", third.token)).toMatchObject({ ok: false, error: { code: "INVITATION_EXPIRED" } });
  });

  it("stops working once the inviter can no longer grant its roles", async () => {
    const world = await setup();
    const admin = await world.grant("admin-1", nodes.orgA, [system("admin")]);
    const created = await invite(world, { actor: user("admin-1") });
    if (!created.ok) throw created.error;
    await world.services.revokeMembership({ actor: user("owner-1"), access: world.access(), membershipId: admin.id, requestId: REQUEST_ID });
    world.account("carla", "carla@example.com");
    expect(await accept(world, "carla", world.tokenOf(created.data.acceptUrl))).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("refuses an impersonated caller (read-only)", async () => {
    const world = await setup();
    const { token } = await invited(world);
    world.account("carla", "carla@example.com");
    const impersonated = { ...user("carla"), impersonation: { sessionId: "imp-1", staffUid: "staff-1" } } as unknown as ReturnType<typeof user>;
    const result = await world.members.acceptInvitation({ actor: impersonated, access: world.access(), token, requestId: REQUEST_ID });
    expect(result).toMatchObject({ ok: false, error: { reason: "IMPERSONATION_READ_ONLY" } });
  });
});

describe("previewInvitation and listInvitations", () => {
  it("previews with the organization name, inviter name and masked email", async () => {
    const world = await setup();
    const { token } = await invited(world);
    expect(await world.members.previewInvitation({ token })).toEqual({
      ok: true,
      data: { organizationName: "Name of org-a", inviterDisplayName: "Olivia Owner", maskedEmail: "c***@example.com", expiresAt: "2026-10-07T12:00:00.000Z" },
    });
  });

  it("lists newest first with the effective status and filters by it", async () => {
    const world = await setup();
    const older = await invited(world);
    world.clock.set("2026-10-01T12:00:00.000Z");
    const newer = await invited(world);
    world.clock.set("2026-10-07T13:00:00.000Z");
    const list = (status?: "pending" | "expired") =>
      world.members.listInvitations({ actor: user("owner-1"), access: world.access(), tenantId: nodes.orgA.tenantId, status, page: { after: undefined, limit: 10 } });

    const all = await list();
    expect(all.ok ? all.data.items.map((i) => [i.id, i.status]) : []).toEqual([
      [newer.invitation.id, "pending"],
      [older.invitation.id, "expired"],
    ]);
    const expired = await list("expired");
    expect(expired.ok ? expired.data.items.map((i) => i.id) : []).toEqual([older.invitation.id]);
    expect(JSON.stringify(all)).not.toContain(older.token);
  });
});
