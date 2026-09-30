import type { Agent } from "@mastra/core/agent";
import type { ObservabilityExporter } from "@mastra/core/observability";
import type { ApiRoute } from "@mastra/core/server";
import type { MastraCompositeStore } from "@mastra/core/storage";
import type { MastraVector } from "@mastra/core/vector";
import type { Memory } from "@mastra/memory";
import type { Observability } from "@mastra/observability";
import type { AnyWorkflow } from "@mastra/core/workflows";
import { createActionAgentDefinition } from "../agents/action-agent.ts";
import { createDataAgentDefinition } from "../agents/data-agent.ts";
import { createKnowledgeAgentDefinition } from "../agents/knowledge-agent.ts";
import { PING_AGENT } from "../agents/ping-agent.ts";
import { createSupervisorAgent, SUPERVISOR_AGENT_ID } from "../agents/supervisor-agent.ts";
import { createTenantAgentSettingsReader } from "../agents/tenant-agent-settings.ts";
import { createWebAgentDefinition } from "../agents/web-agent.ts";
import { type ConnectorLoaders, createConnectorToolResolver, defaultConnectorLoaders } from "../connectors/connector-registry.ts";
import type { AgentMiddleware } from "../auth/agent-middleware.ts";
import { createContextMiddleware } from "../auth/context-middleware.ts";
import { FirebaseMastraAuth } from "../auth/firebase-mastra-auth.ts";
import { createRouteAllowlistMiddleware } from "../auth/route-allowlist-middleware.ts";
import { threadOwnerFromStorage } from "../auth/thread-ownership.ts";
import { createCatalogReindexWorkflow } from "../knowledge/workflows/catalog-reindex.workflow.ts";
import { createKnowledgeIngestWorkflow } from "../knowledge/workflows/knowledge-ingest.workflow.ts";
import { coreFakeRules } from "../models/fake/fake-scenarios.ts";
import { type AgentModels, createModelProvider, embeddingModelIdOf, type ModelFactoryEnv } from "../models/model-factory.ts";
import { createObservability, type ObservabilityEnv } from "../observability/create-observability.ts";
import { createGuardrailProfile } from "../processors/guardrail-profile.ts";
import { createAiCatalogReader } from "../tools/catalog/ai-catalog-reader.ts";
import { loadBundledAiCatalog } from "../tools/catalog/ai-catalog-source.ts";
import { createDescribeEntityTool } from "../tools/catalog/describe-entity.tool.ts";
import { createListEntitiesTool } from "../tools/catalog/list-entities.tool.ts";
import { createRenderFormTool } from "../tools/catalog/render-form.tool.ts";
import { type AgentCommand, commandIdOf, formCommandsOf } from "../tools/commands/agent-command.ts";
import { createCreateProjectCommand } from "../tools/commands/create-project-command.tool.ts";
import { CORE_SKILL_DIRS, createSkillsResolver, loadSkill } from "../skills/resolve-skills.ts";
import { createMemory } from "../memory/create-memory.ts";
import { createSearchKnowledgeTool } from "../tools/knowledge/search-knowledge.tool.ts";
import type { CoreToolDefinition, CoreToolDeps } from "../tools/define-core-tool.ts";
import { createQuerySemanticSqlTool } from "../tools/sql/query-semantic-sql.tool.ts";
import { createToolRegistry, type ToolRegistry } from "../tools/tool-registry.ts";
import { type AgentDefinition, type AgentFactoryDeps, type AgentModule, AgentModuleError } from "./agent-module.ts";
import type { AgentRuntimePorts } from "./runtime-ports.ts";

/** Key of the memory vector store in `new Mastra({ vectors })`. */
export const MEMORY_VECTOR_KEY = "memory";

export type ComposeAgentRuntimeArgs = {
  readonly env: ModelFactoryEnv & Pick<ObservabilityEnv, "OTEL_EXPORTER_OTLP_ENDPOINT"> & { readonly AI_MEMORY_OBSERVATIONAL?: boolean };
  readonly ports: AgentRuntimePorts;
  /** `APP_MODULES` of `apps/mastra`, built with `defineAgentModule`. */
  readonly modules: readonly AgentModule[];
  /** Mastra storage (PostgresStore in the app; in-memory in tests). */
  readonly storage: MastraCompositeStore;
  /** Memory vectors (`PgVector` on schema `mastra` in the app); without it no memory is built. */
  readonly vector?: MastraVector;
  /** `service` of logs and traces. */
  readonly serviceName: string;
  /** Mastra `server.apiPrefix` (default `/api`). */
  readonly apiPrefix?: string;
  /** Test seams. */
  readonly models?: AgentModels;
  readonly exporters?: ObservabilityExporter[];
  readonly aiCatalog?: unknown;
  /** Directories tried first for agent instructions (the bundled copy in `apps/mastra`). */
  readonly instructionsDirs?: readonly string[];
  /** Directories tried first for core skills (`<dir>/<name>/SKILL.md`, the bundled copy). */
  readonly skillsDirs?: readonly string[];
  /** Test seam: how connectors become tools (defaults fetch specs and connect MCP servers). */
  readonly connectorLoaders?: ConnectorLoaders;
};

