import type { Agent } from "@mastra/core/agent";
import type { AgentSkillsResolver, InlineSkill } from "@mastra/core/skills";
import type { Memory } from "@mastra/memory";
import type { TenantAgentSettingsReader } from "../agents/tenant-agent-settings.ts";
import type { ConnectorToolsResolver } from "../connectors/connector-registry.ts";
import type { AgentModels } from "../models/model-factory.ts";
import type { GuardrailProfile, GuardrailProfileKind } from "../processors/guardrail-profile.ts";
import type { AgentCommand } from "../tools/commands/agent-command.ts";
import type { CoreToolDefinition } from "../tools/define-core-tool.ts";
import type { ToolRegistry } from "../tools/tool-registry.ts";
import type { WebToolsRuntime } from "../tools/web/web-tools-runtime.ts";
import type { InstructionsResolver } from "../agents/prompt-instructions.ts";
import { type ModuleWorkflow, workflowIdOf } from "../workflows/workflow-catalog.ts";
import type { AgentRuntimePorts } from "./runtime-ports.ts";

/**
 * What a module adds to the agent runtime (spec §2.1, §3.1, decision 0019):
 * its server entry calls `defineAgentModule(...)`, and `apps/mastra/src/modules.ts`
 * lists the results in `APP_MODULES`. The core packages never import a module.
 */

/** Everything an agent factory may use; ports are reached only through tools. */
export type AgentFactoryDeps = {
  readonly models: AgentModels;
  readonly tools: ToolRegistry;
  readonly ports: AgentRuntimePorts;
  /** Processor stacks every agent spreads into its options (spec §12, `guardrail-profile.ts`). */
  readonly guardrails: (kind: GuardrailProfileKind) => GuardrailProfile;
  /** Tenant-scoped memory (`create-memory.ts`); `undefined` when the runtime has no vector store. */
  readonly memory: Memory | undefined;
  /** Tenant `agent-settings` of the run (enabled subagents, web opt-ins), read once per run. */
  readonly tenantSettings: TenantAgentSettingsReader;
  /** The `skills` option: the named core skills plus the skills of the tenant's enabled modules. */
  readonly skills: (coreSkills: readonly string[]) => AgentSkillsResolver;
  /** Commands of the core and of the modules (the action agent's tools). */
  readonly commands: readonly AgentCommand[];
  /** Tools of the run tenant's connectors for an agent kind (OpenAPI, MCP, browser, Postgres). */
  readonly connectorTools: ConnectorToolsResolver;
  /** Firecrawl clients per tenant and the SSRF guard DNS (the web agent gates its Firecrawl tools on them). */
  readonly webTools: WebToolsRuntime;
  /** Dynamic instructions: the active platform prompt (else the code seed) plus the tenant addendum (decision 0038). */
  readonly instructions: InstructionsResolver;
};

/**
 * What the staff catalog shows about an agent (decision 0044). Data only: `create` builds the
 * agent, and its tools are resolved per run, so the catalog cannot read them from the agent.
 */
export type AgentCatalogInfo = {
  /** Ids of the tools the agent has in every organization. */
  readonly tools: readonly string[];
  /** Names of the core skills it loads. */
  readonly skills: readonly string[];
  /** True when it also gets tools from the organization's connectors or web opt-ins. */
  readonly perOrganizationTools?: boolean;
};

export type AgentDefinition = {
  /** Mastra agent id and key (`/api/agents/<id>`). Module agents are prefixed by the module id. */
  readonly id: string;
  /** Permissions the agent may ever use: tool calls run with context permissions ∩ ceiling. */
  readonly ceiling: readonly string[];
  /**
   * `entry`: registered in Mastra and reachable by callers (entry guardrails).
   * `subagent` (default for module agents): reachable only through the supervisor, and only
   * in tenants whose `agent-settings.enabledAgents` lists its id.
   */
  readonly role?: "entry" | "subagent";
  /** Tools and skills for the staff catalog; absent: the catalog lists the agent without them. */
  readonly catalog?: AgentCatalogInfo;
  readonly create: (deps: AgentFactoryDeps) => Agent;
};

/** The capability refs of an SP2 `defineModule()` manifest (structural, data only). */
export type AgentCapabilityManifest = {
  readonly id: string;
  readonly agents?: readonly { readonly id: string }[];
  readonly tools?: readonly { readonly id: string }[];
  readonly workflows?: readonly { readonly id: string }[];
  readonly skills?: readonly { readonly id: string }[];
};

export type AgentModule = {
  readonly id: string;
  /** The module's manifest: every agent, tool, workflow and skill it names must be implemented here. */
  readonly manifest?: AgentCapabilityManifest;
  readonly agents?: readonly AgentDefinition[];
  readonly tools?: readonly CoreToolDefinition[];
  /** Mutation tools `command.<module>.<Command>` of the action agent, with their target contract. */
  readonly commands?: readonly AgentCommand[];
  /** Agent Skills (`skillFromContent` / `createSkill`), named `<module>-<skill>`; shown only to tenants that enabled the module. */
  readonly skills?: readonly InlineSkill[];
  /** Workflows `<module>-<name>` with their policy (SP5 spec §3.1): `startable` from `/v1`, `schedulable` by tenant schedules. */
  readonly workflows?: readonly ModuleWorkflow[];
};

