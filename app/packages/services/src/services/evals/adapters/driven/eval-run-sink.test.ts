import { type EvalExperimentSummary, EvalExperimentSummaryContract } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { createBigQueryEvalRunSink, createNoopEvalRunSink, type EvalRunsTableLike } from "./eval-run-sink.ts";

const [example] = EvalExperimentSummaryContract.meta.examples as [EvalExperimentSummary];
const summary: EvalExperimentSummary = {
  ...example,
  scores: [
    { scorer: "tool-routing", mean: 0.94, baseline: 0.9 },
    { scorer: "faithfulness", mean: 0.88, baseline: null },
  ],
};

const fakeTable = () => {
  const inserts: Parameters<EvalRunsTableLike["insert"]>[] = [];
  const table: EvalRunsTableLike = {
    insert: (rows, options) => {
      inserts.push([rows, options]);
      return Promise.resolve();
    },
  };
  return { table, inserts };
};

describe("eval run sink", () => {
  it("maps an experiment summary to one eval_runs row per scorer", async () => {
    const { table, inserts } = fakeTable();
    const sink = createBigQueryEvalRunSink({ table, now: () => new Date("2026-10-01T05:00:00.000Z") });
    expect(await sink.exportSummaries([summary])).toBe(2);
    const [[rows, options]] = inserts as [Parameters<EvalRunsTableLike["insert"]>];
    expect(options).toEqual({ raw: true, skipInvalidRows: false, ignoreUnknownValues: false });
    expect(rows.map((row) => row.insertId)).toEqual([
      `${summary.experimentId}:tool-routing:${summary.finishedAt ?? ""}`,
      `${summary.experimentId}:faithfulness:${summary.finishedAt ?? ""}`,
    ]);
    expect(rows[0]?.json).toEqual({
      experiment_id: summary.experimentId,
      dataset_id: summary.datasetId,
      agent_id: summary.agentId,
      prompt_version_id: null,
      status: "completed",
      verdict: "passed",
      item_count: summary.itemCount,
      scorer: "tool-routing",
      mean_score: 0.94,
      baseline_score: 0.9,
      started_at: summary.startedAt,
      finished_at: summary.finishedAt,
      exported_at: "2026-10-01T05:00:00.000Z",
    });
    expect(rows[1]?.json.baseline_score).toBeNull();
  });

  it("sends nothing for an experiment without scores, and the local sink sends nothing at all", async () => {
    const { table, inserts } = fakeTable();
    expect(await createBigQueryEvalRunSink({ table }).exportSummaries([{ ...summary, scores: [] }])).toBe(0);
    expect(inserts).toEqual([]);
    const lines: unknown[] = [];
    expect(
      await createNoopEvalRunSink({ info: (message, fields) => lines.push([message, fields]) }).exportSummaries([
        summary,
      ]),
    ).toBe(0);
    expect(lines).toEqual([["eval_export_skipped", { experimentCount: 1, sink: "none", table: "eval_runs" }]]);
  });
});
