import type { AgentCatalogEntry, AgentCatalogSkill, AgentCatalogTool, WorkflowCatalogEntry } from "@core/contracts";
import type { Logger } from "@core/services";
import type { Agent } from "@mastra/core/agent";
import type { RequestContext } from "@mastra/core/request-context";
import { type ApiRoute, registerApiRoute } from "@mastra/core/server";
import { z } from "zod";
import { CORE_SKILLS } from "../skills/resolve-skills.ts";
import {
  authorizeCaller,
  dataJson,
  inputsOf,
  type RouteInputs,
  routeError,
} from "../workflows/runs/workflow-route-http.ts";
import type { WorkflowCatalog } from "../workflows/workflow-catalog.ts";
import type { AccessPort, SettingsPort } from "./runtime-ports.ts";

/**
 * Custom routes of the tenant settings pages (SP5 Task 14, spec §7): what the runtime offers an
 * organization. Agents, skills and workflows are defined in code (the core and the installed
 * modules); these routes only describe them for the caller's tenant: which subagents its
 * settings enable, the tools each one resolves there (connector tools included) and its skills,
 * and the workflows the tenant may start or schedule. Read only, behind the context middleware.
 */
export const TENANT_CATALOG_ROUTES_PATTERN = "/tenant-catalog/*";
export const TENANT_CATALOG_AGENTS_PATH = "/tenant-catalog/agents";
export const TENANT_CATALOG_WORKFLOWS_PATH = "/tenant-catalog/workflows";

export const TENANT_CATALOG_PERMISSIONS = {
  agents: "core.agent-settings.read",
  workflows: "core.workflow-run.read",
} as const;

export type TenantCatalogRouteDeps = {
  readonly access: AccessPort;
  /** The supervisor's subagents by key (core and module), enabled or not. */
  readonly subagents: Readonly<Record<string, Agent>>;
  /** Ids of the installed agent modules: a capability named `<moduleId>-…` or `<moduleId>.…` is theirs. */
  readonly moduleIds: readonly string[];
  /** Whether a tool id is in the tool registry (core and module tools); anything else an agent resolves is a connector tool. */
  readonly isRegisteredTool: (toolId: string) => boolean;
  readonly settings: SettingsPort;
  readonly catalog: WorkflowCatalog;
  /** The tenant's own agents (decision 0046) as catalog entries; listed after the code-defined ones. */
  readonly customEntries?: (input: {
    readonly tenantId: string;
    readonly requestContext: RequestContext<unknown>;
  }) => Promise<AgentCatalogEntry[]>;
  readonly logger: Pick<Logger, "info" | "error">;
};

const CORE_SKILL_NAMES: ReadonlySet<string> = new Set(Object.values(CORE_SKILLS));

const moduleOf = (id: string, moduleIds: readonly string[]): string | undefined =>
  moduleIds.find(
    (moduleId) =>
      id.startsWith(`${moduleId}-`) || id.startsWith(`${moduleId}.`) || id.startsWith(`command.${moduleId}.`),
  );

type ResolvedTool = { readonly id?: unknown; readonly requireApproval?: unknown };

const toolsOf = async (
  agent: Agent,
  requestContext: RequestContext<unknown>,
  deps: TenantCatalogRouteDeps,
): Promise<AgentCatalogTool[]> => {
  const resolved = (await agent.listTools({ requestContext })) as Readonly<Record<string, ResolvedTool>>;
  return Object.entries(resolved).map(([name, tool]): AgentCatalogTool => {
    const id = typeof tool.id === "string" ? tool.id : name;
    const source = !deps.isRegisteredTool(id)
      ? "connector"
      : moduleOf(id, deps.moduleIds) === undefined
        ? "core"
        : "module";
    // Mutations are the tools Mastra asks a confirmation for (`bindCoreTool`, the MCP tool policy).
    return { id, kind: tool.requireApproval === true ? "mutation" : "read", source };
  });
};

const skillsOf = async (agent: Agent, requestContext: RequestContext<unknown>): Promise<AgentCatalogSkill[]> =>
  (await agent.listSkills({ requestContext })).map(
    (skill): AgentCatalogSkill => ({
      name: skill.name,
      description: skill.description,
      source: CORE_SKILL_NAMES.has(skill.name) ? "core" : "module",
    }),
  );

