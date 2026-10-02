import { type Connector, ConnectorSchema } from "@core/contracts";
import { createTool } from "@mastra/core/tools";
import { RequestContext } from "@mastra/core/request-context";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { buildAgentContextEntries, TEST_TENANT } from "../testing/agent-context-fixture.ts";
import { createFakeAccessPort, createFakeApprovalPort, createFakeAuditPort } from "../testing/fake-ports.ts";
import { type CoreToolDefinition, defineCoreTool } from "../tools/define-core-tool.ts";
import { McpConnectorError, type McpTool } from "./mcp/mcp-connector.ts";
import { OpenApiConnectorError } from "./openapi/openapi-document.ts";
import { type ConnectorLoaders, createConnectorToolResolver } from "./connector-registry.ts";

const base = { tenantId: TEST_TENANT, status: "active", createdBy: "uA1b2C3d4E5f6G7h8I9j", createdAt: "2026-09-30T12:00:00.000Z", updatedAt: "2026-09-30T12:00:00.000Z" };
const openapi = ConnectorSchema.parse({
  ...base,
  id: "Cn0000000000000000A1",
  name: "issues-api",
  type: "openapi",
  secretRef: "connector-secret-a",
  toolPolicy: { allow: ["listIssues", "createIssue"], readOnly: ["listIssues"] },
  config: { specUrl: "https://api.example.com/openapi.json", allowedHosts: ["api.example.com"], auth: "bearer", apiKeyHeader: null },
});
const browser = ConnectorSchema.parse({
  ...base,
  id: "Cn0000000000000000B2",
  name: "browser",
  type: "browser",
  secretRef: null,
  toolPolicy: { allow: ["browser_navigate"], readOnly: [] },
  config: { url: "https://browser.example.com/mcp", allowedHosts: ["browser.example.com"] },
});
const docsMcp = ConnectorSchema.parse({
  ...base,
  id: "Cn0000000000000000C3",
  name: "docs",
  type: "mcp",
  secretRef: null,
  toolPolicy: { allow: ["search", "deleteDoc"], readOnly: ["search"] },
  config: { url: "https://mcp.example.com/mcp", allowedHosts: ["mcp.example.com"], auth: "none" },
});

const coreTool = (id: string, kind: "read" | "mutation"): CoreToolDefinition =>
  defineCoreTool({ id, description: "Connector tool for registry tests.", kind, permission: "core.chat.use", inputSchema: z.strictObject({}), outputSchema: z.strictObject({}), execute: () => Promise.resolve({}) });
const mcpTool = (id: string): McpTool => createTool({ id, description: "MCP tool for registry tests.", inputSchema: z.object({}), execute: () => Promise.resolve({}) });

const setup = (connectors: readonly Connector[] = [openapi, browser, docsMcp]) => {
  const loads: string[] = [];
  const secretsSeen: (string | null)[] = [];
  const disconnected: string[] = [];
  const loaders: ConnectorLoaders = {
    openApiTools: (connector, secret) => {
      loads.push(connector.name);
      secretsSeen.push(secret);
      return Promise.resolve([coreTool("api.issues-api.listIssues", "read"), coreTool("api.issues-api.createIssue", "mutation")]);
    },
    mcpToolset: (connector) => {
      loads.push(connector.name);
      const tools = connector.type === "browser" ? { mcp_browser_browser_navigate: mcpTool("browser_navigate") } : { mcp_docs_search: mcpTool("search"), mcp_docs_deleteDoc: mcpTool("deleteDoc") };
      return Promise.resolve({ tools, disconnect: () => Promise.resolve(void disconnected.push(connector.name)) });
    },
    postgresTools: () => [],
  };
  let clock = 0;
  const resolver = createConnectorToolResolver({
    connectors: { listActive: ({ tenantId }) => Promise.resolve(connectors.filter((connector) => connector.tenantId === tenantId)) },
    secrets: { get: (ref) => Promise.resolve(ref === "connector-secret-a" ? "tok" : null) },
    toolDeps: { access: createFakeAccessPort({}), audit: createFakeAuditPort(), approvals: createFakeApprovalPort() },
    loaders,
    ttlMs: 1000,
    now: () => clock,
  });
  return { resolver, loads, secretsSeen, disconnected, advance: (ms: number) => void (clock += ms) };
};

const context = (tenantId = TEST_TENANT) => new RequestContext<unknown>(buildAgentContextEntries({ tenantId }));

