import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { type EvalRunRecord, EvalRunRecordSchema } from "@core/agents";
import { z } from "zod";

/** The parts of an `app/.evals/<agent>.json` report (SP3 Task 27) a published run keeps. */
const ReportSchema = z.object({
  agentId: z.string(),
  dataset: z.object({ name: z.string(), version: z.number(), itemCount: z.number() }),
  verdict: z.enum(["passed", "failed"]),
  startedAt: z.string(),
  finishedAt: z.string(),
  gate: z.object({ scorers: z.array(z.object({ scorerId: z.string(), mean: z.number().nullable(), floor: z.number() })) }),
  bigqueryRows: z.array(z.object({ git_sha: z.string().nullable() })),
});

/** A CI report as the experiment record of the console (decision 0040); `null` for a file that is not a report. */
export const toEvalRunRecord = (raw: unknown): EvalRunRecord | null => {
  const report = ReportSchema.safeParse(raw);
  if (!report.success) return null;
  const { data } = report;
  const record = EvalRunRecordSchema.safeParse({
    agentId: data.agentId,
    datasetName: data.dataset.name,
    datasetVersion: data.dataset.version,
    itemCount: data.dataset.itemCount,
    scores: data.gate.scorers.flatMap((scorer) => (scorer.mean === null ? [] : [{ scorer: scorer.scorerId, mean: scorer.mean, baseline: Math.max(0, scorer.floor) }])),
    verdict: data.verdict,
    source: "ci",
    promptVersionId: null,
    gitSha: data.bigqueryRows[0]?.git_sha ?? null,
    startedAt: data.startedAt,
    finishedAt: data.finishedAt,
  });
  return record.success ? record.data : null;
};

/**
 * `pnpm evals:publish`: posts each eval report of `dir` to `<target>/console/eval-runs`, where the
 * runtime records it as a completed experiment (`/admin/evals` lists it, `eval-export` exports it).
 * Without a target it does nothing, so CI runs without one stay green.
 */
export const publishEvalRuns = async (args: {
  readonly dir: string;
  readonly targetUrl: string | undefined;
  readonly fetch?: typeof fetch;
  readonly authorization?: string;
}): Promise<{ readonly published: string[]; readonly skipped: string[] }> => {
  if (args.targetUrl === undefined || args.targetUrl === "") return { published: [], skipped: [] };
  const fetchFn = args.fetch ?? fetch;
  const files = readdirSync(args.dir).filter((file) => file.endsWith(".json")).sort();
  const published: string[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    const record = toEvalRunRecord(JSON.parse(readFileSync(path.join(args.dir, file), "utf8")));
    if (record === null) {
      skipped.push(file);
      continue;
    }
    const headers: Record<string, string> = { "content-type": "application/json", ...(args.authorization === undefined ? {} : { authorization: args.authorization }) };
    const response = await fetchFn(`${args.targetUrl.replace(/\/+$/, "")}/console/eval-runs`, { method: "POST", headers, body: JSON.stringify(record) });
    if (!response.ok) throw new Error(`publishing ${file} failed with HTTP ${response.status}`);
    published.push(file);
  }
  return { published, skipped };
};
