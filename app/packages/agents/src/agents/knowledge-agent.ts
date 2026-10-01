import { Agent } from "@mastra/core/agent";
import { AgentRuntimeContextSchema } from "../context/write-agent-context.ts";
import { createCitationGuard } from "../processors/citation-guard.ts";
import type { AgentDefinition } from "../runtime/agent-module.ts";
import { CORE_SKILLS } from "../skills/resolve-skills.ts";
import { CATALOG_READ_PERMISSION } from "../tools/catalog/ai-catalog-reader.ts";
import { KNOWLEDGE_READ_PERMISSION, SEARCH_KNOWLEDGE_TOOL_ID } from "../tools/knowledge/search-knowledge.tool.ts";
import { loadInstructions } from "./load-instructions.ts";

export const KNOWLEDGE_AGENT_ID = "knowledge";
export const KNOWLEDGE_INSTRUCTIONS = "knowledge.v1";
/** Subagents run at most 6 steps (spec §6). */
export const KNOWLEDGE_AGENT_MAX_STEPS = 6;

/**
 * `knowledge` subagent (spec §6): answers from the knowledge base with a citation per
 * claim. Tool: `knowledge.searchKnowledge`. Ceiling: `core.knowledge.read` (plus
 * `core.catalog.read`, which lets the search include visible catalog documents).
 * The citation guard strips citations of passages not retrieved in the turn and
 * marks uncited answers `confidence: "low"`. Reached only through the supervisor
 * (`agent-knowledge`, Task 20), so it runs the `delegated` guardrail profile.
 * @param instructionsDirs directories tried first for `knowledge.v1.md` (bundled copy).
 */
export const createKnowledgeAgentDefinition = (options: { readonly instructionsDirs?: readonly string[] } = {}): AgentDefinition => ({
  id: KNOWLEDGE_AGENT_ID,
  role: "subagent",
  ceiling: ["core.chat.use", KNOWLEDGE_READ_PERMISSION, CATALOG_READ_PERMISSION],
  catalog: { tools: [SEARCH_KNOWLEDGE_TOOL_ID], skills: [CORE_SKILLS.knowledgeCitations] },
  create: ({ models, tools, guardrails, skills, instructions }) => {
    const profile = guardrails("delegated");
    return new Agent({
      id: KNOWLEDGE_AGENT_ID,
      name: "Knowledge",
      description: "Answers questions about the organization's documents and data catalog from the knowledge base, citing every claim.",
      instructions: instructions(KNOWLEDGE_AGENT_ID, loadInstructions(KNOWLEDGE_INSTRUCTIONS, options.instructionsDirs)),
      model: models.language("chat", { agentId: KNOWLEDGE_AGENT_ID }),
      tools: tools.toMastraTools([SEARCH_KNOWLEDGE_TOOL_ID]),
      skills: skills([CORE_SKILLS.knowledgeCitations]),
      inputProcessors: profile.inputProcessors,
      outputProcessors: [createCitationGuard(), ...profile.outputProcessors],
      defaultOptions: { maxSteps: KNOWLEDGE_AGENT_MAX_STEPS },
      requestContextSchema: AgentRuntimeContextSchema,
    });
  },
});
