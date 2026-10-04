import { describe, expect, it } from "vitest";
import { buildModuleSettingsWorld, NOW, tenantId, user, validValues } from "./module-settings.fixture.ts";

const commandFor = (world: ReturnType<typeof buildModuleSettingsWorld>, uid: string, moduleId = "sample") => ({
  actor: user(uid),
  access: world.access.forRequest(),
  tenantId,
  moduleId,
});

describe("getModuleSettings", () => {
  it("returns null values before the first save", async () => {
    const world = buildModuleSettingsWorld();
    const result = await world.services.getModuleSettings(commandFor(world, "viewer-1"));
    expect(result).toEqual({
      ok: true,
      data: { tenantId, moduleId: "sample", values: null, updatedAt: null, updatedBy: null },
    });
  });

  it("fails with UNKNOWN_MODULE for a module without settings", async () => {
    const world = buildModuleSettingsWorld();
    const result = await world.services.getModuleSettings(commandFor(world, "owner-1", "missing"));
    expect(result).toMatchObject({ ok: false, error: { code: "UNKNOWN_MODULE" } });
  });

  it("denies a principal without a grant in the organization", async () => {
    const world = buildModuleSettingsWorld();
    const result = await world.services.getModuleSettings(commandFor(world, "stranger"));
    expect(result).toMatchObject({ ok: false, error: { code: "ACCESS_DENIED", reason: "NOT_A_MEMBER" } });
  });
});

describe("updateModuleSettings", () => {
  it("stores parsed values, returns them with audit fields, and audits the changed field names", async () => {
    const world = buildModuleSettingsWorld();
    const result = await world.services.updateModuleSettings({
      ...commandFor(world, "owner-1"),
      values: validValues,
      requestId: "req-1",
    });
    expect(result).toEqual({
      ok: true,
      data: { tenantId, moduleId: "sample", values: validValues, updatedAt: NOW, updatedBy: "owner-1" },
    });

    const read = await world.services.getModuleSettings(commandFor(world, "viewer-1"));
    expect(read).toMatchObject({ ok: true, data: { values: validValues, updatedBy: "owner-1" } });
    expect(world.auditLog.entries("tenant")).toEqual([
      expect.objectContaining({
        action: "MODULE_SETTINGS_UPDATED",
        target: { type: "module-settings", id: "sample" },
        node: { level: "organization", tenantId },
        changes: ["defaultBudget", "greeting"],
        requestId: "req-1",
      }),
    ]);
  });

  it("audits only the fields that changed on a later save and keeps the creation fields", async () => {
    const world = buildModuleSettingsWorld();
    await world.services.updateModuleSettings({
      ...commandFor(world, "owner-1"),
      values: validValues,
      requestId: "req-1",
    });
    await world.services.updateModuleSettings({
      ...commandFor(world, "owner-1"),
      values: { ...validValues, greeting: "Oi" },
      requestId: "req-2",
    });
    expect(world.auditLog.entries("tenant")[1]?.changes).toEqual(["greeting"]);
    expect(world.repository.snapshot()).toEqual([
      expect.objectContaining({ createdBy: "owner-1", createdAt: NOW, values: { ...validValues, greeting: "Oi" } }),
    ]);
  });

  it("rejects values that fail the module contract with one detail per field", async () => {
    const world = buildModuleSettingsWorld();
    const result = await world.services.updateModuleSettings({
      ...commandFor(world, "owner-1"),
      values: { greeting: "", defaultBudget: { amountMinor: 1.5, currency: "BRL" }, extra: true },
      requestId: "req-1",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_MODULE_SETTINGS");
    expect("details" in result.error ? result.error.details : []).toEqual(
      expect.arrayContaining([
        { field: "greeting", issue: "TOO_SMALL" },
        { field: "defaultBudget.amountMinor", issue: "INVALID_TYPE" },
        { field: "(body)", issue: "UNRECOGNIZED_KEYS" },
      ]),
    );
    expect(world.repository.snapshot()).toEqual([]);
  });

  it("denies a viewer (read permission only) before validating", async () => {
    const world = buildModuleSettingsWorld();
    const result = await world.services.updateModuleSettings({
      ...commandFor(world, "viewer-1"),
      values: {},
      requestId: "req-1",
    });
    expect(result).toMatchObject({ ok: false, error: { code: "ACCESS_DENIED", reason: "PERMISSION_NOT_GRANTED" } });
    expect(world.auditLog.entries("tenant")).toEqual([]);
  });
});
