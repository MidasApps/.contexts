import { KnowledgeDocumentIdSchema, KnowledgeDocumentSourceSchema, KnowledgeNamespaceSchema, PLATFORM_TENANT_ID } from "@core/contracts";
import { z } from "zod";
import { CHUNKS_V1_DIMENSIONS } from "../../adapters/driven/drizzle-schema.ts";

/**
 * Server-only inputs of the knowledge use cases (SP3 Task 12). Tenants come from
 * the server-side context; the model or a client body never names one.
 */

export const MAX_CHUNKS_PER_DOCUMENT = 10_000;
export const MAX_SEARCH_TOP_K = 20;
export const MAX_SEARCH_NAMESPACES = 20;

const TenantOrPlatformSchema = z.string().min(1).max(128);
const EmbeddingSchema = z.array(z.number().refine(Number.isFinite, { error: "Expected a finite number." })).length(CHUNKS_V1_DIMENSIONS);
const PLATFORM_NAMESPACE = /^(?:catalog|module:.+)$/;

/** Platform content lives in `catalog` / `module:*`; a tenant's in `tenant` / `project:*` (decision 0022 amendment). */
const namespaceFitsTenant = (input: { tenantId: string; namespace: string }): boolean =>
  (input.tenantId === PLATFORM_TENANT_ID) === PLATFORM_NAMESPACE.test(input.namespace);

export const RegisterDocumentInputSchema = z
  .strictObject({
    tenantId: TenantOrPlatformSchema,
    namespace: KnowledgeNamespaceSchema,
    source: KnowledgeDocumentSourceSchema,
    sourceRef: z.string().min(1).max(2048),
    title: z.string().max(500).nullable().default(null),
    sourceUrl: z.url({ protocol: /^https$/ }).nullable().default(null),
    mimeType: z.string().max(255).nullable().default(null),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    metadata: z.record(z.string(), z.unknown()).default({}),
    createdBy: z.string().min(1).nullable().default(null),
  })
  .refine(namespaceFitsTenant, { error: "Namespace does not belong to this tenant.", path: ["namespace"] });
export type RegisterDocumentInput = z.input<typeof RegisterDocumentInputSchema>;

const ChunkInputSchema = z.strictObject({
  chunkIndex: z.int().min(0),
  text: z.string().min(1),
  tokenCount: z.int().min(0),
  embedding: EmbeddingSchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
});

/** Chunk indexes are exactly 0..n-1 (contracts/pgvector.md §12). */
const hasDenseIndexes = (chunks: readonly { chunkIndex: number }[]): boolean =>
  chunks
    .map((chunk) => chunk.chunkIndex)
    .sort((left, right) => left - right)
    .every((index, position) => index === position);

export const ReplaceDocumentChunksInputSchema = z.strictObject({
  tenantId: TenantOrPlatformSchema,
  documentId: KnowledgeDocumentIdSchema,
  embeddingModel: z.string().min(1).max(200),
  embeddingVersion: z.string().min(1).max(100),
  chunks: z.array(ChunkInputSchema).max(MAX_CHUNKS_PER_DOCUMENT).refine(hasDenseIndexes, { error: "Chunk indexes must be 0..n-1, once each." }),
});
export type ReplaceDocumentChunksInput = z.input<typeof ReplaceDocumentChunksInputSchema>;

export const SearchChunksInputSchema = z.strictObject({
  tenantId: TenantOrPlatformSchema,
  namespaces: z.array(KnowledgeNamespaceSchema).min(1).max(MAX_SEARCH_NAMESPACES),
  embedding: EmbeddingSchema,
  topK: z.int().min(1).max(MAX_SEARCH_TOP_K).default(5),
});
export type SearchChunksInput = z.input<typeof SearchChunksInputSchema>;

export const DocumentRefInputSchema = z.strictObject({ tenantId: TenantOrPlatformSchema, documentId: KnowledgeDocumentIdSchema });
export type DocumentRefInput = z.input<typeof DocumentRefInputSchema>;

export const ListDocumentsInputSchema = z.strictObject({
  tenantId: TenantOrPlatformSchema,
  namespace: KnowledgeNamespaceSchema.optional(),
  cursor: KnowledgeDocumentIdSchema.optional(),
  limit: z.int().min(1).max(100).default(20),
});
export type ListDocumentsInput = z.input<typeof ListDocumentsInputSchema>;

/** A rejected input: every field issue at once (the `VALIDATION_FAILED` details shape). */
export type KnowledgeInputError = { readonly code: "VALIDATION_FAILED"; readonly details: { field: string; issue: string }[] };

export const inputErrorOf = (error: z.ZodError): KnowledgeInputError => ({
  code: "VALIDATION_FAILED",
  details: error.issues.map((issue) => ({ field: issue.path.map(String).join("."), issue: issue.code.toUpperCase() })),
});
