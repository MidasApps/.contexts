/**
 * Persiste `EvalRun` em Firestore (collection `evalRuns`) — Bulk F5 da
 * migração BigQuery → Firestore (ADR-0013). Uma row por (fixtureId,
 * scorerName), espelhando o shape da BQ table original.
 *
 * Implementação:
 *   - WriteBatch chunk de 500 ops (limite duro do Firestore).
 *   - `startedAt` / `finishedAt` (string ISO em `EvalRun`) → `Timestamp`.
 *   - Doc id auto-gerado (`db.collection().doc()` sem path).
 */
import 'server-only';
import { Timestamp } from 'firebase-admin/firestore';
import type { WriteBatch } from 'firebase-admin/firestore';
import { getDb } from '@/shared/lib/firebase/admin';
import type { EvalRun } from '../scorers/types';

export interface PersistArgs {
  run: EvalRun;
}

const COLLECTION = 'evalRuns';
const BATCH_SIZE = 500;

function toTs(iso: string | null | undefined): Timestamp | null {
  if (!iso) return null;
  return Timestamp.fromDate(new Date(iso));
}

export async function persistEvalRun(args: PersistArgs): Promise<void> {
  const { run } = args;
  const db = getDb();
  const col = db.collection(COLLECTION);

  const startedAt = toTs(run.startedAt);
  const finishedAt = toTs(run.finishedAt);

  for (let i = 0; i < run.results.length; i += BATCH_SIZE) {
    const slice = run.results.slice(i, i + BATCH_SIZE);
    const batch: WriteBatch = db.batch();
    for (const r of slice) {
      const ref = col.doc();
      batch.set(ref, {
        runId: run.runId,
        startedAt,
        finishedAt,
        suite: run.suite,
        judgeModelVersion: run.judgeModelVersion,
        glossaryVersion: run.glossaryVersion,
        regulatoryPackVersion: run.regulatoryPackVersion,
        fixtureId: r.fixtureId,
        scorerName: r.scorerName,
        score: r.score,
        rationale: r.rationale ?? null,
        durationMs: r.durationMs ?? null,
        tokensIn: r.tokensIn ?? null,
        tokensOut: r.tokensOut ?? null,
        costUsd: r.costUsd ?? null,
        personaId: r.personaId ?? null,
        clientId: r.clientId ?? null,
      });
    }
    await batch.commit();
  }
}
