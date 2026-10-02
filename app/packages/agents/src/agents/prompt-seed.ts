import { PROMPT_AGENT_IDS, type PromptAgentId } from "@core/contracts";
import { loadInstructions } from "./load-instructions.ts";

export type PromptSeed = { readonly agentId: PromptAgentId; readonly body: string };

const isPromptAgentId = (value: string): value is PromptAgentId => (PROMPT_AGENT_IDS as readonly string[]).includes(value);

/**
 * The code-defined instructions of an agent with a versioned prompt (`instructions/<agent>.v1.md`,
 * the seed `seed:local` imports as version 1, decision 0038). `/admin` prefills the prompt editor
 * with it when the store has no version yet (follow-up 86). Any other id answers `null`.
 * @param dirs directories tried first (the bundled copy of `apps/mastra`).
 */
export const createPromptSeedReader =
  (dirs?: readonly string[]) =>
  (agentId: string): PromptSeed | null =>
    isPromptAgentId(agentId) ? { agentId, body: loadInstructions(`${agentId}.v1`, dirs) } : null;
