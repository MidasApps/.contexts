import type { CapabilityKind, CapabilityRef } from "@core/contracts";

/**
 * Agents, tools, workflows and skills the example module implements (umbrella D6, decision 0019).
 * Empty on purpose: SP3 names each capability here together with its `defineAgentModule()`
 * implementation, because a ref without an implementation is a boot error of the agent runtime.
 * Ids take the module prefix: `example-<name>` (agents, skills) or `example.<name>` (tools, workflows).
 */
export const EXAMPLE_CAPABILITIES: Readonly<Record<CapabilityKind, CapabilityRef[]>> = {
  agents: [],
  tools: [],
  workflows: [],
  skills: [],
};