/** What `new Mastra({...})` receives from the runtime (spec §3.3); `pubsub` arrives with Task 25. */
export type RuntimeParts = {
  /** Entry agents Mastra serves: `assistant` (supervisor), `ping` and module entry agents. */
  readonly agents: Record<string, Agent>;
  /** Subagents reachable only through the supervisor (knowledge, data, action, web, module agents). */
  readonly subagents: Record<string, Agent>;
  readonly workflows: Record<string, AnyWorkflow>;
  readonly scorers: Record<string, never>;
  readonly mcpServers: Record<string, never>;
  readonly storage: MastraCompositeStore;
  readonly vectors: Record<string, MastraVector>;
  /** Tenant-scoped memory for the chat agents (Task 20 attaches it to the supervisor). */
  readonly memory: Memory | undefined;
  readonly observability: Observability;
  readonly auth: FirebaseMastraAuth;
  /** Route allowlist first, then the context middleware. */
  readonly middleware: AgentMiddleware[];
  readonly apiRoutes: ApiRoute[];
  readonly tools: ToolRegistry;
};

const dirsOption = (dirs: readonly string[] | undefined) => (dirs === undefined ? {} : { instructionsDirs: dirs });

const coreAgents = (args: ComposeAgentRuntimeArgs, commands: readonly AgentCommand[]): AgentDefinition[] => [
  PING_AGENT,
  createKnowledgeAgentDefinition(dirsOption(args.instructionsDirs)),
  createDataAgentDefinition(dirsOption(args.instructionsDirs)),
  createActionAgentDefinition({ commands, ...dirsOption(args.instructionsDirs) }),
  createWebAgentDefinition(dirsOption(args.instructionsDirs)),
];

/** Core commands (SP1 tenancy) plus the modules' commands: the action agent's tools. */
const collectCommands = (args: ComposeAgentRuntimeArgs): AgentCommand[] => [
  createCreateProjectCommand({ projects: args.ports.projects }),
  ...args.modules.flatMap((module) => module.commands ?? []),
];

const coreTools = (args: ComposeAgentRuntimeArgs, models: AgentModels, commands: readonly AgentCommand[]): CoreToolDefinition[] => {
  const catalog = createAiCatalogReader(args.aiCatalog ?? loadBundledAiCatalog());
  const formCommands = formCommandsOf(commands);
  return [
    createListEntitiesTool({ catalog }),
    createDescribeEntityTool({ catalog }),
    createRenderFormTool({ catalog, commands: { get: (id) => formCommands.get(id) }, access: args.ports.access }),
    createQuerySemanticSqlTool({ catalog: args.ports.catalog }),
    createSearchKnowledgeTool({ knowledge: args.ports.knowledge, embedding: models.embedding, catalog }),
    ...commands.map(({ tool }) => tool),
  ];
};

