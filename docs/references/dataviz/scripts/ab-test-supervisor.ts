/**
 * Sprint 3.B Task 13 — A/B harness for supervisor improvements.
 *
 * Usage (with `pnpm dev` running on :3005):
 *   tsx scripts/ab-test-supervisor.ts \
 *     --dataset scripts/datasets/supervisor-eval.jsonl \
 *     --out scripts/datasets/ab-results.csv \
 *     --concurrency 3
 *
 * The harness reads a JSONL dataset of synthetic conversations, sends each
 * one twice (flag OFF → baseline, flag ON → improved) to /api/chat, and
 * captures latency, token counts, observed phases, and two heuristic
 * quality signals (hasHypothesis / citesSource) into a CSV for offline
 * comparison. Authentication is intentionally not handled — run against
 * a dev environment with `NEXT_PUBLIC_FIREBASE_EMULATOR=true` or a stub
 * token.
 *
 * NOT registered in package.json scripts (per Sprint 3.B constraints —
 * package.json is protected). Invoke directly with `tsx` or `node --import tsx`.
 */

import { readFile, writeFile } from 'node:fs/promises';
import pLimit from 'p-limit';

interface DatasetEntry {
  id: string;
  scenario: string;
  phase: 'discovery' | 'diagnosis' | 'prescription' | 'monitoring';
  client: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
}

interface RunResult {
  id: string;
  variant: 'baseline' | 'improved';
  client: string;
  phase: string;
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  phasesObserved: string;
  hasHypothesis: boolean;
  citesSource: boolean;
  status: 'ok' | 'error';
  error?: string;
}

const HYPOTHESIS_REGEX = /hipótese|hypothesis/i;
const SOURCE_REGEX = /\[fonte|source:/i;

function parseArgs(): { dataset: string; out: string; concurrency: number; baseUrl: string } {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback?: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : fallback;
  };
  return {
    dataset: get('--dataset', 'scripts/datasets/supervisor-eval.jsonl')!,
    out: get('--out', 'scripts/datasets/ab-results.csv')!,
    concurrency: Number(get('--concurrency', '3')!),
    baseUrl: get('--base-url', 'http://localhost:3005')!,
  };
}

async function loadDataset(path: string): Promise<DatasetEntry[]> {
  const raw = await readFile(path, 'utf8');
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as DatasetEntry);
}

function clientToDataset(client: string): string {
  // Os códigos sintéticos do dataset eram os 4 acrônimos legados, mapeados
  // 1-para-1 para o dataset id. Com tenant id já em kebab-case, o lowercase
  // simples resolve — tenantDatasetSegment é quem sabe a regra do BigQuery.
  return client.trim().toLowerCase();
}

async function runOne(
  entry: DatasetEntry,
  variant: 'baseline' | 'improved',
  baseUrl: string,
): Promise<RunResult> {
  const t0 = Date.now();
  const dataset = clientToDataset(entry.client);

  const body = {
    messages: entry.messages.map((m, i) => ({
      id: `${entry.id}-${i}`,
      role: m.role,
      parts: [{ type: 'text', text: m.content }],
    })),
    dataset,
    page: '/dashboard',
    filters: {
      dateRange: { start: '2025-01-01', end: '2026-04-30' },
      projetos: [],
      advancedFilters: {
        ratings: [], elegibilidade: [], faixaLtv: [],
        faixaAtraso: [], tipoProponente: [], gruposRepasse: [],
      },
      compareEnabled: false,
      viewMode: 'snapshot',
    },
    useImprovedSupervisor: variant === 'improved',
    useVertexPromptCache: variant === 'improved',
  };

  let text = '';
  let phasesObserved = '';
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      return {
        id: entry.id,
        variant,
        client: entry.client,
        phase: entry.phase,
        durationMs: Date.now() - t0,
        tokensIn: 0,
        tokensOut: 0,
        phasesObserved: '',
        hasHypothesis: false,
        citesSource: false,
        status: 'error',
        error: `HTTP ${res.status}`,
      };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const phases = new Set<string>();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      text += chunk;
      // Best-effort phase observation from the AI SDK UI message stream lines.
      for (const line of chunk.split('\n')) {
        const m = line.match(/"phase"\s*:\s*"(\w+)"/);
        if (m) phases.add(m[1]);
        const tin = line.match(/"input_?tokens?"\s*:\s*(\d+)/i);
        if (tin) tokensIn += Number(tin[1]);
        const tout = line.match(/"output_?tokens?"\s*:\s*(\d+)/i);
        if (tout) tokensOut += Number(tout[1]);
      }
    }
    phasesObserved = Array.from(phases).join('|');
  } catch (err) {
    return {
      id: entry.id,
      variant,
      client: entry.client,
      phase: entry.phase,
      durationMs: Date.now() - t0,
      tokensIn,
      tokensOut,
      phasesObserved,
      hasHypothesis: false,
      citesSource: false,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return {
    id: entry.id,
    variant,
    client: entry.client,
    phase: entry.phase,
    durationMs: Date.now() - t0,
    tokensIn,
    tokensOut,
    phasesObserved,
    hasHypothesis: HYPOTHESIS_REGEX.test(text),
    citesSource: SOURCE_REGEX.test(text),
    status: 'ok',
  };
}

function toCsv(rows: RunResult[]): string {
  const header = [
    'id', 'variant', 'client', 'phase',
    'durationMs', 'tokensIn', 'tokensOut',
    'phasesObserved', 'hasHypothesis', 'citesSource',
    'status', 'error',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.id, r.variant, r.client, r.phase,
      r.durationMs, r.tokensIn, r.tokensOut,
      `"${r.phasesObserved}"`, r.hasHypothesis, r.citesSource,
      r.status, `"${(r.error ?? '').replace(/"/g, "'")}"`,
    ].join(','));
  }
  return lines.join('\n');
}

async function main() {
  const { dataset, out, concurrency, baseUrl } = parseArgs();
  const entries = await loadDataset(dataset);
  console.log(`[ab-test] Loaded ${entries.length} scenarios from ${dataset}`);
  console.log(`[ab-test] Concurrency: ${concurrency}, base URL: ${baseUrl}`);

  const limit = pLimit(concurrency);
  const tasks: Promise<RunResult>[] = [];
  for (const entry of entries) {
    tasks.push(limit(() => runOne(entry, 'baseline', baseUrl)));
    tasks.push(limit(() => runOne(entry, 'improved', baseUrl)));
  }

  const results = await Promise.all(tasks);
  await writeFile(out, toCsv(results), 'utf8');
  console.log(`[ab-test] Wrote ${results.length} rows to ${out}`);

  const okBaseline = results.filter((r) => r.variant === 'baseline' && r.status === 'ok').length;
  const okImproved = results.filter((r) => r.variant === 'improved' && r.status === 'ok').length;
  console.log(`[ab-test] OK baseline: ${okBaseline}/${entries.length}, improved: ${okImproved}/${entries.length}`);
}

if (process.argv[1] && process.argv[1].endsWith('ab-test-supervisor.ts')) {
  main().catch((err) => {
    console.error('[ab-test] FATAL', err);
    process.exit(1);
  });
}
