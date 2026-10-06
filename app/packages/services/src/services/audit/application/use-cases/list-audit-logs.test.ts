import { OrganizationIdSchema, type Principal, TenantIdSchema } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { createInMemoryAccessStore } from "#/services/access/adapters/driven/in-memory-access-store.ts";
import { createAccessCore } from "#/services/access/composition.ts";
import { fixedClock } from "#/services/shared/clock/clock.ts";
import { callRoute, makeInMemoryPipeline } from "#/services/shared/testing/in-memory-api-pipeline.fixture.ts";
import { createInMemoryAuditLogReader } from "../../adapters/driven/in-memory-audit-log-reader.ts";
import { createInMemoryAuditLogWriter } from "../../adapters/driven/in-memory-audit-log-writer.ts";
import { buildAuditLogsRoutes } from "../../adapters/driving/audit-logs-routes.ts";
import { makeListAuditLogs } from "./list-audit-logs.ts";
import { makeRecordAudit } from "./record-audit.ts";

const NOW = "2026-09-30T12:00:00.000Z";
const orgA = OrganizationIdSchema.parse("org-a");
const admin = { type: "user", uid: "admin", mfa: false } as Principal;
const member = { type: "user", uid: "member", mfa: false } as Principal;

const buildWorld = async () => {
  const clock = fixedClock(NOW);
  const store = createInMemoryAccessStore();
  for (const tenant of ["org-a", "org-b"]) store.putOrganization({ id: tenant });
  store.putUser("admin");
  store.putUser("member");
  store.putGrant({
    tenantId: "org-a",
    principalId: "admin",
    nodeId: "org-a",
    roles: [{ kind: "system", key: "admin" }],
  });
  store.putGrant({
    tenantId: "org-a",
    principalId: "member",
    nodeId: "org-a",
    roles: [{ kind: "system", key: "member" }],
  });
  const writer = createInMemoryAuditLogWriter();
  const audit = makeRecordAudit({ writer, clock });
  const entry = (tenantId: string, action: "PROJECT_CREATED" | "ROLE_CREATED", actorId: string, occurredAt: string) =>
    audit.record({
      log: "tenant",
      tenantId: OrganizationIdSchema.parse(tenantId),
      action,
      actor: { type: "user", id: actorId },
      target: { type: "project", id: "p" },
      outcome: "success",
      requestId: "r",
      occurredAt,
    });
  await entry("org-a", "PROJECT_CREATED", "admin", "2026-09-30T10:00:00.000Z");
  await entry("org-a", "ROLE_CREATED", "member", "2026-09-30T11:00:00.000Z");
  await entry("org-a", "PROJECT_CREATED", "member", "2026-09-30T11:30:00.000Z");
  await entry("org-b", "PROJECT_CREATED", "admin", "2026-09-30T11:45:00.000Z");
  const core = createAccessCore({ readers: store, clock });
  const listAuditLogs = makeListAuditLogs({ reader: createInMemoryAuditLogReader({ writer }) });
  return { listAuditLogs, access: () => core.forRequest() };
};

const page = { after: undefined, limit: 20 };

describe("listAuditLogs", () => {
  it("lists the organization's entries newest first, never another tenant's", async () => {
    const world = await buildWorld();
    const listed = await world.listAuditLogs({
      actor: admin,
      access: world.access(),
      tenantId: orgA,
      filters: {},
      page,
    });
    if (!listed.ok) throw listed.error;
    expect(listed.data.items.map((item) => item.occurredAt)).toEqual([
      "2026-09-30T11:30:00.000Z",
      "2026-09-30T11:00:00.000Z",
      "2026-09-30T10:00:00.000Z",
    ]);
    expect(listed.data.items.every((item) => item.tenantId === "org-a")).toBe(true);
  });

  it("filters by action, actor and an exclusive time window", async () => {
    const world = await buildWorld();
    const list = async (filters: Parameters<typeof world.listAuditLogs>[0]["filters"]) => {
      const listed = await world.listAuditLogs({ actor: admin, access: world.access(), tenantId: orgA, filters, page });
      if (!listed.ok) throw listed.error;
      return listed.data.items.map((item) => item.occurredAt);
    };
    expect(await list({ action: "PROJECT_CREATED" })).toEqual(["2026-09-30T11:30:00.000Z", "2026-09-30T10:00:00.000Z"]);
    expect(await list({ actorId: "member", action: "PROJECT_CREATED" })).toEqual(["2026-09-30T11:30:00.000Z"]);
    expect(
      await list({ occurredAfter: "2026-09-30T10:00:00.000Z", occurredBefore: "2026-09-30T11:30:00.000Z" }),
    ).toEqual(["2026-09-30T11:00:00.000Z"]);
  });

  it("refuses a member without core.audit-log.read", async () => {
    const world = await buildWorld();
    expect(
      await world.listAuditLogs({ actor: member, access: world.access(), tenantId: orgA, filters: {}, page }),
    ).toMatchObject({ ok: false, error: { reason: "PERMISSION_NOT_GRANTED" } });
  });
});

