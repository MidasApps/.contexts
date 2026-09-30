import { runEvals, type RunEvalsResult } from "@mastra/core/evals";
import { uuidv7 } from "../observability/uuidv7.ts";
import type { CoreScorer } from "../scorers/core-scorers.ts";
import { type Baseline, baselineFor, evaluateGate, loadBaseline, type ResolvedBaseline } from "./eval-baseline.ts";
import { type EvalDataset, loadEvalDataset } from "./eval-dataset.ts";
import type { EvalHarness } from "./eval-harness.ts";
import { buildEvalReport, type CaseResult, type EvalReport, type ScorerSummary, writeEvalReport } from "./eval-report.ts";

/** Parallel cases per run: fake runs are CPU-bound, real runs stay under provider rate limits. */
export const EVAL_CONCURRENCY = 4;

export type AgentEvalOutcome = { readonly report: EvalReport; readonly reportPath: string | null; readonly result: RunEvalsResult };

// Baselined scorers run with their floor as threshold, so `runEvals` gives the same verdict as the gate.
const scorerEntries = (scorers: readonly CoreScorer[], baseline: ResolvedBaseline) =>
  scorers.map((scorer) => {
    const entry = baseline[scorer.id];
    return entry === undefined ? scorer : { scorer, threshold: Math.round((entry.minimum - entry.tolerance) * 10_000) / 10_000 };
  });

const numberOrNull = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** Longest answer excerpt kept per case in the report (fixture data only, never tenant data). */
const ANSWER_EXCERPT_CHARS = 300;

const caseResultOf = (caseId: string, targetResult: unknown, scorerResults: unknown): CaseResult => {
  const results = typeof scorerResults === "object" && scorerResults !== null ? (scorerResults as Record<string, { score?: unknown } | undefined>) : {};
  const text = typeof targetResult === "object" && targetResult !== null ? (targetResult as { text?: unknown }).text : undefined;
  return {
    caseId,
    scores: Object.fromEntries(Object.entries(results).map(([id, result]) => [id, numberOrNull(result?.score)])),
    answerExcerpt: typeof text === "string" ? text.slice(0, ANSWER_EXCERPT_CHARS) : "",
  };
};

const summariesOf = (scorers: readonly CoreScorer[], result: RunEvalsResult): ScorerSummary[] =>
  scorers.map((scorer) => ({
    scorerId: scorer.id,
    mean: numberOrNull(result.scores[scorer.id]),
    notScorable: result.summary.notScorable?.[scorer.id] ?? 0,
  }));

/**
 * Runs one agent's eval set with every harness scorer (decision 0028), gates the mean
 * per scorer against `evals/baselines/<agent>.json` and writes the JSON report.
 * @param args.dataset / args.baseline test seams; default to the committed files.
 */
export const runAgentEvals = async (args: {
  readonly agentId: string;
  readonly harness: EvalHarness;
  readonly dataset?: EvalDataset;
  readonly baseline?: Baseline;
  readonly reportDir?: string | null;
  readonly gitSha?: string | null;
  readonly now?: () => Date;
}): Promise<AgentEvalOutcome> => {
  const now = args.now ?? (() => new Date());
  const dataset = args.dataset ?? loadEvalDataset(args.agentId);
  const baseline = baselineFor(args.baseline ?? loadBaseline(args.agentId), args.harness.mode);
  const scorers = Object.values(args.harness.scorers);
  const startedAt = now();
  const data = dataset.cases.map((item) => ({ input: item.input, groundTruth: item.groundTruth, requestContext: args.harness.requestContext() }));
  const caseIds = new Map<object, string>(data.map((item, index) => [item, dataset.cases[index]?.id ?? String(index)]));
  const cases: CaseResult[] = [];
  const result = await runEvals({
    target: args.harness.mastra.getAgent(args.agentId),
    data,
    scorers: scorerEntries(scorers, baseline),
    concurrency: EVAL_CONCURRENCY,
    onItemComplete: ({ item, targetResult, scorerResults }) => {
      cases.push(caseResultOf(caseIds.get(item) ?? "unknown", targetResult, scorerResults));
    },
  });
  const summaries = summariesOf(scorers, result);
  const gate = evaluateGate({ means: Object.fromEntries(summaries.map((summary) => [summary.scorerId, summary.mean])), baseline });
  const report = buildEvalReport({
    runId: uuidv7(),
    dataset,
    mode: args.harness.mode,
    startedAt,
    finishedAt: now(),
    runEvalsVerdict: result.verdict ?? null,
    scorers: summaries,
    cases: [...cases].sort((left, right) => left.caseId.localeCompare(right.caseId)),
    gate,
    gitSha: args.gitSha ?? null,
  });
  const reportPath = args.reportDir === null ? null : writeEvalReport(report, args.reportDir);
  return { report, reportPath, result };
};
