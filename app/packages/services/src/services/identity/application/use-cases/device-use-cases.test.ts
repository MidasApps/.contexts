import { OrganizationIdSchema, type CreateDeviceActivationInput } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { nodes } from "../../../access/application/use-cases/access-write.fixture.ts";
import { buildDeviceWorld } from "./device.fixture.ts";

const tenantId = OrganizationIdSchema.parse("org-a");
const activationInput = (overrides: Partial<CreateDeviceActivationInput> = {}): CreateDeviceActivationInput => ({
  label: "Front desk tablet",
  node: nodes.p1,
  roles: [{ kind: "system", key: "device" }],
  ...overrides,
});

describe("device activations", () => {
  it("creates a one-time code stored only as a hash, expiring in 10 minutes", async () => {
    const world = await buildDeviceWorld();
    const created = await world.devices.createDeviceActivation({ actor: world.admin, access: world.access(), tenantId, input: activationInput(), requestId: "r" });
    if (!created.ok) throw created.error;
    expect(created.data.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(created.data.expiresAt).toBe("2026-09-30T12:10:00.000Z");
    const row = world.activations.rowOf(created.data.id);
    expect(row?.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(row)).not.toContain(created.data.code);
  });

  it("refuses roles beyond the admin's permissions and strangers", async () => {
    const world = await buildDeviceWorld();
    const escalation = await world.devices.createDeviceActivation({ actor: world.admin, access: world.access(), tenantId, input: activationInput({ roles: [{ kind: "system", key: "owner" }] }), requestId: "r" });
    expect(escalation).toMatchObject({ ok: false, error: { code: "ESCALATION_FORBIDDEN" } });
    const stranger = await world.devices.createDeviceActivation({ actor: world.stranger, access: world.access(), tenantId, input: activationInput(), requestId: "r" });
    expect(stranger).toMatchObject({ ok: false, error: { code: "ACCESS_DENIED" } });
  });

  it("redeems once: creates the device, its grant and projection, and a device custom token", async () => {
    const world = await buildDeviceWorld();
    const code = await world.activationCode();
    const redeemed = await world.devices.redeemDeviceActivation({ code: `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`, requestId: "r" });
    if (!redeemed.ok) throw redeemed.error;
    const { deviceId } = redeemed.data;
    expect(redeemed.data.customToken).toBe(`custom:${deviceId}:{"principalType":"device","tenantId":"org-a"}`);
    expect(world.deviceRows.rowOf(deviceId)).toMatchObject({ tenantId, label: "Front desk tablet", status: "active", node: nodes.p1 });
    expect(world.writes.allMemberships().filter((grant) => grant.principalId === deviceId)).toMatchObject([{ principalType: "device", node: nodes.p1, deletedAt: null }]);
    expect(world.auth.accounts()).toEqual([deviceId]);
    expect(await world.devices.redeemDeviceActivation({ code, requestId: "r" })).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
  });

  it("refuses an expired code and an unknown or malformed one", async () => {
    const world = await buildDeviceWorld();
    const code = await world.activationCode();
    world.setNow("2026-09-30T12:10:00.000Z");
    expect(await world.devices.redeemDeviceActivation({ code, requestId: "r" })).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    expect(await world.devices.redeemDeviceActivation({ code: "UUUUUUUU", requestId: "r" })).toMatchObject({ ok: false });
    expect(await world.devices.redeemDeviceActivation({ code: "00000000", requestId: "r" })).toMatchObject({ ok: false });
  });
});

describe("devices", () => {
  it("lists the organization's devices and revokes one: status, grants, refresh tokens, Auth user", async () => {
    const world = await buildDeviceWorld();
    const redeemed = await world.devices.redeemDeviceActivation({ code: await world.activationCode(), requestId: "r" });
    if (!redeemed.ok) throw redeemed.error;
    const { deviceId } = redeemed.data;
    const listed = await world.devices.listDevices({ actor: world.admin, access: world.access(), tenantId, page: { after: undefined, limit: 20 } });
    expect(listed).toMatchObject({ ok: true, data: { items: [{ id: deviceId, status: "active" }] } });

    expect(await world.devices.revokeDevice({ actor: world.admin, access: world.access(), deviceId, requestId: "r" })).toEqual({ ok: true, data: undefined });
    expect(world.deviceRows.rowOf(deviceId)?.status).toBe("revoked");
    expect(world.writes.allMemberships().filter((grant) => grant.principalId === deviceId && grant.deletedAt === null)).toEqual([])
    expect(world.writes.projectionOf("org-a", deviceId)).toMatchObject({ isRevoked: true });
    expect(world.auth.revokedUids()).toEqual([deviceId]);
    expect(world.auth.disabledUids()).toEqual([deviceId]);
    expect(world.audited()).toEqual(expect.arrayContaining(["DEVICE_ACTIVATION_CREATED", "DEVICE_ACTIVATED", "DEVICE_REVOKED"]));
    expect(await world.devices.revokeDevice({ actor: world.admin, access: world.access(), deviceId, requestId: "r" })).toEqual({ ok: true, data: undefined });
    expect(await world.devices.revokeDevice({ actor: world.stranger, access: world.access(), deviceId, requestId: "r" })).toMatchObject({ ok: false });
  });
});
