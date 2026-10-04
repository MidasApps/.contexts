import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { RequestContext } from "@mastra/core/request-context";
import { MCPClient } from "@mastra/mcp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSupervisorHarness, MEMBER_PERMISSIONS } from "../agents/supervisor.fixture.ts";
import { buildAgentContextEntries } from "../testing/agent-context-fixture.ts";
import { CORE_MCP_SERVER_ID } from "./core-mcp-server.ts";
import { setMcpRequestAuth } from "./mcp-request-context.ts";

// The core MCP server of the composed runtime, served over Streamable HTTP on 127.0.0.1 the way
// Mastra serves it: the context middleware's snapshot (here: permissions chosen per bearer) is
// bridged into `req.auth` by `setMcpRequestAuth`, then `startHTTP` answers the request.
const MCP_PERMISSIONS = [...MEMBER_PERMISSIONS, "core.mcp.use"];
const CONTEXTS: Record<string, readonly string[]> = {
  "member-token": MCP_PERMISSIONS,
  "no-catalog-token": ["core.mcp.use", "core.chat.use"],
};

const harness = buildSupervisorHarness();
const server = harness.runtime.mcpServers[CORE_MCP_SERVER_ID];
let http: Server;
let origin = "";

beforeAll(async () => {
  http = createServer((req, res) => {
    const token = /^Bearer (\S+)$/.exec(req.headers.authorization ?? "")?.[1] ?? "";
    const permissions = CONTEXTS[token];
    if (permissions !== undefined)
      setMcpRequestAuth(
        req,
        new RequestContext<unknown>(
          buildAgentContextEntries({ permissions: [...permissions], conversationId: "McpConv0000000000001" }),
        ),
      );
    void server?.startHTTP({ url: new URL(req.url ?? "/", "http://127.0.0.1"), httpPath: "/mcp", req, res });
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await server?.close();
  await new Promise<void>((resolve) => http.close(() => resolve()));
});

const clientAs = (token: string | null) =>
  new MCPClient({
    id: `core-test-${token ?? "anonymous"}-${Math.random()}`,
    servers: {
      core: {
        url: new URL(`${origin}/mcp`),
        requestInit: { headers: token === null ? {} : { authorization: `Bearer ${token}` } },
        timeout: 20_000,
      },
    },
  });

const withClient = async <T>(token: string | null, run: (client: MCPClient) => Promise<T>): Promise<T> => {
  const client = clientAs(token);
  try {
    return await run(client);
  } finally {
    await client.disconnect();
  }
};

type ExecutableTool = { execute: (input: unknown, context?: unknown) => Promise<unknown> };

describe("core MCP server", () => {
  it("lists the read tools and ask_assistant, and no mutation tool", async () => {
    const names = await withClient("member-token", async (client) => Object.keys(await client.listTools()).sort());
    expect(names).toEqual([
      "core_ask_assistant",
      "core_describeEntity",
      "core_listEntities",
      "core_querySemanticSql",
      "core_searchKnowledge",
    ]);
  }, 30_000);

  it("runs listEntities with the caller's tenant and permissions", async () => {
    const output = await withClient("member-token", async (client) => {
      const tools = (await client.listTools()) as Record<string, ExecutableTool>;
      return tools.core_listEntities?.execute({ limit: 5 });
    });
    expect(JSON.stringify(output)).toContain("entities");
    expect(JSON.stringify(output)).not.toContain("FORBIDDEN");
  }, 30_000);

  it("refuses a tool call without the caller's context (CONTEXT_MISSING), never with a default tenant", async () => {
    const output = await withClient(null, async (client) => {
      const tools = (await client.listTools()) as Record<string, ExecutableTool>;
      return tools.core_listEntities?.execute({ limit: 5 }).catch((error: unknown) => String(error));
    });
    expect(JSON.stringify(output)).toMatch(/incomplete|CONTEXT_MISSING/);
  }, 30_000);

  it("lists only the catalog resources the caller may read", async () => {
    const member = await withClient("member-token", async (client) => (await client.resources.list()).core ?? []);
    const restricted = await withClient(
      "no-catalog-token",
      async (client) => (await client.resources.list()).core ?? [],
    );
    expect(member.length).toBeGreaterThan(0);
    expect(member.every((resource) => resource.uri.startsWith("catalog://"))).toBe(true);
    expect(restricted.length).toBeLessThan(member.length);
  }, 30_000);

  it("answers ask_assistant through the supervisor in fake mode", async () => {
    const output = await withClient("member-token", async (client) => {
      const tools = (await client.listTools()) as Record<string, ExecutableTool>;
      return tools.core_ask_assistant?.execute({ message: "Hello there" });
    });
    expect(JSON.stringify(output)).toContain("text");
  }, 60_000);
});
