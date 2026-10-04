import type { Connector } from "@core/contracts";
import { MCPClient } from "@mastra/mcp";
import { guardedFetch, type ResolveHost } from "../../tools/web/url-guard.ts";

/**
 * MCP client connectors (spec §9, decision 0027): one `MCPClient` per tenant connector
 * (`mcp` or `browser`, e.g. a Playwright MCP server run with `--headless --isolated`),
 * Streamable HTTP only, `allowedHosts` from the connector, every request through the SSRF
 * guard (DNS to public addresses, redirects checked), headers from the secret store, a
 * 30 s timeout, only the tools of `toolPolicy.allow`, and approval for every tool not in
 * `toolPolicy.readOnly` (browser tools always ask). Output is untrusted data.
 */

export const MCP_TIMEOUT_MS = 30_000;

export class McpConnectorError extends Error {
  readonly code: "STDIO_OUTSIDE_LOCAL" | "NOT_AN_MCP_CONNECTOR" | "CONNECT_FAILED";

  constructor(code: McpConnectorError["code"]) {
    super(`mcp connector refused: ${code}`);
    this.name = "McpConnectorError";
    this.code = code;
  }
}

type McpLikeConnector = Extract<Connector, { type: "mcp" | "browser" }>;

/** A local developer override that runs the server as a child process (`APP_ENV=local` only). */
export type McpStdioOverride = { readonly command: string; readonly args?: readonly string[] };

export type McpConnectorOptions = {
  readonly connector: Connector;
  /** The connector's secret (Bearer token), `null` without one. */
  readonly secret: string | null;
  readonly appEnv: string;
  readonly stdio?: McpStdioOverride;
  /** Seams for tests: the network below the SSRF guard and DNS. */
  readonly fetch?: typeof fetch;
  readonly resolve?: ResolveHost;
};

/** A tool as `MCPClient.listToolsets()` builds it. */
export type McpTool = Awaited<ReturnType<MCPClient["listToolsets"]>>[string][string];

export type McpConnectorToolset = {
  /** Tools keyed `mcp_<connector>_<tool>`, filtered by the tool policy. */
  readonly tools: Record<string, McpTool>;
  readonly disconnect: () => Promise<void>;
};

const keyPart = (value: string): string => value.replace(/[^A-Za-z0-9_-]/g, "_");

const asMcpConnector = (connector: Connector): McpLikeConnector => {
  if (connector.type !== "mcp" && connector.type !== "browser") throw new McpConnectorError("NOT_AN_MCP_CONNECTOR");
  return connector;
};

const needsApproval = (connector: McpLikeConnector, toolName: string): boolean =>
  connector.type === "browser" || !connector.toolPolicy.readOnly.includes(toolName);

const httpServer = (connector: McpLikeConnector, options: McpConnectorOptions) => {
  const { allowedHosts } = connector.config;
  const headers: Record<string, string> = options.secret === null ? {} : { authorization: `Bearer ${options.secret}` };
  const guarded: typeof fetch = (input, init) =>
    guardedFetch(input instanceof Request ? input.url : input, {
      allowedHosts,
      init: { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers).entries()), ...headers } },
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      ...(options.resolve === undefined ? {} : { resolve: options.resolve }),
    });
  return {
    url: new URL(connector.config.url),
    allowedHosts: [...allowedHosts],
    fetch: guarded,
    requireToolApproval: ({ toolName }: { toolName: string }) => needsApproval(connector, toolName),
  };
};

/**
 * Builds the MCP client of a connector.
 * @throws {McpConnectorError} for a stdio override outside local or a non-MCP connector.
 */
export const createMcpConnectorClient = (options: McpConnectorOptions): MCPClient => {
  const connector = asMcpConnector(options.connector);
  if (options.stdio !== undefined && options.appEnv !== "local") throw new McpConnectorError("STDIO_OUTSIDE_LOCAL");
  const server =
    options.stdio === undefined
      ? httpServer(connector, options)
      : {
          command: options.stdio.command,
          args: [...(options.stdio.args ?? [])],
          requireToolApproval: ({ toolName }: { toolName: string }) => needsApproval(connector, toolName),
        };
  return new MCPClient({
    id: `${connector.tenantId}:${connector.id}`,
    servers: { [keyPart(connector.name)]: server },
    timeout: MCP_TIMEOUT_MS,
  });
};

/** Lists the connector's allowed tools; `disconnect()` closes the client (cache eviction). */
export const loadMcpConnectorToolset = async (options: McpConnectorOptions): Promise<McpConnectorToolset> => {
  const connector = asMcpConnector(options.connector);
  const client = createMcpConnectorClient(options);
  try {
    // `listToolsets` logs and skips a server that fails; a connector that fails must be visible.
    const { toolsets, errors } = await client.listToolsetsWithErrors();
    if (Object.keys(errors).length > 0) throw new McpConnectorError("CONNECT_FAILED");
    const allowed = new Set(connector.toolPolicy.allow);
    const tools = Object.fromEntries(
      Object.values(toolsets).flatMap((serverTools) =>
        Object.entries(serverTools)
          .filter(([toolName]) => allowed.has(toolName))
          .map(([toolName, tool]) => [`mcp_${keyPart(connector.name)}_${keyPart(toolName)}`, tool] as const),
      ),
    );
    return { tools, disconnect: () => client.disconnect() };
  } catch (error: unknown) {
    await client.disconnect().catch(() => undefined);
    throw error;
  }
};
