// Public API of the knowledge context (SP3 Task 12): tables ai.documents / ai.chunks_v1 with row level security.
export type {
  ChunkMatch,
  DocumentPage,
  KnowledgeRepository,
  NewChunk,
  NewKnowledgeDocument,
  UpsertedDocument,
} from "./application/ports/knowledge-repository.ts";
export {
  DocumentRefInputSchema,
  type DocumentRefInput,
  type KnowledgeInputError,
  ListDocumentsInputSchema,
  type ListDocumentsInput,
  MAX_CHUNKS_PER_DOCUMENT,
  MAX_SEARCH_NAMESPACES,
  MAX_SEARCH_TOP_K,
  RegisterDocumentInputSchema,
  type RegisterDocumentInput,
  ReplaceDocumentChunksInputSchema,
  type ReplaceDocumentChunksInput,
  SearchChunksInputSchema,
  type SearchChunksInput,
} from "./application/use-cases/knowledge-input.schema.ts";
export { makeRegisterDocument, type RegisterDocument } from "./application/use-cases/register-document.ts";
export { makeReplaceDocumentChunks, type ReplaceDocumentChunks } from "./application/use-cases/replace-document-chunks.ts";
export { makeSearchChunks, MIN_CITATION_SCORE, type SearchChunks } from "./application/use-cases/search-chunks.ts";
export { makeDeleteDocument, type DeleteDocument } from "./application/use-cases/delete-document.ts";
export { makeListDocuments, type ListDocuments } from "./application/use-cases/list-documents.ts";
export { makeGetDocument, type GetDocument } from "./application/use-cases/get-document.ts";
export { createKnowledgeServices, type KnowledgeServices } from "./composition.ts";
export {
  buildKnowledgeDocumentsRoutes,
  KNOWLEDGE_DELETE_PERMISSION,
  KNOWLEDGE_READ_PERMISSION,
  type KnowledgeDocumentsServices,
} from "./adapters/driving/knowledge-documents-route-handler.ts";
export { buildKnowledgeSourcesRoutes, KNOWLEDGE_INGEST_WORKFLOW, KNOWLEDGE_WRITE_PERMISSION } from "./adapters/driving/knowledge-sources-route-handler.ts";
export { CHUNKS_V1_DIMENSIONS, knowledgeChunksV1, knowledgeDocuments } from "./adapters/driven/drizzle-schema.ts";
export {
  createPostgresKnowledgeRepository,
  InvalidEmbeddingError,
  KNOWLEDGE_RUNTIME_ROLE,
  toVectorLiteral,
} from "./adapters/driven/postgres-knowledge-repository.ts";
export { createLogKnowledgeEventPublisher, type KnowledgeDocumentIndexedEvent } from "./adapters/driven/log-knowledge-events.ts";
