import { type ImpersonationSession, ImpersonationSessionIdSchema, TenantIdSchema, UserIdSchema } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { buildSessionWorld, WORLD_NOW } from "./session.fixture.ts";

const staffUid = UserIdSchema.parse("u-staff");
const targetUid = UserIdSchema.parse("u-ana");
const tenantId = TenantIdSchema.parse("org-1");
const IMP = ImpersonationSessionIdSchema.parse("imp-1");
const IN_30_MIN = new Date(Date.parse(WORLD_NOW) + 30 * 60_000).toISOString();
const IN_2_HOURS = new Date(Date.parse(WORLD_NOW) + 120 * 60_000).toISOString();

const impersonation = (overrides: Partial<ImpersonationSession> = {}): ImpersonationSession => ({
  id: IMP,
  staffUid,
  targetUid,
  tenantId,
  reason: "Ticket 4821: user cannot see project Launch.",
  expiresAt: IN_30_MIN,
  endedAt: null,
  createdAt: WORLD_NOW,
  ...overrides,
});

const impersonatedToken = `custom:${targetUid}:{"imp":"${IMP}","impBy":"${staffUid}"}`;

/** A staff member with MFA, signed in on the web, who started `imp-1` on Ana. */
const staffWorld = async (session: Partial<ImpersonationSession> = {}) => {
  const world = buildSessionWorld();
  world.staff.set(staffUid, { role: "platform-support", isActive: true });
  world.impersonations.create(undefined as never, { session: impersonation(session), actorId: staffUid });
  const { cookie, sessionId } = await world.webSession(staffUid, { mfa: true });
  const staffToken = `custom:${staffUid}:{"smfa":true,"sessionId":"${sessionId}"}`;
  return { world, cookie, staffToken };
};

describe("impersonation in the web session", () => {
  it("enters an open session of the staff member and returns the impersonated token", async () => {
    const { world, cookie } = await staffWorld();
    expect(await world.services.enterImpersonation({ cookie, impersonationSessionId: IMP, requestId: "r1" })).toEqual({
      ok: true,
      data: { customToken: impersonatedToken },
    });
  });

  it("restores the impersonated user on the next exchange (a reload)", async () => {
    const { world, cookie } = await staffWorld();
    await world.services.enterImpersonation({ cookie, impersonationSessionId: IMP, requestId: "r1" });
    expect(await world.services.exchangeWebSession({ cookie })).toEqual({
      ok: true,
      data: { customToken: impersonatedToken },
    });
  });

  it("refuses a session of another staff member, an ended one, an expired one and a non-staff cookie", async () => {
    const other = await staffWorld({ staffUid: UserIdSchema.parse("u-colleague") });
    expect(
      await other.world.services.enterImpersonation({
        cookie: other.cookie,
        impersonationSessionId: IMP,
        requestId: "r",
      }),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const ended = await staffWorld({ endedAt: WORLD_NOW });
    expect(
      await ended.world.services.enterImpersonation({
        cookie: ended.cookie,
        impersonationSessionId: IMP,
        requestId: "r",
      }),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const expired = await staffWorld({ expiresAt: WORLD_NOW });
    expect(
      await expired.world.services.enterImpersonation({
        cookie: expired.cookie,
        impersonationSessionId: IMP,
        requestId: "r",
      }),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const demoted = await staffWorld();
    demoted.world.staff.set(staffUid, { role: "platform-support", isActive: false });
    expect(
      await demoted.world.services.enterImpersonation({
        cookie: demoted.cookie,
        impersonationSessionId: IMP,
        requestId: "r",
      }),
    ).toMatchObject({ ok: false, error: { code: "NOT_PLATFORM_STAFF" } });
    expect(
      await demoted.world.services.enterImpersonation({
        cookie: undefined,
        impersonationSessionId: IMP,
        requestId: "r",
      }),
    ).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
  });

  it("falls back to staff once the session expired, audits the expiry once and forgets it", async () => {
    const { world, cookie, staffToken } = await staffWorld();
    await world.services.enterImpersonation({ cookie, impersonationSessionId: IMP, requestId: "r1" });
    world.setNow(IN_2_HOURS);
    expect(await world.services.exchangeWebSession({ cookie })).toEqual({
      ok: true,
      data: { customToken: staffToken },
    });
    expect(await world.services.exchangeWebSession({ cookie })).toEqual({
      ok: true,
      data: { customToken: staffToken },
    });
    expect(world.audited().filter((action) => action === "IMPERSONATION_EXPIRED")).toHaveLength(1);
    expect(world.repository.all()[0]?.impersonationSessionId).toBeNull();
  });

  it("falls back to staff when the session was ended elsewhere or the staff member lost the role", async () => {
    const { world, cookie, staffToken } = await staffWorld();
    await world.services.enterImpersonation({ cookie, impersonationSessionId: IMP, requestId: "r1" });
    world.impersonations.end(undefined as never, { id: IMP, endedAt: WORLD_NOW, actorId: "u-colleague" });
    expect(await world.services.exchangeWebSession({ cookie })).toEqual({
      ok: true,
      data: { customToken: staffToken },
    });
    expect(world.audited()).not.toContain("IMPERSONATION_EXPIRED");

    const demoted = await staffWorld();
    await demoted.world.services.enterImpersonation({
      cookie: demoted.cookie,
      impersonationSessionId: IMP,
      requestId: "r1",
    });
    demoted.world.staff.set(staffUid, { role: "platform-support", isActive: false });
    expect(await demoted.world.services.exchangeWebSession({ cookie: demoted.cookie })).toEqual({
      ok: true,
      data: { customToken: demoted.staffToken },
    });
  });

  it("leaves: ends the session (audited on both logs) and returns the staff token", async () => {
    const { world, cookie, staffToken } = await staffWorld();
    await world.services.enterImpersonation({ cookie, impersonationSessionId: IMP, requestId: "r1" });
    expect(await world.services.leaveImpersonation({ cookie, requestId: "r2" })).toEqual({
      ok: true,
      data: { customToken: staffToken },
    });
    expect(world.impersonations.rowOf(IMP)?.endedAt).toBe(WORLD_NOW);
    expect(world.audited()).toContain("IMPERSONATION_ENDED");
    expect(world.tenantAudited()).toContain("IMPERSONATION_ENDED");
    expect(await world.services.exchangeWebSession({ cookie })).toEqual({
      ok: true,
      data: { customToken: staffToken },
    });
    // Idempotent: a second leave neither fails nor audits again.
    expect(await world.services.leaveImpersonation({ cookie, requestId: "r3" })).toEqual({
      ok: true,
      data: { customToken: staffToken },
    });
    expect(world.audited().filter((action) => action === "IMPERSONATION_ENDED")).toHaveLength(1);
  });

  it("leaving needs the staff cookie", async () => {
    const { world } = await staffWorld();
    expect(await world.services.leaveImpersonation({ cookie: undefined, requestId: "r" })).toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED" },
    });
  });
});
