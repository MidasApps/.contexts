import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresClient } from "../../../shared/postgres/postgres-client.ts";
import type { NewChunk, NewKnowledgeDocument } from "../../application/ports/knowledge-repository.ts";
import { makeReplaceDocumentChunks } from "../../application/use-cases/replace-document-chunks.ts";
import { makeSearchChunks } from "../../application/use-cases/search-chunks.ts";
import { CHUNKS_V1_DIMENSIONS } from "./drizzle-schema.ts";
import { createPostgresKnowledgeRepository, KNOWLEDGE_RUNTIME_ROLE } from "./postgres-knowledge-repository.ts";

// Needs the compose container and `pnpm db:migrate` (migrations 0003/0004).
const LOCAL_DATABASE_URL = "postgresql://app:app@127.0.0.1:5432/app";
const sql = createPostgresClient({ DATABASE_URL: process.env.DATABASE_URL ?? LOCAL_DATABASE_URL }, { max: 2 });
const repository = createPostgresKnowledgeRepository(sql);

const TENANT_A = "kbTenantA0000000000";
const TENANT_B = "kbTenantB0000000000";
const PLATFORM = "_platform";
const MODEL = "google/gemini-embedding-2";
const TEST_TENANTS = [TENANT_A, TENANT_B, PLATFORM];

/** Deterministic unit vector with its weight on one axis (plus a little on the next). */
const axis = (index: number, tilt = 0): number[] => {
  const vector = Array.from({ length: CHUNKS_V1_DIMENSIONS }, () => 0);
  vector[index] = 1;
  vector[(index + 1) % CHUNKS_V1_DIMENSIONS] = tilt;
  const norm = Math.hypot(...vector);
  return vector.map((value) => value / norm);
};

const hash = (label: string): string => label.padEnd(64, "0").replace(/[^a-f0-9]/g, "a").slice(0, 64);

const doc = (overrides: Partial<NewKnowledgeDocument> = {}): NewKnowledgeDocument => ({
  tenantId: TENANT_A,
  namespace: "tenant",
  source: "upload",
  sourceRef: "file-1",
  title: "Guide",
  sourceUrl: null,
  mimeType: "text/markdown",
  contentHash: hash("a1"),
  metadata: { pages: 1 },
  createdBy: "uid-1",
  ...overrides,
});

const chunk = (chunkIndex: number, embedding: number[], text = `chunk ${chunkIndex}`) => ({ chunkIndex, text, tokenCount: 3, embedding, metadata: {} }) satisfies NewChunk;

// Test cleanup as the runtime role, one tenant at a time (RLS lets nothing else through).
const cleanup = async (): Promise<void> => {
  for (const tenantId of TEST_TENANTS) {
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      await tx.unsafe(`SET LOCAL ROLE ${KNOWLEDGE_RUNTIME_ROLE}`);
      await tx`DELETE FROM ai.documents WHERE source_ref LIKE 'file-%' OR source_ref LIKE 'contract:%'`;
    });
  }
};

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await sql.end();
});

const indexed = async (document: NewKnowledgeDocument, chunks: NewChunk[]) => {
  const { document: stored } = await repository.upsertDocument(document);
  await repository.replaceChunks({ tenantId: document.tenantId, documentId: stored.id, embeddingModel: MODEL, embeddingVersion: "v1", chunks });
  return stored;
};

