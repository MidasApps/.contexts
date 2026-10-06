import { Agent } from "@mastra/core/agent";
import { ToolCallFilter } from "@mastra/core/processors";
import { AgentRuntimeContextSchema } from "../context/write-agent-context.ts";
import type { AgentDefinition } from "../runtime/agent-module.ts";
import { CORE_SKILLS } from "../skills/resolve-skills.ts";
import { CATALOG_READ_PERMISSION } from "../tools/catalog/ai-catalog-reader.ts";
import { CATALOG_QUERY_PERMISSION } from "../tools/sql/query-semantic-sql.tool.ts";
import { loadInstructions } from "./load-instructions.ts";

export const DATA_AGENT_ID = "data";
export const DATA_INSTRUCTIONS = "data.v1";
/** Subagents run at most 6 steps (spec §6). */
export const SUBAGENT_MAX_STEPS = 6;

export const DATA_AGENT_TOOLS = [
  "catalog.listEntities",
  "catalog.describeEntity",
  "catalog.renderForm",
  "sql.querySemanticSql",
] as const;

/**
 * `data` subagent (spec §6, §8.2, §8.3): explains the data catalog, runs read-only SQL
 * over semantic views and asks the chat to render forms. Ceiling: `core.catalog.read`,
 * `core.catalog.query` (renderForm checks the command permission itself). Reached only
 * through the supervisor, so it runs the `delegated` guardrail profile.
 */
export const createDataAgentDefinition = (
  options: { readonly instructionsDirs?: readonly string[] } = {},
): AgentDefinition => ({
  id: DATA_AGENT_ID,
  role: "subagent",
  ceiling: ["core.chat.use", CATALOG_READ_PERMISSION, CATALOG_QUERY_PERMISSION],
  catalog: { tools: DATA_AGENT_TOOLS, skills: [CORE_SKILLS.dataCatalog], perOrganizationTools: true },
  create: ({ models, tools, guardrails, skills, connectorTools, instructions }) => {
    const profile = guardrails("delegated");
    return new Agent({
      id: DATA_AGENT_ID,
      name: "Data",
      description:
        "Explains which data the organization has, describes record types, answers questions with read-only SQL over semantic views and shows forms to create or change records.",
      instructions: instructions(DATA_AGENT_ID, loadInstructions(DATA_INSTRUCTIONS, options.instructionsDirs)),
      model: models.language("chat", { agentId: DATA_AGENT_ID }),
      // Static data tools plus the tenant's Postgres connectors (resolved per run from the server context).
      tools: async ({ requestContext }) => ({
        ...tools.toMastraTools(DATA_AGENT_TOOLS),
        ...(await connectorTools(requestContext, "data")),
      }),
      skills: skills([CORE_SKILLS.dataCatalog]),
      // Old tool payloads (catalog dumps, query rows) leave the history; the current turn keeps them.
      inputProcessors: [...profile.inputProcessors, new ToolCallFilter()],
      outputProcessors: profile.outputProcessors,
      defaultOptions: { maxSteps: SUBAGENT_MAX_STEPS },
      requestContextSchema: AgentRuntimeContextSchema,
    });
  },
});
