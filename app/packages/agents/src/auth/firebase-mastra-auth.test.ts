import type { MastraAuthRequest } from "@mastra/core/server";
import { describe, expect, it, vi } from "vitest";
import type { AccessPort, AccessPrincipal } from "../runtime/runtime-ports.ts";
import { createFakeAccessPort, FAKE_REGIONAL } from "../testing/fake-ports.ts";
import { FirebaseMastraAuth, requiredPermissionFor } from "./firebase-mastra-auth.ts";

const TENANT = "Jd8sK2lPq0WnR5tYu3bV";
const MEMBER: AccessPrincipal = { type: "user", uid: "member-uid", mfa: false };
const VIEWER: AccessPrincipal = { type: "user", uid: "viewer-uid", mfa: false };
const API_KEY: AccessPrincipal = { type: "service", apiKeyId: "key-1", tenantId: TENANT, ownerUid: "member-uid" };
const DEVICE: AccessPrincipal = { type: "device", deviceId: "device-1", tenantId: TENANT };

const createAuth = () => {
  const access = createFakeAccessPort({
    credentials: { "member-token": MEMBER, "viewer-token": VIEWER, core_live_key: API_KEY, "device-token": DEVICE },
    memberships: [
      { tenantId: TENANT, uid: "member-uid", permissions: ["core.chat.use", "core.mcp.use", "core.knowledge.read"] },
      { tenantId: TENANT, uid: "viewer-uid", permissions: ["core.knowledge.read"] },
    ],
  });
  return { access, auth: new FirebaseMastraAuth({ access }) };
};

type RequestInput = { method?: string; path?: string; headers?: Record<string, string> };

/** Same shape Mastra's auth middleware passes (`adaptToMastraAuthRequest`). */
const mastraRequest = ({
  method = "POST",
  path = "/api/agents/assistant/stream",
  headers = {},
}: RequestInput): MastraAuthRequest => {
  const raw = new Request(`http://mastra.internal${path}`, { method, headers });
  return { raw, headers: raw.headers, header: (name: string) => raw.headers.get(name) ?? undefined };
};

const withBearer = (token: string, extra: Record<string, string> = {}) => ({
  authorization: `Bearer ${token}`,
  "x-tenant-id": TENANT,
  ...extra,
});

describe("FirebaseMastraAuth.authenticateToken", () => {
  it("rejects a token that only came from ?apiKey= (no Authorization header)", async () => {
    const { auth, access } = createAuth();
    const request = mastraRequest({
      path: "/api/agents/assistant/stream?apiKey=member-token",
      headers: { "x-tenant-id": TENANT },
    });
    expect(await auth.authenticateToken("member-token", request)).toBeNull();
    expect(access.verifyCalls).toEqual([]);
  });

  it("rejects a token that differs from the Authorization header", async () => {
    const { auth } = createAuth();
    expect(
      await auth.authenticateToken("member-token", mastraRequest({ headers: withBearer("viewer-token") })),
    ).toBeNull();
  });

  it("rejects a non-Bearer scheme", async () => {
    const { auth } = createAuth();
    const request = mastraRequest({ headers: { authorization: "Basic member-token", "x-tenant-id": TENANT } });
    expect(await auth.authenticateToken("member-token", request)).toBeNull();
  });

  it("resolves a Bearer user into a tenant principal with permissions and regional settings", async () => {
    const { auth } = createAuth();
    const request = mastraRequest({ headers: withBearer("member-token", { "x-active-screen": "notes.list" }) });
    const principal = await auth.authenticateToken("member-token", request);
    expect(principal).toMatchObject({
      kind: "user",
      uid: "member-uid",
      tenantId: TENANT,
      isMember: true,
      regional: FAKE_REGIONAL,
      activeScreen: "notes.list",
    });
    expect(principal?.permissions.has("core.chat.use")).toBe(true);
  });

  it("checks revocation on POST and skips it on GET", async () => {
    const { auth, access } = createAuth();
    await auth.authenticateToken("member-token", mastraRequest({ method: "GET", headers: withBearer("member-token") }));
    await auth.authenticateToken(
      "member-token",
      mastraRequest({ method: "POST", headers: withBearer("member-token") }),
    );
    expect(access.verifyCalls.map((call) => call.checkRevoked)).toEqual([false, true]);
  });

  it("returns null for an invalid token", async () => {
    const { auth } = createAuth();
    expect(await auth.authenticateToken("forged", mastraRequest({ headers: withBearer("forged") }))).toBeNull();
  });

  it("resolves an API key bearer into a service principal acting as the key owner", async () => {
    const { auth } = createAuth();
    const principal = await auth.authenticateToken(
      "core_live_key",
      mastraRequest({ headers: withBearer("core_live_key") }),
    );
    expect(principal).toMatchObject({ kind: "service", uid: "member-uid", tenantId: TENANT, isMember: true });
  });

  it("does not accept device credentials for agent runs", async () => {
    const { auth } = createAuth();
    expect(
      await auth.authenticateToken("device-token", mastraRequest({ headers: withBearer("device-token") })),
    ).toBeNull();
  });

  it("gives a principal without tenant header no membership and no permissions", async () => {
    const { auth } = createAuth();
    const principal = await auth.authenticateToken(
      "member-token",
      mastraRequest({ headers: { authorization: "Bearer member-token" } }),
    );
    expect(principal).toMatchObject({ tenantId: null, isMember: false });
    expect(principal?.permissions.size).toBe(0);
  });

  it("scopes the access context to the forwarded project and unit", async () => {
    const { auth } = createAuth();
    const headers = withBearer("member-token", { "x-project-id": "project-1", "x-unit-id": "unit-1" });
    const principal = await auth.authenticateToken("member-token", mastraRequest({ headers }));
    expect(principal).toMatchObject({ projectId: "project-1", unitId: "unit-1" });
  });

  it("treats a unit without a project as no membership", async () => {
    const { auth } = createAuth();
    const principal = await auth.authenticateToken(
      "member-token",
      mastraRequest({ headers: withBearer("member-token", { "x-unit-id": "unit-1" }) }),
    );
    expect(principal?.isMember).toBe(false);
  });

  it("also reads a plain Web Request", async () => {
    const { auth } = createAuth();
    const raw = new Request("http://mastra.internal/api/agents", {
      method: "GET",
      headers: withBearer("member-token"),
    });
    expect(await auth.authenticateToken("member-token", raw)).toMatchObject({ uid: "member-uid" });
  });
});

