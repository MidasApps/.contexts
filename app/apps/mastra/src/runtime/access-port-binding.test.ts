import type { AccessPrincipal, RegionalSettings } from "@core/agents";
import { createAccessCore, createFakeTokenVerifier, createInMemoryAccessStore, fixedClock, makeVerifyBearer, refuseAllApiKeys } from "@core/services";
import { describe, expect, it } from "vitest";
import { bindAccessPort, RegionalSettingsNotWiredError, type RegionalSettingsResolver, UNWIRED_REGIONAL_SETTINGS } from "./access-port-binding.ts";

const TENANT = "org-a";
const MEMBER: AccessPrincipal = { type: "user", uid: "member-uid", mfa: false };
const REGIONAL: RegionalSettings = { locale: "pt-BR", displayTimeZone: "America/Sao_Paulo", nodeTimeZone: "America/Manaus", currency: "BRL" };
const ORG = { level: "organization", tenantId: TENANT } as const;

const setup = (regional: RegionalSettingsResolver = () => Promise.resolve<RegionalSettings | null>(REGIONAL)) => {
  const store = createInMemoryAccessStore();
  store.putOrganization({ id: TENANT });
  store.putProject({ id: "p1", tenantId: TENANT });
  store.putUser("member-uid");
  store.putUser("outsider-uid");
  store.putGrant({ tenantId: TENANT, principalId: "member-uid", nodeId: TENANT, roles: [{ kind: "system", key: "member" }] });
  const tokenVerifier = createFakeTokenVerifier({
    tokens: { "member-token": { uid: "member-uid", claims: {}, signInProvider: "password", secondFactor: null } },
    revoked: ["member-token"],
  });
  const access = createAccessCore({ readers: store, clock: fixedClock("2026-09-30T12:00:00.000Z") });
  const verifyBearer = makeVerifyBearer({ tokenVerifier, apiKeyAuthenticator: refuseAllApiKeys, apiKeyPrefix: "core" });
  return bindAccessPort({ verifyBearer, access, regional });
};

describe("bindAccessPort", () => {
  it("verifies with SP1 and honours checkRevoked", async () => {
    const port = setup();
    expect(await port.verifyBearer({ token: "member-token", checkRevoked: false })).toMatchObject({ type: "user", uid: "member-uid" });
    expect(await port.verifyBearer({ token: "member-token", checkRevoked: true })).toBeNull();
    expect(await port.verifyBearer({ token: "garbage", checkRevoked: false })).toBeNull();
  });

  it("resolves the access context of a member from SP1 effective permissions and regional settings", async () => {
    const context = await setup().resolveAccessContext({ principal: MEMBER, node: { level: "project", tenantId: TENANT, projectId: "p1" } });
    expect(context).toMatchObject({ tenantId: TENANT, projectId: "p1", principal: MEMBER, regional: REGIONAL });
    expect(context?.permissions).toContain("core.chat.use");
    expect(context?.permissions).toEqual([...(context?.permissions ?? [])].sort());
  });

  it("answers null for a non-member, an unknown node or the platform node", async () => {
    const port = setup();
    expect(await port.resolveAccessContext({ principal: { type: "user", uid: "outsider-uid", mfa: false }, node: ORG })).toBeNull();
    expect(await port.resolveAccessContext({ principal: MEMBER, node: { level: "organization", tenantId: "org-missing" } })).toBeNull();
    expect(await port.resolveAccessContext({ principal: MEMBER, node: { level: "platform" } })).toBeNull();
  });

  it("answers null when the node has no regional settings, and rejects while they are unwired", async () => {
    expect(await setup(() => Promise.resolve(null)).resolveAccessContext({ principal: MEMBER, node: ORG })).toBeNull();
    await expect(setup(UNWIRED_REGIONAL_SETTINGS).resolveAccessContext({ principal: MEMBER, node: ORG })).rejects.toBeInstanceOf(RegionalSettingsNotWiredError);
  });

  it("authorizes through SP1 with the agent ceiling", async () => {
    const port = setup();
    expect(await port.authorize({ principal: MEMBER, permission: "core.chat.use", node: ORG })).toEqual({ allowed: true, requiresApproval: false });
    expect(await port.authorize({ principal: MEMBER, permission: "core.chat.use", node: ORG, ceiling: new Set(["core.catalog.read"]) })).toEqual({
      allowed: false,
      reason: "CEILING_EXCLUDES",
    });
    expect(await port.authorize({ principal: MEMBER, permission: "Not A Permission", node: ORG })).toEqual({ allowed: false, reason: "UNKNOWN_PERMISSION" });
  });

  it("returns effective permissions, empty when SP1 denies", async () => {
    const port = setup();
    expect((await port.getEffectivePermissions({ principal: MEMBER, node: ORG, ceiling: new Set(["core.chat.use"]) })).has("core.chat.use")).toBe(true);
    expect((await port.getEffectivePermissions({ principal: { type: "user", uid: "outsider-uid", mfa: false }, node: ORG })).size).toBe(0);
  });
});
