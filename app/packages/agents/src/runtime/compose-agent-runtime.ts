import { createInMemoryModelSettingsRepository, processLogger } from "@core/services";
import type { Agent } from "@mastra/core/agent";
import type { MCPServerBase } from "@mastra/core/mcp";
import type { ApiRoute } from "@mastra/core/server";
import type { MastraCompositeStore } from "@mastra/core/storage";
import type { MastraVector } from "@mastra/core/vector";
import type { AnyWorkflow } from "@mastra/core/workflows";
import type { Memory } from "@mastra/memory";
import type { Observability } from "@mastra/observability";
import { createInstructionsResolver } from "../agents/prompt-instructions.ts";
import { SUPERVISOR_AGENT_ID } from "../agents/supervisor-agent.ts";
import { createTenantAgentSettingsReader } from "../agents/tenant-agent-settings.ts";
import type { AgentMiddleware } from "../auth/agent-middleware.ts";
import { FirebaseMastraAuth } from "../auth/firebase-mastra-auth.ts";
import type { ChatRuntime } from "../chat/chat-http.ts";
import { createConversationSummarizer } from "../chat/conversation-summarizer.ts";
import { createConnectorToolResolver, defaultConnectorLoaders } from "../connectors/connector-registry.ts";
import { composeCustomAgents, createCustomAgentAccess } from "../custom/compose-custom-agents.ts";
import { setMcpRequestAuth } from "../mcp-server/mcp-request-context.ts";
import { createMemory } from "../memory/create-memory.ts";
import { createModelProvider } from "../models/model-factory.ts";
import { priceTableFor } from "../models/model-prices.ts";
import { createModelSettingsService, type ModelSettingsService } from "../models/model-settings.ts";
import { createProviderRegistry } from "../models/provider-registry.ts";
import { createObservability } from "../observability/create-observability.ts";
import { createGuardrailProfile } from "../processors/guardrail-profile.ts";
import { type CoreScorer, createCoreScorers } from "../scorers/core-scorers.ts";
import { CORE_SKILL_DIRS, CORE_SKILLS, createSkillsResolver, loadSkill } from "../skills/resolve-skills.ts";
import type { AgentCommand } from "../tools/commands/agent-command.ts";
import type { ToolRegistry } from "../tools/tool-registry.ts";
import { createWebToolsRuntime } from "../tools/web/web-tools-runtime.ts";
import { composeVoice } from "../voice/compose-voice.ts";
import type { CoreVoice } from "../voice/create-voice.ts";
import type { PlatformSchedule } from "../workflows/schedules/platform-schedules.ts";
import { gateScheduleFires } from "../workflows/schedules/schedule-fire-gate.ts";
import type { WorkflowCatalog } from "../workflows/workflow-catalog.ts";
import type { AgentDefinition, AgentFactoryDeps } from "./agent-module.ts";
import type { ComposeAgentRuntimeArgs } from "./compose-agent-runtime-args.ts";
import { CORE_FLAG_KEYS } from "./core-flag-keys.ts";
import { createFlagReader, type FlagReader } from "./flag-reader.ts";
import { buildAgents, buildChat, collectAgents, collectCommands, dirsOption, isEntry } from "./runtime-agents.ts";
import { buildRuntimeApiRoutes, buildRuntimeMiddleware } from "./runtime-http.ts";
import { buildMcpServers, buildToolRegistry, registerFakeRules, toolDepsOf } from "./runtime-tools.ts";
import { collectWorkflows } from "./runtime-workflows.ts";

export type { ComposeAgentRuntimeArgs } from "./compose-agent-runtime-args.ts";

/** Key of the memory vector store in `new Mastra({ vectors })`. */
export const MEMORY_VECTOR_KEY = "memory";

