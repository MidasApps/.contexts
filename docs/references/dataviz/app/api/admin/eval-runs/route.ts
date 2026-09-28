/**
 * Sprint 3.D, Task 15 — admin endpoint para agregados de eval-runs.
 * Bulk F5: backend migrado de BigQuery (`liquid_meta.eval_runs`) para
 * Firestore (collection `evalRuns`).
 *
 * GET /api/admin/eval-runs?suite=&days=&judgeModelVersion=&clientId=&personaId=
 *
 * Retorna agregados p50/p95 por (scorer x persona x client). Como o
 * dataset é pequeno (uma row por scorer×fixture×run), agregamos em
 * memória após buscar a janela `days`. Requer admin (Firebase claim ou
 * fallback de e-mail).
 */
import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { requireAdmin, isAdminAuthOk } from '@/shared/lib/auth/require-admin';
import { getDb } from '@/shared/lib/firebase/admin';

export const runtime = 'nodejs';

export interface EvalRunAggregateRow {
  scorerName: string;
  personaId: string;
  clientId: string;
  p50: number;
  p95: number;
  sampleSize: number;
  judgeModelVersion: string;
}

export interface EvalRunsResponse {
  rows: EvalRunAggregateRow[];
  /** Indica que o backend retornou stub (Firestore desconfigurado/falhou). */
  stub?: boolean;
  generatedAt: string;
  suite: string;
  days: number;
}

const DEFAULT_DAYS = 30;
const COLLECTION = 'evalRuns';

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

interface EvalRunDoc {
  suite?: string;
  startedAt?: Timestamp | { toDate: () => Date };
  judgeModelVersion?: string;
  scorerName?: string;
  personaId?: string | null;
  clientId?: string | null;
  score?: number;
}

interface Bucket {
  scorerName: string;
  personaId: string;
  clientId: string;
  scores: number[];
  judgeModelVersion: string;
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (!isAdminAuthOk(auth)) return auth;

  const url = new URL(req.url);
  const suite = url.searchParams.get('suite') ?? 'smoke';
  const daysRaw = url.searchParams.get('days');
  const days = daysRaw ? Math.max(1, Number.parseInt(daysRaw, 10)) : DEFAULT_DAYS;
  const judgeModelVersion = url.searchParams.get('judgeModelVersion') ?? undefined;
  const clientId = url.searchParams.get('clientId') ?? undefined;
  const personaId = url.searchParams.get('personaId') ?? undefined;

  const generatedAt = new Date().toISOString();

  try {
    const db = getDb();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const cutoffTs = Timestamp.fromDate(cutoff);

    // Só `suite` + janela vão ao Firestore, na ordem do índice declarado
    // (`suite` ASC, `startedAt` DESC). Sem o `orderBy`, o range pede
    // `startedAt` ASC — índice que não existe — e a consulta falhava sempre
    // com FAILED_PRECONDITION. Os filtros opcionais ficam em memória, como a
    // agregação: cada combinação no Firestore exigiria um índice composto.
    const snap = await db
      .collection(COLLECTION)
      .where('suite', '==', suite)
      .where('startedAt', '>=', cutoffTs)
      .orderBy('startedAt', 'desc')
      .get();

    // Agrupa por (scorerName, personaId, clientId) em memória.
    const buckets = new Map<string, Bucket>();
    for (const d of snap.docs) {
      const data = d.data() as EvalRunDoc;
      if (typeof data.score !== 'number') continue;
      if (judgeModelVersion && data.judgeModelVersion !== judgeModelVersion) continue;
      if (clientId && data.clientId !== clientId) continue;
      if (personaId && data.personaId !== personaId) continue;
      const sName = String(data.scorerName ?? '');
      const pId = String(data.personaId ?? '');
      const cId = String(data.clientId ?? '');
      const key = `${sName}${pId}${cId}`;
      const existing = buckets.get(key);
      if (existing) {
        existing.scores.push(data.score);
      } else {
        buckets.set(key, {
          scorerName: sName,
          personaId: pId,
          clientId: cId,
          scores: [data.score],
          judgeModelVersion: String(data.judgeModelVersion ?? ''),
        });
      }
    }

    const rows: EvalRunAggregateRow[] = [];
    for (const b of buckets.values()) {
      rows.push({
        scorerName: b.scorerName,
        personaId: b.personaId,
        clientId: b.clientId,
        judgeModelVersion: b.judgeModelVersion,
        p50: percentile(b.scores, 50),
        p95: percentile(b.scores, 95),
        sampleSize: b.scores.length,
      });
    }
    rows.sort((a, b) =>
      a.scorerName.localeCompare(b.scorerName)
      || a.personaId.localeCompare(b.personaId)
      || a.clientId.localeCompare(b.clientId)
    );

    const body: EvalRunsResponse = { rows, generatedAt, suite, days };
    return NextResponse.json(body);
  } catch (err) {
    console.warn('[admin/eval-runs] Firestore falhou, retornando stub:', err);
    const body: EvalRunsResponse = {
      rows: [],
      stub: true,
      generatedAt,
      suite,
      days,
    };
    return NextResponse.json(body);
  }
}
