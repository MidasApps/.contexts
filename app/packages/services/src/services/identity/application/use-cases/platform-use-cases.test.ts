import {
  ImpersonationSessionIdSchema,
  OrganizationIdSchema,
  type Principal,
  StartImpersonationInputSchema,
  UserIdSchema,
} from "@core/contracts";
import { describe, expect, it } from "vitest";
import { nodes } from "../../../access/application/use-cases/access-write.fixture.ts";
import { buildPlatformWorld, staffPrincipal } from "./platform.fixture.ts";

const tenantId = OrganizationIdSchema.parse("org-a");
const REASON = "Ticket 4821: user cannot see project Launch.";
const input = (overrides: Record<string, unknown> = {}) =>
  StartImpersonationInputSchema.parse({ targetUid: "owner", organizationId: tenantId, reason: REASON, ...overrides });

const grantSupport = async (world: Awaited<ReturnType<typeof buildPlatformWorld>>, uid = "staff") =>
  world.platform.grantPlatformStaff({ uid: UserIdSchema.parse(uid), role: "platform-support", requestId: "r" });

const impersonated = (sessionId: string, staffUid = "staff"): Principal => ({
  type: "user",
  uid: UserIdSchema.parse("owner"),
  mfa: false,
  impersonation: { sessionId: ImpersonationSessionIdSchema.parse(sessionId), staffUid: UserIdSchema.parse(staffUid) },
});

describe("grantPlatformStaff", () => {
  it("writes the staff doc, audits PLATFORM_STAFF_GRANTED on the platform log and syncs claims", async () => {
    const world = await buildPlatformWorld();
    const staff = await grantSupport(world);
    expect(staff).toMatchObject({
      uid: "staff",
      role: "platform-support",
      isActive: true,
      createdAt: "2026-09-30T12:00:00.000Z",
    });
    expect(world.actions("platform")).toEqual(["PLATFORM_STAFF_GRANTED"]);
    expect(world.entries("platform")[0]).toMatchObject({
      actor: { type: "system", id: "system" },
      target: { type: "user", id: "staff" },
      outcome: "success",
    });
    expect(world.writes.claims.claimsOf("staff")).toMatchObject({ platformRole: "platform-support" });

    world.setNow("2026-10-01T12:00:00.000Z");
    const promoted = await world.platform.grantPlatformStaff({
      uid: UserIdSchema.parse("staff"),
      role: "platform-admin",
      requestId: "r",
    });
    expect(promoted).toMatchObject({
      role: "platform-admin",
      createdAt: "2026-09-30T12:00:00.000Z",
      updatedAt: "2026-10-01T12:00:00.000Z",
    });
  });
});