/** What `new Mastra({...})` receives from the runtime (spec §3.3); `pubsub` arrives with Task 25. */
export type RuntimeParts = {
  /**
   * Entry agents Mastra serves: `assistant` (supervisor), `ping`, module entry agents and the
   * durable chat wrapper of the supervisor (`assistant-chat`, reachable only through `/chat/*`).
   */
  readonly agents: Record<string, Agent>;
  /** Subagents reachable only through the supervisor (knowledge, data, action, web, module agents). */
  readonly subagents: Record<string, Agent>;
  readonly workflows: Record<string, AnyWorkflow>;
  /** Which workflows `/v1` may start and tenants may schedule (SP5). */
  readonly workflowCatalog: WorkflowCatalog;
  /** Platform crons of core workflows; `apps/mastra` writes them with `ensurePlatformSchedules` at boot. */
  readonly platformSchedules: readonly PlatformSchedule[];
  /** Core scorers (Task 27); the LLM judge only in real mode. */
  readonly scorers: Record<string, CoreScorer>;
  /** The core MCP server (`core`, Task 24); `/v1/mcp` reaches it through the gateway. */
  readonly mcpServers: Record<string, MCPServerBase>;
  /** `server.mcpOptions` of `new Mastra()`: bridges the verified agent context into MCP requests. */
  readonly mcpOptions: { readonly setRequestAuth: typeof setMcpRequestAuth };
  readonly storage: MastraCompositeStore;
  readonly vectors: Record<string, MastraVector>;
  /** Tenant-scoped memory for the chat agents (Task 20 attaches it to the supervisor). */
  readonly memory: Memory | undefined;
  readonly observability: Observability;
  readonly auth: FirebaseMastraAuth;
  /** Route allowlist first, then the context middleware. */
  readonly middleware: AgentMiddleware[];
  /** Voice routes (Task 26), the chat routes (SP4 Task 2) and the workflow approval settle route (SP5, decision 0036). */
  readonly apiRoutes: ApiRoute[];
  /** Chat agents, run owners and the approval previewer the chat routes share (SP4, decision 0031). */
  readonly chat: ChatRuntime;
  readonly tools: ToolRegistry;
  /** `CompositeVoice` over the voice roles; `null` when no voice model is configured (SP4 attaches it). */
  readonly voice: CoreVoice | null;
};

/** What the agent factories share, plus the pieces the rest of the composition reuses. */
type AgentDepsBundle = {
  readonly deps: AgentFactoryDeps;
  readonly customAccess: ReturnType<typeof createCustomAgentAccess>;
  readonly toolDeps: ReturnType<typeof toolDepsOf>;
  readonly flags: FlagReader;
  readonly skillDirs: readonly string[];
  readonly modelSettings: ModelSettingsService;
};

/** Decision 0072: the staff choice of model per text role and the live price table. */
const createModelSettings = (args: ComposeAgentRuntimeArgs): ModelSettingsService => {
  const registry = createProviderRegistry(args.env);
  const modelSettings = createModelSettingsService({
    store: args.ports.modelSettings ?? createInMemoryModelSettingsRepository(),
    env: args.env,
    aiMode: args.env.AI_MODE,
    codePrices: priceTableFor(args.env.AI_MODE),
    isConfigured: (provider) => registry.isConfigured(provider),
    logger: processLogger,
  });
  // Loaded while the runtime boots; until it answers the roles follow the environment.
  void modelSettings.refresh();
  return modelSettings;
};

