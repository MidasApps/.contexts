import { CUSTOM_AGENT_RUNTIME_ID, type CustomAgent, type CustomAgentKnowledgeScope } from "@core/contracts";
import type { TenantAgentSettingsReader } from "../agents/tenant-agent-settings.ts";
import type { ConnectorTool, ConnectorToolsResolver } from "../connectors/connector-registry.ts";
import { CONNECTOR_TOOL_PERMISSION } from "../connectors/openapi/openapi-to-tools.ts";
import type { RequestContextReader } from "../context/agent-request-context.ts";
import { CATALOG_READ_PERMISSION } from "../tools/catalog/ai-catalog-reader.ts";
import { offeredToolsOf } from "../tools/commands/module-commands.ts";
import type { CoreToolDefinition, CoreToolDeps } from "../tools/define-core-tool.ts";
import { KNOWLEDGE_READ_PERMISSION, SEARCH_KNOWLEDGE_TOOL_ID } from "../tools/knowledge/search-knowledge.tool.ts";
import { type BoundCoreTool, bindCoreTool, type ToolRegistry } from "../tools/tool-registry.ts";
import { FIRECRAWL_TOOL_IDS } from "../tools/web/web-tools-runtime.ts";
import type { CustomAgentLoader, LoadedCustomAgent } from "./custom-agent-loader.ts";

/** Mastra id of the one agent that runs every custom agent (decision 0046). */
export const CUSTOM_AGENT_ID = CUSTOM_AGENT_RUNTIME_ID;

/** Every custom agent may chat; everything else comes from what its record selects. */
const BASE_PERMISSION = "core.chat.use";

/**
 * Registry tools a record may not select: the knowledge search is decided by the knowledge scope,
 * and the web tools need the organization's opt-in and stay with the `web` agent.
 */
const NOT_SELECTABLE: ReadonlySet<string> = new Set([SEARCH_KNOWLEDGE_TOOL_ID, ...FIRECRAWL_TOOL_IDS]);

export const isSelectableTool = (registry: Pick<ToolRegistry, "has">, toolId: string): boolean =>
  registry.has(toolId) && !NOT_SELECTABLE.has(toolId);

/** Tools a custom agent may select, in registration order. */
export const selectableToolsOf = (registry: Pick<ToolRegistry, "ids" | "get">): CoreToolDefinition[] =>
  registry
    .ids()
    .filter((id) => !NOT_SELECTABLE.has(id))
    .flatMap((id) => registry.get(id) ?? []);

/** The record's tool ids that exist and are selectable; anything else is dropped (fail-closed). */
export const selectedToolsOf = (
  agent: Pick<CustomAgent, "tools">,
  registry: Pick<ToolRegistry, "has" | "get">,
): CoreToolDefinition[] =>
  agent.tools.filter((id) => isSelectableTool(registry, id)).flatMap((id) => registry.get(id) ?? []);

const NAMESPACES: Record<
  Exclude<CustomAgentKnowledgeScope, "none" | "all">,
  (projectId: string | undefined) => string[]
> = {
  organization: () => ["tenant"],
  project: (projectId) => ["tenant", ...(projectId === undefined ? [] : [`project:${projectId}`])],
};

/**
 * The knowledge search narrowed to a scope: the namespaces are forced, so the model cannot ask for
 * more, and the tool still keeps only the ones the caller may search. `all` is the tool unchanged.
 */
export const scopedKnowledgeTool = (
  definition: CoreToolDefinition,
  scope: Exclude<CustomAgentKnowledgeScope, "none">,
): CoreToolDefinition => {
  if (scope === "all") return definition;
  return {
    ...definition,
    execute: (input, ctx) => definition.execute({ ...input, namespaces: NAMESPACES[scope](ctx.agent.projectId) }, ctx),
  };
};

/**
 * Ceiling of one custom agent run (decision 0046): what its record selected, inside the platform
 * ceiling of the code-defined subagents. Every call is still authorized for the caller.
 */
