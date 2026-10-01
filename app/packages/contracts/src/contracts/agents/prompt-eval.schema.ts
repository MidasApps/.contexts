import { z } from "zod";
import { defineContract } from "../contract.ts";
import { none } from "../field-docs.ts";
import { PromptVersionIdSchema } from "./prompt-version.schema.ts";

/** Agents with a versioned prompt: the supervisor and the core subagents (seeds `instructions/<agent>.v1.md`). */
export const PROMPT_AGENT_IDS = ["assistant", "knowledge", "data", "action", "web"] as const;
export const PromptAgentIdSchema = z.enum(PROMPT_AGENT_IDS);
export type PromptAgentId = z.infer<typeof PromptAgentIdSchema>;

/** Verdict of a candidate prompt on its agent's eval set against the baseline (decision 0038). */
export const PromptEvalResultSchema = z.strictObject({
  versionId: PromptVersionIdSchema.meta(none("Evaluated version.")),
  experimentId: z.string().min(1).max(128).meta(none("Id of the eval run (recorded on the version).")),
  verdict: z.enum(["passed", "failed"]).meta(none("Gate verdict against the agent's baseline.")),
  scorers: z
    .array(
      z.strictObject({
        scorerId: z.string().min(1).meta(none("Scorer.")),
        mean: z.number().min(0).max(1).nullable().meta(none("Mean score; null when nothing was scorable.")),
        passed: z.boolean().meta(none("Whether the mean met the baseline floor.")),
      }),
    )
    .meta(none("Per-scorer gate results.")),
});
export type PromptEvalResult = z.infer<typeof PromptEvalResultSchema>;

export const PromptEvalResultContract = defineContract(PromptEvalResultSchema, {
  id: "agents.PromptEvalResult",
  kind: "view",
  description: "Result of running an agent's eval set with a candidate prompt; activation needs `passed`.",
  examples: [
    {
      versionId: "01927f3c-8b4a-7d2e-9f10-3a4b5c6d7e8f",
      experimentId: "01927f3e-0000-7000-8000-000000000001",
      verdict: "passed",
      scorers: [{ scorerId: "tool-routing", mean: 1, passed: true }],
    },
  ],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  permission: "core.prompt.write",
});
