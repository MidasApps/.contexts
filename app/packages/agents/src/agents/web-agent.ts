import { Agent } from "@mastra/core/agent";
import { AgentRuntimeContextSchema } from "../context/write-agent-context.ts";
import type { AgentDefinition } from "../runtime/agent-module.ts";
import { SUBAGENT_MAX_STEPS } from "./data-agent.ts";
import { loadInstructions } from "./load-instructions.ts";
import { WEB_AGENT_KEY } from "./tenant-agent-settings.ts";

export const WEB_AGENT_ID = WEB_AGENT_KEY;
export const WEB_INSTRUCTIONS = "web.v1";
export const WEB_TOOLS_PERMISSION = "core.web-tools.use";

/**
 * `web` subagent (spec §6, §8.5): public web research. Offered to the supervisor only in
 * tenants that opted in (`agent-settings.webTools`), and `onDelegationStart` rejects it
 * otherwise. Its tools are resolved per run: the tenant's browser connectors (Task 22) and
 * Firecrawl search/scrape (Task 23).
 */
export const createWebAgentDefinition = (options: { readonly instructionsDirs?: readonly string[] } = {}): AgentDefinition => ({
  id: WEB_AGENT_ID,
  role: "subagent",
  ceiling: ["core.chat.use", WEB_TOOLS_PERMISSION],
  create: ({ models, guardrails }) =>
    new Agent({
      id: WEB_AGENT_ID,
      name: "Web",
      description: "Researches public web pages and summarizes them with their addresses; browser actions ask the user for approval.",
      instructions: loadInstructions(WEB_INSTRUCTIONS, options.instructionsDirs),
      model: models.language("chat", { agentId: WEB_AGENT_ID }),
      tools: {},
      defaultOptions: { maxSteps: SUBAGENT_MAX_STEPS },
      requestContextSchema: AgentRuntimeContextSchema,
      ...guardrails("delegated"),
    }),
});
