import type { Logger } from "@core/services";
import type { Agent } from "@mastra/core/agent";
import type { RequestContext } from "@mastra/core/request-context";
import type { ApiRoute } from "@mastra/core/server";
import type { InlineSkill } from "@mastra/core/skills";
import { chatAgentIdOf } from "../chat/durable-supervisor.ts";
import { CUSTOM_AGENT_ID_KEY, readAgentContext } from "../context/agent-request-context.ts";
import type { AgentDefinition, AgentFactoryDeps } from "../runtime/agent-module.ts";
import type { AccessPort, CustomAgentsPort } from "../runtime/runtime-ports.ts";
import type { CoreToolDeps } from "../tools/define-core-tool.ts";
import type { ToolRegistry } from "../tools/tool-registry.ts";
import { createCustomAgent } from "./custom-agent.ts";
import { createCustomAgentLoader, type CustomAgentLoader } from "./custom-agent-loader.ts";
import { createCustomAgentRoutes, type CustomCatalogDeps, customCatalogEntriesOf } from "./custom-agent-routes.ts";
import { createCustomCeilingResolver, createCustomToolsResolver, CUSTOM_AGENT_ID } from "./custom-agent-tools.ts";

/** Mastra ids that run custom agents: the plain agent and its durable chat wrapper. */
export const CUSTOM_AGENT_RUN_IDS: readonly string[] = [CUSTOM_AGENT_ID, chatAgentIdOf(CUSTOM_AGENT_ID)];

/**
 * Platform ceiling of custom agents (decision 0046): the union of the code-defined subagents'
 * ceilings, so an organization's agent never holds a permission no shipped agent could use.
 */
export const platformCeilingOf = (subagents: readonly Pick<AgentDefinition, "ceiling">[]): ReadonlySet<string> => new Set(subagents.flatMap((agent) => agent.ceiling));

/**
 * The loader and the `runCeilingOf` of the runtime. Built before the tool registry exists (the
 * registry is bound to the tool deps that carry the ceiling), so the registry is read lazily.
 */
export const createCustomAgentAccess = (args: {
  readonly customAgents: CustomAgentsPort;
  readonly subagents: readonly Pick<AgentDefinition, "ceiling">[];
  readonly registry: () => Pick<ToolRegistry, "has" | "get">;
}): { readonly loader: CustomAgentLoader; readonly runCeilingOf: NonNullable<CoreToolDeps["runCeilingOf"]> } => {
  const loader = createCustomAgentLoader(args.customAgents);
  const runCeilingOf = createCustomCeilingResolver({ loader, registry: args.registry, platformCeiling: platformCeilingOf(args.subagents), agentIds: CUSTOM_AGENT_RUN_IDS });
  return { loader, runCeilingOf };
};

/**
 * `ChatRuntime.resolveCustomAgent`: a chat agent id that is an enabled custom agent of the
 * caller's tenant is named in the request context and served by the generic durable agent.
 * A missing, disabled or other-tenant agent, or a context without a tenant, resolves to nothing.
 */
export const createCustomChatResolver =
  (loader: Pick<CustomAgentLoader, "load">) =>
  async (agentId: string, requestContext: RequestContext<unknown>): Promise<string | undefined> => {
    const context = readAgentContext(requestContext);
    if (!context.ok) return undefined;
    const loaded = await loader.load({ tenantId: context.data.context.tenantId, agentId });
    if (loaded === null) return undefined;
    requestContext.set(CUSTOM_AGENT_ID_KEY, loaded.agent.id);
    return chatAgentIdOf(CUSTOM_AGENT_ID);
  };

export type CustomAgentRuntime = {
  /** The generic agent; registered in Mastra and wrapped as a durable chat agent, both hidden from `/api/agents/*`. */
  readonly agent: Agent;
  readonly resolveChatAgent: ReturnType<typeof createCustomChatResolver>;
  readonly routes: ApiRoute[];
  /** The tenant's custom agents as catalog entries (`GET /tenant-catalog/agents`). */
  readonly catalogEntries: (input: Parameters<typeof customCatalogEntriesOf>[1]) => ReturnType<typeof customCatalogEntriesOf>;
};

/** The custom agent, its chat resolver, its runtime routes and its catalog entries. */
export const composeCustomAgents = (args: {
  readonly deps: Pick<AgentFactoryDeps, "models" | "guardrails" | "memory" | "connectorTools">;
  readonly loader: CustomAgentLoader;
  readonly registry: ToolRegistry;
  readonly toolDeps: CoreToolDeps;
  readonly customAgents: CustomAgentsPort;
  readonly access: AccessPort;
  readonly moduleIds: readonly string[];
  readonly coreSkills: Readonly<Record<string, InlineSkill>>;
  readonly instructionsDirs?: readonly string[];
  readonly logger: Pick<Logger, "info" | "error">;
}): CustomAgentRuntime => {
  const { deps, loader, registry, coreSkills, moduleIds } = args;
  const agent = createCustomAgent({
    deps,
    loader,
    tools: createCustomToolsResolver({ registry, toolDeps: args.toolDeps, connectorTools: deps.connectorTools }),
    coreSkills,
    ...(args.instructionsDirs === undefined ? {} : { instructionsDirs: args.instructionsDirs }),
  });
  const catalogDeps: CustomCatalogDeps = { customAgents: args.customAgents, registry, moduleIds, coreSkills, connectorTools: deps.connectorTools };
  return {
    agent,
    resolveChatAgent: createCustomChatResolver(loader),
    routes: createCustomAgentRoutes({ access: args.access, registry, moduleIds, coreSkills, loader, logger: args.logger }),
    catalogEntries: (input) => customCatalogEntriesOf(catalogDeps, input),
  };
};
