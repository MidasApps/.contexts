import 'server-only';
import { getDb } from '@/shared/lib/firebase/admin';
import { vectorSearch } from '@/shared/lib/firestore/vector-search';
import { AiStudioRepo } from '@/features/ai-studio/repo';

const EMBEDDINGS_COL = 'embeddingsDocs';
const IN_BATCH = 30; // limite do Firestore `in`

type Db = FirebaseFirestore.Firestore;

export async function resolveVisibleKbs(
  refs: string[], clientId: string | null, _db?: Db,
): Promise<string[]> {
  if (!refs || refs.length === 0) return [];
  const repo = new AiStudioRepo('knowledgeBase');
  const all = await repo.list();
  const refSet = new Set(refs);
  return all
    .filter((kb) => refSet.has(kb.id))
    .filter((kb) => kb.status === 'active')
    .filter((kb) => {
      const kbClient = (kb as { clientId?: string | null }).clientId ?? null;
      return kbClient === null || kbClient === clientId;
    })
    .map((kb) => kb.id);
}

export interface KbHit {
  id: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function queryKbDocs(
  input: { embedding: number[]; topK: number; knowledgeBaseIds: string[] }, db?: Db,
): Promise<KbHit[]> {
  if (!input.knowledgeBaseIds || input.knowledgeBaseIds.length === 0) return [];
  const firestore = db ?? getDb();
  const col = firestore.collection(EMBEDDINGS_COL);

  const batches = chunk(input.knowledgeBaseIds, IN_BATCH);
  const all: KbHit[] = [];
  for (const batch of batches) {
    const matches = await vectorSearch<{ content: string; metadata: Record<string, unknown> }>({
      collection: col as never,
      queryEmbedding: input.embedding,
      filters: { knowledgeBaseId: batch },
      topK: input.topK,
    });
    for (const m of matches) {
      all.push({ id: m.id, content: m.data.content, similarity: m.score, metadata: m.data.metadata ?? {} });
    }
  }
  all.sort((a, b) => b.similarity - a.similarity);
  return all.slice(0, input.topK);
}
