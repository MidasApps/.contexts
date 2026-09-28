import 'server-only';
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '@/shared/lib/firebase/admin';
import { vectorSearch } from '@/shared/lib/firestore/vector-search';

/**
 * Sprint 2.A rag-service — Firestore-backed (Bulk F2 / ADR-0013).
 *
 * Layout: collection `embeddingsDocs/{docId}` where
 *   docId = sha256(`${clientId}:${sourcePath}:${chunkIndex}`).
 * The deterministic id makes re-ingest idempotent — a re-embed of the same
 * (clientId, sourcePath, chunkIndex) overwrites the previous doc instead of
 * accumulating duplicates.
 *
 * Multi-tenancy (ADR-0006): `queryDocs` requires `clientId` and applies it
 * as a Firestore equality filter; `upsertDoc` always writes `clientId`.
 *
 * Vector search: brute-force cosine over the client-scoped subset via
 * `firestore/vector-search`. Acceptable while collection size is in
 * low-thousands per tenant; revisit when ANN is GA on Firestore.
 */

const EMBEDDINGS_COL = 'embeddingsDocs';

export interface UpsertDocInput {
  /**
   * Knowledge base of the chunk. The assistant's search (`queryKbDocs`) only
   * sees chunks whose `knowledgeBaseId` is in the agent's list; without it a
   * loaded document stayed invisible until someone ran `migrate:embeddings-kb`.
   */
  knowledgeBaseId: string;
  sourcePath: string;
  chunkIndex: number;
  content: string;
  contentHash: string;
  embedding: number[];
  embeddingModel: string;
  clientId: string;
  docType: string | null;
  product: string | null;
  persona: string | null;
  regulatoryArea: string | null;
  metadata: Record<string, unknown>;
}

function docIdFor(clientId: string, sourcePath: string, chunkIndex: number): string {
  return createHash('sha256')
    .update(`${clientId}:${sourcePath}:${chunkIndex}`)
    .digest('hex');
}

export async function upsertDoc(i: UpsertDocInput): Promise<void> {
  if (!i.clientId) {
    throw new Error('upsertDoc requires clientId (multi-tenancy hard requirement)');
  }
  if (!i.knowledgeBaseId?.trim()) {
    throw new Error('upsertDoc requires knowledgeBaseId (the assistant only searches chunks tagged with one)');
  }
  const db = getDb();
  const id = docIdFor(i.clientId, i.sourcePath, i.chunkIndex);
  const ref = db.collection(EMBEDDINGS_COL).doc(id);

  // Fast skip when the existing doc has the same contentHash + embeddingModel
  // AND the same knowledge base: a chunk stored without one (or in another)
  // must be rewritten to get it.
  const existing = await ref.get();
  if (
    existing.exists &&
    (existing.data()?.contentHash as string | undefined) === i.contentHash &&
    (existing.data()?.embeddingModel as string | undefined) === i.embeddingModel &&
    (existing.data()?.knowledgeBaseId as string | undefined) === i.knowledgeBaseId
  ) {
    return;
  }

  await ref.set({
    knowledgeBaseId: i.knowledgeBaseId,
    clientId: i.clientId,
    sourcePath: i.sourcePath,
    chunkIndex: i.chunkIndex,
    content: i.content,
    contentHash: i.contentHash,
    embedding: i.embedding,
    embeddingModel: i.embeddingModel,
    docType: i.docType,
    product: i.product,
    persona: i.persona,
    regulatoryArea: i.regulatoryArea,
    metadata: i.metadata,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export interface QueryDocsInput {
  embedding: number[];
  topK: number;
  clientId: string; // ADR-0006: server-bound, multi-tenancy hard requirement.
  filters?: { product?: string; persona?: string; docType?: string };
}

export interface QueryDocsHit {
  id: string;
  sourcePath: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

interface EmbeddingDoc {
  sourcePath?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

export async function queryDocs(input: QueryDocsInput): Promise<QueryDocsHit[]> {
  if (!input.clientId) {
    throw new Error('queryDocs requires clientId (multi-tenancy hard requirement)');
  }
  const db = getDb();
  const col = db.collection(EMBEDDINGS_COL);

  const filters: Record<string, unknown> = { clientId: input.clientId };
  if (input.filters?.product) filters.product = input.filters.product;
  if (input.filters?.persona) filters.persona = input.filters.persona;
  if (input.filters?.docType) filters.docType = input.filters.docType;

  const matches = await vectorSearch<EmbeddingDoc>({
    collection: col,
    queryEmbedding: input.embedding,
    filters,
    topK: input.topK,
  });

  return matches.map((m) => ({
    id: m.id,
    sourcePath: (m.data.sourcePath as string) ?? '',
    content: (m.data.content as string) ?? '',
    metadata: (m.data.metadata as Record<string, unknown>) ?? {},
    similarity: m.score,
  }));
}

export async function getExistingHashes(sourcePath: string): Promise<Map<number, string>> {
  const db = getDb();
  const snap = await db
    .collection(EMBEDDINGS_COL)
    .where('sourcePath', '==', sourcePath)
    .get();
  const out = new Map<number, string>();
  for (const d of snap.docs) {
    const data = d.data();
    const idx = data.chunkIndex as number | undefined;
    const hash = data.contentHash as string | undefined;
    if (typeof idx === 'number' && typeof hash === 'string') out.set(idx, hash);
  }
  return out;
}

/** Whether the knowledge base exists in `knowledgeBases`. */
export const knowledgeBaseExists = async (knowledgeBaseId: string): Promise<boolean> => {
  const doc = await getDb().collection('knowledgeBases').doc(knowledgeBaseId).get();
  return doc.exists;
};
