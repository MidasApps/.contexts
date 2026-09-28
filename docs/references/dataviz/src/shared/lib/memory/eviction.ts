import 'server-only';
import { Timestamp } from 'firebase-admin/firestore';
import type { WriteBatch, QueryDocumentSnapshot, DocumentData } from 'firebase-admin/firestore';
import { getDb } from '@/shared/lib/firebase/admin';
import { recordMemoryMetric } from './metrics';

/**
 * Sprint 3.A TTL eviction — Firestore-backed (Bulk F3 / ADR-0013).
 *
 * Substitui as queries `DELETE FROM embeddings_sql / embeddings_blocks`
 * (Postgres) por uma varredura de docs antigos + batch delete em chunks de
 * 500 ops (limite WriteBatch).
 *
 * Critério (mantido vs. pgvector):
 *   - cutoff = now - 90d
 *   - embeddingsSql:    delete docs com createdAt < cutoff E
 *                       (lastReusedAt == null OR lastReusedAt < cutoff)
 *   - embeddingsBlocks: idem + templateId == null (templates curados ficam)
 *
 * Implementação: o filtro `createdAt < cutoff` vai como Firestore `where`
 * (range query), e o restante é avaliado em JS sobre o resultset porque
 * Firestore não suporta `OR` nativo entre `is null` e `< cutoff` no mesmo
 * campo dentro de uma única query.
 */

const COL_SQL = 'embeddingsSql';
const COL_BLOCKS = 'embeddingsBlocks';
const TTL_DAYS = 90;
const BATCH_SIZE = 500;

export interface EvictionResult {
  sqlDeleted: number;
  blocksDeleted: number;
}

function isExpired(
  data: DocumentData | undefined,
  cutoff: Date,
): boolean {
  const lastReusedAt = data?.lastReusedAt;
  if (lastReusedAt == null) return true;
  if (lastReusedAt instanceof Timestamp) {
    return lastReusedAt.toDate() < cutoff;
  }
  if (lastReusedAt instanceof Date) {
    return lastReusedAt < cutoff;
  }
  // Unknown shape — treat as expired to be safe (matches Postgres `IS NULL OR <`).
  return true;
}

async function commitInBatches(
  docs: QueryDocumentSnapshot<DocumentData>[],
): Promise<number> {
  if (docs.length === 0) return 0;
  const db = getDb();
  let deleted = 0;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const slice = docs.slice(i, i + BATCH_SIZE);
    const batch: WriteBatch = db.batch();
    for (const d of slice) batch.delete(d.ref);
    await batch.commit();
    deleted += slice.length;
  }
  return deleted;
}

export async function runEviction(opts: { now?: Date } = {}): Promise<EvictionResult> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - TTL_DAYS * 24 * 60 * 60 * 1000);
  const db = getDb();

  // embeddingsSql ---------------------------------------------------------
  const sqlSnap = await db
    .collection(COL_SQL)
    .where('createdAt', '<', cutoff)
    .get();
  const sqlExpired = sqlSnap.docs.filter((d) => isExpired(d.data(), cutoff));
  const sqlDeleted = await commitInBatches(sqlExpired);

  // embeddingsBlocks ------------------------------------------------------
  const blockSnap = await db
    .collection(COL_BLOCKS)
    .where('createdAt', '<', cutoff)
    .get();
  const blockExpired = blockSnap.docs.filter((d) => {
    const data = d.data();
    if (data?.templateId != null) return false; // curated templates pinned
    return isExpired(data, cutoff);
  });
  const blocksDeleted = await commitInBatches(blockExpired);

  recordMemoryMetric({ event: 'eviction.run', durationMs: 0, ok: true });
  return { sqlDeleted, blocksDeleted };
}
