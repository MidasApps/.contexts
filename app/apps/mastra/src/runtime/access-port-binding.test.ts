import type { AccessPrincipal } from "@core/agents";
import {
  createAccessCore,
  createFakeTokenVerifier,
  createInMemoryAccessStore,
  fixedClock,
  makeVerifyBearer,
  refuseAllApiKeys,
  type ResolveAccessContext,
} from "@core/services";
import { describe, expect, it } from "vitest";
import { bindAccessPort } from "./access-port-binding.ts";

const TENANT = "org-a";
const MEMBER: AccessPrincipal = { type: "user", uid: "member-uid", mfa: false };
const REGIONAL = { locale: "pt-BR", displayTimeZone: "America/Sao_Paulo", nodeTimeZone: "America/Manaus", currency: "BRL" };
const ORG = { level: "organization", tenantId: TENANT } as const;

const setup = (resolveAccessContext?: ResolveAccessContext) => {
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
  const calls: Parameters<ResolveAccessContext>[0][] = [];
  // SP1-shaped fake: members of TENANT get their sorted effective permissions and REGIONAL.
  const fake: ResolveAccessContext = async (input) => {
    calls.push(input);
    if (input.node.level === "platform" || input.node.tenantId !== TENANT) return null;
    const effective = await access.forRequest().getEffectivePermissions(input);
    if (!effective.ok) return null;
    const projectId = input.node.level === "organization" ? {} : { projectId: input.node.projectId };
    return { tenantId: input.node.tenantId, ...projectId, principal: input.principal, permissions: [...effective.permissions].sort(), regional: REGIONAL };
  };
  return { port: bindAccessPort({ verifyBearer, access, resolveAccessContext: resolveAccessContext ?? fake }), calls };
};

describe("bindAccessPort", () => {
  it("verifies with SP1 and honours checkRevoked", async () => {
    const { port } = setup();
    expect(await port.verifyBearer({ token: "member-token", checkRevoked: false })).toMatchObject({ type: "user", uid: "member-uid" });
    expect(await port.verifyBearer({ token: "member-token", checkRevoked: true })).toBeNull();
    expect(await port.verifyBearer({ token: "garbage", checkRevoked: false })).toBeNull();
  });

  it("resolves the access context through SP1 resolveAccessContext with branded principal and node", async () => {
    const { port, calls } = setup();
    const context = await port.resolveAccessContext({ principal: MEMBER, node: { level: "project", tenantId: TENANT, projectId: "p1" } });
    expect(context).toMatchObject({ tenantId: TENANT, projectId: "p1", principal: MEMBER, regional: REGIONAL });
    expect(context?.permissions).toContain("core.chat.use");
    expect(context).not.toHaveProperty("unitId");
    expect(calls).toEqual([{ principal: MEMBER, node: { level: "project", tenantId: TENANT, projectId: "p1" } }]);
  });

  it("answers null when SP1 answers null (non-member, unknown node, platform)", async () => {
    const { port } = setup();
    expect(await port.resolveAccessContext({ principal: { type: "user", uid: "outsider-uid", mfa: false }, node: ORG })).toBeNull();
    expect(await port.resolveAccessContext({ principal: MEMBER, node: { level: "organization", tenantId: "org-missing" } })).toBeNull();
    expect(await port.resolveAccessContext({ principal: MEMBER, node: { level: "platform" } })).toBeNull();
  });

  it("propagates an SP1 failure (never resolves a context on error)", async () => {
    const { port } = setup(() => Promise.reject(new Error("firestore unavailable")));
    await expect(port.resolveAccessContext({ principal: MEMBER, node: ORG })).rejects.toThrow("firestore unavailable");
  });

  it("authorizes through SP1 with the agent ceiling", async () => {
    const { port } = setup();
    expect(await port.authorize({ principal: MEMBER, permission: "core.chat.use", node: ORG })).toEqual({ allowed: true, requiresApproval: false });
    expect(await port.authorize({ principal: MEMBER, permission: "core.chat.use", node: ORG, ceiling: new Set(["core.catalog.read"]) })).toEqual({
      allowed: false,
      reason: "CEILING_EXCLUDES",
    });
    expect(await port.authorize({ principal: MEMBER, permission: "Not A Permission", node: ORG })).toEqual({ allowed: false, reason: "UNKNOWN_PERMISSION" });
  });

  it("returns effective permissions, empty when SP1 denies", async () => {
    const { port } = setup();
    expect((await port.getEffectivePermissions({ principal: MEMBER, node: ORG, ceiling: new Set(["core.chat.use"]) })).has("core.chat.use")).toBe(true);
    expect((await port.getEffectivePermissions({ principal: { type: "user", uid: "outsider-uid", mfa: false }, node: ORG })).size).toBe(0);
  });
});