describe("startImpersonation", () => {
  it("requires MFA and an active staff role, and audits the refusals", async () => {
    const world = await buildPlatformWorld();
    await grantSupport(world);
    const withoutMfa = await world.platform.startImpersonation({
      actor: staffPrincipal("staff", false),
      access: world.access(),
      input: input(),
      requestId: "r",
    });
    expect(withoutMfa).toMatchObject({ ok: false, error: { reason: "MFA_REQUIRED" } });
    const notStaff = await world.platform.startImpersonation({
      actor: staffPrincipal("member"),
      access: world.access(),
      input: input(),
      requestId: "r",
    });
    expect(notStaff).toMatchObject({ ok: false, error: { code: "ACCESS_DENIED" } });
    expect(world.actions("platform")).toEqual([
      "PLATFORM_STAFF_GRANTED",
      "PLATFORM_ACCESS_DENIED",
      "PLATFORM_ACCESS_DENIED",
    ]);
    expect(world.entries("platform")[1]).toMatchObject({
      outcome: "denied",
      targetTenantId: tenantId,
      metadata: { errorCode: "MFA_REQUIRED" },
    });
    expect(world.impersonations.rowOf("imp-1")).toBeUndefined();
  });

  it("refuses an impersonated caller, the staff member itself and users outside the organization", async () => {
    const world = await buildPlatformWorld();
    await grantSupport(world);
    const self = await world.platform.startImpersonation({
      actor: staffPrincipal("staff"),
      access: world.access(),
      input: input({ targetUid: "staff" }),
      requestId: "r",
    });
    expect(self).toMatchObject({ ok: false, error: { code: "ACCESS_DENIED" } });
    const outsider = await world.platform.startImpersonation({
      actor: staffPrincipal("staff"),
      access: world.access(),
      input: input({ targetUid: "support-2" }),
      requestId: "r",
    });
    expect(outsider).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const nestedActor = {
      ...staffPrincipal("staff"),
      impersonation: {
        sessionId: ImpersonationSessionIdSchema.parse("imp-9"),
        staffUid: UserIdSchema.parse("support-2"),
      },
    };
    const nested = await world.platform.startImpersonation({
      actor: nestedActor,
      access: world.access(),
      input: input(),
      requestId: "r",
    });
    expect(nested).toMatchObject({ ok: false, error: { reason: "IMPERSONATION_READ_ONLY" } });
  });

  it("opens a session of at most 60 minutes, returns a custom token and audits both logs", async () => {
    const world = await buildPlatformWorld();
    await grantSupport(world);
    const started = await world.platform.startImpersonation({
      actor: staffPrincipal("staff"),
      access: world.access(),
      input: input(),
      requestId: "r",
    });
    if (!started.ok) throw started.error;
    expect(started.data).toEqual({
      sessionId: "imp-1",
      customToken: 'custom:owner:{"imp":"imp-1","impBy":"staff"}',
      expiresAt: "2026-09-30T13:00:00.000Z",
    });
    expect(world.impersonations.rowOf("imp-1")).toMatchObject({
      staffUid: "staff",
      targetUid: "owner",
      tenantId,
      reason: REASON,
      endedAt: null,
    });
    expect(world.actions("platform")).toContain("IMPERSONATION_STARTED");
    expect(world.entries("tenant").filter((entry) => entry.action === "IMPERSONATION_STARTED")).toMatchObject([
      {
        tenantId,
        actor: { type: "user", id: "owner", onBehalfOf: "staff" },
        target: { type: "impersonation-session", id: "imp-1" },
        reason: REASON,
      },
    ]);
    expect(StartImpersonationInputSchema.safeParse({ ...input(), durationMinutes: 61 }).success).toBe(false);
  });

  it("lets the session read until it expires, never write", async () => {
    const world = await buildPlatformWorld();
    await grantSupport(world);
    const started = await world.platform.startImpersonation({
      actor: staffPrincipal("staff"),
      access: world.access(),
      input: input({ durationMinutes: 15 }),
      requestId: "r",
    });
    if (!started.ok) throw started.error;
    const principal = impersonated(started.data.sessionId);
    const read = () => world.access().authorize({ principal, permission: "core.organization.read", node: nodes.orgA });
    expect(await read()).toMatchObject({ allowed: true });
    expect(
      await world.access().authorize({ principal, permission: "core.organization.update", node: nodes.orgA }),
    ).toEqual({ allowed: false, reason: "IMPERSONATION_READ_ONLY" });
    world.setNow("2026-09-30T12:15:00.000Z");
    expect(await read()).toEqual({ allowed: false, reason: "IMPERSONATION_EXPIRED" });
  });
});

