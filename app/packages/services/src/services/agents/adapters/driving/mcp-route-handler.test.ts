import { type ApiKeyId, type Principal, type RegionalSettings, TenantIdSchema, UserIdSchema } from "@core/contracts";
import { describe, expect, it } from "vitest";
import type { ResolveAccessContext } from "#/services/identity/application/use-cases/resolve-access-context.ts";
import type { ErrorEnvelope } from "#/services/shared/http/error-envelope.ts";
import { callRoute, makeInMemoryPipeline } from "#/services/shared/testing/in-memory-api-pipeline.fixture.ts";
import type { AgentRuntimeGateway, McpCallInput } from "../../application/ports/agent-runtime-gateway.ts";
import { buildMcpRoutes } from "./mcp-route-handler.ts";

const ORG_A = "OrgAaaaaaaaaaaaaaaaaa";
const ORG_B = "OrgBbbbbbbbbbbbbbbbbb";
const REGIONAL: RegionalSettings = {
  locale: "pt-BR",
  displayTimeZone: "America/Sao_Paulo",
  nodeTimeZone: "America/Sao_Paulo",
  currency: "BRL",
};
const KEY: Principal = {
  type: "service",
  apiKeyId: "key-1" as ApiKeyId,
  tenantId: TenantIdSchema.parse(ORG_A),
  ownerUid: UserIdSchema.parse("alice"),
};
const LIST_TOOLS = { jsonrpc: "2.0", id: 1, method: "tools/list" };

const setup = (options: { keyScopes?: readonly string[] } = {}) => {
  const { pipeline, store } = makeInMemoryPipeline({
    now: "2026-09-30T12:00:00.000Z",
    members: [
      { uid: "alice", tenantId: ORG_A, role: "admin" },
      { uid: "mia", tenantId: ORG_A, role: "member" },
    ],
  });
  store.putApiKey("key-1", {
    tenantId: TenantIdSchema.parse(ORG_A),
    ownerUid: UserIdSchema.parse("alice"),
    status: "active",
    expiresAt: "2027-01-01T00:00:00.000Z",
    scopes: options.keyScopes ?? ["core.mcp.use"],
    node: { level: "organization", tenantId: TenantIdSchema.parse(ORG_A) },
  });
  const withKey = {
    ...pipeline,
    verifyBearer: (input: { token: string }) =>
      input.token === "core_key-token" ? Promise.resolve(KEY) : pipeline.verifyBearer(input as never),
  };
  const calls: McpCallInput[] = [];
  const gateway = {
    callMcp: (input: McpCallInput) => {
      calls.push(input);
      const body = new Response('{"jsonrpc":"2.0","id":1,"result":{"tools":[]}}').body;
      return Promise.resolve({
        ok: true as const,
        data: { status: 200, body, contentType: "application/json", headers: { "mcp-session-id": "sess-1" } },
      });
    },
  } as unknown as AgentRuntimeGateway;
  const resolveAccessContext: ResolveAccessContext = ({ principal, node }) =>
    Promise.resolve(
      node.level === "organization"
        ? { tenantId: node.tenantId, principal, permissions: [], regional: REGIONAL }
        : null,
    );
  return { routes: buildMcpRoutes({ pipeline: withKey, gateway, resolveAccessContext }), calls };
};

const post = (
  routes: ReturnType<typeof setup>["routes"],
  url: string,
  init: { as?: string; headers?: Record<string, string>; body?: unknown } = {},
) =>
  callRoute(routes, "agents.callMcp", url, {
    method: "POST",
    body: init.body ?? LIST_TOOLS,
    ...(init.as === undefined ? {} : { as: init.as }),
    ...(init.headers === undefined ? {} : { headers: init.headers }),
  });

const codeOf = async (response: Response) => ((await response.json()) as ErrorEnvelope).error.code;

describe("POST /v1/mcp", () => {
  it("answers 401 without a Bearer and 403 without core.mcp.use", async () => {
    const { routes, calls } = setup();
    expect((await post(routes, `/v1/mcp?organizationId=${ORG_A}`)).status).toBe(401);
    const member = await post(routes, `/v1/mcp?organizationId=${ORG_A}`, { as: "mia" });
    expect(member.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("needs the organization of a user caller (400) and hides organizations it is not in (404)", async () => {
    const { routes, calls } = setup();
    const missing = await post(routes, "/v1/mcp", { as: "alice" });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({
      error: { code: "VALIDATION_FAILED", details: [{ field: "organizationId", issue: "REQUIRED" }] },
    });
    expect((await post(routes, `/v1/mcp?organizationId=${ORG_B}`, { as: "alice" })).status).toBe(404);
    expect(calls).toEqual([]);
  });

  it("proxies the MCP message with the caller's Bearer, the MCP headers and the scope, and passes the answer through", async () => {
    const { routes, calls } = setup();
    const response = await post(routes, `/v1/mcp?organizationId=${ORG_A}`, {
      as: "alice",
      headers: {
        "mcp-method": "tools/list",
        "mcp-protocol-version": "2026-07-28",
        cookie: "session=secret",
        "x-tenant-id": ORG_B,
      },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("mcp-session-id")).toBe("sess-1");
    expect(await response.json()).toEqual({ jsonrpc: "2.0", id: 1, result: { tools: [] } });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      serverId: "core",
      body: LIST_TOOLS,
      headers: { "mcp-method": "tools/list", "mcp-protocol-version": "2026-07-28" },
      scope: { bearer: "alice-token", tenantId: ORG_A, regional: REGIONAL },
    });
    expect(calls[0]?.headers).not.toHaveProperty("cookie");
    expect(calls[0]?.headers).not.toHaveProperty("x-tenant-id");
  });

  it("acts in an API key's own organization, and never in another one", async () => {
    const { routes, calls } = setup();
    expect((await post(routes, "/v1/mcp", { headers: { authorization: "Bearer core_key-token" } })).status).toBe(200);
    expect(calls[0]?.scope).toMatchObject({ bearer: "core_key-token", tenantId: ORG_A });
    const other = await post(routes, `/v1/mcp?organizationId=${ORG_B}`, {
      headers: { authorization: "Bearer core_key-token" },
    });
    expect(other.status).toBe(403);
    expect(await codeOf(other)).toBe("FORBIDDEN");
    expect(calls).toHaveLength(1);
  });

  it("refuses an API key without the core.mcp.use scope", async () => {
    const { routes, calls } = setup({ keyScopes: ["core.catalog.read"] });
    expect((await post(routes, "/v1/mcp", { headers: { authorization: "Bearer core_key-token" } })).status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("rejects a body that is not a JSON-RPC 2.0 message (400)", async () => {
    const { routes, calls } = setup();
    expect(
      (await post(routes, `/v1/mcp?organizationId=${ORG_A}`, { as: "alice", body: { method: "tools/list" } })).status,
    ).toBe(400);
    expect(calls).toEqual([]);
  });
});
