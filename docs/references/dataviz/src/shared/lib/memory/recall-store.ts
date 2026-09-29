import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '@/shared/lib/firebase/admin';
import { vectorSearch } from '@/shared/lib/firestore/vector-search';

/**
 * Sprint 3.A semantic recall store — Firestore-backed (Bulk F3 / ADR-0013).
 *
 * Substitui a stack pgvector (HNSW, ivfflat) das tabelas `embeddings_sql` e
 * `embeddings_blocks` por collections Firestore homônimas em camelCase
 * (`embeddingsSql`, `embeddingsBlocks`) com brute-force cosine via
 * `firestore/vector-search`.
 *
 * Multi-tenancy (ADR-0006): clientId é hard requirement em todas as funções
 * de query/upsert. SQL embeddings adicionalmente exigem personaId.
 *
 * Tradeoffs vs pgvector HNSW: O(N) por query — aceitável enquanto cada tenant
 * fica em low-thousands de docs e enquanto Firestore Vector Search (managed
 * ANN) está em preview. A função `runEviction` (eviction.ts) garante TTL de
 * 90d para conter crescimento.
 */

const COL_SQL = 'embeddingsSql';
const COL_BLOCKS = 'embeddingsBlocks';

export interface EmbeddedSql {
  id: string;
  clientId: string;
  personaId: string;
  intent: string;
  sqlText: string;
  schemaSnapshot: Record<string, unknown>;
  rowCount: number;
  latencyMs: number;
  glossaryVersion: string | null;
  regulatoryPackVersion: string | null;
  reuseCount: number;
  score?: number;
}

export interface EmbeddedBlock {
  id: string;
  clientId: string;
  blockType: 'kpi' | 'chart' | 'table';
  blockSpec: Record<string, unknown>;
  templateId: string | null;
  /** Métrica do cliente materializada a partir deste bloco (G4); null se ausente. */
  metricId: string | null;
  reuseCount: number;
  score?: number;
}

// RecallResult<T> removida — nenhum caller tipava o retorno por ela.

const ALLOWED_COLLECTIONS = new Set([COL_SQL, COL_BLOCKS]);
export type RecallCollection = typeof COL_SQL | typeof COL_BLOCKS;

function clampTopK(topK: number): number {
  return Math.max(1, Math.min(50, topK));
}

export interface UpsertSqlInput {
  embedding: number[];
  clientId: string;
  personaId: string;
  intent: string;
  sqlText: string;
  schemaSnapshot: Record<string, unknown>;
  rowCount: number;
  latencyMs: number;
  glossaryVersion?: string | null;
  regulatoryPackVersion?: string | null;
}