describe("endImpersonation", () => {
  it("ends the staff member's own session once and answers ok again (idempotent)", async () => {
    const world = await buildPlatformWorld();
    await grantSupport(world);
    await grantSupport(world, "support-2");
    const started = await world.platform.startImpersonation({
      actor: staffPrincipal("staff"),
      access: world.access(),
      input: input(),
      requestId: "r",
    });
    if (!started.ok) throw started.error;
    const sessionId = ImpersonationSessionIdSchema.parse(started.data.sessionId);
    const other = await world.platform.endImpersonation({
      actor: staffPrincipal("support-2"),
      access: world.access(),
      sessionId,
      requestId: "r",
    });
    expect(other).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const unknown = await world.platform.endImpersonation({
      actor: staffPrincipal("staff"),
      access: world.access(),
      sessionId: ImpersonationSessionIdSchema.parse("nope"),
      requestId: "r",
    });
    expect(unknown).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });

    world.setNow("2026-09-30T12:05:00.000Z");
    expect(
      await world.platform.endImpersonation({
        actor: staffPrincipal("staff"),
        access: world.access(),
        sessionId,
        requestId: "r",
      }),
    ).toEqual({ ok: true, data: undefined });
    expect(world.impersonations.rowOf(sessionId)?.endedAt).toBe("2026-09-30T12:05:00.000Z");
    expect(
      await world.platform.endImpersonation({
        actor: staffPrincipal("staff"),
        access: world.access(),
        sessionId,
        requestId: "r",
      }),
    ).toEqual({ ok: true, data: undefined });
    expect(world.actions("platform").filter((action) => action === "IMPERSONATION_ENDED")).toHaveLength(1);
    expect(world.actions("tenant").filter((action) => action === "IMPERSONATION_ENDED")).toHaveLength(1);
    expect(
      await world
        .access()
        .authorize({ principal: impersonated(sessionId), permission: "core.organization.read", node: nodes.orgA }),
    ).toEqual({
      allowed: false,
      reason: "IMPERSONATION_EXPIRED",
    });
  });

  it("requires MFA to end a session", async () => {
    const world = await buildPlatformWorld();
    await grantSupport(world);
    const ended = await world.platform.endImpersonation({
      actor: staffPrincipal("staff", false),
      access: world.access(),
      sessionId: ImpersonationSessionIdSchema.parse("imp-1"),
      requestId: "r",
    });
    expect(ended).toMatchObject({ ok: false, error: { reason: "MFA_REQUIRED" } });
  });
});

describe("auditImpersonatedRequest", () => {
  it("records every impersonated request in both logs with onBehalfOf, and a denied write as such", async () => {
    const world = await buildPlatformWorld();
    await grantSupport(world);
    const started = await world.platform.startImpersonation({
      actor: staffPrincipal("staff"),
      access: world.access(),
      input: input(),
      requestId: "r",
    });
    if (!started.ok) throw started.error;
    const principal = impersonated(started.data.sessionId);
    if (principal.type !== "user" || principal.impersonation === undefined) throw new Error("unexpected principal");
    const base = { principal: { ...principal, impersonation: principal.impersonation }, requestId: "r2" };
    await world.platform.auditImpersonatedRequest({
      ...base,
      endpointId: "tenancy.getOrganization",
      method: "GET",
      status: 200,
    });
    await world.platform.auditImpersonatedRequest({
      ...base,
      endpointId: "tenancy.updateOrganization",
      method: "PATCH",
      status: 403,
      denyReason: "IMPERSONATION_READ_ONLY",
    });
    const served = {
      action: "IMPERSONATED_REQUEST_SERVED",
      outcome: "success",
      actor: { id: "owner", onBehalfOf: "staff" },
      metadata: { endpointId: "tenancy.getOrganization" },
    };
    const denied = {
      action: "IMPERSONATED_WRITE_DENIED",
      outcome: "denied",
      actor: { id: "owner", onBehalfOf: "staff" },
      metadata: { endpointId: "tenancy.updateOrganization", errorCode: "IMPERSONATION_READ_ONLY" },
    };
    expect(world.entries("tenant").slice(-2)).toMatchObject([
      { ...served, tenantId },
      { ...denied, tenantId },
    ]);
    expect(world.entries("platform").slice(-2)).toMatchObject([
      { ...served, targetTenantId: tenantId },
      { ...denied, targetTenantId: tenantId },
    ]);
  });

  it("writes only the platform entry when the session is unknown", async () => {
    const world = await buildPlatformWorld();
    const principal = impersonated("imp-404");
    if (principal.type !== "user" || principal.impersonation === undefined) throw new Error("unexpected principal");
    await world.platform.auditImpersonatedRequest({
      principal: { ...principal, impersonation: principal.impersonation },
      requestId: "r",
      endpointId: "identity.getMe",
      method: "GET",
      status: 403,
    });
    expect(world.actions("tenant")).not.toContain("IMPERSONATED_REQUEST_SERVED");
    expect(world.entries("platform").at(-1)).toMatchObject({
      action: "IMPERSONATED_REQUEST_SERVED",
      outcome: "denied",
    });
  });
});