describe("FirebaseMastraAuth.authorizeUser", () => {
  const authenticate = async (token: string, input: RequestInput = {}) => {
    const { auth } = createAuth();
    const request = mastraRequest({ ...input, headers: withBearer(token) });
    const principal = await auth.authenticateToken(token, request);
    if (principal === null) throw new Error("expected a principal");
    return { auth, principal, request };
  };

  it("allows a member holding core.chat.use", async () => {
    const { auth, principal, request } = await authenticate("member-token");
    expect(auth.authorizeUser(principal, request)).toBe(true);
  });

  it("denies a member without core.chat.use (403)", async () => {
    const { auth, principal, request } = await authenticate("viewer-token");
    expect(auth.authorizeUser(principal, request)).toBe(false);
  });

  it("requires core.mcp.use on the MCP routes", async () => {
    const member = await authenticate("member-token", { path: "/api/mcp/core/mcp" });
    expect(member.auth.authorizeUser(member.principal, member.request)).toBe(true);
    const viewer = await authenticate("viewer-token", { path: "/api/mcp/core/mcp" });
    expect(viewer.auth.authorizeUser(viewer.principal, viewer.request)).toBe(false);
  });

  it("denies a principal without membership", async () => {
    const { auth } = createAuth();
    const request = mastraRequest({ headers: { authorization: "Bearer member-token" } });
    const principal = await auth.authenticateToken("member-token", request);
    if (principal === null) throw new Error("expected a principal");
    expect(auth.authorizeUser(principal, request)).toBe(false);
  });
});

describe("FirebaseMastraAuth with API keys", () => {
  const OTHER_TENANT = "Qw3eR4tY5uI6oP7aS8dF";
  const OWNER_PERMISSIONS = ["core.chat.use", "core.mcp.use", "core.knowledge.read"];

  /** An SP1 binding that forgets the key's tenant and scopes: the auth must still fail closed. */
  const laxAccess = (key: AccessPrincipal, effective: readonly string[]): AccessPort => ({
    verifyBearer: () => Promise.resolve(key),
    resolveAccessContext: ({ principal, node }) =>
      Promise.resolve(
        node.level === "platform"
          ? null
          : { tenantId: node.tenantId, principal, permissions: OWNER_PERMISSIONS, regional: FAKE_REGIONAL },
      ),
    authorize: () => Promise.resolve({ allowed: false, reason: "PERMISSION_NOT_GRANTED" }),
    getEffectivePermissions: () => Promise.resolve(new Set(effective)),
  });

  it("gives no membership to a key forwarded with another tenant", async () => {
    const key: AccessPrincipal = { type: "service", apiKeyId: "key-2", tenantId: TENANT, ownerUid: "member-uid" };
    const access = {
      ...laxAccess(key, OWNER_PERMISSIONS),
      resolveAccessContext: vi.fn(laxAccess(key, OWNER_PERMISSIONS).resolveAccessContext),
    };
    const auth = new FirebaseMastraAuth({ access });
    const request = mastraRequest({ headers: { authorization: "Bearer core_live_key", "x-tenant-id": OTHER_TENANT } });
    const principal = await auth.authenticateToken("core_live_key", request);
    expect(principal).toMatchObject({ kind: "service", tenantId: OTHER_TENANT, isMember: false });
    expect(principal?.permissions.size).toBe(0);
    expect(access.resolveAccessContext).not.toHaveBeenCalled();
    if (principal === null) throw new Error("expected a principal");
    expect(auth.authorizeUser(principal, request)).toBe(false);
  });

  it("limits a key to its scopes even when the access context lists the owner's grants", async () => {
    const key: AccessPrincipal = { type: "service", apiKeyId: "key-3", tenantId: TENANT, ownerUid: "member-uid" };
    const auth = new FirebaseMastraAuth({ access: laxAccess(key, ["core.mcp.use"]) });
    const chat = mastraRequest({ headers: withBearer("core_live_key") });
    const principal = await auth.authenticateToken("core_live_key", chat);
    if (principal === null) throw new Error("expected a principal");
    expect([...principal.permissions]).toEqual(["core.mcp.use"]);
    expect(auth.authorizeUser(principal, chat)).toBe(false);
    expect(
      auth.authorizeUser(principal, mastraRequest({ path: "/api/mcp/core/mcp", headers: withBearer("core_live_key") })),
    ).toBe(true);
  });

  it("applies the scopes of the fake access port like SP1", async () => {
    const access = createFakeAccessPort({
      credentials: { core_live_key: API_KEY },
      memberships: [{ tenantId: TENANT, uid: "member-uid", permissions: OWNER_PERMISSIONS }],
      apiKeyScopes: { "key-1": ["core.knowledge.read"] },
    });
    const principal = await new FirebaseMastraAuth({ access }).authenticateToken(
      "core_live_key",
      mastraRequest({ headers: withBearer("core_live_key") }),
    );
    expect([...(principal?.permissions ?? [])]).toEqual(["core.knowledge.read"]);
  });
});