describe("postgres knowledge repository", () => {
  it("upserts idempotently by (tenant_id, source, source_ref) and flags unchanged content", async () => {
    const first = await repository.upsertDocument(doc());
    await repository.replaceChunks({ tenantId: TENANT_A, documentId: first.document.id, embeddingModel: MODEL, embeddingVersion: "v1", chunks: [chunk(0, axis(0))] });
    const again = await repository.upsertDocument(doc());
    expect(again).toMatchObject({ unchanged: true, document: { id: first.document.id, status: "ready" } });
    const changed = await repository.upsertDocument(doc({ contentHash: hash("b2"), title: "Guide v2" }));
    expect(changed).toMatchObject({ unchanged: false, document: { id: first.document.id, status: "pending", title: "Guide v2" } });
    expect((await repository.listDocuments({ tenantId: TENANT_A, limit: 10 })).documents).toHaveLength(1);
  });

  it("replaces chunks atomically: a failing insert keeps the previous chunks", async () => {
    const stored = await indexed(doc(), [chunk(0, axis(0)), chunk(1, axis(1))]);
    const broken = [chunk(0, axis(2)), chunk(0, axis(3))]; // duplicate chunk_index violates the unique key
    await expect(repository.replaceChunks({ tenantId: TENANT_A, documentId: stored.id, embeddingModel: MODEL, embeddingVersion: "v1", chunks: broken })).rejects.toThrow();
    const hits = await repository.searchChunks({ tenantId: TENANT_A, namespaces: ["tenant"], embedding: axis(1), embeddingModel: MODEL, topK: 5 });
    expect(hits.map((hit) => hit.chunkIndex).sort()).toEqual([0, 1]);
  });

  it("never returns tenant B's chunks to tenant A, even with the same text", async () => {
    await indexed(doc({ tenantId: TENANT_A }), [chunk(0, axis(5), "same text")]);
    const other = await indexed(doc({ tenantId: TENANT_B }), [chunk(0, axis(5), "same text")]);
    const hits = await repository.searchChunks({ tenantId: TENANT_A, namespaces: ["tenant"], embedding: axis(5), embeddingModel: MODEL, topK: 10 });
    expect(hits).toHaveLength(1);
    expect(hits.map((hit) => hit.documentId)).not.toContain(other.id);
  });

  it("shows _platform rows to every tenant but lets no tenant write them", async () => {
    const platform = await indexed(doc({ tenantId: PLATFORM, namespace: "catalog", source: "catalog", sourceRef: "contract:example.Note", createdBy: null }), [chunk(0, axis(7))]);
    for (const tenantId of [TENANT_A, TENANT_B]) {
      const hits = await repository.searchChunks({ tenantId, namespaces: ["catalog"], embedding: axis(7), embeddingModel: MODEL, topK: 3 });
      expect(hits.map((hit) => hit.documentId)).toEqual([platform.id]);
    }
    expect(await repository.replaceChunks({ tenantId: TENANT_A, documentId: platform.id, embeddingModel: MODEL, embeddingVersion: "v1", chunks: [] })).toBe(false);
    expect(await repository.deleteDocument({ tenantId: TENANT_A, documentId: platform.id })).toBe(false);
    const stillThere = await repository.searchChunks({ tenantId: TENANT_B, namespaces: ["catalog"], embedding: axis(7), embeddingModel: MODEL, topK: 3 });
    expect(stillThere).toHaveLength(1);
  });

  it("refuses a row whose tenant is not the transaction's tenant (WITH CHECK)", async () => {
    await expect(
      sql.begin(async (tx) => {
        await tx`SELECT set_config('app.tenant_id', ${TENANT_A}, true)`;
        await tx.unsafe(`SET LOCAL ROLE ${KNOWLEDGE_RUNTIME_ROLE}`);
        await tx`INSERT INTO ai.documents (tenant_id, namespace, source, source_ref, content_hash) VALUES (${PLATFORM}, 'catalog', 'catalog', 'contract:forged', ${hash("c3")})`;
      }),
    ).rejects.toThrow(/row-level security/);
  });

  it("filters by namespace", async () => {
    await indexed(doc({ namespace: "project:p1", sourceRef: "file-p1" }), [chunk(0, axis(9))]);
    await indexed(doc({ namespace: "tenant", sourceRef: "file-t" }), [chunk(0, axis(9, 0.1))]);
    const hits = await repository.searchChunks({ tenantId: TENANT_A, namespaces: ["project:p1"], embedding: axis(9), embeddingModel: MODEL, topK: 10 });
    expect(hits.map((hit) => hit.namespace)).toEqual(["project:p1"]);
  });

  it("deletes a document and cascades its chunks", async () => {
    const stored = await indexed(doc(), [chunk(0, axis(11)), chunk(1, axis(12))]);
    expect(await repository.deleteDocument({ tenantId: TENANT_A, documentId: stored.id })).toBe(true);
    const rows = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${TENANT_A}, true)`;
      await tx.unsafe(`SET LOCAL ROLE ${KNOWLEDGE_RUNTIME_ROLE}`);
      return tx<{ count: number }[]>`SELECT count(*)::int AS count FROM ai.chunks_v1 WHERE document_id = ${stored.id}`;
    });
    expect(rows[0]?.count).toBe(0);
  });

  it("returns nothing without a tenant setting except platform rows", async () => {
    await indexed(doc(), [chunk(0, axis(13))]);
    const rows = await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL ROLE ${KNOWLEDGE_RUNTIME_ROLE}`);
      return tx<{ tenant_id: string }[]>`SELECT tenant_id FROM ai.chunks_v1`;
    });
    expect(rows.every((row) => row.tenant_id === PLATFORM)).toBe(true);
  });

  it("has an HNSW index that the nearest-neighbour query uses", async () => {
    const plan = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${TENANT_A}, true)`;
      await tx.unsafe(`SET LOCAL ROLE ${KNOWLEDGE_RUNTIME_ROLE}`);
      // With a handful of test rows a sort is cheaper than any index; forbid it (and seq scans)
      // to check that the search query shape can be served by the HNSW index at all.
      await tx.unsafe("SET LOCAL enable_seqscan = off");
      await tx.unsafe("SET LOCAL enable_sort = off");
      const vector = `[${axis(1).join(",")}]`;
      return tx.unsafe(
        `EXPLAIN SELECT id FROM ai.chunks_v1 WHERE namespace = ANY('{tenant}'::text[]) AND embedding_model = '${MODEL}'
         ORDER BY embedding <=> '${vector}'::vector LIMIT 5`,
      );
    });
    expect(JSON.stringify(plan)).toContain("chunks_v1_embedding_hnsw");
  });
});

describe("knowledge use cases over Postgres", () => {
  it("replaces chunks and searches with citations, dropping weak matches", async () => {
    const { document } = await repository.upsertDocument(doc());
    const replace = makeReplaceDocumentChunks({ repository });
    const replaced = await replace({ tenantId: TENANT_A, documentId: document.id, embeddingModel: MODEL, embeddingVersion: "v1", chunks: [chunk(0, axis(20)), chunk(1, axis(40))] });
    expect(replaced).toEqual({ ok: true, data: { chunkCount: 2 } });
    const search = makeSearchChunks({ repository, embeddingModel: MODEL });
    const result = await search({ tenantId: TENANT_A, namespaces: ["tenant"], embedding: axis(20, 0.05), topK: 5 });
    expect(result).toMatchObject({ ok: true, data: [{ citationId: `kb:${document.id}#0`, documentId: document.id, title: "Guide", snippet: "chunk 0" }] });
    if (result.ok) expect(result.data).toHaveLength(1); // the orthogonal chunk scores ~0 and is dropped
  });
});
