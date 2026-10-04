import type { EvalExperimentSummary } from "@core/contracts";
import type { Logger } from "../../../shared/observability/logger.ts";
import type { EvalRunSink } from "../../application/ports/eval-run-sink.ts";

export const EVAL_RUNS_TABLE = "eval_runs";
const INSERT_BATCH = 500;

/** One row of `ai_observability.eval_runs` (DDL in `infra/bigquery/ai_observability.sql`). */
export type BigQueryEvalRunRow = {
  readonly experiment_id: string;
  readonly dataset_id: string;
  readonly agent_id: string;
  readonly prompt_version_id: string | null;
  readonly status: EvalExperimentSummary["status"];
  readonly verdict: EvalExperimentSummary["verdict"];
  readonly item_count: number;
  readonly scorer: string;
  readonly mean_score: number;
  readonly baseline_score: number | null;
  readonly started_at: string;
  readonly finished_at: string | null;
  readonly exported_at: string;
};

export type EvalRunsTableLike = {
  readonly insert: (
    rows: readonly { readonly insertId: string; readonly json: BigQueryEvalRunRow }[],
    options: { readonly raw: true; readonly skipInvalidRows: false; readonly ignoreUnknownValues: false },
  ) => Promise<unknown>;
};

/** Experiment → one row per scorer; an experiment without scores exports nothing. */
export const toEvalRunRows = (
  summary: EvalExperimentSummary,
  exportedAt: string,
): { insertId: string; json: BigQueryEvalRunRow }[] =>
  summary.scores.map((score) => ({
    insertId: `${summary.experimentId}:${score.scorer}:${summary.finishedAt ?? "running"}`,
    json: {
      experiment_id: summary.experimentId,
      dataset_id: summary.datasetId,
      agent_id: summary.agentId,
      prompt_version_id: summary.promptVersionId,
      status: summary.status,
      verdict: summary.verdict,
      item_count: summary.itemCount,
      scorer: score.scorer,
      mean_score: score.mean,
      baseline_score: score.baseline,
      started_at: summary.startedAt,
      finished_at: summary.finishedAt,
      exported_at: exportedAt,
    },
  }));

/** BigQuery `EvalRunSink`; an insert failure rejects (the daily run retries the window). */
export const createBigQueryEvalRunSink = (deps: {
  readonly table: EvalRunsTableLike;
  readonly now?: () => Date;
}): EvalRunSink => ({
  exportSummaries: async (summaries) => {
    const exportedAt = (deps.now ?? (() => new Date()))().toISOString();
    const rows = summaries.flatMap((summary) => toEvalRunRows(summary, exportedAt));
    for (let start = 0; start < rows.length; start += INSERT_BATCH) {
      await deps.table.insert(rows.slice(start, start + INSERT_BATCH), {
        raw: true,
        skipInvalidRows: false,
        ignoreUnknownValues: false,
      });
    }
    return rows.length;
  },
});

/** `local` (and `USAGE_SINK=none`): nothing leaves the machine; one log line per export. */
export const createNoopEvalRunSink = (logger: Pick<Logger, "info">): EvalRunSink => ({
  exportSummaries: (summaries) => {
    logger.info("eval_export_skipped", { experimentCount: summaries.length, sink: "none", table: EVAL_RUNS_TABLE });
    return Promise.resolve(0);
  },
});