export async function upsertSqlEmbedding(i: UpsertSqlInput): Promise<void> {
  if (!i.clientId || !i.personaId) {
    throw new Error('upsertSqlEmbedding requires clientId+personaId');
  }
  await getDb().collection(COL_SQL).add({
    clientId: i.clientId,
    personaId: i.personaId,
    intent: i.intent,
    sqlText: i.sqlText,
    schemaSnapshot: i.schemaSnapshot,
    rowCount: i.rowCount,
    latencyMs: i.latencyMs,
    glossaryVersion: i.glossaryVersion ?? null,
    regulatoryPackVersion: i.regulatoryPackVersion ?? null,
    embedding: i.embedding,
    reuseCount: 0,
    lastReusedAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export interface UpsertBlockInput {
  embedding: number[];
  clientId: string;
  blockType: 'kpi' | 'chart' | 'table';
  content: string;
  blockSpec: Record<string, unknown>;
  templateId?: string | null;
  metricId?: string | null;
}

export async function upsertBlockEmbedding(i: UpsertBlockInput): Promise<void> {
  if (!i.clientId) throw new Error('upsertBlockEmbedding requires clientId');
  await getDb().collection(COL_BLOCKS).add({
    clientId: i.clientId,
    blockType: i.blockType,
    content: i.content,
    blockSpec: i.blockSpec,
    templateId: i.templateId ?? null,
    metricId: i.metricId ?? null,
    embedding: i.embedding,
    reuseCount: 0,
    lastReusedAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export interface QuerySqlInput {
  embedding: number[];
  clientId: string;
  personaId: string;
  topK: number;
}

interface SqlEmbeddingDoc {
  clientId?: string;
  personaId?: string;
  intent?: string;
  sqlText?: string;
  schemaSnapshot?: Record<string, unknown> | null;
  rowCount?: number;
  latencyMs?: number;
  glossaryVersion?: string | null;
  regulatoryPackVersion?: string | null;
  reuseCount?: number;
}

export async function querySqlEmbeddings(i: QuerySqlInput): Promise<EmbeddedSql[]> {
  if (!i.clientId) throw new Error('querySqlEmbeddings requires clientId (ADR-0006)');
  if (!i.personaId) throw new Error('querySqlEmbeddings requires personaId');
  const topK = clampTopK(i.topK);
  const matches = await vectorSearch<SqlEmbeddingDoc>({
    collection: getDb().collection(COL_SQL),
    queryEmbedding: i.embedding,
    filters: { clientId: i.clientId, personaId: i.personaId },
    topK,
  });
  return matches.map((m) => ({
    id: m.id,
    clientId: m.data.clientId ?? i.clientId,
    personaId: m.data.personaId ?? i.personaId,
    intent: m.data.intent ?? '',
    sqlText: m.data.sqlText ?? '',
    schemaSnapshot: m.data.schemaSnapshot ?? {},
    rowCount: m.data.rowCount ?? 0,
    latencyMs: m.data.latencyMs ?? 0,
    glossaryVersion: m.data.glossaryVersion ?? null,
    regulatoryPackVersion: m.data.regulatoryPackVersion ?? null,
    reuseCount: m.data.reuseCount ?? 0,
    score: m.score,
  }));
}

export interface QueryBlockInput {
  embedding: number[];
  clientId: string;
  blockType: 'kpi' | 'chart' | 'table';
  topK: number;
}

interface BlockEmbeddingDoc {
  clientId?: string;
  blockType?: 'kpi' | 'chart' | 'table';
  blockSpec?: Record<string, unknown> | null;
  templateId?: string | null;
  metricId?: string | null;
  reuseCount?: number;
}

export async function queryBlockEmbeddings(i: QueryBlockInput): Promise<EmbeddedBlock[]> {
  if (!i.clientId) throw new Error('queryBlockEmbeddings requires clientId (ADR-0006)');
  const topK = clampTopK(i.topK);
  const matches = await vectorSearch<BlockEmbeddingDoc>({
    collection: getDb().collection(COL_BLOCKS),
    queryEmbedding: i.embedding,
    filters: { clientId: i.clientId, blockType: i.blockType },
    topK,
  });
  return matches.map((m) => ({
    id: m.id,
    clientId: m.data.clientId ?? i.clientId,
    blockType: m.data.blockType ?? i.blockType,
    blockSpec: m.data.blockSpec ?? {},
    templateId: m.data.templateId ?? null,
    metricId: m.data.metricId ?? null,
    reuseCount: m.data.reuseCount ?? 0,
    score: m.score,
  }));
}

export async function bumpReuse(
  collection: RecallCollection,
  ids: string[],
): Promise<void> {
  if (!ALLOWED_COLLECTIONS.has(collection)) {
    throw new Error(`bumpReuse: collection '${collection}' not allowed`);
  }
  if (ids.length === 0) return;
  const db = getDb();
  await Promise.all(
    ids.map((id) =>
      db.collection(collection).doc(id).update({
        reuseCount: FieldValue.increment(1),
        lastReusedAt: FieldValue.serverTimestamp(),
      }),
    ),
  );
}
