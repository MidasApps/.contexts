import type { Agent } from "@mastra/core/agent";
import type { AgentModels } from "../models/model-factory.ts";
import type { GuardrailProfile, GuardrailProfileKind } from "../processors/guardrail-profile.ts";
import type { CoreToolDefinition } from "../tools/define-core-tool.ts";
import type { ToolRegistry } from "../tools/tool-registry.ts";
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
};

export type AgentDefinition = {
  /** Mastra agent id and key (`/api/agents/<id>`). Module agents are prefixed by the module id. */
  readonly id: string;
  /** Permissions the agent may ever use: tool calls run with context permissions ∩ ceiling. */
  readonly ceiling: readonly string[];
  readonly create: (deps: AgentFactoryDeps) => Agent;
};

/** The capability refs of an SP2 `defineModule()` manifest (structural, data only). */
export type AgentCapabilityManifest = {
  readonly id: string;
  readonly agents?: readonly { readonly id: string }[];
  readonly tools?: readonly { readonly id: string }[];
};

export type AgentModule = {
  readonly id: string;
  /** The module's manifest: every agent and tool it names must be implemented here. */
  readonly manifest?: AgentCapabilityManifest;
  readonly agents?: readonly AgentDefinition[];
  readonly tools?: readonly CoreToolDefinition[];
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
const checkManifest = (module: AgentModule, kind: "agents" | "tools", implemented: readonly string[]): void => {
  const manifest = module.manifest;
  if (manifest === undefined) return;
  const refs = new Set((manifest[kind] ?? []).map((ref) => ref.id));
  const unknown = [...refs].find((ref) => !implemented.includes(ref));
  if (unknown !== undefined) throw new AgentModuleError({ code: "UNKNOWN_CAPABILITY_REF", moduleId: module.id, capabilityId: unknown });
  const unnamed = implemented.find((id) => !refs.has(id));
  if (unnamed !== undefined) throw new AgentModuleError({ code: "MANIFEST_MISMATCH", moduleId: module.id, capabilityId: unnamed });
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
  return module;
};