const auditLogServicesOf = (writer: ReturnType<typeof createInMemoryAuditLogWriter>) => {
  const reader = createInMemoryAuditLogReader({ writer });
  return { listAuditLogs: makeListAuditLogs({ reader }), listPlatformAuditLogs: reader.listPlatform };
};

describe("GET /v1/organizations/{organizationId}/audit-logs", () => {
  it("answers 400 when occurredAfter is not before occurredBefore, and 403 to a member", async () => {
    const { pipeline } = makeInMemoryPipeline({
      now: NOW,
      members: [
        { uid: "admin", tenantId: "org-a", role: "admin" },
        { uid: "member", tenantId: "org-a", role: "member" },
      ],
    });
    const writer = createInMemoryAuditLogWriter();
    const routes = buildAuditLogsRoutes({
      pipeline,
      auditLogs: auditLogServicesOf(writer),
    });
    const window = "occurredAfter=2026-09-30T12:00:00.000Z&occurredBefore=2026-09-30T11:00:00.000Z";
    const invalid = await callRoute(routes, "audit.listAuditLogs", `/v1/organizations/org-a/audit-logs?${window}`, {
      as: "admin",
    });
    expect(invalid.status).toBe(400);
    expect(((await invalid.json()) as { error: { code: string; details: { field: string }[] } }).error).toMatchObject({
      code: "VALIDATION_FAILED",
      details: [{ field: "occurredAfter" }],
    });
    expect(
      (await callRoute(routes, "audit.listAuditLogs", "/v1/organizations/org-a/audit-logs", { as: "admin" })).status,
    ).toBe(200);
    expect(
      (await callRoute(routes, "audit.listAuditLogs", "/v1/organizations/org-a/audit-logs", { as: "member" })).status,
    ).toBe(403);
  });
});

describe("GET /v1/admin/audit-logs", () => {
  it("lists the platform log to staff (support too), newest first and filtered, and refuses others", async () => {
    const { pipeline } = makeInMemoryPipeline({
      now: NOW,
      members: [{ uid: "admin", tenantId: "org-a", role: "admin" }],
      staff: [
        { uid: "sam", role: "platform-admin", mfa: true },
        { uid: "sue", role: "platform-support", mfa: true },
      ],
    });
    const writer = createInMemoryAuditLogWriter();
    const entry = (action: "PLAN_CREATED" | "TENANT_BUDGET_UPDATED", minute: number, targetTenantId?: string) =>
      writer.append({
        log: "platform",
        entry: {
          occurredAt: `2026-09-30T10:${String(minute).padStart(2, "0")}:00.000Z`,
          action,
          actor: { type: "user", id: "sam" },
          target: { type: "plan", id: "p1" },
          outcome: "success",
          requestId: `req-${String(minute)}`,
          ...(targetTenantId === undefined ? {} : { targetTenantId: TenantIdSchema.parse(targetTenantId) }),
        },
      });
    await entry("PLAN_CREATED", 1);
    await entry("TENANT_BUDGET_UPDATED", 2, "org-a");
    await entry("TENANT_BUDGET_UPDATED", 3, "org-b");
    const routes = buildAuditLogsRoutes({ pipeline, auditLogs: auditLogServicesOf(writer) });
    const list = async (query: string, as: string) =>
      callRoute(routes, "admin.listAuditLogs", `/v1/admin/audit-logs${query}`, { as });
    const body = async (response: Response) =>
      ((await response.json()) as { data: { requestId: string }[] }).data.map((item) => item.requestId);

    expect(await body(await list("", "sam"))).toEqual(["req-3", "req-2", "req-1"]);
    expect(await body(await list("?action=TENANT_BUDGET_UPDATED&organizationId=org-a", "sam"))).toEqual(["req-2"]);
    expect((await list("", "sue")).status).toBe(200);
    expect((await list("", "admin")).status).toBe(403);
  });
});
