import { type KnowledgeDocument, KnowledgeDocumentSchema } from "@core/contracts";
import type { Sql, TransactionSql } from "postgres";
import { withTenantTransaction } from "../../../shared/postgres/with-tenant-transaction.ts";
import type { ChunkMatch, KnowledgeRepository, NewChunk, NewKnowledgeDocument, UpsertedDocument } from "../../application/ports/knowledge-repository.ts";
import { CHUNKS_V1_DIMENSIONS } from "./drizzle-schema.ts";

/** NOLOGIN role every knowledge query runs as (migration 0004): no BYPASSRLS, DML on ai.documents/chunks_v1 only. */
export const KNOWLEDGE_RUNTIME_ROLE = "knowledge_runtime";

/** Bug guard: a vector that pgvector would reject or misread never reaches SQL text. */
export class InvalidEmbeddingError extends Error {
  readonly code = "INVALID_EMBEDDING";

  constructor() {
    super(`embedding must have ${CHUNKS_V1_DIMENSIONS} finite numbers`);
    this.name = "InvalidEmbeddingError";
  }
}

type DocumentRow = {
  id: string;
  tenant_id: string;
  namespace: string;
  source: string;
  source_ref: string;
  title: string | null;
  source_url: string | null;
  mime_type: string | null;
  content_hash: string;
  status: string;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

const DOCUMENT_COLUMNS = "id, tenant_id, namespace, source, source_ref, title, source_url, mime_type, content_hash, status, created_by, created_at, updated_at";

/** @throws {ZodError} for a row the contract rejects (a bug or a manual write). */
const toDocument = (row: DocumentRow): KnowledgeDocument =>
  KnowledgeDocumentSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    namespace: row.namespace,
    source: row.source,
    sourceRef: row.source_ref,
    title: row.title,
    sourceUrl: row.source_url,
    mimeType: row.mime_type,
    contentHash: row.content_hash,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });

/** pgvector text form `[x,y,...]`, built only from checked finite numbers. */
export const toVectorLiteral = (embedding: readonly number[]): string => {
  if (embedding.length !== CHUNKS_V1_DIMENSIONS || !embedding.every(Number.isFinite)) throw new InvalidEmbeddingError();
  return `[${embedding.join(",")}]`;
};

// Every transaction switches to the runtime role, so the policies apply even when the
// login role could bypass them (a local superuser); tenant settings come from withTenantTransaction.
const asRuntime = async (tx: TransactionSql): Promise<void> => {
  await tx.unsafe(`SET LOCAL ROLE ${KNOWLEDGE_RUNTIME_ROLE}`);
};

const upsertDocument = (sql: Sql) => async (document: NewKnowledgeDocument): Promise<UpsertedDocument> =>
  withTenantTransaction(sql, { tenantId: document.tenantId }, async (tx) => {
    await asRuntime(tx);
    const [previous] = await tx<{ content_hash: string; namespace: string; status: string }[]>`
      SELECT content_hash, namespace, status FROM ai.documents
      WHERE tenant_id = ${document.tenantId} AND source = ${document.source} AND source_ref = ${document.sourceRef}
      FOR UPDATE`;
    const unchanged = previous !== undefined && previous.content_hash === document.contentHash && previous.namespace === document.namespace && previous.status === "ready";
    const [row] = await tx<DocumentRow[]>`
      INSERT INTO ai.documents (tenant_id, namespace, source, source_ref, title, source_url, mime_type, content_hash, status, metadata, created_by)
      VALUES (${document.tenantId}, ${document.namespace}, ${document.source}, ${document.sourceRef}, ${document.title}, ${document.sourceUrl},
              ${document.mimeType}, ${document.contentHash}, 'pending', ${JSON.stringify(document.metadata)}::jsonb, ${document.createdBy})
      ON CONFLICT (tenant_id, source, source_ref) DO UPDATE SET
        namespace = EXCLUDED.namespace, title = EXCLUDED.title, source_url = EXCLUDED.source_url, mime_type = EXCLUDED.mime_type,
        content_hash = EXCLUDED.content_hash, metadata = EXCLUDED.metadata,
        status = CASE WHEN ${unchanged} THEN ai.documents.status ELSE 'pending' END,
        updated_at = now()
      RETURNING ${tx.unsafe(DOCUMENT_COLUMNS)}`;
    if (row === undefined) throw new Error("upsert returned no row");
    return { document: toDocument(row), unchanged };
  });

const chunkRows = (input: { tenantId: string; documentId: string; namespace: string; embeddingModel: string; embeddingVersion: string; chunks: readonly NewChunk[] }) =>
  input.chunks.map((chunk) => ({
    document_id: input.documentId,
    tenant_id: input.tenantId,
    namespace: input.namespace,
    chunk_index: chunk.chunkIndex,
    text: chunk.text,
    token_count: chunk.tokenCount,
    embedding: toVectorLiteral(chunk.embedding),
    embedding_model: input.embeddingModel,
    embedding_version: input.embeddingVersion,
    metadata: JSON.stringify(chunk.metadata),
  }));

