import {
  type AgentCatalogEntry,
  type AgentCatalogSkill,
  type AgentCatalogTool,
  CUSTOM_AGENT_MODELS,
  type CustomAgent,
  type CustomAgentRuntimeOptions,
  type CustomSkill,
} from "@core/contracts";
import type { Logger } from "@core/services";
import { type ApiRoute, registerApiRoute } from "@mastra/core/server";
import type { InlineSkill } from "@mastra/core/skills";
import type { TenantAgentSettingsReader } from "../agents/tenant-agent-settings.ts";
import type { ConnectorToolsResolver } from "../connectors/connector-registry.ts";
import type { RequestContextReader } from "../context/agent-request-context.ts";
import type { AccessPort, CustomAgentsPort } from "../runtime/runtime-ports.ts";
import { offeredToolsOf } from "../tools/commands/module-commands.ts";
import { SEARCH_KNOWLEDGE_TOOL_ID } from "../tools/knowledge/search-knowledge.tool.ts";
import type { ToolRegistry } from "../tools/tool-registry.ts";
import {
  authorizeCaller,
  dataJson,
  inputsOf,
  type RouteInputs,
  routeError,
} from "../workflows/runs/workflow-route-http.ts";
import { customSkillNameOf } from "./custom-agent.ts";
import type { CustomAgentLoader } from "./custom-agent-loader.ts";
import { selectableToolsOf, selectedToolsOf } from "./custom-agent-tools.ts";

/**
 * Runtime routes of tenant-defined agents (decision 0046), next to the tenant catalog: what a
 * custom agent may select here, and the cache invalidation `/v1` asks for after a write. Both sit
 * behind the context middleware (`/tenant-catalog/*`) and authorize again.
 */
export const CUSTOM_AGENT_OPTIONS_PATH = "/tenant-catalog/agent-options";
export const CUSTOM_AGENT_INVALIDATE_PATH = "/tenant-catalog/custom-agents/invalidate";

export const CUSTOM_AGENT_PERMISSIONS = {
  read: "core.agent-settings.read",
  write: "core.agent-settings.update",
} as const;

export type CustomAgentRouteDeps = {
  readonly access: AccessPort;
  readonly registry: Pick<ToolRegistry, "ids" | "get" | "has">;
  /** Ids of the installed agent modules (a tool `<moduleId>.…` or `command.<moduleId>.…` is theirs). */
  readonly moduleIds: readonly string[];
  /** The caller's tenant settings: commands of modules it did not enable are not listed (decision 0064). */
  readonly tenantSettings: TenantAgentSettingsReader;
  readonly coreSkills: Readonly<Record<string, InlineSkill>>;
  readonly loader: Pick<CustomAgentLoader, "invalidate">;
  readonly logger: Pick<Logger, "info" | "error">;
};

const moduleOf = (id: string, moduleIds: readonly string[]): string | undefined =>
  moduleIds.find(
    (moduleId) =>
      id.startsWith(`${moduleId}-`) || id.startsWith(`${moduleId}.`) || id.startsWith(`command.${moduleId}.`),
  );

const sourceOf = (id: string, moduleIds: readonly string[]): "core" | "module" =>
  moduleOf(id, moduleIds) === undefined ? "core" : "module";

/** The models, tools and platform skills a custom agent may select in this runtime, for a tenant with these enabled agents. */
export const customAgentOptionsOf = (
  deps: Pick<CustomAgentRouteDeps, "registry" | "moduleIds" | "coreSkills">,
  enabledAgents: ReadonlySet<string>,
): CustomAgentRuntimeOptions => ({
  models: [...CUSTOM_AGENT_MODELS],
  tools: offeredToolsOf(selectableToolsOf(deps.registry), deps.moduleIds, enabledAgents).map((tool) => ({
    id: tool.id,
    kind: tool.kind,
    source: sourceOf(tool.id, deps.moduleIds),
    description: tool.description.slice(0, 2000),
  })),
  coreSkills: Object.values(deps.coreSkills).map((skill) => ({
    name: skill.name,
    description: skill.description.slice(0, 1024),
  })),
});

const guarded =
  (deps: Pick<CustomAgentRouteDeps, "logger">, event: string, handle: (inputs: RouteInputs) => Promise<Response>) =>
  async (inputs: RouteInputs) => {
    try {
      return await handle(inputs);
    } catch (error: unknown) {
      deps.logger.error(event, { requestId: inputs.requestContext.get("requestId"), err: error });
      return routeError("INTERNAL_ERROR", inputs.requestContext);
    }
  };

/** `GET /tenant-catalog/agent-options` (`core.agent-settings.read`). */
export const handleCustomAgentOptions = (deps: CustomAgentRouteDeps) =>
  guarded(deps, "custom_agent_options_failed", async ({ requestContext }) => {
    const caller = await authorizeCaller({
      access: deps.access,
      requestContext,
      permission: CUSTOM_AGENT_PERMISSIONS.read,
    });
    if (!caller.ok) return caller.response;
    const { enabledAgents } = await deps.tenantSettings(requestContext);
    return dataJson(customAgentOptionsOf(deps, enabledAgents));
  });

