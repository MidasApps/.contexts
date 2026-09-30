import { Agent } from "@mastra/core/agent";
import { AgentRuntimeContextSchema } from "../context/write-agent-context.ts";
import type { AgentDefinition } from "../runtime/agent-module.ts";
import { CATALOG_READ_PERMISSION } from "../tools/catalog/ai-catalog-reader.ts";

export const PING_AGENT_ID = "ping";

/**
 * Smoke-test agent of the runtime (SP3 Task 7): proves auth → context →
 * model → tool → span end to end, on the fast role (fake model in tests).
 * The supervisor and subagents arrive in Task 20.
 */
export const PING_AGENT: AgentDefinition = {
  id: PING_AGENT_ID,
  ceiling: ["core.chat.use", CATALOG_READ_PERMISSION],
  create: ({ models, tools }) =>
    new Agent({
      id: PING_AGENT_ID,
      name: "Ping",
      description: "Answers a health check and can list the data contracts the caller may see.",
      instructions:
        "You are a health check. Answer in one short sentence in the caller's locale. " +
        "Use catalog.listEntities only when asked which data exists.",
      model: models.language("fast", { agentId: PING_AGENT_ID }),
      tools: tools.toMastraTools(["catalog.listEntities"]),
      requestContextSchema: AgentRuntimeContextSchema,
    }),
};
