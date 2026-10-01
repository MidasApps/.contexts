import { Agent } from "@mastra/core/agent";
import { type RequestContextReader, readAgentContext } from "../context/agent-request-context.ts";
import { AgentRuntimeContextSchema } from "../context/write-agent-context.ts";
import type { AgentDefinition, AgentFactoryDeps } from "../runtime/agent-module.ts";
import { FIRECRAWL_TOOL_IDS } from "../tools/web/web-tools-runtime.ts";
import { SUBAGENT_MAX_STEPS } from "./data-agent.ts";
import { loadInstructions } from "./load-instructions.ts";
import { WEB_AGENT_KEY } from "./tenant-agent-settings.ts";

export const WEB_AGENT_ID = WEB_AGENT_KEY;
export const WEB_INSTRUCTIONS = "web.v1";
export const WEB_TOOLS_PERMISSION = "core.web-tools.use";

// Per run: browser connectors with the browser opt-in; Firecrawl tools with its opt-in and a key.
const webToolsOf = async (deps: AgentFactoryDeps, requestContext: RequestContextReader | undefined) => {
  const settings = await deps.tenantSettings(requestContext);
  const browser = settings.webTools.browser ? await deps.connectorTools(requestContext, "web") : {};
  const read = readAgentContext(requestContext);
  const hasFirecrawl = settings.webTools.firecrawl && read.ok && (await deps.webTools.clients.forTenant(read.data.context.tenantId)) !== null;
  return { ...browser, ...(hasFirecrawl ? deps.tools.toMastraTools(FIRECRAWL_TOOL_IDS) : {}) };
};

/**
 * `web` subagent (spec §6, §8.5): public web research. Offered to the supervisor only in
 * tenants that opted in (`agent-settings.webTools`), and `onDelegationStart` rejects it
 * otherwise. Its tools are resolved per run: the tenant's browser connectors (Task 22) with
 * `webTools.browser`, and Firecrawl `web.search`/`web.scrape` (Task 23) with
 * `webTools.firecrawl` and a key (the tenant's own or the platform's); either tool set is
 * absent otherwise.
 */
export const createWebAgentDefinition = (options: { readonly instructionsDirs?: readonly string[] } = {}): AgentDefinition => ({
  id: WEB_AGENT_ID,
  role: "subagent",
  ceiling: ["core.chat.use", WEB_TOOLS_PERMISSION],
  // Every web tool depends on the organization's opt-ins (browser connectors, Firecrawl).
  catalog: { tools: [], skills: [], perOrganizationTools: true },
  create: (deps) =>
    new Agent({
      id: WEB_AGENT_ID,
      name: "Web",
      description: "Researches public web pages and summarizes them with their addresses; browser actions ask the user for approval.",
      instructions: deps.instructions(WEB_AGENT_ID, loadInstructions(WEB_INSTRUCTIONS, options.instructionsDirs)),
      model: deps.models.language("chat", { agentId: WEB_AGENT_ID }),
      tools: ({ requestContext }) => webToolsOf(deps, requestContext),
      defaultOptions: { maxSteps: SUBAGENT_MAX_STEPS },
      requestContextSchema: AgentRuntimeContextSchema,
      ...deps.guardrails("delegated"),
    }),
});
