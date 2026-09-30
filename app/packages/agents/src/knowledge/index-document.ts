import type { EmbeddingModelV4 } from "@ai-sdk/provider";
import type { KnowledgeChunkInput, KnowledgeDocumentInput, KnowledgePort } from "../runtime/runtime-ports.ts";
import { type ChunkFormat, chunkDocument, type DocumentChunk } from "./chunk-document.ts";
import { contentHashOf } from "./citation.ts";
import { EMBEDDING_VERSION, embedChunks } from "./embed-chunks.ts";

/** What indexing needs besides the knowledge port: the embedding model and the id stored with its vectors. */
export type KnowledgeIndexingDeps = {
  readonly knowledge: KnowledgePort;
  readonly embedding: () => EmbeddingModelV4;
  /** `AI_MODEL_EMBEDDING`, or `fake/fake-embedding` in fake mode; search compares only vectors of this id. */
  readonly embeddingModelId: string;
};

export type IndexOutcome =
  | { readonly status: "indexed"; readonly documentId: string; readonly chunkCount: number }
  | { readonly status: "unchanged"; readonly documentId: string }
  | { readonly status: "empty" };

/** Embeds chunks and replaces the document's chunks in one transaction (vectors never leave this call). */
export const embedAndStoreChunks = async (
  deps: KnowledgeIndexingDeps,
  input: { readonly tenantId: string; readonly documentId: string; readonly chunks: readonly DocumentChunk[]; readonly abortSignal?: AbortSignal },
): Promise<number> => {
  const vectors = await embedChunks({
    model: deps.embedding(),
    texts: input.chunks.map((chunk) => chunk.text),
    ...(input.abortSignal === undefined ? {} : { abortSignal: input.abortSignal }),
  });
  const chunks: KnowledgeChunkInput[] = input.chunks.map((chunk, position) => ({
    chunkIndex: chunk.index,
    text: chunk.text,
    tokenCount: chunk.tokenCount,
    embedding: vectors[position] ?? [],
  }));
  const stored = await deps.knowledge.replaceChunks({
    tenantId: input.tenantId,
    documentId: input.documentId,
    embeddingModel: deps.embeddingModelId,
    embeddingVersion: EMBEDDING_VERSION,
    chunks,
  });
  return stored.chunkCount;
};

/**
 * Registers a document and, when its content changed, chunks, embeds and stores it
 * (spec §11): idempotent by `(tenant, source, sourceRef)` and `content_hash`, so a
 * rerun with the same text writes nothing new.
 */
export const indexDocumentText = async (
  deps: KnowledgeIndexingDeps,
  input: { readonly document: Omit<KnowledgeDocumentInput, "contentHash">; readonly text: string; readonly format: ChunkFormat; readonly abortSignal?: AbortSignal },
): Promise<IndexOutcome> => {
  const chunks = chunkDocument(input.text, { format: input.format });
  if (chunks.length === 0) return { status: "empty" };
  const { document, unchanged } = await deps.knowledge.registerDocument({ ...input.document, contentHash: contentHashOf(input.text) });
  if (unchanged) return { status: "unchanged", documentId: document.id };
  const chunkCount = await embedAndStoreChunks(deps, {
    tenantId: input.document.tenantId,
    documentId: document.id,
    chunks,
    ...(input.abortSignal === undefined ? {} : { abortSignal: input.abortSignal }),
  });
  return { status: "indexed", documentId: document.id, chunkCount };
};