const replaceChunks = (sql: Sql): KnowledgeRepository["replaceChunks"] => async (input) =>
  withTenantTransaction(sql, { tenantId: input.tenantId }, async (tx) => {
    await asRuntime(tx);
    // FOR UPDATE also needs the write policy: a platform document is never locked by a tenant.
    const [document] = await tx<{ namespace: string }[]>`SELECT namespace FROM ai.documents WHERE id = ${input.documentId} FOR UPDATE`;
    if (document === undefined) return false;
    await tx`DELETE FROM ai.chunks_v1 WHERE document_id = ${input.documentId}`;
    const rows = chunkRows({ ...input, namespace: document.namespace });
    if (rows.length > 0) {
      await tx`INSERT INTO ai.chunks_v1 ${tx(rows, "document_id", "tenant_id", "namespace", "chunk_index", "text", "token_count", "embedding", "embedding_model", "embedding_version", "metadata")}`;
    }
    await tx`UPDATE ai.documents SET status = 'ready', updated_at = now() WHERE id = ${input.documentId}`;
    return true;
  });

type MatchRow = { document_id: string; chunk_index: number; text: string; distance: number; title: string | null; source_url: string | null; namespace: string };

const toMatch = (row: MatchRow): ChunkMatch => ({
  documentId: row.document_id,
  chunkIndex: row.chunk_index,
  text: row.text,
  distance: Number(row.distance),
  title: row.title,
  sourceUrl: row.source_url,
  namespace: row.namespace,
});

const searchChunks = (sql: Sql): KnowledgeRepository["searchChunks"] => async (input) =>
  withTenantTransaction(sql, { tenantId: input.tenantId, readOnly: true }, async (tx) => {
    await asRuntime(tx);
    // Tenant and namespace filters follow the ANN scan; iterative scans keep topK results (pgvector 0.8).
    await tx.unsafe("SET LOCAL hnsw.iterative_scan = relaxed_order");
    const vector = toVectorLiteral(input.embedding);
    const rows = await tx<MatchRow[]>`
      WITH nearest AS (
        SELECT document_id, chunk_index, text, namespace, embedding <=> ${vector}::vector AS distance
        FROM ai.chunks_v1
        WHERE namespace = ANY(${[...input.namespaces]}::text[]) AND embedding_model = ${input.embeddingModel}
        ORDER BY embedding <=> ${vector}::vector
        LIMIT ${input.topK}
      )
      SELECT n.document_id, n.chunk_index, n.text, n.namespace, n.distance, d.title, d.source_url
      FROM nearest n JOIN ai.documents d ON d.id = n.document_id AND d.status = 'ready'
      ORDER BY n.distance, n.document_id, n.chunk_index`;
    return rows.map(toMatch);
  });

const deleteDocument = (sql: Sql): KnowledgeRepository["deleteDocument"] => async (input) =>
  withTenantTransaction(sql, { tenantId: input.tenantId }, async (tx) => {
    await asRuntime(tx);
    const deleted = await tx`DELETE FROM ai.documents WHERE id = ${input.documentId} RETURNING id`;
    return deleted.length > 0;
  });

const listDocuments = (sql: Sql): KnowledgeRepository["listDocuments"] => async (input) =>
  withTenantTransaction(sql, { tenantId: input.tenantId, readOnly: true }, async (tx) => {
    await asRuntime(tx);
    const rows = await tx<DocumentRow[]>`
      SELECT ${tx.unsafe(DOCUMENT_COLUMNS)} FROM ai.documents
      WHERE tenant_id = ${input.tenantId}
        AND (${input.namespace ?? null}::text IS NULL OR namespace = ${input.namespace ?? null})
        AND (${input.cursor ?? null}::uuid IS NULL OR id < ${input.cursor ?? null}::uuid)
      ORDER BY id DESC
      LIMIT ${input.limit + 1}`;
    const page = rows.slice(0, input.limit).map(toDocument);
    return { documents: page, nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null };
  });

/**
 * Postgres adapter of the knowledge base (SP3 Task 12): tables `ai.documents`
 * and `ai.chunks_v1` with `FORCE ROW LEVEL SECURITY`; each call is one
 * transaction with `app.tenant_id` set and role `knowledge_runtime`, bound
 * parameters only (vectors as checked `[x,...]` literals). Search uses the HNSW
 * cosine index (`ORDER BY embedding <=> $1 LIMIT k`).
 */
export const createPostgresKnowledgeRepository = (sql: Sql): KnowledgeRepository => ({
  upsertDocument: upsertDocument(sql),
  replaceChunks: replaceChunks(sql),
  searchChunks: searchChunks(sql),
  deleteDocument: deleteDocument(sql),
  listDocuments: listDocuments(sql),
});
