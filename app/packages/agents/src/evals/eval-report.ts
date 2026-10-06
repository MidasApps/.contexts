import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { GateResult } from "./eval-baseline.ts";
import type { EvalDataset } from "./eval-dataset.ts";
import type { EvalMode } from "./eval-harness.ts";

/** `app/.evals/` (git-ignored): one JSON report per agent and mode. */
export const EVAL_REPORT_DIR = path.resolve(import.meta.dirname, "../../../../.evals");
export const EVAL_REPORT_SCHEMA_VERSION = 1;

export type ScorerSummary = { readonly scorerId: string; readonly mean: number | null; readonly notScorable: number };

/** Per-case scores, so a failed gate points at the cases that moved. */
export type CaseResult = {
  readonly caseId: string;
  readonly scores: Readonly<Record<string, number | null>>;
  readonly answerExcerpt: string;
};

export type EvalReport = {
  readonly schemaVersion: number;
  readonly runId: string;
  readonly agentId: string;
  readonly dataset: {
    readonly name: string;
    readonly version: number;
    readonly sha256: string;
    readonly itemCount: number;
  };
  readonly mode: EvalMode;
  readonly startedAt: string;
  readonly finishedAt: string;
  /** Mastra `runEvals` verdict (thresholds = baseline floors). */
  readonly runEvalsVerdict: string | null;
  readonly verdict: "passed" | "failed";
  readonly scorers: readonly ScorerSummary[];
  readonly cases: readonly CaseResult[];
  readonly gate: GateResult;
  /** Rows for BigQuery `ai_observability.eval_runs` (SP5 exports them), snake_case per contracts/bigquery.md. */
  readonly bigqueryRows: readonly EvalRunRow[];
};

export type EvalRunRow = {
  readonly run_id: string;
  readonly agent_id: string;
  readonly dataset_name: string;
  readonly dataset_version: number;
  readonly dataset_sha256: string;
  readonly ai_mode: EvalMode;
  readonly scorer_id: string;
  readonly mean_score: number | null;
  readonly minimum_score: number | null;
  readonly tolerance: number | null;
  readonly gate_passed: boolean | null;
  readonly item_count: number;
  readonly not_scorable_count: number;
  readonly git_sha: string | null;
  readonly started_at: string;
  readonly finished_at: string;
};

const rowsOf = (report: Omit<EvalReport, "bigqueryRows">, gitSha: string | null): EvalRunRow[] =>
  report.scorers.map((scorer) => {
    const gate = report.gate.scorers.find((entry) => entry.scorerId === scorer.scorerId);
    return {
      run_id: report.runId,
      agent_id: report.agentId,
      dataset_name: report.dataset.name,
      dataset_version: report.dataset.version,
      dataset_sha256: report.dataset.sha256,
      ai_mode: report.mode,
      scorer_id: scorer.scorerId,
      mean_score: scorer.mean,
      minimum_score: gate?.minimum ?? null,
      tolerance: gate?.tolerance ?? null,
      gate_passed: gate?.passed ?? null,
      item_count: report.dataset.itemCount,
      not_scorable_count: scorer.notScorable,
      git_sha: gitSha,
      started_at: report.startedAt,
      finished_at: report.finishedAt,
    };
  });

export const buildEvalReport = (args: {
  readonly runId: string;
  readonly dataset: EvalDataset;
  readonly mode: EvalMode;
  readonly startedAt: Date;
  readonly finishedAt: Date;
  readonly runEvalsVerdict: string | null;
  readonly scorers: readonly ScorerSummary[];
  readonly cases: readonly CaseResult[];
  readonly gate: GateResult;
  readonly gitSha: string | null;
}): EvalReport => {
  const base = {
    schemaVersion: EVAL_REPORT_SCHEMA_VERSION,
    runId: args.runId,
    agentId: args.dataset.agentId,
    dataset: {
      name: args.dataset.name,
      version: args.dataset.version,
      sha256: args.dataset.sha256,
      itemCount: args.dataset.cases.length,
    },
    mode: args.mode,
    startedAt: args.startedAt.toISOString(),
    finishedAt: args.finishedAt.toISOString(),
    runEvalsVerdict: args.runEvalsVerdict,
    verdict: args.gate.passed && args.runEvalsVerdict === "passed" ? ("passed" as const) : ("failed" as const),
    scorers: args.scorers,
    cases: args.cases,
    gate: args.gate,
  };
  return { ...base, bigqueryRows: rowsOf(base, args.gitSha) };
};

/** Writes `<dir>/<agent>.json` (fake) or `<agent>.real.json`; returns the path. */
export const writeEvalReport = (report: EvalReport, dir: string = EVAL_REPORT_DIR): string => {
  mkdirSync(dir, { recursive: true });
  const file = path.join(
    dir,
    report.mode === "fake" ? `${report.agentId}.json` : `${report.agentId}.${report.mode}.json`,
  );
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return file;
};
