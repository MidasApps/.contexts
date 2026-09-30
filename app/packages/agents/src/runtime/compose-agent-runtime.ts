import type { Agent } from "@mastra/core/agent";
import type { ObservabilityExporter } from "@mastra/core/observability";
import type { ApiRoute } from "@mastra/core/server";
import type { MastraCompositeStore } from "@mastra/core/storage";
import type { Observability } from "@mastra/observability";
import type { AnyWorkflow } from "@mastra/core/workflows";
import { PING_AGENT } from "../agents/ping-agent.ts";
import type { AgentMiddleware } from "../auth/agent-middleware.ts";
import { createContextMiddleware } from "../auth/context-middleware.ts";
import { FirebaseMastraAuth } from "../auth/firebase-mastra-auth.ts";
import { createRouteAllowlistMiddleware } from "../auth/route-allowlist-middleware.ts";
import { createCatalogReindexWorkflow } from "../knowledge/workflows/catalog-reindex.workflow.ts";
import { createKnowledgeIngestWorkflow } from "../knowledge/workflows/knowledge-ingest.workflow.ts";
import { type AgentModels, createModelProvider, embeddingModelIdOf, type ModelFactoryEnv } from "../models/model-factory.ts";
import { createObservability } from "../observability/create-observability.ts";
import { createAiCatalogReader } from "../tools/catalog/ai-catalog-reader.ts";
import { loadBundledAiCatalog } from "../tools/catalog/ai-catalog-source.ts";
import { createDescribeEntityTool } from "../tools/catalog/describe-entity.tool.ts";
import { createListEntitiesTool } from "../tools/catalog/list-entities.tool.ts";
import type { CoreToolDefinition } from "../tools/define-core-tool.ts";
import { createQuerySemanticSqlTool } from "../tools/sql/query-semantic-sql.tool.ts";
import { createToolRegistry, type ToolRegistry } from "../tools/tool-registry.ts";
import { type AgentDefinition, type AgentModule, AgentModuleError } from "./agent-module.ts";
import type { AgentRuntimePorts } from "./runtime-ports.ts";

export type ComposeAgentRuntimeArgs = {
  readonly env: ModelFactoryEnv;
  readonly ports: AgentRuntimePorts;
  /** `APP_MODULES` of `apps/mastra`, built with `defineAgentModule`. */
  readonly modules: readonly AgentModule[];
  /** Mastra storage (PostgresStore in the app; in-memory in tests). */
  readonly storage: MastraCompositeStore;
  /** `service` of logs and traces. */
  readonly serviceName: string;
  /** Mastra `server.apiPrefix` (default `/api`). */
  readonly apiPrefix?: string;
  /** Test seams. */
  readonly models?: AgentModels;
  readonly exporters?: ObservabilityExporter[];
  readonly aiCatalog?: unknown;
};

/** What `new Mastra({...})` receives from the runtime (spec §3.3); `pubsub` arrives with Task 25. */
export type RuntimeParts = {
  readonly agents: Record<string, Agent>;
  readonly workflows: Record<string, AnyWorkflow>;
  readonly scorers: Record<string, never>;
  readonly mcpServers: Record<string, never>;
  readonly storage: MastraCompositeStore;
  readonly vectors: Record<string, never>;
  readonly observability: Observability;
  readonly auth: FirebaseMastraAuth;
  /** Route allowlist first, then the context middleware. */
  readonly middleware: AgentMiddleware[];
  readonly apiRoutes: ApiRoute[];
  readonly tools: ToolRegistry;
};

const CORE_AGENTS: readonly AgentDefinition[] = [PING_AGENT];

const coreTools = (args: ComposeAgentRuntimeArgs): CoreToolDefinition[] => {
  const catalog = createAiCatalogReader(args.aiCatalog ?? loadBundledAiCatalog());
  return [createListEntitiesTool({ catalog }), createDescribeEntityTool({ catalog }), createQuerySemanticSqlTool({ catalog: args.ports.catalog })];
};

const collectAgents = (modules: readonly AgentModule[]): AgentDefinition[] => {
  const all = [...CORE_AGENTS, ...modules.flatMap((module) => module.agents ?? [])];
  const seen = new Set<string>();
  for (const agent of all) {
    if (seen.has(agent.id)) throw new AgentModuleError({ code: "DUPLICATE_CAPABILITY", moduleId: "runtime", capabilityId: agent.id });
    seen.add(agent.id);
  }
  return all;
};

/** Core workflows (spec §11): knowledge ingestion and the platform catalog reindex. */
const coreWorkflows = (args: ComposeAgentRuntimeArgs, models: AgentModels): Record<string, AnyWorkflow> => {
  const indexing = { knowledge: args.ports.knowledge, embedding: models.embedding, embeddingModelId: embeddingModelIdOf(args.env) };
  const ingest = createKnowledgeIngestWorkflow({
    ...indexing,
    access: args.ports.access,
    files: args.ports.files,
    webContent: args.ports.webContent,
    events: args.ports.knowledgeEvents,
  });
  const reindex = createCatalogReindexWorkflow({ ...indexing, ...(args.aiCatalog === undefined ? {} : { aiCatalog: args.aiCatalog }) });
  return { [ingest.id]: ingest, [reindex.id]: reindex };
};

const buildToolRegistry = (args: ComposeAgentRuntimeArgs, agents: readonly AgentDefinition[]): ToolRegistry => {
  // Ceilings are data, known before any tool is bound: every call is capped by its agent's.
  const agentCeilings = Object.fromEntries(agents.map((agent) => [agent.id, new Set(agent.ceiling)]));
  const registry = createToolRegistry({ access: args.ports.access, audit: args.ports.audit, approvals: args.ports.approvals, agentCeilings });
  for (const tool of [...coreTools(args), ...args.modules.flatMap((module) => module.tools ?? [])]) registry.register(tool);
  return registry;
};

/**
 * Builds every runtime part Mastra serves (spec §3.3, decision 0019): agents,
 * tools bound to the SP1/SP3 ports, the auth provider, the route allowlist and
 * the context middleware, and tracing with tenant metadata.
 * @throws {AgentModuleError} for duplicated agents; {DuplicateToolError} for duplicated tools (boot errors).
 */
export const composeAgentRuntime = (args: ComposeAgentRuntimeArgs): RuntimeParts => {
  const definitions = collectAgents(args.modules);
  const tools = buildToolRegistry(args, definitions);
  const models = args.models ?? createModelProvider(args.env);
  const deps = { models, tools, ports: args.ports };
  const agents = Object.fromEntries(definitions.map((definition) => [definition.id, definition.create(deps)]));
  const apiPrefix = args.apiPrefix;
  const auth = new FirebaseMastraAuth({ access: args.ports.access, ...(apiPrefix === undefined ? {} : { apiPrefix }) });
  const prefix = apiPrefix === undefined ? {} : { apiPrefix };
  return {
    agents,
    workflows: coreWorkflows(args, models),
    scorers: {},
    mcpServers: {},
    storage: args.storage,
    vectors: {},
    observability: createObservability({ serviceName: args.serviceName, ...(args.exporters === undefined ? {} : { exporters: args.exporters }) }),
    auth,
    middleware: [createRouteAllowlistMiddleware(prefix), createContextMiddleware({ auth, aiMode: args.env.AI_MODE, ...prefix })],
    apiRoutes: [],
    tools,
  };
};
