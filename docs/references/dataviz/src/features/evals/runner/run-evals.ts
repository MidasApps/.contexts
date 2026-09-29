/**
 * Runner CLI de evals (Sprint 3.D, Task 11).
 *
 * Carrega dataset por suite (smoke|full|gold), executa scorers sobre cada
 * fixture com concorrencia limitada, agrega `p50/p95` por scorer e
 * opcionalmente persiste na collection Firestore `evalRuns` (Bulk F5).
 *
 * Uso:
 *   pnpm tsx src/features/evals/runner/run-evals.ts --suite=smoke
 *   pnpm tsx src/features/evals/runner/run-evals.ts --suite=full --dry-run
 *
 * Sem dependencia de `commander` — parsing simples por `process.argv`.
 */
import pLimit from 'p-limit';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  AgentOutput,
  BriefingFixture,
  EvalRun,
  Scorer,
  ScoreResult,
} from '../scorers/types';
import { SCORER_REGISTRY } from '../scorers';
import { BriefingFixtureArraySchema } from '../datasets/schema';
import type { RunOptions, SuiteName, RunSummary } from './types';
import { cacheKey, getCached, setCached } from './cache';
import { persistEvalRun } from './persist';
import { checkBudget } from './cost-budget';

/** Custo medio historico placeholder (Sprint 3.D Task 17).
 *
 * Em prod, este valor deve vir de query agregada sobre
 * `liquid_meta.eval_runs.cost_usd` (rolling 30d / count). Mantemos um
 * fallback estatico aqui para manter a CI determinista enquanto a
 * query real nao esta wired. */
const HISTORICAL_AVG_COST_USD_PER_CALL = 0.01;

const DEFAULT_AGENT_OUTPUT: AgentOutput = {
  sql: 'SELECT 1',
  layout: { blocks: [] },
  narrative: 'Stub agent output for runner validation.',
};

const DEFAULT_CONCURRENCY = 8;

export function defaultLoadDataset(suite: SuiteName): BriefingFixture[] {
  const file =
    suite === 'smoke' ? 'smoke-30.json'
    : suite === 'full' ? 'full-180.json'
    : 'gold-30.json';
  const path = join(process.cwd(), 'src/features/evals/datasets', file);
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return BriefingFixtureArraySchema.parse(raw) as BriefingFixture[];
}

/** Calcula percentil (linear interpolation) de uma lista de numeros. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

export interface RunEvalsDeps {
  agentOutput?: AgentOutput;
  /** Persistência injetável (default: persistEvalRun). Facilita teste e wire alternativo. */
  persist?: (args: { run: EvalRun }) => Promise<void>;
}