/** `POST /tenant-catalog/custom-agents/invalidate` (`core.agent-settings.update`): drops the caller's tenant's cached records. */
export const handleInvalidateCustomAgents = (deps: CustomAgentRouteDeps) =>
  guarded(deps, "custom_agent_invalidate_failed", async ({ requestContext }) => {
    const caller = await authorizeCaller({
      access: deps.access,
      requestContext,
      permission: CUSTOM_AGENT_PERMISSIONS.write,
    });
    if (!caller.ok) return caller.response;
    deps.loader.invalidate(caller.data.context.tenantId);
    deps.logger.info("custom_agents_invalidated", {
      requestId: requestContext.get("requestId"),
      tenantId: caller.data.context.tenantId,
    });
    return new Response(null, { status: 204 });
  });

export const createCustomAgentRoutes = (deps: CustomAgentRouteDeps): ApiRoute[] => [
  registerApiRoute(CUSTOM_AGENT_OPTIONS_PATH, {
    method: "GET",
    requiresAuth: true,
    handler: (c) => handleCustomAgentOptions(deps)(inputsOf(c)),
  }),
  registerApiRoute(CUSTOM_AGENT_INVALIDATE_PATH, {
    method: "POST",
    requiresAuth: true,
    handler: (c) => handleInvalidateCustomAgents(deps)(inputsOf(c)),
  }),
];

export type CustomCatalogDeps = {
  readonly customAgents: Pick<CustomAgentsPort, "listAgents" | "listSkills">;
  readonly registry: Pick<ToolRegistry, "get" | "has">;
  readonly moduleIds: readonly string[];
  readonly coreSkills: Readonly<Record<string, InlineSkill>>;
  readonly connectorTools: ConnectorToolsResolver;
};

type ConnectorToolLike = { readonly id?: unknown; readonly requireApproval?: unknown };

const connectorCatalogTools = async (
  deps: CustomCatalogDeps,
  requestContext: RequestContextReader,
): Promise<AgentCatalogTool[]> =>
  Object.entries(
    (await deps.connectorTools(requestContext, "supervisor")) as Readonly<Record<string, ConnectorToolLike>>,
  ).map(([name, tool]) => ({
    id: typeof tool.id === "string" ? tool.id : name,
    kind: tool.requireApproval === true ? "mutation" : "read",
    source: "connector",
  }));

const toolsOfRecord = (
  agent: CustomAgent,
  deps: CustomCatalogDeps,
  connector: readonly AgentCatalogTool[],
): AgentCatalogTool[] => {
  const knowledge = deps.registry.get(SEARCH_KNOWLEDGE_TOOL_ID);
  return [
    ...selectedToolsOf(agent, deps.registry).map(
      (tool): AgentCatalogTool => ({ id: tool.id, kind: tool.kind, source: sourceOf(tool.id, deps.moduleIds) }),
    ),
    ...(agent.knowledgeScope === "none" || knowledge === undefined
      ? []
      : [{ id: knowledge.id, kind: knowledge.kind, source: "core" } satisfies AgentCatalogTool]),
    ...(agent.connectorTools ? connector : []),
  ];
};

const skillsOfAgent = (
  agent: CustomAgent,
  skills: readonly CustomSkill[],
  deps: CustomCatalogDeps,
): AgentCatalogSkill[] => {
  const selected = new Set<string>(agent.customSkills);
  return [
    ...agent.coreSkills.flatMap((name): AgentCatalogSkill[] => {
      const skill = deps.coreSkills[name];
      return skill === undefined
        ? []
        : [{ name: skill.name, description: skill.description.slice(0, 1024), source: "core" }];
    }),
    ...skills
      .filter((skill) => skill.enabled && selected.has(skill.id))
      .map(
        (skill): AgentCatalogSkill => ({
          name: customSkillNameOf(skill),
          description: skill.description,
          source: "custom",
        }),
      ),
  ];
};

/**
 * Catalog entries of the tenant's custom agents, enabled or not, with the tools and skills each
 * one has at run time (unknown tool ids and disabled skills are left out, as in a run).
 */
export const customCatalogEntriesOf = async (
  deps: CustomCatalogDeps,
  input: { readonly tenantId: string; readonly requestContext: RequestContextReader },
): Promise<AgentCatalogEntry[]> => {
  const agents = (await deps.customAgents.listAgents({ tenantId: input.tenantId })).filter(
    (agent) => agent.tenantId === input.tenantId,
  );
  if (agents.length === 0) return [];
  const [skills, connector] = await Promise.all([
    deps.customAgents.listSkills({ tenantId: input.tenantId }),
    agents.some((agent) => agent.connectorTools)
      ? connectorCatalogTools(deps, input.requestContext).catch(() => [])
      : Promise.resolve([]),
  ]);
  return agents.map((agent) => ({
    key: agent.id,
    name: agent.name,
    description: agent.description,
    source: "custom",
    moduleId: null,
    enabled: agent.enabled,
    tools: toolsOfRecord(agent, deps, connector),
    skills: skillsOfAgent(
      agent,
      skills.filter((skill) => skill.tenantId === input.tenantId),
      deps,
    ),
  }));
};
