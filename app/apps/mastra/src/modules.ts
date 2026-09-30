import type { AgentModule } from "@core/agents";

/**
 * Agent modules served by this Mastra app (spec §3.3, decision 0019): each
 * module's server entry exports a `defineAgentModule(...)` value, listed here
 * and only here (the core packages never import a module, umbrella D6). The
 * example module joins with SP3 Task 19.
 */
export const APP_MODULES: readonly AgentModule[] = [];
