import type { LanguageModelV4 } from "@ai-sdk/provider";
import type { MastraScorer } from "@mastra/core/evals";
import { createCitationsGroundedScorer } from "./citations-grounded.scorer.ts";
import { createFaithfulnessJudgeScorer } from "./faithfulness-judge.scorer.ts";
import { createFormatComplianceScorer } from "./format-compliance.scorer.ts";
import { createTenantLeakScorer } from "./tenant-leak.scorer.ts";
import { createToolRoutingScorer } from "./tool-routing.scorer.ts";

// Scorer generics differ per pipeline; the registry only needs the common surface
// (Mastra's own `MastraScorers` registry types them the same way).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CoreScorer = MastraScorer<string, any, any, any>;

/**
 * The core scorers by id (spec §13, decision 0028), for `new Mastra({ scorers })` and
 * the eval runner. The LLM judge is present only when a judge model is given (real mode).
 */
export const createCoreScorers = (
  options: { readonly foreignMarkers?: readonly string[]; readonly judgeModel?: LanguageModelV4 } = {},
): Record<string, CoreScorer> => {
  const scorers: CoreScorer[] = [
    createToolRoutingScorer(),
    createCitationsGroundedScorer(),
    createTenantLeakScorer(options.foreignMarkers === undefined ? {} : { foreignMarkers: options.foreignMarkers }),
    createFormatComplianceScorer(),
    ...(options.judgeModel === undefined ? [] : [createFaithfulnessJudgeScorer({ model: options.judgeModel })]),
  ];
  return Object.fromEntries(scorers.map((scorer) => [scorer.id, scorer]));
};
