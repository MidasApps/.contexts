import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { type Connector, ConnectorSchema } from "@core/contracts";
import { createTool } from "@mastra/core/tools";
import { MCPServer } from "@mastra/mcp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createMcpConnectorClient, loadMcpConnectorToolset, McpConnectorError } from "./mcp-connector.ts";

// A real MCP server over Streamable HTTP on 127.0.0.1. The connector names
// https://mcp.example.com (its contract only allows public https hosts); the test fetch below
// the SSRF guard sends those requests to the local server, and DNS answers a public address.
const searchTool = createTool({ id: "search", description: "Searches the docs.", inputSchema: z.object({ q: z.string() }), execute: ({ q }) => Promise.resolve({ hits: [`doc about ${q}`] }) });
const deleteTool = createTool({ id: "deleteDoc", description: "Deletes a doc.", inputSchema: z.object({ id: z.string() }), execute: () => Promise.resolve({ ok: true }) });
const hiddenTool = createTool({ id: "admin", description: "Not allowed by the policy.", inputSchema: z.object({}), execute: () => Promise.resolve({}) });
const mcpServer = new MCPServer({ id: "docs", name: "docs", version: "1.0.0", tools: { search: searchTool, deleteDoc: deleteTool, admin: hiddenTool } });

let http: Server;
let origin = "";
const seen: string[] = [];

beforeAll(async () => {
  http = createServer((req, res) => {
    void mcpServer.startHTTP({ url: new URL(req.url ?? "/", "http://127.0.0.1"), httpPath: "/mcp", req, res });
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await mcpServer.close();
  await new Promise<void>((resolve) => http.close(() => resolve()));
});

const localFetch: typeof fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  seen.push(url.hostname);
  // A fresh Response has no `url`, like the public host would answer (no redirect seen).
  return fetch(`${origin}${url.pathname}${url.search}`, init).then((response) => new Response(response.body, response));
};

const connectorOf = (): Connector =>
  ConnectorSchema.parse({
    id: "Cn4sK2lPq0WnR5tYu3bV",
    tenantId: "Jd8sK2lPq0WnR5tYu3bV",
    name: "docs-mcp",
    type: "mcp",
    status: "active",
    secretRef: null,
    toolPolicy: { allow: ["search", "deleteDoc"], readOnly: ["search"] },
    config: { url: "https://mcp.example.com/mcp", allowedHosts: ["mcp.example.com"], auth: "none" },
    createdBy: "uA1b2C3d4E5f6G7h8I9j",
    createdAt: "2026-09-30T12:00:00.000Z",
    updatedAt: "2026-09-30T12:00:00.000Z",
  });

const publicDns = () => Promise.resolve(["93.184.216.34"]);

// Mastra marks every MCP tool `requireApproval` and decides per call with `needsApprovalFn`.
const asksApproval = async (tool: unknown, args: Record<string, unknown> = {}): Promise<unknown> => {
  const { requireApproval, needsApprovalFn } = tool as { requireApproval?: boolean; needsApprovalFn?: (input: Record<string, unknown>) => unknown };
  return requireApproval === true && (needsApprovalFn === undefined || (await needsApprovalFn(args)) === true);
};

describe("mcp client connector", () => {
  it("lists only the allowed tools and asks approval for every tool outside readOnly", async () => {
    const toolset = await loadMcpConnectorToolset({ connector: connectorOf(), secret: null, appEnv: "prod", fetch: localFetch, resolve: publicDns });
    try {
      expect(Object.keys(toolset.tools).sort()).toEqual(["mcp_docs-mcp_deleteDoc", "mcp_docs-mcp_search"]);
      expect(await asksApproval(toolset.tools["mcp_docs-mcp_search"], { q: "x" })).toBe(false);
      expect(await asksApproval(toolset.tools["mcp_docs-mcp_deleteDoc"], { id: "1" })).toBe(true);
      expect(seen.every((host) => host === "mcp.example.com")).toBe(true);
    } finally {
      await toolset.disconnect();
    }
  });

  it("asks approval for every browser tool", async () => {
    const browser = ConnectorSchema.parse({ ...connectorOf(), type: "browser", toolPolicy: { allow: ["search"], readOnly: ["search"] }, config: { url: "https://mcp.example.com/mcp", allowedHosts: ["mcp.example.com"] } });
    const toolset = await loadMcpConnectorToolset({ connector: browser, secret: null, appEnv: "prod", fetch: localFetch, resolve: publicDns });
    try {
      expect(await asksApproval(toolset.tools["mcp_docs-mcp_search"], { q: "x" })).toBe(true);
    } finally {
      await toolset.disconnect();
    }
  });

  it("refuses a server whose host resolves to a private address, or outside allowedHosts", async () => {
    await expect(loadMcpConnectorToolset({ connector: connectorOf(), secret: null, appEnv: "prod", fetch: localFetch, resolve: () => Promise.resolve(["10.0.0.7"]) })).rejects.toThrow(McpConnectorError);
    const outside = ConnectorSchema.parse({ ...connectorOf(), config: { url: "https://mcp.example.com/mcp", allowedHosts: ["other.example.com"], auth: "none" } });
    await expect(loadMcpConnectorToolset({ connector: outside, secret: null, appEnv: "prod", fetch: localFetch, resolve: publicDns })).rejects.toThrow(McpConnectorError);
  });

  it("allows a stdio server only in local", () => {
    expect(() => createMcpConnectorClient({ connector: connectorOf(), secret: null, appEnv: "staging", stdio: { command: "npx", args: ["@playwright/mcp"] } })).toThrow(McpConnectorError);
    expect(() => createMcpConnectorClient({ connector: connectorOf(), secret: null, appEnv: "local", stdio: { command: "npx", args: ["@playwright/mcp"] } })).not.toThrow();
  });
});
