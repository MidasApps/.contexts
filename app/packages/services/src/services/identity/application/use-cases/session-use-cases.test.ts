import { ImpersonationSessionIdSchema, UserIdSchema, type UserPrincipal } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { hashSessionSecret } from "../../domain/session-secret.ts";
import { buildSessionWorld, WORLD_NOW } from "./session.fixture.ts";

const uid = UserIdSchema.parse("u-ana");
const actor: UserPrincipal = { type: "user", uid, mfa: false };
const nowSeconds = Date.parse(WORLD_NOW) / 1000;

describe("web sessions", () => {
  it("refuses an ID token whose sign-in is older than 5 minutes", async () => {
    const world = buildSessionWorld();
    world.auth.addIdToken("id-stale", { uid, authTimeSeconds: nowSeconds - 301, mfa: false });
    const result = await world.services.createWebSession({ idToken: "id-stale", userAgent: null });
    expect(result).toMatchObject({ ok: false, error: { code: "RECENT_SIGN_IN_REQUIRED" } });
    expect(world.repository.all()).toHaveLength(0);
  });

  it("refuses an unknown or revoked ID token", async () => {
    const world = buildSessionWorld();
    expect(await world.services.createWebSession({ idToken: "nope", userAgent: null })).toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("creates a cookie session and exchanges it for a custom token carrying smfa", async () => {
    const world = buildSessionWorld();
    world.auth.addIdToken("id-fresh", { uid, authTimeSeconds: nowSeconds - 10, mfa: true });
    const created = await world.services.createWebSession({
      idToken: "id-fresh",
      userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0",
    });
    if (!created.ok) throw created.error;
    expect(created.data.maxAgeSeconds).toBe(5 * 86_400);
    expect(world.repository.all()[0]).toMatchObject({
      kind: "web",
      mfa: true,
      userAgent: "Firefox on Linux",
      cookieHash: hashSessionSecret(created.data.cookie),
    });
    const exchanged = await world.services.exchangeWebSession({ cookie: created.data.cookie });
    expect(exchanged).toEqual({
      ok: true,
      data: { customToken: `custom:${uid}:{"smfa":true,"sessionId":"${created.data.sessionId}"}` },
    });
  });

  it("keeps one session per cookie when two sign-ins yield the same cookie", async () => {
    const world = buildSessionWorld();
    world.auth.addIdToken("id-twin", { uid, authTimeSeconds: nowSeconds - 10, mfa: false });
    const first = await world.services.createWebSession({ idToken: "id-twin", userAgent: null });
    const second = await world.services.createWebSession({ idToken: "id-twin", userAgent: null });
    if (!first.ok || !second.ok) throw new Error("expected both sign-ins to open a session");
    expect(second.data.sessionId).toBe(first.data.sessionId);
    expect(world.repository.all()).toHaveLength(1);
    await world.services.revokeSession({ actor, sessionId: second.data.sessionId, requestId: "r1" });
    expect(await world.services.requireWebSession({ cookie: first.data.cookie })).toMatchObject({ ok: false });
  });

  it("refuses to exchange a signed-out (revoked) session", async () => {
    const world = buildSessionWorld();
    const { cookie } = await world.webSession(uid, { mfa: false });
    await world.services.signOutWebSession({ cookie, requestId: "r2" });
    expect(await world.services.exchangeWebSession({ cookie })).toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED" },
    });
    expect(await world.services.requireWebSession({ cookie })).toMatchObject({ ok: false });
  });

  it("revoke-all revokes refresh tokens and every record", async () => {
    const world = buildSessionWorld();
    const { cookie } = await world.webSession(uid, { mfa: false });
    await world.services.createDesktopSession({ actor, userAgent: null });
    expect(await world.services.revokeAllSessions({ actor, requestId: "r3" })).toEqual({ ok: true, data: 2 });
    expect(world.auth.revokedUids()).toEqual([uid]);
    expect(world.repository.all().every((record) => record.revokedAt !== null)).toBe(true);
    expect(await world.services.requireWebSession({ cookie })).toMatchObject({ ok: false });
    expect(world.audited()).toContain("ALL_SESSIONS_REVOKED");
  });

  it("lists open sessions without hashes and revokes only the caller's own", async () => {
    const world = buildSessionWorld();
    const own = await world.webSession(uid, { mfa: false });
    const other = await world.webSession(UserIdSchema.parse("u-bia"), { mfa: false });
    const page = await world.services.listSessions({ actor, page: { after: undefined, limit: 20 } });
    expect(page.items.map((item) => item.id)).toEqual([own.sessionId]);
    expect(page.items[0]?.current).toBe(false);
    const fromSession = await world.services.listSessions({
      actor: { ...actor, sessionId: own.sessionId },
      page: { after: undefined, limit: 20 },
    });
    expect(fromSession.items[0]?.current).toBe(true);
    expect(JSON.stringify(page.items)).not.toContain("Hash");
    expect(await world.services.revokeSession({ actor, sessionId: other.sessionId, requestId: "r" })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(await world.services.revokeSession({ actor, sessionId: own.sessionId, requestId: "r" })).toEqual({
      ok: true,
      data: undefined,
    });
    expect((await world.services.listSessions({ actor, page: { after: undefined, limit: 20 } })).items).toHaveLength(0);
  });

  it("refuses session writes under impersonation", async () => {
    const world = buildSessionWorld();
    const impersonated: UserPrincipal = {
      ...actor,
      impersonation: { sessionId: ImpersonationSessionIdSchema.parse("imp-1"), staffUid: UserIdSchema.parse("staff") },
    };
    expect(await world.services.revokeAllSessions({ actor: impersonated, requestId: "r" })).toMatchObject({
      ok: false,
      error: { reason: "IMPERSONATION_READ_ONLY" },
    });
    expect(await world.services.createDesktopSession({ actor: impersonated, userAgent: null })).toMatchObject({
      ok: false,
    });
    expect(world.auth.revokedUids()).toEqual([]);
  });
});

describe("desktop sessions", () => {
  it("rotates the secret on exchange and revokes the session when a rotated secret is reused", async () => {
    const world = buildSessionWorld();
    const created = await world.services.createDesktopSession({ actor: { ...actor, mfa: true }, userAgent: null });
    if (!created.ok) throw created.error;
    const first = await world.services.exchangeDesktopSession({ secret: created.data.secret, requestId: "r" });
    if (!first.ok) throw first.error;
    expect(first.data.secret).not.toBe(created.data.secret);
    expect(first.data.customToken).toBe(`custom:${uid}:{"smfa":true,"sessionId":"${created.data.sessionId}"}`);

    const reuse = await world.services.exchangeDesktopSession({ secret: created.data.secret, requestId: "r" });
    expect(reuse).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    expect(world.repository.all()[0]?.revokedAt).not.toBeNull();
    expect(world.audited()).toContain("DESKTOP_SESSION_REUSE_DETECTED");
    expect(await world.services.exchangeDesktopSession({ secret: first.data.secret, requestId: "r" })).toMatchObject({
      ok: false,
    });
  });

  it("slides the expiry forward on every exchange", async () => {
    const world = buildSessionWorld();
    const created = await world.services.createDesktopSession({ actor, userAgent: null });
    if (!created.ok) throw created.error;
    world.setNow("2026-10-20T12:00:00.000Z");
    const exchanged = await world.services.exchangeDesktopSession({ secret: created.data.secret, requestId: "r" });
    expect(exchanged).toMatchObject({ ok: true, data: { expiresAt: "2026-11-19T12:00:00.000Z" } });
  });

  it("refuses sessions created before tokensValidAfterTime, and of disabled users", async () => {
    const world = buildSessionWorld();
    const created = await world.services.createDesktopSession({ actor, userAgent: null });
    if (!created.ok) throw created.error;
    world.auth.setState(uid, { disabled: false, tokensValidAfter: "2026-09-30T12:00:01.000Z" });
    expect(await world.services.exchangeDesktopSession({ secret: created.data.secret, requestId: "r" })).toMatchObject({
      ok: false,
    });
    world.auth.setState(uid, { disabled: true, tokensValidAfter: null });
    expect(await world.services.exchangeDesktopSession({ secret: created.data.secret, requestId: "r" })).toMatchObject({
      ok: false,
    });
  });

  it("refuses an expired session (30 days without exchange)", async () => {
    const world = buildSessionWorld();
    const created = await world.services.createDesktopSession({ actor, userAgent: null });
    if (!created.ok) throw created.error;
    world.setNow("2026-10-30T12:00:01.000Z");
    expect(await world.services.exchangeDesktopSession({ secret: created.data.secret, requestId: "r" })).toMatchObject({
      ok: false,
    });
  });
});

describe("platform staff guard", () => {
  it("requires an active staff doc and MFA (sign_in_second_factor or smfa)", async () => {
    const world = buildSessionWorld();
    const plain = await world.webSession(uid, { mfa: false });
    expect(await world.services.requirePlatformStaffSession({ cookie: plain.cookie })).toMatchObject({
      ok: false,
      error: { code: "NOT_PLATFORM_STAFF" },
    });
    world.staff.set(uid, { role: "platform-admin", isActive: true });
    expect(await world.services.requirePlatformStaffSession({ cookie: plain.cookie })).toMatchObject({
      ok: false,
      error: { code: "NOT_PLATFORM_STAFF" },
    });
    const strong = await world.webSession(uid, { mfa: true });
    expect(await world.services.requirePlatformStaffSession({ cookie: strong.cookie })).toMatchObject({
      ok: true,
      data: { role: "platform-admin", principal: { uid, mfa: true } },
    });
    world.staff.set(uid, { role: "platform-admin", isActive: false });
    expect(await world.services.requirePlatformStaffSession({ cookie: strong.cookie })).toMatchObject({ ok: false });
    expect(await world.services.requirePlatformStaffSession({ cookie: undefined })).toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED" },
    });
  });
});
