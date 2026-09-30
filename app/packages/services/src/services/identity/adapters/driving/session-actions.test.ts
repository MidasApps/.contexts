import { UserIdSchema } from "@core/contracts";
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