export async function runEvals(
  options: RunOptions,
  deps: RunEvalsDeps = {},
): Promise<RunSummary> {
  const {
    suite,
    concurrency = DEFAULT_CONCURRENCY,
    dryRun = true,
    loadDataset = defaultLoadDataset,
    scorers = SCORER_REGISTRY as unknown as Record<string, Scorer>,
    glossaryVersion = process.env.GLOSSARY_VERSION ?? 'v0',
    regulatoryPackVersion = process.env.REGULATORY_PACK_VERSION ?? 'v0',
    judgeModelVersion = process.env.JUDGE_MODEL_VERSION ?? 'gemini-2.5-pro',
  } = options;

  const fixtures = loadDataset(suite);
  const scorerEntries = Object.entries(scorers);

  // Sprint 3.D Task 17 — pre-check de orcamento.
  const plannedCalls = fixtures.length * scorerEntries.length;
  const budget = checkBudget({
    historicalAvgCostUsdPerCall: HISTORICAL_AVG_COST_USD_PER_CALL,
    plannedCalls,
  });
  if (budget.alert) {
    console.warn(
      `[run-evals] cost budget ALERT: estimated $${budget.estimatedUsd.toFixed(2)} ` +
        `vs budget $${budget.budgetUsd.toFixed(2)} ` +
        `(plannedCalls=${plannedCalls}, blocked=${budget.blocked})`,
    );
  }
  if (budget.blocked) {
    throw new Error(
      `run-evals: cost budget BLOCKED — estimated $${budget.estimatedUsd.toFixed(2)} ` +
        `> 1.2x budget ($${budget.budgetUsd.toFixed(2)}). ` +
        `Aprovacao manual exigida (ver src/features/evals/README.md).`,
    );
  }

  const limit = pLimit(concurrency);
  const startedAt = new Date().toISOString();
  const runId = randomUUID();
  const agentOutput = deps.agentOutput ?? DEFAULT_AGENT_OUTPUT;

  const tasks: Array<Promise<EvalRun['results'][number]>> = [];

  for (const fixture of fixtures) {
    for (const [scorerName, scorer] of scorerEntries) {
      tasks.push(
        limit(async () => {
          const key = cacheKey({
            briefingId: fixture.id,
            scorerName,
            judgeModelVersion,
            glossaryVersion,
            regulatoryPackVersion,
          });
          let result: ScoreResult | undefined = getCached(key);
          const t0 = Date.now();
          if (!result) {
            result = await scorer.run({
              briefing: fixture,
              agentOutput,
              context: {
                clientId: fixture.clientId,
                personaId: fixture.personaId,
                macroAsOf: new Date().toISOString().slice(0, 10),
              },
            });
            setCached(key, result);
          }
          const durationMs = Date.now() - t0;
          const meta = (result.metadata ?? {}) as Record<string, unknown>;
          return {
            fixtureId: fixture.id,
            scorerName,
            score: result.score,
            rationale: result.rationale,
            durationMs,
            tokensIn: typeof meta.tokensIn === 'number' ? meta.tokensIn : undefined,
            tokensOut: typeof meta.tokensOut === 'number' ? meta.tokensOut : undefined,
            costUsd: typeof meta.costUsd === 'number' ? meta.costUsd : undefined,
            clientId: fixture.clientId,
            personaId: fixture.personaId,
          };
        }),
      );
    }
  }

  const results = await Promise.all(tasks);
  const finishedAt = new Date().toISOString();

  // Aggregate p50/p95 per scorer.
  const byScorer = new Map<string, number[]>();
  let totalCost = 0;
  for (const r of results) {
    if (!byScorer.has(r.scorerName)) byScorer.set(r.scorerName, []);
    byScorer.get(r.scorerName)!.push(r.score);
    if (typeof r.costUsd === 'number') totalCost += r.costUsd;
  }
  const p50: Record<string, number> = {};
  const p95: Record<string, number> = {};
  for (const [name, scores] of byScorer) {
    p50[name] = percentile(scores, 50);
    p95[name] = percentile(scores, 95);
  }

  const run: EvalRun = {
    runId,
    startedAt,
    finishedAt,
    suite,
    judgeModelVersion,
    glossaryVersion,
    regulatoryPackVersion,
    results,
    totals: { p50, p95, costUsd: totalCost },
  };

  if (!dryRun) {
    const persist = deps.persist ?? persistEvalRun;
    await persist({ run });
  }

  return {
    ...run,
    totalFixtures: fixtures.length,
    totalScorers: scorerEntries.length,
  };
}

// ----- CLI entrypoint -----
export function parseArgs(argv: string[]): RunOptions {
  const opts: Partial<RunOptions> & { suite: SuiteName } = { suite: 'smoke' };
  for (const arg of argv) {
    if (arg.startsWith('--suite=')) {
      const v = arg.slice('--suite='.length);
      if (v !== 'smoke' && v !== 'full' && v !== 'gold') {
        throw new Error(`invalid suite: ${v}`);
      }
      opts.suite = v;
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--persist') {
      opts.dryRun = false;
    } else if (arg.startsWith('--concurrency=')) {
      opts.concurrency = Number.parseInt(arg.slice('--concurrency='.length), 10);
    }
  }
  return opts as RunOptions;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.dryRun === false) {
    console.warn(
      '[run-evals] PERSISTINDO com DEFAULT_AGENT_OUTPUT (stub). ' +
        'Os scores refletem o stub, não o agente real — faça o wire de agentOutput antes de confiar nos painéis (a6-ia-05, follow-up).',
    );
  }
  const summary = await runEvals(opts);
  console.log(JSON.stringify({
    runId: summary.runId,
    suite: summary.suite,
    totalFixtures: summary.totalFixtures,
    totalScorers: summary.totalScorers,
    p50: summary.totals.p50,
    p95: summary.totals.p95,
    costUsd: summary.totals.costUsd,
  }, null, 2));
}

// Detect direct execution (vs import) via import.meta.url
const isMain = (() => {
  try {
    const argv1 = process.argv[1];
    if (!argv1) return false;
    return import.meta.url.endsWith(argv1.split('/').pop() ?? '__never__');
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((err) => {
    console.error('[run-evals] FAILED:', err);
    process.exit(2);
  });
}
