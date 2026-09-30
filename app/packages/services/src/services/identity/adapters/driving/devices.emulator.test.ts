import { OrganizationIdSchema } from "@core/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { createCoreServer } from "../../../composition.ts";
import { CORE_COLLECTIONS } from "../../../shared/firestore/collections.ts";
import { createLogger } from "../../../shared/observability/logger.ts";
import { signInWithCustomToken } from "../../../shared/testing/auth-emulator-rest.fixture.ts";
import { buildEmulatorServer, clearCoreCollections, EMULATOR_APP_URL, emulatorFirebase, ensureAuthUser } from "../../../shared/testing/core-server-emulator.fixture.ts";

const firebase = emulatorFirebase();
const { firestore, auth } = firebase;
// Admin calls use the fake verifier (`token-<uid>`); device calls go through the real one,
// so the device's Firebase ID token is verified by the Auth Emulator.
const harness = buildEmulatorServer({ firebase, uids: ["dv-owner"] });
const real = createCoreServer({
  env: { API_KEY_PREFIX: "core", NEXT_PUBLIC_APP_URL: EMULATOR_APP_URL },
  firebase,
  logger: createLogger({ context: { service: "test", env: "local" }, sink: () => undefined }),
});
let tenantId = OrganizationIdSchema.parse("unset");

const callReal = (endpointId: string, path: string, init: { method?: string; bearer?: string; body?: unknown; ip?: string } = {}) => {
  const handler = real.routes[endpointId];
  if (handler === undefined) throw new Error(`no handler for ${endpointId}`);
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": init.ip ?? "198.51.100.20" };
  if (init.bearer !== undefined) headers["authorization"] = `Bearer ${init.bearer}`;
  return handler(new Request(`http://localhost${path}`, { method: init.method ?? "GET", headers, ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }) }));
};

const createActivation = async (): Promise<string> => {
  const response = await harness.call("identity.createDeviceActivation", {
    method: "POST",
    path: `/v1/organizations/${tenantId}/device-activations`,
    as: "dv-owner",
    body: { label: "Front desk tablet", node: { level: "organization", tenantId }, roles: [{ kind: "system", key: "device" }] },
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { data: { code: string } }).data.code;
};

const redeem = (code: string, ip?: string) => callReal("identity.redeemDeviceActivation", "/v1/device-activations/redeem", { method: "POST", body: { code }, ...(ip === undefined ? {} : { ip }) });

beforeEach(async () => {
  await clearCoreCollections(firestore);
  await ensureAuthUser(auth, "dv-owner");
  const created = await harness.call("tenancy.createOrganization", {
    method: "POST",
    path: "/v1/organizations",
    as: "dv-owner",
    body: { name: "Devices Inc", defaults: { locale: "pt-BR", timeZone: "America/Sao_Paulo", currency: "BRL" } },
  });
  tenantId = OrganizationIdSchema.parse(((await created.json()) as { data: { id: string } }).data.id);
}, 30_000);

describe("devices (Auth Emulator)", () => {
  it("redeems a code into a device whose ID token reads its access context, until it is revoked", { timeout: 60_000 }, async () => {
    const code = await createActivation();
    const redeemed = await redeem(`${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`);
    expect(redeemed.status).toBe(200);
    const { data } = (await redeemed.json()) as { data: { deviceId: string; tenantId: string; customToken: string } };
    expect(data.tenantId).toBe(tenantId);
    const { idToken } = await signInWithCustomToken(data.customToken);
    expect(await auth.verifyIdToken(idToken)).toMatchObject({ uid: data.deviceId, principalType: "device", tenantId });

    const context = await callReal("identity.getAccessContext", `/v1/me/context?organizationId=${tenantId}`, { bearer: idToken });
    expect(context.status).toBe(200);
    const permissions = ((await context.json()) as { data: { permissions: string[] } }).data.permissions;
    expect(permissions).toContain("core.organization.read");
    expect(permissions).not.toContain("core.organization.update");
    expect((await firestore.collection(CORE_COLLECTIONS.devices).doc(data.deviceId).get()).data()).toMatchObject({ tenantId, status: "active" });
    expect((await redeem(code)).status).toBe(401);

    const revoked = await harness.call("identity.revokeDevice", { method: "DELETE", path: `/v1/devices/${data.deviceId}`, as: "dv-owner" });
    expect(revoked.status).toBe(204);
    expect((await auth.getUser(data.deviceId)).disabled).toBe(true);
    expect((await callReal("identity.getAccessContext", `/v1/me/context?organizationId=${tenantId}`, { bearer: idToken })).status).toBe(401);
    const listed = await harness.call("identity.listDevices", { method: "GET", path: `/v1/organizations/${tenantId}/devices`, as: "dv-owner" });
    expect(((await listed.json()) as { data: { id: string; status: string }[] }).data).toMatchObject([{ id: data.deviceId, status: "revoked" }]);
  });

  it("answers 429 to the 6th wrong code from the same IP", { timeout: 60_000 }, async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) expect((await redeem("00000000", "203.0.113.50")).status).toBe(401);
    const locked = await redeem(await createActivation(), "203.0.113.50");
    expect(locked.status).toBe(429);
    expect(locked.headers.get("retry-after")).not.toBeNull();
  });
});