export const ceilingOfRecord = (
  agent: CustomAgent,
  deps: { readonly registry: Pick<ToolRegistry, "has" | "get">; readonly platformCeiling: ReadonlySet<string> },
): ReadonlySet<string> => {
  const wanted = [
    BASE_PERMISSION,
    ...selectedToolsOf(agent, deps.registry).map((tool) => tool.permission),
    ...(agent.knowledgeScope === "none" ? [] : [KNOWLEDGE_READ_PERMISSION]),
    ...(agent.knowledgeScope === "all" ? [CATALOG_READ_PERMISSION] : []),
    ...(agent.connectorTools ? [CONNECTOR_TOOL_PERMISSION] : []),
  ];
  return new Set(wanted.filter((permission) => deps.platformCeiling.has(permission)));
};

const EMPTY: ReadonlySet<string> = new Set();

/**
 * `CoreToolDeps.runCeilingOf` of the runtime: a run whose context names a custom agent, or any
 * call made as `custom-agent` (or its durable wrapper), gets the record's ceiling; without a
 * loaded record the ceiling is empty. Other runs keep their static ceiling (`undefined`).
 */
export const createCustomCeilingResolver =
  (deps: {
    readonly loader: Pick<CustomAgentLoader, "ofRun" | "isCustomRun">;
    readonly registry: () => Pick<ToolRegistry, "has" | "get">;
    readonly platformCeiling: ReadonlySet<string>;
    readonly agentIds: readonly string[];
  }): NonNullable<CoreToolDeps["runCeilingOf"]> =>
  async ({ agentId, requestContext }) => {
    if (!deps.agentIds.includes(agentId) && !deps.loader.isCustomRun(requestContext)) return undefined;
    const loaded = await deps.loader.ofRun(requestContext);
    return loaded === null
      ? EMPTY
      : ceilingOfRecord(loaded.agent, { registry: deps.registry(), platformCeiling: deps.platformCeiling });
  };

export type CustomToolsDeps = {
  readonly registry: Pick<ToolRegistry, "has" | "get">;
  readonly toolDeps: CoreToolDeps;
  readonly connectorTools: ConnectorToolsResolver;
  /** Ids of the installed modules: their commands reach only tenants that enabled them (decision 0064). */
  readonly moduleIds: readonly string[];
  readonly tenantSettings: TenantAgentSettingsReader;
};

export type CustomToolsResolver = (
  loaded: LoadedCustomAgent,
  requestContext: RequestContextReader | undefined,
) => Promise<Record<string, BoundCoreTool | ConnectorTool>>;

/**
 * The tools of a custom agent run: the selected registry tools and the scoped knowledge search,
 * bound as `custom-agent` (so the ceiling never depends on what Mastra reports as the caller), and
 * the read-only connector tools when the record opted in. A selected command of a module the
 * tenant did not enable is dropped (decision 0064). Bound tools are kept per definition.
 */
export const createCustomToolsResolver = (deps: CustomToolsDeps): CustomToolsResolver => {
  const bound = new Map<string, BoundCoreTool>();
  const bind = (key: string, definition: CoreToolDefinition): BoundCoreTool => {
    const tool = bound.get(key) ?? bindCoreTool(definition, deps.toolDeps, { agentId: CUSTOM_AGENT_ID });
    bound.set(key, tool);
    return tool;
  };
  const knowledgeOf = (scope: CustomAgentKnowledgeScope): Record<string, BoundCoreTool> => {
    const definition = deps.registry.get(SEARCH_KNOWLEDGE_TOOL_ID);
    if (scope === "none" || definition === undefined) return {};
    return {
      [SEARCH_KNOWLEDGE_TOOL_ID]: bind(`${SEARCH_KNOWLEDGE_TOOL_ID}#${scope}`, scopedKnowledgeTool(definition, scope)),
    };
  };
  return async ({ agent }, requestContext) => {
    const { enabledAgents } = await deps.tenantSettings(requestContext);
    const selected = offeredToolsOf(selectedToolsOf(agent, deps.registry), deps.moduleIds, enabledAgents);
    return {
      ...(agent.connectorTools ? await deps.connectorTools(requestContext, "supervisor") : {}),
      ...Object.fromEntries(selected.map((tool) => [tool.id, bind(tool.id, tool)])),
      ...knowledgeOf(agent.knowledgeScope),
    };
  };
};