export type AgentModuleErrorCode = "INVALID_MODULE_ID" | "UNPREFIXED_CAPABILITY" | "DUPLICATE_CAPABILITY" | "UNKNOWN_CAPABILITY_REF" | "MANIFEST_MISMATCH";

/** Boot error: a module's agent manifest is inconsistent (decision 0019). */
export class AgentModuleError extends Error {
  readonly code: AgentModuleErrorCode;
  readonly moduleId: string;
  readonly capabilityId?: string;

  constructor(args: { code: AgentModuleErrorCode; moduleId: string; capabilityId?: string }) {
    super(`${args.code}: module ${args.moduleId}${args.capabilityId === undefined ? "" : ` capability ${args.capabilityId}`}`);
    this.name = "AgentModuleError";
    this.code = args.code;
    this.moduleId = args.moduleId;
    if (args.capabilityId !== undefined) this.capabilityId = args.capabilityId;
  }
}

const MODULE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const RESERVED_MODULE_IDS = new Set(["core", "platform"]);

const isPrefixed = (moduleId: string, capabilityId: string): boolean =>
  capabilityId.startsWith(`${moduleId}.`) || capabilityId.startsWith(`${moduleId}-`);

const checkCapabilities = (moduleId: string, ids: readonly string[]): void => {
  const seen = new Set<string>();
  for (const id of ids) {
    if (!isPrefixed(moduleId, id)) throw new AgentModuleError({ code: "UNPREFIXED_CAPABILITY", moduleId, capabilityId: id });
    if (seen.has(id)) throw new AgentModuleError({ code: "DUPLICATE_CAPABILITY", moduleId, capabilityId: id });
    seen.add(id);
  }
};

// Every ref the manifest names needs an implementation, and nothing is implemented unnamed.
const checkManifest = (module: AgentModule, kind: "agents" | "tools" | "workflows" | "skills", implemented: readonly string[]): void => {
  const manifest = module.manifest;
  if (manifest === undefined) return;
  const refs = new Set((manifest[kind] ?? []).map((ref) => ref.id));
  const unknown = [...refs].find((ref) => !implemented.includes(ref));
  if (unknown !== undefined) throw new AgentModuleError({ code: "UNKNOWN_CAPABILITY_REF", moduleId: module.id, capabilityId: unknown });
  const unnamed = implemented.find((id) => !refs.has(id));
  if (unnamed !== undefined) throw new AgentModuleError({ code: "MANIFEST_MISMATCH", moduleId: module.id, capabilityId: unnamed });
};

// Commands are mutations named after their module's command contract (`command.<module>.<Name>`).
const checkCommands = (module: AgentModule): void => {
  const seen = new Set<string>();
  for (const { tool } of module.commands ?? []) {
    const named = tool.id.startsWith(`command.${module.id}.`) && tool.kind === "mutation";
    if (!named) throw new AgentModuleError({ code: "UNPREFIXED_CAPABILITY", moduleId: module.id, capabilityId: tool.id });
    if (seen.has(tool.id)) throw new AgentModuleError({ code: "DUPLICATE_CAPABILITY", moduleId: module.id, capabilityId: tool.id });
    seen.add(tool.id);
  }
};

/**
 * Declares a module's agent capabilities; validated at boot.
 * @throws {AgentModuleError} for an invalid or reserved id, an unprefixed or
 *   duplicated capability, or a manifest ref without implementation.
 */
export const defineAgentModule = (module: AgentModule): AgentModule => {
  if (!MODULE_ID_PATTERN.test(module.id) || RESERVED_MODULE_IDS.has(module.id)) {
    throw new AgentModuleError({ code: "INVALID_MODULE_ID", moduleId: module.id });
  }
  if (module.manifest !== undefined && module.manifest.id !== module.id) throw new AgentModuleError({ code: "MANIFEST_MISMATCH", moduleId: module.id });
  const agentIds = (module.agents ?? []).map((agent) => agent.id);
  const toolIds = (module.tools ?? []).map((tool) => tool.id);
  checkCapabilities(module.id, agentIds);
  checkCapabilities(module.id, toolIds);
  checkManifest(module, "agents", agentIds);
  checkManifest(module, "tools", toolIds);
  checkCommands(module);
  const skillNames = (module.skills ?? []).map((skill) => skill.name);
  const workflowIds = (module.workflows ?? []).map((entry) => workflowIdOf(entry.workflow));
  checkCapabilities(module.id, skillNames);
  checkCapabilities(module.id, workflowIds);
  checkManifest(module, "skills", skillNames);
  checkManifest(module, "workflows", workflowIds);
  return module;
};
