import type { Connector } from "@core/contracts";
import { type RequestContextReader, readAgentContext } from "../context/agent-request-context.ts";
import type { ConnectorsPort, SecretStore } from "../runtime/runtime-ports.ts";
import type { CoreToolDefinition, CoreToolDeps } from "../tools/define-core-tool.ts";
import type { BoundCoreTool } from "../tools/tool-registry.ts";
import { bindCoreTool } from "../tools/tool-registry.ts";
import { type ConnectorLoadOutcome, recordConnectorLoads } from "./connector-load-errors.ts";
import { postgresConnectorTools } from "./db/postgres-readonly-connector.ts";
import { loadMcpConnectorToolset, type McpConnectorToolset, type McpTool } from "./mcp/mcp-connector.ts";
import { loadOpenApiDocument } from "./openapi/openapi-document.ts";
import { openApiToTools } from "./openapi/openapi-to-tools.ts";

/**
 * Per-tenant connector tools (spec §9, decision 0027): the active connectors of the run's
 * tenant (from the server-side context, never the model), loaded once per tenant and kept
 * 5 minutes; MCP clients are disconnected when their entry is evicted. A connector that
 * fails to load is left out of the run (fail-closed) and retried after the TTL; why it failed
 * (a code) is recorded on the connector for the settings page.
 */

export const CONNECTOR_CACHE_TTL_MS = 5 * 60_000;

/** Which agent asks: each gets a different slice of the tenant's connector tools. */
export type ConnectorAgentKind = "supervisor" | "data" | "action" | "web";

type LoadedConnector = {
  readonly connector: Connector;
  /** OpenAPI and Postgres tools (run through the `defineCoreTool` pipeline). */
  readonly coreTools: readonly CoreToolDefinition[];
  /** MCP tools as Mastra builds them (approval per call from the tool policy). */
  readonly mcp: McpConnectorToolset | null;
};

export type ConnectorLoaders = {
  readonly openApiTools: (connector: Connector, secret: string | null) => Promise<CoreToolDefinition[]>;
  readonly mcpToolset: (connector: Connector, secret: string | null) => Promise<McpConnectorToolset>;
  readonly postgresTools: (connector: Connector, secret: string | null) => CoreToolDefinition[];
};

export const defaultConnectorLoaders = (appEnv: string): ConnectorLoaders => ({
  openApiTools: async (connector, secret) => {
    if (connector.type !== "openapi") return [];
    const document = await loadOpenApiDocument({
      specUrl: connector.config.specUrl,
      allowedHosts: connector.config.allowedHosts,
    });
    return openApiToTools({ connector, document, secret });
  },
  mcpToolset: (connector, secret) => loadMcpConnectorToolset({ connector, secret, appEnv }),
  postgresTools: (connector, secret) => postgresConnectorTools({ connector, dsn: secret }),
});

/** Bound core tools (OpenAPI, Postgres) and MCP tools, keyed by the name the model sees. */
export type ConnectorTool = BoundCoreTool | McpTool;

export type ConnectorToolsResolver = ((
  requestContext: RequestContextReader | undefined,
  kind: ConnectorAgentKind,
) => Promise<Record<string, ConnectorTool>>) & {
  /** Disconnects every cached MCP client (shutdown, tests). */
  readonly close: () => Promise<void>;
};

const loadOne = async (
  connector: Connector,
  secret: string | null,
  loaders: ConnectorLoaders,
): Promise<LoadedConnector> => {
  if (connector.type === "mcp" || connector.type === "browser")
    return { connector, coreTools: [], mcp: await loaders.mcpToolset(connector, secret) };
  if (connector.type === "openapi")
    return { connector, coreTools: await loaders.openApiTools(connector, secret), mcp: null };
  return { connector, coreTools: loaders.postgresTools(connector, secret), mcp: null };
};

