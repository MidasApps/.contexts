import { describe, expect, it } from "vitest";
import { makeRecordAudit } from "../../../audit/application/use-cases/record-audit.ts";
import { callRoute, makeInMemoryPipeline } from "../../../shared/testing/in-memory-api-pipeline.fixture.ts";
import { createInMemoryFlagStores } from "../driven/in-memory-flags.ts";
import { createFlagsServices } from "../../composition.ts";
import { buildAdminFlagsRoutes } from "./admin-flags-route-handler.ts";
import { buildFlagsRoutes } from "./flags-route-handler.ts";

const ORG_A = "OrgAaaaaaaaaaaaaaaaaa";
const ORG_B = "OrgBbbbbbbbbbbbbbbbbb";

const setup = () => {
  const { pipeline, auditLog, clock } = makeInMemoryPipeline({
    now: "2026-10-01T12:00:00.000Z",
    members: [
      { uid: "alice", tenantId: ORG_A, role: "admin" },
      { uid: "mia", tenantId: ORG_A, role: "member" },
      { uid: "bob", tenantId: ORG_B, role: "admin" },
    ],
    staff: [
      { uid: "sam", role: "platform-admin", mfa: true },
      { uid: "nomfa", role: "platform-admin", mfa: false },
      { uid: "sue", role: "platform-support", mfa: true },
    ],
  });
  const memory = createInMemoryFlagStores();
  const flags = createFlagsServices({ stores: memory.stores, environmentDefaults: { "chat.voice": true }, clock, audit: makeRecordAudit({ writer: auditLog, clock }) });
  const routes = { ...buildFlagsRoutes({ pipeline, flags }), ...buildAdminFlagsRoutes({ pipeline, flags }) };
  return { routes, memory, auditLog };
};

describe("/v1/admin/flags", () => {
  it("refuses non-staff, staff without MFA and support staff (403), auditing the denial", async () => {
    const { routes, auditLog } = setup();
    expect((await callRoute(routes, "flags.adminList", "/v1/admin/flags", { as: "alice" })).status).toBe(403);
    const noMfa = await callRoute(routes, "flags.adminList", "/v1/admin/flags", { as: "nomfa" });
    expect(noMfa.status).toBe(403);
    expect(await noMfa.json()).toMatchObject({ error: { code: "MFA_REQUIRED" } });
    expect((await callRoute(routes, "flags.adminSetValue", "/v1/admin/flags/ai.kill-switch", { method: "PUT", as: "sue", body: { value: true } })).status).toBe(403);
    expect(auditLog.entries("platform").map((entry) => entry.action)).toEqual(["PLATFORM_ACCESS_DENIED", "PLATFORM_ACCESS_DENIED", "PLATFORM_ACCESS_DENIED"]);
  });

  it("lets staff with MFA list every flag and override a tenant, audited with targetTenantId", async () => {
    const { routes, memory, auditLog } = setup();
    const list = await callRoute(routes, "flags.adminList", "/v1/admin/flags", { as: "sam" });
    expect(list.status).toBe(200);
    expect(((await list.json()) as { data: unknown[] }).data).toHaveLength(6);
    const set = await callRoute(routes, "flags.adminSetValue", "/v1/admin/flags/ai.kill-switch", { method: "PUT", as: "sam", body: { value: true, tenantId: ORG_B } });
    expect(set.status).toBe(200);
    expect(await set.json()).toMatchObject({ data: { key: "ai.kill-switch", value: true, tenantOverride: true } });
    expect(memory.tenants[ORG_B]).toEqual({ "ai.kill-switch": true });
    expect(auditLog.entries("platform").at(-1)).toMatchObject({ action: "FEATURE_FLAG_UPDATED", targetTenantId: ORG_B, actor: { type: "user", id: "sam" } });
    expect((await callRoute(routes, "flags.adminSetValue", "/v1/admin/flags/no.such", { method: "PUT", as: "sam", body: { value: true } })).status).toBe(404);
  });
});

describe("DELETE /v1/admin/flags/{flagKey}/overrides/{organizationId}", () => {
  const path = (key: string, org: string) => `/v1/admin/flags/${key}/overrides/${org}`;

  it("refuses non-staff, staff without MFA and support staff with 403 and keeps the override", async () => {
    const { routes, memory } = setup();
    memory.tenants[ORG_B] = { "ai.kill-switch": true };
    for (const as of ["alice", "nomfa", "sue"]) {
      expect((await callRoute(routes, "flags.adminClearOverride", path("ai.kill-switch", ORG_B), { method: "DELETE", as })).status).toBe(403);
    }
    expect(memory.tenants[ORG_B]).toEqual({ "ai.kill-switch": true });
  });

  it("removes only that override, answers the flag without it and audits with targetTenantId", async () => {
    const { routes, memory, auditLog } = setup();
    memory.tenants[ORG_B] = { "ai.kill-switch": true, "chat.voice": false };
    const cleared = await callRoute(routes, "flags.adminClearOverride", path("ai.kill-switch", ORG_B), { method: "DELETE", as: "sam" });
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toMatchObject({ data: { key: "ai.kill-switch", value: false, tenantOverride: null } });
    expect(memory.tenants[ORG_B]).toEqual({ "chat.voice": false });
    expect(auditLog.entries("platform")).toEqual([expect.objectContaining({ action: "FEATURE_FLAG_UPDATED", targetTenantId: ORG_B, changes: ["tenantOverride"], actor: { type: "user", id: "sam" } })]);
  });

  it("is idempotent (no second audit entry) and answers 404 for an unknown flag", async () => {
    const { routes, auditLog } = setup();
    expect((await callRoute(routes, "flags.adminClearOverride", path("ai.kill-switch", ORG_A), { method: "DELETE", as: "sam" })).status).toBe(200);
    expect(auditLog.entries("platform")).toEqual([]);
    expect((await callRoute(routes, "flags.adminClearOverride", path("no.such", ORG_A), { method: "DELETE", as: "sam" })).status).toBe(404);
  });
});

