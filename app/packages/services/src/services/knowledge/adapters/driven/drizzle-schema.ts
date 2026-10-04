import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgPolicy,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { aiSchema } from "../../../shared/postgres/drizzle-schemas.ts";

/**
 * Knowledge base tables (SP3 spec §11, decisions 0022 and 0023): source of the
 * Drizzle migrations only; queries go through postgres.js in
 * `postgres-knowledge-repository.ts`. `FORCE ROW LEVEL SECURITY` and the
 * runtime role grants are in the custom migration that follows the generated one.
 */

/** Embedding dimension of `chunks_v1` (decision 0022, D3-06). A new model or dimension means `chunks_v2`. */
export const CHUNKS_V1_DIMENSIONS = 1536;

const currentTenant = sql`current_setting('app.tenant_id', true)`;

// Reads see the tenant's rows and shared platform rows; writes only the tenant's own
// rows (platform content is written with app.tenant_id = '_platform').
const tenantPolicies = (table: string) => [
  pgPolicy(`${table}_tenant_rows`, {
    for: "all",
    using: sql`tenant_id = ${currentTenant}`,
    withCheck: sql`tenant_id = ${currentTenant}`,
  }),
  pgPolicy(`${table}_platform_read`, { for: "select", using: sql`tenant_id = '_platform'` }),
];

export const knowledgeDocuments = aiSchema
  .table(
    "documents",
    {
      id: uuid("id").primaryKey().default(sql`uuidv7()`),
      tenantId: text("tenant_id").notNull(),
      namespace: text("namespace").notNull(),
      source: text("source").notNull(),
      sourceRef: text("source_ref").notNull(),
      title: text("title"),
      sourceUrl: text("source_url"),
      mimeType: text("mime_type"),
      contentHash: text("content_hash").notNull(),
      status: text("status").notNull().default("pending"),
      metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
      createdBy: text("created_by"),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      unique("documents_tenant_source_ref_key").on(table.tenantId, table.source, table.sourceRef),
      // Target of the chunks' (document_id, tenant_id) key: a chunk can never point at another tenant's document.
      unique("documents_id_tenant_key").on(table.id, table.tenantId),
      index("documents_tenant_namespace_idx").on(table.tenantId, table.namespace),
      check("documents_source_check", sql`${table.source} IN ('upload', 'url', 'catalog', 'module')`),
      check("documents_status_check", sql`${table.status} IN ('pending', 'ready', 'failed', 'deleted')`),
      check("documents_content_hash_check", sql`${table.contentHash} ~ '^[a-f0-9]{64}$'`),
      ...tenantPolicies("documents"),
    ],
  )
  .enableRLS();

export const knowledgeChunksV1 = aiSchema
  .table(
    "chunks_v1",
    {
      id: uuid("id").primaryKey().default(sql`uuidv7()`),
      documentId: uuid("document_id").notNull(),
      tenantId: text("tenant_id").notNull(),
      namespace: text("namespace").notNull(),
      chunkIndex: integer("chunk_index").notNull(),
      text: text("text").notNull(),
      tokenCount: integer("token_count").notNull(),
      embedding: vector("embedding", { dimensions: CHUNKS_V1_DIMENSIONS }).notNull(),
      embeddingModel: text("embedding_model").notNull(),
      embeddingVersion: text("embedding_version").notNull(),
      metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      foreignKey({
        name: "chunks_v1_document_fk",
        columns: [table.documentId, table.tenantId],
        foreignColumns: [knowledgeDocuments.id, knowledgeDocuments.tenantId],
      }).onDelete("cascade"),
      unique("chunks_v1_document_chunk_key").on(table.documentId, table.chunkIndex),
      index("chunks_v1_document_idx").on(table.documentId),
      index("chunks_v1_tenant_namespace_idx").on(table.tenantId, table.namespace),
      index("chunks_v1_embedding_hnsw")
        .using("hnsw", table.embedding.op("vector_cosine_ops"))
        .with({ m: 16, ef_construction: 64 }),
      check("chunks_v1_chunk_index_check", sql`${table.chunkIndex} >= 0`),
      check("chunks_v1_token_count_check", sql`${table.tokenCount} >= 0`),
      ...tenantPolicies("chunks_v1"),
    ],
  )
  .enableRLS();