const collectAgents = (args: ComposeAgentRuntimeArgs, commands: readonly AgentCommand[]): AgentDefinition[] => {
  const all = [...coreAgents(args, commands), ...args.modules.flatMap((module) => module.agents ?? [])];
  const seen = new Set<string>([SUPERVISOR_AGENT_ID]);
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

/** The supervisor calls no core tool itself; its subagents' calls are capped by their own ceilings. */
const SUPERVISOR_CEILING = ["core.chat.use"];

// Ceilings are data, known before any tool is bound: every call is capped by its agent's.
const toolDepsOf = (args: ComposeAgentRuntimeArgs, agents: readonly AgentDefinition[]): CoreToolDeps => {
  const ceilings = [...agents.map((agent) => [agent.id, new Set(agent.ceiling)] as const), [SUPERVISOR_AGENT_ID, new Set(SUPERVISOR_CEILING)] as const];
  return {
    access: args.ports.access,
    audit: args.ports.audit,
    approvals: args.ports.approvals,
    commands: args.ports.commands,
    agentCeilings: Object.fromEntries(ceilings),
  };
};

const buildToolRegistry = (args: ComposeAgentRuntimeArgs, toolDeps: CoreToolDeps, models: AgentModels, commands: readonly AgentCommand[]): ToolRegistry => {
  const registry = createToolRegistry(toolDeps);
  for (const tool of [...coreTools(args, models, commands), ...args.modules.flatMap((module) => module.tools ?? [])]) registry.register(tool);
  return registry;
};

const registerFakeRules = (models: AgentModels, commands: readonly AgentCommand[]): void => {
  const refs = commands.map(({ tool, targetContractId }) => ({ toolId: tool.id, commandId: commandIdOf(tool), targetContractId }));
  for (const [agentId, rule] of coreFakeRules(refs)) models.registerFakeScenario(agentId, rule);
};

// Module agents are subagents unless they declare `entry`; `ping` is the core entry smoke agent.
const isEntry = (definition: AgentDefinition): boolean => definition.role === "entry" || (definition.role === undefined && definition.id === PING_AGENT.id);

/** Entry agents (Mastra `agents`), the subagents and the supervisor over them. */
const buildAgents = (definitions: readonly AgentDefinition[], deps: AgentFactoryDeps, instructionsDirs: readonly string[] | undefined) => {
  const build = (list: readonly AgentDefinition[]) => Object.fromEntries(list.map((definition) => [definition.id, definition.create(deps)]));
  const subagents = build(definitions.filter((definition) => !isEntry(definition)));
  const supervisor = createSupervisorAgent({ deps, subagents, ...(instructionsDirs === undefined ? {} : { instructionsDirs }) });
  return { agents: { ...build(definitions.filter(isEntry)), [SUPERVISOR_AGENT_ID]: supervisor }, subagents };
};

/**
 * Builds every runtime part Mastra serves (spec §3.3, decision 0019): agents,
 * tools bound to the SP1/SP3 ports, the auth provider, the route allowlist and
 * the context middleware, and tracing with tenant metadata.
 * @throws {AgentModuleError} for duplicated agents; {DuplicateToolError} for duplicated tools (boot errors).
 */
export const composeAgentRuntime = (args: ComposeAgentRuntimeArgs): RuntimeParts => {
  const commands = collectCommands(args);
  const definitions = collectAgents(args, commands);
  const models = args.models ?? createModelProvider(args.env);
  registerFakeRules(models, commands);
  const toolDeps = toolDepsOf(args, definitions);
  const tools = buildToolRegistry(args, toolDeps, models, commands);
  const connectorTools = createConnectorToolResolver({
    connectors: args.ports.connectors,
    secrets: args.ports.secrets,
    toolDeps,
    loaders: args.connectorLoaders ?? defaultConnectorLoaders(args.env.APP_ENV),
  });
  const guardrails = (kind: Parameters<typeof createGuardrailProfile>[1]) => createGuardrailProfile({ models, ports: args.ports }, kind);
  const memory =
    args.vector === undefined
      ? undefined
      : createMemory({ storage: args.storage, vector: args.vector, models, env: { AI_MEMORY_OBSERVATIONAL: args.env.AI_MEMORY_OBSERVATIONAL ?? false } });
  const tenantSettings = createTenantAgentSettingsReader(args.ports.settings);
  const skillDirs = [...(args.skillsDirs ?? []), ...CORE_SKILL_DIRS];
  const skills = (names: readonly string[]) => createSkillsResolver({ core: names.map((name) => loadSkill(name, skillDirs)), modules: args.modules, settings: tenantSettings });
  const deps: AgentFactoryDeps = { models, tools, ports: args.ports, guardrails, memory, tenantSettings, skills, commands, connectorTools };
  const { agents, subagents } = buildAgents(definitions, deps, args.instructionsDirs);
  const apiPrefix = args.apiPrefix;
  const auth = new FirebaseMastraAuth({ access: args.ports.access, ...(apiPrefix === undefined ? {} : { apiPrefix }) });
  const prefix = apiPrefix === undefined ? {} : { apiPrefix };
  return {
    agents,
    subagents,
    workflows: coreWorkflows(args, models),
    scorers: {},
    mcpServers: {},
    storage: args.storage,
    vectors: args.vector === undefined ? {} : { [MEMORY_VECTOR_KEY]: args.vector },
    memory,
    observability: createObservability({
      serviceName: args.serviceName,
      env: args.env,
      usage: args.ports.usage,
      ...(args.exporters === undefined ? {} : { exporters: args.exporters }),
    }),
    auth,
    middleware: [createRouteAllowlistMiddleware(prefix), createContextMiddleware({ auth, aiMode: args.env.AI_MODE, threadOwnerOf: threadOwnerFromStorage(args.storage), ...prefix })],
    apiRoutes: [],
    tools,
  };
};
