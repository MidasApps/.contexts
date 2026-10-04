import type { TenantId, UserPrincipal } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { createInMemoryAuditLogWriter } from "../../../audit/adapters/driven/in-memory-audit-log-writer.ts";
import { makeRecordAudit } from "../../../audit/application/use-cases/record-audit.ts";
import { fixedClock } from "../../../shared/clock/clock.ts";
import { createInMemoryFlagStores } from "../../adapters/driven/in-memory-flags.ts";
import { createFlagsServices } from "../../composition.ts";

const ORG = "OrgAaaaaaaaaaaaaaaaaa" as TenantId;
const ACTOR = { type: "user", uid: "alice", mfa: true } as UserPrincipal;

const setup = (
  seed: Parameters<typeof createInMemoryFlagStores>[0] = {},
  environmentDefaults: Record<string, boolean | undefined> = {},
) => {
  const memory = createInMemoryFlagStores(seed);
  const auditLog = createInMemoryAuditLogWriter();
  const clock = fixedClock("2026-10-01T12:00:00.000Z");
  const flags = createFlagsServices({
    stores: memory.stores,
    environmentDefaults,
    clock,
    audit: makeRecordAudit({ writer: auditLog, clock }),
  });
  return { flags, memory, auditLog };
};

describe("flag values", () => {
  it("resolve tenant override → stored environment value → environment default → registry default", async () => {
    const { flags } = setup(
      { environment: { "ai.web-tools": false }, tenants: { [ORG]: { "chat.voice": false } } },
      { "chat.voice": true },
    );
    const environment = await flags.getFlagValues({ tenantId: null });
    expect(environment).toMatchObject({
      "ai.web-tools": false,
      "chat.voice": true,
      "workflows.schedules": true,
      "ai.kill-switch": false,
    });
    expect(await flags.getFlagValues({ tenantId: ORG })).toMatchObject({ "chat.voice": false, "ai.web-tools": false });
  });

  it("never lets a tenant override lift a platform kill-switch, but lets it kill one tenant", async () => {
    expect(
      (
        await setup({
          environment: { "ai.kill-switch": true },
          tenants: { [ORG]: { "ai.kill-switch": false } },
        }).flags.getFlagValues({ tenantId: ORG })
      )["ai.kill-switch"],
    ).toBe(true);
    const perTenant = setup({ tenants: { [ORG]: { "ai.kill-switch": true } } }).flags;
    expect((await perTenant.getFlagValues({ tenantId: ORG }))["ai.kill-switch"]).toBe(true);
    expect((await perTenant.getFlagValues({ tenantId: "OrgBbbbbbbbbbbbbbbbbb" }))["ai.kill-switch"]).toBe(false);
  });

  it("lists tenant-overridable flags only for tenants, with the override and expiry status", async () => {
    const { flags } = setup({ tenants: { [ORG]: { "chat.voice": false } } }, { "chat.voice": true });
    const listed = await flags.listFlags({ tenantId: ORG, tenantOverridableOnly: true });
    expect(listed.map((flag) => flag.key)).toEqual(["chat.voice", "chat.voice.realtime"]);
    expect(listed[0]).toMatchObject({ value: false, tenantOverride: false, expired: false, owner: "platform-team" });
    expect(listed[0]).not.toHaveProperty("tenantOverridable");
  });
});