describe("connector tool resolver", () => {
  it("gives each agent its slice: supervisor reads, action everything but browser, web the browser", async () => {
    const { resolver, secretsSeen } = setup();
    expect(Object.keys(await resolver(context(), "supervisor")).sort()).toEqual(["api.issues-api.listIssues", "mcp_docs_search"]);
    expect(Object.keys(await resolver(context(), "action")).sort()).toEqual(["api.issues-api.createIssue", "api.issues-api.listIssues", "mcp_docs_deleteDoc", "mcp_docs_search"]);
    expect(Object.keys(await resolver(context(), "web"))).toEqual(["mcp_browser_browser_navigate"]);
    expect(secretsSeen).toEqual(["tok"]);
  });

  it("binds OpenAPI mutations with approval", async () => {
    const { resolver } = setup();
    const tools = await resolver(context(), "action");
    expect(tools["api.issues-api.createIssue"]?.requireApproval).toBe(true);
    expect(tools["api.issues-api.listIssues"]?.requireApproval).toBe(false);
  });

  it("loads a tenant once per TTL and disconnects MCP clients on eviction", async () => {
    const { resolver, loads, disconnected, advance } = setup();
    await resolver(context(), "action");
    await resolver(context(), "web");
    expect(loads.sort()).toEqual(["browser", "docs", "issues-api"]);
    advance(1001);
    await resolver(context(), "action");
    expect(disconnected.sort()).toEqual(["browser", "docs"]);
    expect(loads).toHaveLength(6);
    await resolver.close();
  });

  it("uses the tenant of the server context and offers nothing without one", async () => {
    const { resolver } = setup();
    expect(await resolver(context("OtherTenant000000000"), "action")).toEqual({});
    expect(await resolver(new RequestContext<unknown>(), "action")).toEqual({});
  });

  it("leaves out a connector that fails to load, keeping the others", async () => {
    const { resolver } = setup();
    const failing = createConnectorToolResolver({
      connectors: { listActive: () => Promise.resolve([openapi, docsMcp]) },
      secrets: { get: () => Promise.resolve(null) },
      toolDeps: { access: createFakeAccessPort({}), audit: createFakeAuditPort(), approvals: createFakeApprovalPort() },
      loaders: { openApiTools: () => Promise.reject(new Error("spec down")), mcpToolset: () => Promise.resolve({ tools: { mcp_docs_search: mcpTool("search") }, disconnect: () => Promise.resolve() }), postgresTools: () => [] },
    });
    expect(Object.keys(await failing(context(), "action"))).toEqual(["mcp_docs_search"]);
    await resolver.close();
  });
});

describe("connector load errors", () => {
  type Recorded = { tenantId: string; connectorId: string; lastError: { code: string; at: string } | null };
  const record = (connectors: readonly Connector[], loaders: Partial<ConnectorLoaders>) => {
    const recorded: Recorded[] = [];
    const resolver = createConnectorToolResolver({
      connectors: {
        listActive: () => Promise.resolve(connectors),
        recordLoad: (input) => Promise.resolve(void recorded.push(input)),
      },
      secrets: { get: (ref) => Promise.resolve(ref === "connector-secret-a" ? "tok" : null) },
      toolDeps: { access: createFakeAccessPort({}), audit: createFakeAuditPort(), approvals: createFakeApprovalPort() },
      loaders: { openApiTools: () => Promise.resolve([]), mcpToolset: () => Promise.resolve({ tools: {}, disconnect: () => Promise.resolve() }), postgresTools: () => [], ...loaders },
      now: () => Date.UTC(2026, 9, 1, 10, 0, 0),
    });
    return { resolver, recorded };
  };
  const AT = "2026-10-01T10:00:00.000Z";

  it("records why a connector failed to load, as a code, and keeps the others' tools", async () => {
    const { resolver, recorded } = record([openapi, docsMcp], {
      openApiTools: () => Promise.reject(new OpenApiConnectorError("SPEC_UNAVAILABLE")),
      mcpToolset: () => Promise.resolve({ tools: { mcp_docs_search: mcpTool("search") }, disconnect: () => Promise.resolve() }),
    });
    expect(Object.keys(await resolver(context(), "supervisor"))).toEqual(["mcp_docs_search"]);
    await vi.waitFor(() => expect(recorded).toEqual([{ tenantId: TEST_TENANT, connectorId: openapi.id, lastError: { code: "SPEC_UNAVAILABLE", at: AT } }]));
  });

  it("classifies a missing secret, an MCP refusal and anything else", async () => {
    const noSecret = ConnectorSchema.parse({ ...openapi, id: "Cn0000000000000000D4", secretRef: null });
    const { resolver, recorded } = record([noSecret, docsMcp, browser], {
      mcpToolset: (connector) => Promise.reject(connector.type === "mcp" ? new McpConnectorError("CONNECT_FAILED") : new Error("boom")),
    });
    await resolver(context(), "action");
    await vi.waitFor(() => expect(recorded).toHaveLength(3));
    expect(Object.fromEntries(recorded.map((entry) => [entry.connectorId, entry.lastError?.code]))).toEqual({
      [noSecret.id]: "SECRET_MISSING",
      [docsMcp.id]: "CONNECT_FAILED",
      [browser.id]: "LOAD_FAILED",
    });
  });

  it("clears a past error once the connector loads, and writes nothing when nothing changed", async () => {
    const healed = ConnectorSchema.parse({ ...docsMcp, lastError: { code: "CONNECT_FAILED", at: "2026-09-30T10:00:00.000Z" } });
    const { resolver, recorded } = record([healed, openapi], {});
    await resolver(context(), "action");
    await vi.waitFor(() => expect(recorded).toEqual([{ tenantId: TEST_TENANT, connectorId: healed.id, lastError: null }]));
  });
});