/** Models, the tool registry, guardrails, memory, settings, skills and instructions the agents are built on. */
const createAgentDeps = (
  args: ComposeAgentRuntimeArgs,
  commands: readonly AgentCommand[],
  definitions: readonly AgentDefinition[],
): AgentDepsBundle => {
  const modelSettings = createModelSettings(args);
  const models = args.models ?? createModelProvider(args.env, { modelIdOf: modelSettings.modelIdOf });
  registerFakeRules(models, commands);
  // Decision 0046: the loader and per-run ceiling of custom agents; the registry is read lazily (it is bound to these deps).
  const customAccess = createCustomAgentAccess({
    customAgents: args.ports.customAgents,
    subagents: definitions.filter((definition) => !isEntry(definition)),
    registry: () => tools,
  });
  const toolDeps = toolDepsOf(args, definitions, customAccess.runCeilingOf);
  const webTools = args.webTools ?? createWebToolsRuntime({ env: args.env, secrets: args.ports.secrets });
  const tools = buildToolRegistry(args, toolDeps, models, commands, webTools);
  const connectorTools = createConnectorToolResolver({
    connectors: args.ports.connectors,
    secrets: args.ports.secrets,
    toolDeps,
    loaders: args.connectorLoaders ?? defaultConnectorLoaders(args.env.APP_ENV),
    logger: processLogger,
  });
  const guardrails = (kind: Parameters<typeof createGuardrailProfile>[1]) =>
    createGuardrailProfile({ models, ports: args.ports }, kind);
  const memory =
    args.vector === undefined
      ? undefined
      : createMemory({
          storage: args.storage,
          vector: args.vector,
          models,
          env: { AI_MEMORY_OBSERVATIONAL: args.env.AI_MEMORY_OBSERVATIONAL ?? false },
        });
  const flags = createFlagReader(args.ports.flags);
  const tenantSettings = createTenantAgentSettingsReader(args.ports.settings, flags);
  const skillDirs = [...(args.skillsDirs ?? []), ...CORE_SKILL_DIRS];
  const skills = (names: readonly string[]) =>
    createSkillsResolver({
      core: names.map((name) => loadSkill(name, skillDirs)),
      modules: args.modules,
      settings: tenantSettings,
    });
  // Decision 0038: active platform prompt (else the seed) + tenant addendum, cached 60 s.
  const instructions = createInstructionsResolver(args.ports.prompts);
  const deps: AgentFactoryDeps = {
    models,
    tools,
    ports: args.ports,
    guardrails,
    memory,
    tenantSettings,
    skills,
    commands,
    connectorTools,
    webTools,
    instructions,
  };
  return { deps, customAccess, toolDeps, flags, skillDirs, modelSettings };
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
  const { deps, customAccess, toolDeps, flags, skillDirs, modelSettings } = createAgentDeps(
    args,
    commands,
    definitions,
  );
  const { models, tools, guardrails, memory } = deps;
  const { agents, subagents } = buildAgents(definitions, deps, args.instructionsDirs);
  const apiPrefix = args.apiPrefix;
  const auth = new FirebaseMastraAuth({ access: args.ports.access, ...(apiPrefix === undefined ? {} : { apiPrefix }) });
  const { voice, routes: voiceRoutes } = composeVoice({
    env: args.env,
    models,
    ports: args.ports,
    flags,
    supervisor: agents[SUPERVISOR_AGENT_ID],
    logger: processLogger,
  });
  const custom = composeCustomAgents({
    deps,
    loader: customAccess.loader,
    registry: tools,
    toolDeps,
    customAgents: args.ports.customAgents,
    access: args.ports.access,
    moduleIds: args.modules.map((module) => module.id),
    coreSkills: Object.fromEntries(Object.values(CORE_SKILLS).map((name) => [name, loadSkill(name, skillDirs)])),
    ...dirsOption(args.instructionsDirs),
    logger: processLogger,
  });
  const chat = buildChat(agents, {
    tools,
    toolDeps,
    summarizer: createConversationSummarizer({ models, guardrails: guardrails("delegated") }),
    custom,
  });
  const { workflows, catalog: workflowCatalog, platformSchedules } = collectWorkflows(args, models, memory);
  return {
    agents: chat.agents,
    subagents,
    workflows,
    workflowCatalog,
    platformSchedules,
    scorers: createCoreScorers(models.mode === "real" ? { judgeModel: models.language("judge") } : {}),
    mcpServers: buildMcpServers(args, tools, toolDeps, agents[SUPERVISOR_AGENT_ID]),
    mcpOptions: { setRequestAuth: setMcpRequestAuth },
    // Decision 0037 A2: `workflows.schedules` off holds every schedule fire (tenant and platform).
    storage: gateScheduleFires({
      storage: args.storage,
      isEnabled: () => flags.isEnabled({ key: CORE_FLAG_KEYS.schedules, tenantId: null, fallback: true }),
      logger: processLogger,
    }),
    vectors: args.vector === undefined ? {} : { [MEMORY_VECTOR_KEY]: args.vector },
    memory,
    observability: createObservability({
      serviceName: args.serviceName,
      env: args.env,
      aiMode: args.env.AI_MODE,
      usage: args.ports.usage,
      prices: modelSettings.prices,
      ...(args.exporters === undefined ? {} : { exporters: args.exporters }),
    }),
    auth,
    middleware: buildRuntimeMiddleware({ runtime: args, auth, flags, hiddenAgentIds: chat.hiddenAgentIds }),
    apiRoutes: buildRuntimeApiRoutes({
      runtime: args,
      voiceRoutes,
      chat: chat.runtime,
      definitions,
      agents,
      subagents,
      workflowCatalog,
      tools,
      custom,
      modelSettings,
    }),
    tools,
    voice,
    chat: chat.runtime,
  };
};