describe("/v1/flags", () => {
  it("shows tenant-overridable flags to members with core.flag.read and lets admins switch them off", async () => {
    const { routes, memory } = setup();
    expect((await callRoute(routes, "flags.list", `/v1/flags?organizationId=${ORG_A}`, { as: "mia" })).status).toBe(403);
    const listed = await callRoute(routes, "flags.list", `/v1/flags?organizationId=${ORG_A}`, { as: "alice" });
    expect(((await listed.json()) as { data: { key: string }[] }).data.map((flag) => flag.key)).toEqual(["chat.voice", "chat.voice.realtime"]);
    const off = await callRoute(routes, "flags.setTenantValue", `/v1/flags/chat.voice?organizationId=${ORG_A}`, { method: "PUT", as: "alice", body: { value: false } });
    expect(off.status).toBe(200);
    expect(memory.tenants[ORG_A]).toEqual({ "chat.voice": false });
  });

  it("never takes the organization from the body and refuses another tenant, non-overridable flags and enabling a disabled one", async () => {
    const { routes } = setup();
    expect((await callRoute(routes, "flags.setTenantValue", `/v1/flags/chat.voice?organizationId=${ORG_A}`, { method: "PUT", as: "alice", body: { value: false, tenantId: ORG_B } })).status).toBe(400);
    expect((await callRoute(routes, "flags.setTenantValue", `/v1/flags/chat.voice?organizationId=${ORG_A}`, { method: "PUT", as: "bob", body: { value: false } })).status).toBe(404);
    expect((await callRoute(routes, "flags.setTenantValue", `/v1/flags/ai.kill-switch?organizationId=${ORG_A}`, { method: "PUT", as: "alice", body: { value: false } })).status).toBe(403);
    const enable = await callRoute(routes, "flags.setTenantValue", `/v1/flags/chat.voice.realtime?organizationId=${ORG_A}`, { method: "PUT", as: "alice", body: { value: true } });
    expect(enable.status).toBe(400);
    expect(await enable.json()).toMatchObject({ error: { code: "VALIDATION_FAILED", details: [{ field: "value", issue: "ENVIRONMENT_DISABLED" }] } });
  });
});

describe("DELETE /v1/flags/{flagKey}", () => {
  const path = (key: string) => `/v1/flags/${key}?organizationId=${ORG_A}`;

  it("lets an admin (core.flag.write) remove the organization's own override, so it follows the platform again", async () => {
    const { routes, memory, auditLog } = setup();
    memory.tenants[ORG_A] = { "chat.voice": false };
    const cleared = await callRoute(routes, "flags.clearTenantOverride", path("chat.voice"), { method: "DELETE", as: "alice" });
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toMatchObject({ data: { key: "chat.voice", value: true, tenantOverride: null } });
    expect(memory.tenants[ORG_A]).toEqual({});
    expect(auditLog.entries("tenant")).toEqual([expect.objectContaining({ action: "FEATURE_FLAG_UPDATED", tenantId: ORG_A, actor: { type: "user", id: "alice" } })]);
  });

  it("refuses members without core.flag.write, another tenant and non-overridable flags, and answers 404 for an unknown flag", async () => {
    const { routes, memory } = setup();
    memory.tenants[ORG_A] = { "chat.voice": false, "ai.kill-switch": true };
    expect((await callRoute(routes, "flags.clearTenantOverride", path("chat.voice"), { method: "DELETE", as: "mia" })).status).toBe(403);
    expect((await callRoute(routes, "flags.clearTenantOverride", path("chat.voice"), { method: "DELETE", as: "bob" })).status).toBe(404);
    expect((await callRoute(routes, "flags.clearTenantOverride", path("ai.kill-switch"), { method: "DELETE", as: "alice" })).status).toBe(403);
    expect((await callRoute(routes, "flags.clearTenantOverride", path("no.such"), { method: "DELETE", as: "alice" })).status).toBe(404);
    expect(memory.tenants[ORG_A]).toEqual({ "chat.voice": false, "ai.kill-switch": true });
  });
});

