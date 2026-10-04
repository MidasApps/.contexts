// Public API of the knowledge context (SP3 Task 12): tables ai.documents / ai.chunks_v1 with row level security.

export { CHUNKS_V1_DIMENSIONS, knowledgeChunksV1, knowledgeDocuments } from "./adapters/driven/drizzle-schema.ts";
export {
  createLogKnowledgeEventPublisher,
  type KnowledgeDocumentIndexedEvent,
} from "./adapters/driven/log-knowledge-events.ts";
export {
  createPostgresKnowledgeRepository,
  InvalidEmbeddingError,
  KNOWLEDGE_RUNTIME_ROLE,
  toVectorLiteral,
} from "./adapters/driven/postgres-knowledge-repository.ts";
export {
  buildKnowledgeDocumentsRoutes,
  KNOWLEDGE_DELETE_PERMISSION,
  KNOWLEDGE_READ_PERMISSION,
  type KnowledgeDocumentsServices,
} from "./adapters/driving/knowledge-documents-route-handler.ts";
export {
  buildKnowledgeSourcesRoutes,
  KNOWLEDGE_INGEST_WORKFLOW,
  KNOWLEDGE_WRITE_PERMISSION,
} from "./adapters/driving/knowledge-sources-route-handler.ts";
export type {
  ChunkMatch,
  DocumentPage,
  KnowledgeRepository,
  NewChunk,
  NewKnowledgeDocument,
  UpsertedDocument,
} from "./application/ports/knowledge-repository.ts";
export { type DeleteDocument, makeDeleteDocument } from "./application/use-cases/delete-document.ts";
export { type GetDocument, makeGetDocument } from "./application/use-cases/get-document.ts";
export {
  type DocumentRefInput,
  DocumentRefInputSchema,
  type KnowledgeInputError,
  type ListDocumentsInput,
  ListDocumentsInputSchema,
  MAX_CHUNKS_PER_DOCUMENT,
  MAX_SEARCH_NAMESPACES,
  MAX_SEARCH_TOP_K,
  type RegisterDocumentInput,
  RegisterDocumentInputSchema,
  type ReplaceDocumentChunksInput,
  ReplaceDocumentChunksInputSchema,
  type SearchChunksInput,
  SearchChunksInputSchema,
} from "./application/use-cases/knowledge-input.schema.ts";
export { type ListDocuments, makeListDocuments } from "./application/use-cases/list-documents.ts";
export { makeRegisterDocument, type RegisterDocument } from "./application/use-cases/register-document.ts";
export {
  makeReplaceDocumentChunks,
  type ReplaceDocumentChunks,
} from "./application/use-cases/replace-document-chunks.ts";
export { MIN_CITATION_SCORE, makeSearchChunks, type SearchChunks } from "./application/use-cases/search-chunks.ts";
export { createKnowledgeServices, type KnowledgeServices } from "./composition.ts";
