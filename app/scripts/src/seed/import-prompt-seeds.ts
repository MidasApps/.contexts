import { createHash } from "node:crypto";
import { loadInstructions, PROMPT_AGENT_IDS } from "@core/agents";
import type { PromptRepository } from "@core/services";

/** Author of the imported seeds (not a user: the code that shipped them). */
export const PROMPT_SEED_AUTHOR = "system:prompt-seeds";
export const PROMPT_SEED_REASON = "Code seed v1, gated by the CI eval suite (decision 0028).";

/**
 * Imports each agent's code seed (`instructions/<agent>.v1.md`) as platform version 1 and activates
 * it (decision 0038). Idempotent: an agent that already has a platform version is skipped, so a
 * rerun never adds a version or flips an activation staff made. The activation is marked forced
 * with a reason: the seed passed the CI eval gate, not a `run-prompt-eval` run.
 */
export const importPromptSeeds = async (deps: {
  readonly prompts: PromptRepository;
  readonly loadSeed?: (agentId: string) => string;
}): Promise<{ readonly imported: readonly string[]; readonly skipped: readonly string[] }> => {
  const loadSeed = deps.loadSeed ?? ((agentId: string) => loadInstructions(`${agentId}.v1`));
  const imported: string[] = [];
  const skipped: string[] = [];
  for (const agentId of PROMPT_AGENT_IDS) {
    const key = { agentId, scope: "platform" as const, tenantId: null };
    if ((await deps.prompts.listVersions(key)).length > 0) {
      skipped.push(agentId);
      continue;
    }
    const body = loadSeed(agentId);
    const version = await deps.prompts.insertVersion({ ...key, body, bodySha256: createHash("sha256").update(body, "utf8").digest("hex"), note: "Code seed v1.", createdBy: PROMPT_SEED_AUTHOR });
    await deps.prompts.insertActivation({ ...key, versionId: version.id, forced: true, reason: PROMPT_SEED_REASON, activatedBy: PROMPT_SEED_AUTHOR });
    imported.push(agentId);
  }
  return { imported, skipped };
};