// One agent failing to resolve (a connector that is down) must not hide the others.
const entryOf = async (
  key: string,
  agent: Agent,
  enabled: boolean,
  inputs: RouteInputs,
  deps: TenantCatalogRouteDeps,
): Promise<AgentCatalogEntry> => {
  const moduleId = moduleOf(key, deps.moduleIds) ?? null;
  const [tools, skills] = await Promise.all([
    toolsOf(agent, inputs.requestContext, deps).catch((error: unknown) => {
      deps.logger.error("tenant_catalog_tools_failed", {
        requestId: inputs.requestContext.get("requestId"),
        agentId: key,
        err: error,
      });
      return [];
    }),
    skillsOf(agent, inputs.requestContext).catch((error: unknown) => {
      deps.logger.error("tenant_catalog_skills_failed", {
        requestId: inputs.requestContext.get("requestId"),
        agentId: key,
        err: error,
      });
      return [];
    }),
  ]);
  return {
    key,
    name: agent.name,
    description: agent.getDescription(),
    source: moduleId === null ? "core" : "module",
    moduleId,
    enabled,
    tools,
    skills,
  };
};

const guarded =
  (deps: TenantCatalogRouteDeps, event: string, handle: (inputs: RouteInputs) => Promise<Response>) =>
  async (inputs: RouteInputs) => {
    try {
      return await handle(inputs);
    } catch (error: unknown) {
      deps.logger.error(event, { requestId: inputs.requestContext.get("requestId"), err: error });
      return routeError("INTERNAL_ERROR", inputs.requestContext);
    }
  };

/** `GET /tenant-catalog/agents` (`core.agent-settings.read`): the subagents as the caller's organization has them, then its own agents. */
export const handleListAgentCatalog = (deps: TenantCatalogRouteDeps) =>
  guarded(deps, "tenant_catalog_agents_failed", async (inputs) => {
    const caller = await authorizeCaller({
      access: deps.access,
      requestContext: inputs.requestContext,
      permission: TENANT_CATALOG_PERMISSIONS.agents,
    });
    if (!caller.ok) return caller.response;
    const settings = await deps.settings.getAgentSettings({ tenantId: caller.data.context.tenantId });
    const enabled = new Set<string>(settings.enabledAgents);
    const entries = await Promise.all(
      Object.entries(deps.subagents).map(([key, agent]) => entryOf(key, agent, enabled.has(key), inputs, deps)),
    );
    // A failing custom agent store must not hide the code-defined agents.
    const custom = await (
      deps.customEntries?.({ tenantId: caller.data.context.tenantId, requestContext: inputs.requestContext }) ??
      Promise.resolve([])
    ).catch((error: unknown) => {
      deps.logger.error("tenant_catalog_custom_agents_failed", {
        requestId: inputs.requestContext.get("requestId"),
        err: error,
      });
      return [];
    });
    return dataJson([...entries, ...custom]);
  });

const isZodType = (schema: unknown): schema is z.ZodType => schema instanceof z.ZodType;

// The schema is help for a form; a workflow whose schema has no JSON Schema form is listed without one.
const jsonSchemaOf = (schema: unknown): Record<string, unknown> | null => {
  if (!isZodType(schema)) return null;
  try {
    return z.toJSONSchema(schema);
  } catch {
    return null;
  }
};

/** `GET /tenant-catalog/workflows` (`core.workflow-run.read`): workflows a tenant may start or schedule; platform-only ones are left out. */
export const handleListWorkflowCatalog = (deps: TenantCatalogRouteDeps) =>
  guarded(deps, "tenant_catalog_workflows_failed", async ({ mastra, requestContext }) => {
    const caller = await authorizeCaller({
      access: deps.access,
      requestContext,
      permission: TENANT_CATALOG_PERMISSIONS.workflows,
    });
    if (!caller.ok) return caller.response;
    const entries = deps.catalog.ids().flatMap((id): WorkflowCatalogEntry[] => {
      const policy = deps.catalog.get(id);
      if (policy === undefined || (!policy.startable && !policy.schedulable)) return [];
      const workflow = mastra.getWorkflow(id) as { readonly description?: string; readonly inputSchema?: unknown };
      return [
        {
          id,
          description: workflow.description ?? "",
          startable: policy.startable,
          schedulable: policy.schedulable,
          inputSchema: jsonSchemaOf(workflow.inputSchema),
        },
      ];
    });
    return dataJson(entries);
  });

/** Both routes require Mastra auth and read the tenant from the verified context only. */
export const createTenantCatalogRoutes = (deps: TenantCatalogRouteDeps): ApiRoute[] => [
  registerApiRoute(TENANT_CATALOG_AGENTS_PATH, {
    method: "GET",
    requiresAuth: true,
    handler: (c) => handleListAgentCatalog(deps)(inputsOf(c)),
  }),
  registerApiRoute(TENANT_CATALOG_WORKFLOWS_PATH, {
    method: "GET",
    requiresAuth: true,
    handler: (c) => handleListWorkflowCatalog(deps)(inputsOf(c)),
  }),
];
