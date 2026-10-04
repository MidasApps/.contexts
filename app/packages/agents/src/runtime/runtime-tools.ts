import type { Agent } from "@mastra/core/agent";
import type { MCPServerBase } from "@mastra/core/mcp";
import { SUPERVISOR_AGENT_ID } from "../agents/supervisor-agent.ts";
import { CORE_MCP_SERVER_ID, createCoreMcpServer, MCP_CALLER_ID, MCP_CEILING } from "../mcp-server/core-mcp-server.ts";
import { coreFakeRules } from "../models/fake/fake-scenarios.ts";
import type { AgentModels } from "../models/model-factory.ts";
import { createAiCatalogReader } from "../tools/catalog/ai-catalog-reader.ts";
import { loadBundledAiCatalog } from "../tools/catalog/ai-catalog-source.ts";
import { createDescribeEntityTool } from "../tools/catalog/describe-entity.tool.ts";
import { createListEntitiesTool } from "../tools/catalog/list-entities.tool.ts";
import { createRenderFormTool } from "../tools/catalog/render-form.tool.ts";
import { type AgentCommand, commandIdOf, formCommandsOf } from "../tools/commands/agent-command.ts";
import { createCommandOfferedCheck } from "../tools/commands/module-commands.ts";
import type { CoreToolDefinition, CoreToolDeps } from "../tools/define-core-tool.ts";
import { createSearchKnowledgeTool } from "../tools/knowledge/search-knowledge.tool.ts";
import { createQuerySemanticSqlTool } from "../tools/sql/query-semantic-sql.tool.ts";
import { createToolRegistry, type ToolRegistry } from "../tools/tool-registry.ts";
import { createFirecrawlTools, type WebToolsRuntime } from "../tools/web/web-tools-runtime.ts";
import { LOCAL_MCP_REQUEST_STATE_KEY } from "./agent-env.schema.ts";
import type { AgentDefinition } from "./agent-module.ts";
import type { ComposeAgentRuntimeArgs } from "./compose-agent-runtime-args.ts";
import { SUPERVISOR_CEILING } from "./runtime-agents.ts";

const coreTools = (
  args: ComposeAgentRuntimeArgs,
  models: AgentModels,
  commands: readonly AgentCommand[],
  web: WebToolsRuntime,
): CoreToolDefinition[] => {
  const catalog = createAiCatalogReader(args.aiCatalog ?? loadBundledAiCatalog());
  const formCommands = formCommandsOf(commands);
  return [
    createListEntitiesTool({ catalog }),
    createDescribeEntityTool({ catalog }),
    createRenderFormTool({
      catalog,
      commands: { get: (id) => formCommands.get(id) },
      access: args.ports.access,
      isCommandOffered: createCommandOfferedCheck(
        args.ports.settings,
        args.modules.map((module) => module.id),
      ),
    }),
    createQuerySemanticSqlTool({ catalog: args.ports.catalog }),
    createSearchKnowledgeTool({ knowledge: args.ports.knowledge, embedding: models.embedding, catalog }),
    ...createFirecrawlTools(web),
    ...commands.map(({ tool }) => tool),
  ];
};

// Ceilings are data, known before any tool is bound: every call is capped by its agent's.
export const toolDepsOf = (
  args: ComposeAgentRuntimeArgs,
  agents: readonly AgentDefinition[],
  runCeilingOf: NonNullable<CoreToolDeps["runCeilingOf"]>,
): CoreToolDeps => {
  const ceilings = [
    ...agents.map((agent) => [agent.id, new Set(agent.ceiling)] as const),
    [SUPERVISOR_AGENT_ID, new Set(SUPERVISOR_CEILING)] as const,
    [MCP_CALLER_ID, new Set(MCP_CEILING)] as const,
  ];
  return {
    access: args.ports.access,
    audit: args.ports.audit,
    approvals: args.ports.approvals,
    commands: args.ports.commands,
    agentCeilings: Object.fromEntries(ceilings),
    // Custom agents (decision 0046): the ceiling of the record the run names; empty without one.
    runCeilingOf,
  };
};

export const buildToolRegistry = (
  args: ComposeAgentRuntimeArgs,
  toolDeps: CoreToolDeps,
  models: AgentModels,
  commands: readonly AgentCommand[],
  web: WebToolsRuntime,
): ToolRegistry => {
  const registry = createToolRegistry(toolDeps);
  for (const tool of [
    ...coreTools(args, models, commands, web),
    ...args.modules.flatMap((module) => module.tools ?? []),
  ])
    registry.register(tool);
  return registry;
};

export const registerFakeRules = (models: AgentModels, commands: readonly AgentCommand[]): void => {
  const refs = commands.map(({ tool, targetContractId }) => ({
    toolId: tool.id,
    commandId: commandIdOf(tool),
    targetContractId,
  }));
  for (const [agentId, rule] of coreFakeRules(refs)) models.registerFakeScenario(agentId, rule);
};

/** The core MCP server over the registry's read tools and the supervisor (decision 0027 D3-15). */
export const buildMcpServers = (
  args: ComposeAgentRuntimeArgs,
  tools: ToolRegistry,
  toolDeps: CoreToolDeps,
  assistant: Agent | undefined,
): Record<string, MCPServerBase> => {
  if (assistant === undefined) return {};
  const catalog = createAiCatalogReader(args.aiCatalog ?? loadBundledAiCatalog());
  const requestStateKey = args.env.MCP_REQUEST_STATE_KEY ?? LOCAL_MCP_REQUEST_STATE_KEY;
  return {
    [CORE_MCP_SERVER_ID]: createCoreMcpServer({ registry: tools, toolDeps, assistant, catalog, requestStateKey }),
  };
};
