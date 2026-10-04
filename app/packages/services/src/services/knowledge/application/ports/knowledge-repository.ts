import type { KnowledgeDocument, KnowledgeDocumentSource, KnowledgeNamespace } from "@core/contracts";

/**
 * Driven port of the knowledge base (SP3 spec §11, decision 0022). Every call
 * names the tenant it runs as; the Postgres adapter turns it into
 * `app.tenant_id` for row level security, so a row of another tenant is never
 * read or written even if a caller passes a foreign id. Reads also see
 * `_platform` rows; writes only the tenant's own.
 */

export type NewKnowledgeDocument = {
  readonly tenantId: string;
  readonly namespace: KnowledgeNamespace;
  readonly source: KnowledgeDocumentSource;
  readonly sourceRef: string;
  readonly title: string | null;
  readonly sourceUrl: string | null;
  readonly mimeType: string | null;
  /** SHA-256 hex of the extracted text. */
  readonly contentHash: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdBy: string | null;
};

export type UpsertedDocument = {
  readonly document: KnowledgeDocument;
  /** Same content and namespace as an already indexed (`ready`) document: no re-embedding needed. */
  readonly unchanged: boolean;
};

export type NewChunk = {
  readonly chunkIndex: number;
  readonly text: string;
  readonly tokenCount: number;
  readonly embedding: readonly number[];
  readonly metadata: Readonly<Record<string, unknown>>;
};

export type ChunkMatch = {
  readonly documentId: string;
  readonly chunkIndex: number;
  readonly text: string;
  /** Cosine distance (`<=>`), 0 = identical. */
  readonly distance: number;
  readonly title: string | null;
  readonly sourceUrl: string | null;
  readonly namespace: string;
};

export type DocumentPage = { readonly documents: readonly KnowledgeDocument[]; readonly nextCursor: string | null };

export type KnowledgeRepository = {
  /** Idempotent by `(tenant_id, source, source_ref)`; changed content goes back to `pending`. */
  readonly upsertDocument: (document: NewKnowledgeDocument) => Promise<UpsertedDocument>;
  /**
   * Replaces all chunks of a document in one transaction and marks it `ready`.
   * @returns `false` when the tenant has no such document (nothing changes).
   */
  readonly replaceChunks: (input: {
    readonly tenantId: string;
    readonly documentId: string;
    readonly embeddingModel: string;
    readonly embeddingVersion: string;
    readonly chunks: readonly NewChunk[];
  }) => Promise<boolean>;
  /** Nearest chunks of `ready` documents in the namespaces, closest first. */
  readonly searchChunks: (input: {
    readonly tenantId: string;
    readonly namespaces: readonly string[];
    readonly embedding: readonly number[];
    readonly embeddingModel: string;
    readonly topK: number;
  }) => Promise<readonly ChunkMatch[]>;
  /** Deletes a document of the tenant and, by cascade, its chunks. @returns whether it existed. */
  readonly deleteDocument: (input: { readonly tenantId: string; readonly documentId: string }) => Promise<boolean>;
  /** One of the tenant's own documents (platform documents are not addressable); `null` when missing. */
  readonly getDocument: (input: {
    readonly tenantId: string;
    readonly documentId: string;
  }) => Promise<KnowledgeDocument | null>;
  /** The tenant's own documents, newest first (platform documents are not listed). */
  readonly listDocuments: (input: {
    readonly tenantId: string;
    readonly namespace?: string | undefined;
    readonly cursor?: string | undefined;
    readonly limit: number;
  }) => Promise<DocumentPage>;
};