describe("setFlagValue", () => {
  it("lets staff set the environment value and a tenant override, audited on the platform log with targetTenantId", async () => {
    const { flags, memory, auditLog } = setup();
    const environment = await flags.setFlagValue({
      actor: ACTOR,
      by: "staff",
      key: "ai.kill-switch",
      value: true,
      tenantId: null,
      requestId: "req-1",
    });
    expect(environment).toMatchObject({ ok: true, data: { key: "ai.kill-switch", value: true, tenantOverride: null } });
    const override = await flags.setFlagValue({
      actor: ACTOR,
      by: "staff",
      key: "chat.voice",
      value: true,
      tenantId: ORG,
      requestId: "req-2",
    });
    expect(override).toMatchObject({ ok: true, data: { value: true, tenantOverride: true } });
    expect(memory.environment).toEqual({ "ai.kill-switch": true });
    expect(memory.tenants[ORG]).toEqual({ "chat.voice": true });
    expect(auditLog.entries("platform")).toEqual([
      expect.objectContaining({
        action: "FEATURE_FLAG_UPDATED",
        target: { type: "feature-flag", id: "ai.kill-switch" },
        outcome: "success",
      }),
      expect.objectContaining({
        action: "FEATURE_FLAG_UPDATED",
        target: { type: "feature-flag", id: "chat.voice" },
        targetTenantId: ORG,
      }),
    ]);
    expect(auditLog.entries("platform")[0]).not.toHaveProperty("targetTenantId");
  });

  it("lets a tenant switch off an overridable flag but never enable what the environment disables", async () => {
    const { flags, auditLog } = setup({}, { "chat.voice": true });
    expect(
      await flags.setFlagValue({
        actor: ACTOR,
        by: "tenant",
        key: "chat.voice",
        value: false,
        tenantId: ORG,
        requestId: "r",
      }),
    ).toMatchObject({ ok: true });
    expect(auditLog.entries("tenant")).toEqual([
      expect.objectContaining({ action: "FEATURE_FLAG_UPDATED", tenantId: ORG }),
    ]);
    expect(
      await flags.setFlagValue({
        actor: ACTOR,
        by: "tenant",
        key: "chat.voice.realtime",
        value: true,
        tenantId: ORG,
        requestId: "r",
      }),
    ).toEqual({
      ok: false,
      error: { code: "ENVIRONMENT_DISABLED" },
    });
    expect(
      await flags.setFlagValue({
        actor: ACTOR,
        by: "tenant",
        key: "ai.kill-switch",
        value: false,
        tenantId: ORG,
        requestId: "r",
      }),
    ).toEqual({
      ok: false,
      error: { code: "FLAG_NOT_OVERRIDABLE" },
    });
    expect(
      await flags.setFlagValue({
        actor: ACTOR,
        by: "staff",
        key: "no.such-flag",
        value: true,
        tenantId: null,
        requestId: "r",
      }),
    ).toEqual({
      ok: false,
      error: { code: "FLAG_NOT_FOUND" },
    });
  });
});

describe("clearFlagOverride by a tenant", () => {
  it("removes the organization's own override, audited on its tenant log, and is idempotent", async () => {
    const { flags, memory, auditLog } = setup(
      { tenants: { [ORG]: { "chat.voice": false, "chat.voice.realtime": false } } },
      { "chat.voice": true },
    );
    const cleared = await flags.clearFlagOverride({
      actor: ACTOR,
      by: "tenant",
      key: "chat.voice",
      tenantId: ORG,
      requestId: "r",
    });
    expect(cleared).toMatchObject({ ok: true, data: { key: "chat.voice", value: true, tenantOverride: null } });
    expect(memory.tenants[ORG]).toEqual({ "chat.voice.realtime": false });
    expect(auditLog.entries("tenant")).toEqual([
      expect.objectContaining({ action: "FEATURE_FLAG_UPDATED", tenantId: ORG, changes: ["tenantOverride"] }),
    ]);
    expect(auditLog.entries("platform")).toEqual([]);
    expect(
      await flags.clearFlagOverride({ actor: ACTOR, by: "tenant", key: "chat.voice", tenantId: ORG, requestId: "r" }),
    ).toMatchObject({ ok: true });
    expect(auditLog.entries("tenant")).toHaveLength(1);
  });

  it("never removes an override of a flag the organization may not change (staff set it)", async () => {
    const { flags, memory } = setup({ tenants: { [ORG]: { "ai.kill-switch": true } } });
    expect(
      await flags.clearFlagOverride({
        actor: ACTOR,
        by: "tenant",
        key: "ai.kill-switch",
        tenantId: ORG,
        requestId: "r",
      }),
    ).toEqual({ ok: false, error: { code: "FLAG_NOT_OVERRIDABLE" } });
    expect(memory.tenants[ORG]).toEqual({ "ai.kill-switch": true });
  });
});