describe("requiredPermissionFor", () => {
  it("derives the MCP route from the configured API prefix", () => {
    expect(requiredPermissionFor("/api/mcp/core/mcp")).toBe("core.mcp.use");
    expect(requiredPermissionFor("/api/mcp/core/mcp", "/mastra")).toBe("core.chat.use");
    expect(requiredPermissionFor("/mastra/mcp/core/mcp", "/mastra/")).toBe("core.mcp.use");
    expect(requiredPermissionFor("/api/mcpx/other", "/api")).toBe("core.chat.use");
    expect(requiredPermissionFor(undefined)).toBe("core.chat.use");
  });

  it("uses the prefix passed to the provider", async () => {
    const { access } = createAuth();
    const auth = new FirebaseMastraAuth({ access, apiPrefix: "/mastra" });
    const request = mastraRequest({ path: "/mastra/mcp/core/mcp", headers: withBearer("member-token") });
    const principal = await auth.authenticateToken("member-token", request);
    if (principal === null) throw new Error("expected a principal");
    expect(auth.authorizeUser(principal, request)).toBe(true);
  });
});

describe("FirebaseMastraAuth.mapUserToResourceId", () => {
  it("is an own property set through super(), not a shadowed prototype method", () => {
    const { auth } = createAuth();
    expect(Object.hasOwn(auth, "mapUserToResourceId")).toBe(true);
    expect(typeof auth.mapUserToResourceId).toBe("function");
  });

  it("maps a principal to tenantId:uid", async () => {
    const { auth } = createAuth();
    const principal = await auth.authenticateToken(
      "member-token",
      mastraRequest({ headers: withBearer("member-token") }),
    );
    if (principal === null) throw new Error("expected a principal");
    expect(auth.mapUserToResourceId?.(principal)).toBe(`${TENANT}:member-uid`);
  });

  it("maps a principal without tenant to a resource no tenant can own", async () => {
    const { auth } = createAuth();
    const principal = await auth.authenticateToken(
      "member-token",
      mastraRequest({ headers: { authorization: "Bearer member-token" } }),
    );
    if (principal === null) throw new Error("expected a principal");
    expect(auth.mapUserToResourceId?.(principal)).toBe("unscoped:member-uid");
  });
});

describe("FirebaseMastraAuth per-request memo", () => {
  it("verifies a request once when the context middleware and the route auth both authenticate it", async () => {
    const { auth, access } = createAuth();
    const raw = new Request("http://mastra.internal/api/agents/ping/generate", {
      method: "POST",
      headers: withBearer("member-token"),
    });
    const first = await auth.authenticateToken("member-token", raw);
    const second = await auth.authenticateToken("member-token", {
      raw,
      headers: raw.headers,
      header: (name: string) => raw.headers.get(name) ?? undefined,
    });
    expect(second).toBe(first);
    expect(access.verifyCalls).toHaveLength(1);
  });

  it("never reuses a result across requests", async () => {
    const { auth, access } = createAuth();
    await auth.authenticateToken("member-token", mastraRequest({ headers: withBearer("member-token") }));
    await auth.authenticateToken("member-token", mastraRequest({ headers: withBearer("member-token") }));
    expect(access.verifyCalls).toHaveLength(2);
  });
});
