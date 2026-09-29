import 'server-only';
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '@/shared/lib/firebase/admin';

const EMBEDDINGS_COL = 'embeddingsDocs';

export interface KbChunkInput {
  knowledgeBaseId: string;
  sourceDocId: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
  embeddingModel: string;
  clientId: string | null;
  metadata: Record<string, unknown>;
}

export function kbChunkId(knowledgeBaseId: string, sourceDocId: string, chunkIndex: number): string {
  return createHash('sha256').update(`${knowledgeBaseId}:${sourceDocId}:${chunkIndex}`).digest('hex');
}

type Db = FirebaseFirestore.Firestore;

export async function upsertKbChunks(chunks: KbChunkInput[], db?: Db): Promise<void> {
  const firestore = db ?? getDb();
  const col = firestore.collection(EMBEDDINGS_COL);
  for (const c of chunks) {
    const id = kbChunkId(c.knowledgeBaseId, c.sourceDocId, c.chunkIndex);
    await col.doc(id).set({
      knowledgeBaseId: c.knowledgeBaseId,
      sourceDocId: c.sourceDocId,
      chunkIndex: c.chunkIndex,
      content: c.content,
      embedding: c.embedding,
      embeddingModel: c.embeddingModel,
      clientId: c.clientId,
      metadata: c.metadata,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
}

export async function pruneKbChunks(
  knowledgeBaseId: string, sourceDocId: string, keepCount: number, db?: Db,
): Promise<void> {
  const firestore = db ?? getDb();
  const snap = await firestore.collection(EMBEDDINGS_COL)
    .where('sourceDocId', '==', sourceDocId)
    .where('chunkIndex', '>=', keepCount)
    .get();
  for (const doc of snap.docs) await doc.ref.delete();
}

export async function deleteKbDocChunks(sourceDocId: string, db?: Db): Promise<number> {
  const firestore = db ?? getDb();
  const snap = await firestore.collection(EMBEDDINGS_COL).where('sourceDocId', '==', sourceDocId).get();
  for (const doc of snap.docs) await doc.ref.delete();
  return snap.docs.length;
}
