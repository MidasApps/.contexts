import { ImpersonationSessionIdSchema, TenantIdSchema, UserIdSchema } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { createLogger } from "../../../shared/observability/logger.ts";
import { buildSessionWorld, WORLD_NOW } from "../../application/use-cases/session.fixture.ts";
import { makeSessionActions, SESSION_COOKIE_NAME, type CookieJar } from "./session-actions.ts";
import { makeSessionGuards } from "./session-guards.ts";

const uid = UserIdSchema.parse("u-ana");
const ORIGIN = "https://app.example.com";

const jar = () => {
  const values = new Map<string, { value: string; maxAgeSeconds: number }>();
  const cookies: CookieJar = {
    get: (name) => values.get(name)?.value,
    set: (name, value, { maxAgeSeconds }) => void values.set(name, { value, maxAgeSeconds }),
    delete: (name) => void values.delete(name),
  };
  return { cookies, values };
};

const setup = () => {
  const world = buildSessionWorld();
  world.auth.addIdToken("id-1", { uid, authTimeSeconds: Date.parse(WORLD_NOW) / 1000, mfa: false });
  const actions = makeSessionActions({ sessions: world.services, appUrl: `${ORIGIN}/`, logger: createLogger({ context: { service: "test", env: "local" }, sink: () => undefined }) });
  return { world, actions, guards: makeSessionGuards({ sessions: world.services }) };
};

describe("session actions", () => {
  it("refuses a cross-origin call before touching the token", async () => {
    const { actions, world } = setup();
    const { cookies, values } = jar();
    const result = await actions.createSession({ idToken: "id-1" }, { cookies, origin: "https://evil.example.com" });
    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(values.size).toBe(0);
    expect(world.repository.all()).toHaveLength(0);
  });

  it("answers VALIDATION_FAILED with every issue for a malformed input", async () => {
    const { actions } = setup();
    const result = await actions.createSession({ idToken: "" }, { cookies: jar().cookies, origin: ORIGIN });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED", details: [{ field: "idToken" }] } });
  });

  it("sets __session, exchanges it, guards pages with it, and signs out", async () => {
    const { actions, guards } = setup();
    const { cookies, values } = jar();
    expect(await actions.createSession({ idToken: "id-1" }, { cookies, origin: ORIGIN })).toMatchObject({ ok: true });
    expect(values.get(SESSION_COOKIE_NAME)?.maxAgeSeconds).toBe(432_000);
    const exchanged = await actions.exchangeSession({ cookies, origin: ORIGIN });
    expect(exchanged.ok && exchanged.data.customToken.startsWith(`custom:${uid}:`)).toBe(true);
    expect(await guards.requireWebSession(cookies)).toMatchObject({ kind: "session", principal: { uid } });
    expect(await guards.requirePlatformStaffSession(cookies)).toEqual({ kind: "not-found" });

    expect(await actions.signOut({ cookies, origin: ORIGIN })).toEqual({ ok: true, data: null });
    expect(values.has(SESSION_COOKIE_NAME)).toBe(false);
    expect(await guards.requireWebSession(cookies)).toEqual({ kind: "redirect" });
    expect(await guards.requirePlatformStaffSession(cookies)).toEqual({ kind: "redirect" });
  });

  it("deletes a dead cookie when the exchange fails", async () => {
    const { actions } = setup();
    const { cookies, values } = jar();
    cookies.set(SESSION_COOKIE_NAME, "forged", { maxAgeSeconds: 10 });
    expect(await actions.exchangeSession({ cookies, origin: ORIGIN })).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    expect(values.has(SESSION_COOKIE_NAME)).toBe(false);
  });
});

describe("impersonation actions (decision 0047)", () => {
  const IMP = ImpersonationSessionIdSchema.parse("imp-1");
  const staffSetup = async () => {
    const { world, actions } = setup();
    world.auth.addIdToken("id-staff", { uid, authTimeSeconds: Date.parse(WORLD_NOW) / 1000, mfa: true });
    world.staff.set(uid, { role: "platform-support", isActive: true });
    const expiresAt = new Date(Date.parse(WORLD_NOW) + 30 * 60_000).toISOString();
    const target = UserIdSchema.parse("u-bia");
    const session = { id: IMP, staffUid: uid, targetUid: target, tenantId: TenantIdSchema.parse("org-1"), reason: "Ticket 4821: user cannot see it.", expiresAt, endedAt: null, createdAt: WORLD_NOW };
    world.impersonations.create(undefined as never, { session, actorId: uid });
    const { cookies, values } = jar();
    await actions.createSession({ idToken: "id-staff" }, { cookies, origin: ORIGIN });
    return { world, actions, cookies, values, target };
  };

  it("enters, survives an exchange and leaves back to the staff token, keeping the cookie", async () => {
    const { actions, cookies, values, target } = await staffSetup();
    const cookie = values.get(SESSION_COOKIE_NAME)?.value;
    const entered = await actions.enterImpersonation({ impersonationSessionId: IMP }, { cookies, origin: ORIGIN });
    expect(entered.ok && entered.data.customToken.startsWith(`custom:${target}:`)).toBe(true);
    const reloaded = await actions.exchangeSession({ cookies, origin: ORIGIN });
    expect(reloaded.ok && reloaded.data.customToken.startsWith(`custom:${target}:`)).toBe(true);
    const left = await actions.leaveImpersonation({ cookies, origin: ORIGIN });
    expect(left.ok && left.data.customToken.startsWith(`custom:${uid}:`)).toBe(true);
    expect(values.get(SESSION_COOKIE_NAME)?.value).toBe(cookie);
  });

  it("refuses a cross-origin call, a malformed input and an unknown session", async () => {
    const { actions, cookies } = await staffSetup();
    expect(await actions.enterImpersonation({ impersonationSessionId: IMP }, { cookies, origin: "https://evil.example.com" })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await actions.leaveImpersonation({ cookies, origin: "https://evil.example.com" })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await actions.enterImpersonation({ impersonationSessionId: "" }, { cookies, origin: ORIGIN })).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(await actions.enterImpersonation({ impersonationSessionId: "imp-9" }, { cookies, origin: ORIGIN })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("answers UNAUTHORIZED without a session cookie", async () => {
    const { actions } = setup();
    expect(await actions.leaveImpersonation({ cookies: jar().cookies, origin: ORIGIN })).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    expect(await actions.enterImpersonation({ impersonationSessionId: IMP }, { cookies: jar().cookies, origin: ORIGIN })).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
  });
});