const mcpToolsFor = (loaded: LoadedConnector, kind: ConnectorAgentKind): Record<string, McpTool> => {
  if (loaded.mcp === null) return {};
  const isBrowser = loaded.connector.type === "browser";
  if (kind === "web") return isBrowser ? loaded.mcp.tools : {};
  if (isBrowser || kind === "data") return {};
  if (kind === "action") return loaded.mcp.tools;
  // The supervisor answers questions: only the tools the policy marks read-only.
  const readOnly = new Set(loaded.connector.toolPolicy.readOnly.map((name) => name.replace(/[^A-Za-z0-9_-]/g, "_")));
  return Object.fromEntries(
    Object.entries(loaded.mcp.tools).filter(([key]) => [...readOnly].some((name) => key.endsWith(`_${name}`))),
  );
};

const coreToolsFor = (loaded: LoadedConnector, kind: ConnectorAgentKind): readonly CoreToolDefinition[] => {
  if (loaded.connector.type === "postgres") return kind === "data" ? loaded.coreTools : [];
  if (kind === "action") return loaded.coreTools;
  if (kind === "supervisor") return loaded.coreTools.filter((tool) => tool.kind === "read");
  return [];
};

/** Builds the resolver the agents' dynamic `tools` call on every run. */
export const createConnectorToolResolver = (args: {
  readonly connectors: ConnectorsPort;
  readonly secrets: SecretStore;
  readonly toolDeps: CoreToolDeps;
  readonly loaders: ConnectorLoaders;
  readonly ttlMs?: number;
  readonly now?: () => number;
}): ConnectorToolsResolver => {
  const ttl = args.ttlMs ?? CONNECTOR_CACHE_TTL_MS;
  const now = args.now ?? Date.now;
  const cache = new Map<string, { expiresAt: number; loaded: Promise<LoadedConnector[]> }>();
  const evict = async (tenantId: string): Promise<void> => {
    const entry = cache.get(tenantId);
    cache.delete(tenantId);
    const loaded = await entry?.loaded.catch(() => []);
    await Promise.all(
      (loaded ?? []).map((item) =>
        item.mcp === null ? Promise.resolve() : item.mcp.disconnect().catch(() => undefined),
      ),
    );
  };
  const loadTenant = async (tenantId: string): Promise<LoadedConnector[]> => {
    const active = await args.connectors.listActive({ tenantId });
    const settled = await Promise.all(
      active.map(async (connector): Promise<ConnectorLoadOutcome & { loaded: LoadedConnector | null }> => {
        let secret: string | null = null;
        try {
          secret = connector.secretRef === null ? null : await args.secrets.get(connector.secretRef);
          return {
            connector,
            secret,
            error: null,
            failed: false,
            loaded: await loadOne(connector, secret, args.loaders),
          };
        } catch (error: unknown) {
          return { connector, secret, error, failed: true, loaded: null };
        }
      }),
    );
    recordConnectorLoads({
      connectors: args.connectors,
      tenantId,
      outcomes: settled,
      at: new Date(now()).toISOString(),
    });
    return settled.flatMap((outcome) => (outcome.loaded === null ? [] : [outcome.loaded]));
  };
  const tenantConnectors = async (tenantId: string): Promise<LoadedConnector[]> => {
    const entry = cache.get(tenantId);
    if (entry !== undefined && entry.expiresAt > now()) return entry.loaded;
    if (entry !== undefined) await evict(tenantId);
    const loaded = loadTenant(tenantId);
    cache.set(tenantId, { expiresAt: now() + ttl, loaded });
    return loaded;
  };
  const resolve = async (
    requestContext: RequestContextReader | undefined,
    kind: ConnectorAgentKind,
  ): Promise<Record<string, ConnectorTool>> => {
    const read = readAgentContext(requestContext);
    if (!read.ok) return {};
    const loaded = await tenantConnectors(read.data.context.tenantId).catch(() => []);
    const core = loaded.flatMap((item) =>
      coreToolsFor(item, kind).map((tool) => [tool.id, bindCoreTool(tool, args.toolDeps)] as const),
    );
    const mcp = loaded.flatMap((item) => Object.entries(mcpToolsFor(item, kind)));
    return Object.fromEntries<ConnectorTool>([...core, ...mcp]);
  };
  const close = async (): Promise<void> => {
    await Promise.all([...cache.keys()].map((tenantId) => evict(tenantId)));
  };
  return Object.assign(resolve, { close });
};
