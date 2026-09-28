import 'server-only';
import type {
  CollectionReference,
  Query,
  DocumentData,
} from 'firebase-admin/firestore';

/**
 * Brute-force cosine vector search over a Firestore collection (ADR-0013).
 *
 * Strategy:
 *   1. Apply equality filters via `where(...)` to scope the candidate set
 *      (multi-tenancy enforced by callers passing `clientId`).
 *   2. Fetch matching docs with `.get()`.
 *   3. Compute cosine similarity in-memory: dot(a,b) / (||a|| * ||b||).
 *   4. Sort desc by score, return top-K.
 *
 * Tradeoffs vs pgvector HNSW: O(N) read+compute. Acceptable while collection
 * is in low-thousands; revisit when N grows or when Firestore Vector Search
 * (managed ANN, currently in preview) is GA.
 */

export interface VectorSearchInput {
  collection: CollectionReference<DocumentData>;
  queryEmbedding: number[];
  filters: Record<string, unknown>;
  topK: number;
  embeddingField?: string;
}

export interface VectorMatch<T = DocumentData> {
  id: string;
  score: number;
  data: T;
}

function dotProduct(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < len; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

function norm(v: number[]): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += (v[i] ?? 0) * (v[i] ?? 0);
  return Math.sqrt(s);
}

export async function vectorSearch<T = DocumentData>(
  input: VectorSearchInput,
): Promise<VectorMatch<T>[]> {
  const field = input.embeddingField ?? 'embedding';

  let q: Query<DocumentData> = input.collection;
  for (const [k, v] of Object.entries(input.filters)) {
    if (Array.isArray(v)) {
      if (v.length === 0) return []; // `in []` nunca casa — short-circuit
      q = q.where(k, 'in', v);
    } else {
      q = q.where(k, '==', v);
    }
  }

  const snap = await q.get();
  if (snap.empty) return [];

  const queryNorm = norm(input.queryEmbedding);
  const matches: VectorMatch<T>[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const emb = data?.[field];
    if (!Array.isArray(emb)) continue;
    const docNorm = norm(emb as number[]);
    const denom = queryNorm * docNorm;
    const score = denom === 0 ? 0 : dotProduct(input.queryEmbedding, emb as number[]) / denom;
    matches.push({ id: doc.id, score, data: data as T });
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, input.topK);
}

// O bundle `_internal` (dotProduct/norm/cosineSimilarity) foi removido: existia
// "para testes", mas o próprio vector-search.test.ts exercita a busca pela API
// pública. Reexportar helper privado sem consumidor só alarga a superfície.
