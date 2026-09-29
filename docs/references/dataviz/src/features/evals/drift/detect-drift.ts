/**
 * Sprint 3.D, Task 14 — detector de drift do judge LLM.
 * Bulk F5: backend migrado de BigQuery (`liquid_meta.judge_drift`) para
 * Firestore (collection `judgeDrift`).
 *
 * Compara `EvalRun` produzido pela suite=gold com o baseline humano em
 * `gold-30.json` (`goldScores`). Para cada par (fixture, scorer),
 * calcula `delta = judgeScore - humanBaseline`. Marca `alert` quando
 * `|delta| >= thresholdAbs` (default 0.1, override via env
 * `EVAL_DRIFT_THRESHOLD`).
 *
 * Quando `persist: true`, lê o `rolling3mAvgDelta` da collection Firestore
 * (filtrando por scorer/fixture nos últimos 90 dias) e grava as rows
 * novas via WriteBatch (chunk 500).
 *
 * `thresholdSigma` é mantido na assinatura para evolução futura (z-score
 * sobre série histórica). Por enquanto, `thresholdAbs` é o gate primário.
 */
import 'server-only';
import { Timestamp } from 'firebase-admin/firestore';
import type { WriteBatch } from 'firebase-admin/firestore';
import { getDb } from '@/shared/lib/firebase/admin';
import type { BriefingFixture, EvalRun } from '../scorers/types';
import { buildBaselineFromFixtures, loadGoldBaseline } from './baseline-loader';

export interface DriftRow {
  fixtureId: string;
  scorerName: string;
  judgeScore: number;
  humanBaseline: number;
  delta: number;
  alert: boolean;
  rolling3mAvgDelta?: number;
}

export interface DriftDetectorArgs {
  judgeRun: EvalRun;
  /** Baseline gold-30 (fixtures com goldScores). Default: lazy load. */
  goldDataset?: BriefingFixture[];
  thresholdAbs?: number;
  thresholdSigma?: number;
  /** Default false (Test/CI). Em prod CI rodamos com `persist: true`. */
  persist?: boolean;
  /** Override do "agora" para testes determinísticos. */
  now?: Date;
}

const COLLECTION = 'judgeDrift';
const BATCH_SIZE = 500;
const ROLLING_WINDOW_DAYS = 90;

function parseEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

interface DriftHistoryDoc {
  delta?: number;
}

async function loadRollingAvgDelta(args: {
  scorerName: string;
  fixtureId: string;
  threshold: Date;
}): Promise<number | undefined> {
  try {
    const db = getDb();
    const snap = await db
      .collection(COLLECTION)
      .where('detectedAt', '>', args.threshold)
      .where('scorerName', '==', args.scorerName)
      .where('fixtureId', '==', args.fixtureId)
      .get();
    const deltas: number[] = [];
    for (const d of snap.docs) {
      const data = d.data() as DriftHistoryDoc;
      if (typeof data.delta === 'number') deltas.push(data.delta);
    }
    if (deltas.length === 0) return undefined;
    const sum = deltas.reduce((a, b) => a + b, 0);
    return sum / deltas.length;
  } catch {
    // Silencioso: collection pode não existir ainda em primeira execução.
    return undefined;
  }
}

export async function detectDrift(
  args: DriftDetectorArgs,
): Promise<{ rows: DriftRow[]; alertCount: number }> {
  const { judgeRun, persist = false } = args;
  const thresholdAbs = args.thresholdAbs ?? parseEnvNumber('EVAL_DRIFT_THRESHOLD', 0.1);
  // Reservado para evolução (z-score). Disponível em metadata.
  const thresholdSigma = args.thresholdSigma ?? parseEnvNumber('EVAL_DRIFT_SIGMA', 2);
  void thresholdSigma;

  const fixtures = args.goldDataset ?? [];
  const baseline = fixtures.length > 0
    ? buildBaselineFromFixtures(fixtures)
    : await loadGoldBaseline();

  const rows: DriftRow[] = [];
  for (const r of judgeRun.results) {
    const human = baseline[r.fixtureId]?.[r.scorerName];
    if (typeof human !== 'number') continue; // sem baseline → ignora.
    const delta = r.score - human;
    rows.push({
      fixtureId: r.fixtureId,
      scorerName: r.scorerName,
      judgeScore: r.score,
      humanBaseline: human,
      delta,
      alert: Math.abs(delta) >= thresholdAbs,
    });
  }

  // Rolling 3m avg via Firestore (best-effort).
  const now = args.now ?? new Date();
  const rollingThreshold = new Date(now.getTime() - ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  for (const row of rows) {
    const avg = await loadRollingAvgDelta({
      scorerName: row.scorerName,
      fixtureId: row.fixtureId,
      threshold: rollingThreshold,
    });
    if (typeof avg === 'number') row.rolling3mAvgDelta = avg;
  }

  if (persist && rows.length > 0) {
    const db = getDb();
    const col = db.collection(COLLECTION);
    const detectedAt = Timestamp.fromDate(now);
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const slice = rows.slice(i, i + BATCH_SIZE);
      const batch: WriteBatch = db.batch();
      for (const row of slice) {
        const ref = col.doc();
        batch.set(ref, {
          detectedAt,
          judgeModelVersion: judgeRun.judgeModelVersion,
          scorerName: row.scorerName,
          fixtureId: row.fixtureId,
          judgeScore: row.judgeScore,
          humanBaseline: row.humanBaseline,
          delta: row.delta,
          alert: row.alert,
          rolling3mAvgDelta: row.rolling3mAvgDelta ?? null,
        });
      }
      await batch.commit();
    }
  }

  return { rows, alertCount: rows.filter((r) => r.alert).length };
}

/**
 * Resolve persistência do CLI de drift: `--persist` ou EVAL_DRIFT_PERSIST=1|true.
 *
 * `env` é tipado como `Record<string, string | undefined>` (não
 * `NodeJS.ProcessEnv`) porque o Next.js aumenta `ProcessEnv` globalmente com
 * `NODE_ENV` obrigatório, o que quebraria o type-check ao testar com objetos
 * literais simples. `process.env` continua atribuível aqui normalmente.
 */
export function shouldPersistFromEnv(argv: string[], env: Record<string, string | undefined>): boolean {
  if (argv.includes('--persist')) return true;
  const v = env.EVAL_DRIFT_PERSIST;
  return v === '1' || v === 'true';
}

// ----- CLI entrypoint -----
async function main() {
  // CLI: assume artifact `gold-output.json` produzido em job anterior do
  // workflow. Em ausência, sai com erro. CI já roda `--suite=gold` antes.
  const { readFileSync } = await import('node:fs');
  const path = process.env.EVAL_GOLD_OUTPUT_PATH ?? 'gold-output.json';
  let txt: string;
  try {
    txt = readFileSync(path, 'utf8');
  } catch {
    console.error(`[detect-drift] missing input ${path}`);
    process.exit(2);
  }
  const start = txt.indexOf('{');
  const summary = JSON.parse(txt.slice(start)) as EvalRun;
  const persist = shouldPersistFromEnv(process.argv.slice(2), process.env);
  const result = await detectDrift({ judgeRun: summary, persist });
  console.log(JSON.stringify({ alertCount: result.alertCount, rows: result.rows }, null, 2));
  if (result.alertCount > 0) process.exit(1);
}

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
    console.error('[detect-drift] FAILED:', err);
    process.exit(2);
  });
}
