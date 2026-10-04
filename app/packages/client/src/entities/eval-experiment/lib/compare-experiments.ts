import type { EvalExperimentSummary } from "@core/contracts";

export type ScoreOutcome = "better" | "worse" | "same" | "only-a" | "only-b";

export type ScoreComparison = {
  readonly scorer: string;
  /** Mean of experiment A (the reference); `null` when A did not run the scorer. */
  readonly a: number | null;
  readonly b: number | null;
  /** Baseline floor (B's, else A's); `null` when neither carries one. */
  readonly baseline: number | null;
  /** B relative to A. */
  readonly outcome: ScoreOutcome;
};

/** Differences below this are noise of the mean (scores are 0–1). */
const EPSILON = 0.0005;

const outcomeOf = (a: number | null, b: number | null): ScoreOutcome => {
  if (a === null) return "only-b";
  if (b === null) return "only-a";
  if (Math.abs(b - a) < EPSILON) return "same";
  return b > a ? "better" : "worse";
};

/**
 * Compares the mean score per scorer of two experiments (client-side: the API has no compare
 * endpoint). Scorers keep A's order, then the ones only B ran.
 */
export const compareExperiments = (a: EvalExperimentSummary, b: EvalExperimentSummary): ScoreComparison[] => {
  const scorers = [...new Set([...a.scores, ...b.scores].map((score) => score.scorer))];
  return scorers.map((scorer) => {
    const inA = a.scores.find((score) => score.scorer === scorer);
    const inB = b.scores.find((score) => score.scorer === scorer);
    const meanA = inA?.mean ?? null;
    const meanB = inB?.mean ?? null;
    return {
      scorer,
      a: meanA,
      b: meanB,
      baseline: inB?.baseline ?? inA?.baseline ?? null,
      outcome: outcomeOf(meanA, meanB),
    };
  });
};
