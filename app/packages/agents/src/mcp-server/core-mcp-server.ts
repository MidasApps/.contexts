import type { Agent } from "@mastra/core/agent";
import type { MCPServerBase } from "@mastra/core/mcp";
import { MCPServer } from "@mastra/mcp";
import { type RequestContextReader, readAgentContext } from "../context/agent-request-context.ts";
import type { AiCatalogReader } from "../tools/catalog/ai-catalog-reader.ts";
import type { CoreToolDeps } from "../tools/define-core-tool.ts";
import { bindCoreTool, type ToolRegistry } from "../tools/tool-registry.ts";
import { hydrateMcpRequestContext } from "./mcp-request-context.ts";

/** Mastra MCP server id: `/api/mcp/core/mcp`, reached from `/v1/mcp` through the gateway. */
export const CORE_MCP_SERVER_ID = "core";
/** Ceiling key of the MCP caller: tools run with context permissions ∩ this ceiling. */
export const MCP_CALLER_ID = "mcp";
/** Read-only in v1 (decision 0027): no mutation tool is exposed over MCP. */
export const MCP_CEILING = [
  "core.mcp.use",
  "core.chat.use",
  "core.catalog.read",
  "core.catalog.query",
  "core.knowledge.read",
];

/** MCP tool name → core tool id (spec §9). */
export const CORE_MCP_TOOLS = {
  listEntities: "catalog.listEntities",
  describeEntity: "catalog.describeEntity",
  searchKnowledge: "knowledge.searchKnowledge",
  querySemanticSql: "sql.querySemanticSql",
} as const;

const CATALOG_URI = "catalog://";
const MAX_RESOURCES = 200;

export class CoreMcpServerError extends Error {
  readonly code = "MCP_TOOL_MISSING";
  readonly toolId: string;

  constructor(toolId: string) {
    super(`MCP_TOOL_MISSING: ${toolId} is not registered`);
    this.name = "CoreMcpServerError";
    this.toolId = toolId;
  }
}

const permissionsOf = (requestContext: RequestContextReader): ReadonlySet<string> => {
  const read = readAgentContext(requestContext);
  return new Set(read.ok ? read.data.context.permissions : []);
};

// Catalog entries the caller may read; hidden and unknown contracts look the same (not found).
const catalogResources = (catalog: AiCatalogReader) => ({
  listResources: ({ requestContext }: { requestContext: RequestContextReader }) =>
    Promise.resolve(
      catalog.list({ permissions: permissionsOf(requestContext), limit: MAX_RESOURCES }).entities.map((entity) => ({
        uri: `${CATALOG_URI}${entity.id}`,
        name: entity.id,
        title: entity.name,
        description: entity.description,
        mimeType: "application/json",
      })),
    ),
  getResourceContent: ({ uri, requestContext }: { uri: string; requestContext: RequestContextReader }) => {
    const id = uri.startsWith(CATALOG_URI) ? uri.slice(CATALOG_URI.length) : "";
    const entity = catalog.describe({ id, permissions: permissionsOf(requestContext) });
    if (entity === undefined) return Promise.reject(new Error(`Resource ${uri} not found`));
    return Promise.resolve({ text: JSON.stringify(entity) });
  },
});

/**
 * The core MCP server (SP3 spec §9, decision 0027 D3-15): the read tools `listEntities`,
 * `describeEntity`, `searchKnowledge` and `querySemanticSql` through the core tool pipeline
 * (SP1 authorize with the MCP ceiling, audit where the tool audits), the `assistant` as
 * `ask_assistant`, and the AI catalog entries the caller may read as resources. Requests are
 * stateless (MCP 2026-07-28); `requestState.key` signs input-required continuations and must be
 * shared by every instance.
 * @throws {CoreMcpServerError} at boot when a core tool is missing from the registry.
 */
export const createCoreMcpServer = (deps: {
  readonly registry: ToolRegistry;
  readonly toolDeps: CoreToolDeps;
  readonly assistant: Agent;
  readonly catalog: AiCatalogReader;
  readonly requestStateKey: string;
}): MCPServerBase => {
  const tools = Object.fromEntries(
    Object.entries(CORE_MCP_TOOLS).map(([name, id]) => {
      const definition = deps.registry.get(id);
      if (definition === undefined) throw new CoreMcpServerError(id);
      return [name, bindCoreTool(definition, deps.toolDeps, { agentId: MCP_CALLER_ID })];
    }),
  );
  const server = new MCPServer({
    id: CORE_MCP_SERVER_ID,
    name: "Core",
    version: "1.0.0",
    description: "Read-only access to the organization's data catalog, knowledge base, semantic SQL and assistant.",
    instructions:
      "Start with listEntities or the catalog resources; answers are scoped to the caller's organization and permissions.",
    tools,
    agents: { assistant: deps.assistant },
    resources: catalogResources(deps.catalog),
    requestState: { key: deps.requestStateKey },
    mapAuthInfoToUser: ({ authInfo, requestContext }) => hydrateMcpRequestContext({ authInfo, requestContext }),
  });
  // @mastra/mcp 2.1.1 types its resources without `| undefined` on optional fields, which
  // `exactOptionalPropertyTypes` rejects against @mastra/core's base class; the object is one.
  return server as unknown as MCPServerBase;
};
