import type { EvalExperimentSummary } from "@core/contracts";

/**
 * Export of eval experiment summaries to the warehouse (BigQuery `ai_observability.eval_runs`,
 * decision 0040) outside `local`; a logging no-op in `local`. One row per experiment and scorer.
 * @returns the number of rows sent.
 */
export type EvalRunSink = {
  readonly exportSummaries: (summaries: readonly EvalExperimentSummary[]) => Promise<number>;
};
