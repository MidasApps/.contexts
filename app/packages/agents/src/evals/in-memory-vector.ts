import { randomUUID } from "node:crypto";
import {
  type CreateIndexParams,
  type DeleteIndexParams,
  type DeleteVectorParams,
  type DeleteVectorsParams,
  type DescribeIndexParams,
  type IndexStats,
  MastraVector,
  type QueryResult,
  type QueryVectorParams,
  type UpdateVectorParams,
  type UpsertVectorParams,
  type VectorFilter,
} from "@mastra/core/vector";

type Entry = { vector: number[]; metadata: Record<string, unknown> };
type Index = { dimension: number; metric: "cosine"; entries: Map<string, Entry> };

export class UnsupportedVectorFilterError extends Error {
  readonly code = "UNSUPPORTED_VECTOR_FILTER";
  constructor(filter: unknown) {
    super(`in-memory vector supports equality and $and filters only: ${JSON.stringify(filter)}`);
    this.name = "UnsupportedVectorFilterError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Memory filters by `resource_id` / `thread_id` equality; anything richer fails loudly.
const matches = (metadata: Record<string, unknown>, filter: VectorFilter | undefined): boolean => {
  if (filter === undefined || filter === null) return true;
  if (!isRecord(filter)) throw new UnsupportedVectorFilterError(filter);
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$and" && Array.isArray(expected))
      return expected.every((part) => matches(metadata, part as VectorFilter));
    if (isRecord(expected) && Object.keys(expected).length === 1 && "$eq" in expected)
      return metadata[key] === expected.$eq;
    if (isRecord(expected) || Array.isArray(expected) || key.startsWith("$"))
      throw new UnsupportedVectorFilterError(filter);
    return metadata[key] === expected;
  });
};

const cosine = (a: readonly number[], b: readonly number[]): number => {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
};

/**
 * A process-local `MastraVector` for the memory comparison eval (SP3 Task 28): the CI
 * eval job has no Postgres, and the comparison is about the memory strategy, not the
 * store. Cosine similarity, equality filters only. Never used by the app runtime,
 * which keeps `PgVector` (decision 0029).
 */
export class InMemoryVector extends MastraVector {
  private readonly indexes = new Map<string, Index>();

  constructor() {
    super({ id: "in-memory-vector" });
  }

  private indexOf(indexName: string): Index {
    const index = this.indexes.get(indexName);
    if (index === undefined) throw new Error(`vector index ${indexName} does not exist`);
    return index;
  }

  // Promise.try: a missing index or bad filter rejects, like a real store's I/O error.
  createIndex({ indexName, dimension }: CreateIndexParams): Promise<void> {
    return Promise.try(() => {
      const existing = this.indexes.get(indexName);
      if (existing !== undefined && existing.dimension !== dimension)
        throw new Error(`vector index ${indexName} has dimension ${existing.dimension}, not ${dimension}`);
      if (existing === undefined) this.indexes.set(indexName, { dimension, metric: "cosine", entries: new Map() });
    });
  }

  listIndexes(): Promise<string[]> {
    return Promise.try(() => [...this.indexes.keys()]);
  }

  describeIndex({ indexName }: DescribeIndexParams): Promise<IndexStats> {
    return Promise.try(() => {
      const index = this.indexOf(indexName);
      return { dimension: index.dimension, count: index.entries.size, metric: index.metric };
    });
  }

  deleteIndex({ indexName }: DeleteIndexParams): Promise<void> {
    return Promise.try(() => {
      this.indexes.delete(indexName);
    });
  }

  upsert({ indexName, vectors, metadata = [], ids, deleteFilter }: UpsertVectorParams): Promise<string[]> {
    return Promise.try(() => {
      const index = this.indexOf(indexName);
      if (deleteFilter !== undefined)
        for (const [id, entry] of index.entries) if (matches(entry.metadata, deleteFilter)) index.entries.delete(id);
      return vectors.map((vector, position) => {
        const id = ids?.[position] ?? randomUUID();
        index.entries.set(id, { vector: [...vector], metadata: { ...(metadata[position] ?? {}) } });
        return id;
      });
    });
  }

  query({
    indexName,
    queryVector,
    topK = 10,
    filter,
    includeVector = false,
  }: QueryVectorParams): Promise<QueryResult[]> {
    return Promise.try(() =>
      [...this.indexOf(indexName).entries]
        .filter(([, entry]) => matches(entry.metadata, filter))
        .map(([id, entry]) => ({
          id,
          score: queryVector === undefined ? 0 : cosine(queryVector, entry.vector),
          metadata: entry.metadata,
          ...(includeVector ? { vector: entry.vector } : {}),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK),
    );
  }

  updateVector(params: UpdateVectorParams): Promise<void> {
    return Promise.try(() => {
      const index = this.indexOf(params.indexName);
      const targets =
        params.id === undefined
          ? [...index.entries.values()].filter((entry) => matches(entry.metadata, params.filter))
          : [index.entries.get(params.id)];
      for (const entry of targets) {
        if (entry === undefined) continue;
        if (params.update.vector !== undefined) entry.vector = [...params.update.vector];
        if (params.update.metadata !== undefined) entry.metadata = { ...entry.metadata, ...params.update.metadata };
      }
    });
  }

  deleteVector({ indexName, id }: DeleteVectorParams): Promise<void> {
    return Promise.try(() => {
      this.indexOf(indexName).entries.delete(id);
    });
  }

  deleteVectors(params: DeleteVectorsParams): Promise<void> {
    return Promise.try(() => {
      const index = this.indexOf(params.indexName);
      if (params.ids !== undefined) for (const id of params.ids) index.entries.delete(id);
      if (params.filter !== undefined)
        for (const [id, entry] of index.entries) if (matches(entry.metadata, params.filter)) index.entries.delete(id);
    });
  }
}
