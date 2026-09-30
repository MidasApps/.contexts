// Composition root of the knowledge context (SP3 Tasks 12, 14): use cases over one repository.
import type { KnowledgeRepository } from "./application/ports/knowledge-repository.ts";
import { type DeleteDocument, makeDeleteDocument } from "./application/use-cases/delete-document.ts";
import { type GetDocument, makeGetDocument } from "./application/use-cases/get-document.ts";
import { type ListDocuments, makeListDocuments } from "./application/use-cases/list-documents.ts";
import { makeRegisterDocument, type RegisterDocument } from "./application/use-cases/register-document.ts";
import { makeReplaceDocumentChunks, type ReplaceDocumentChunks } from "./application/use-cases/replace-document-chunks.ts";
import { makeSearchChunks, type SearchChunks } from "./application/use-cases/search-chunks.ts";

export type KnowledgeServices = {
  readonly registerDocument: RegisterDocument;
  readonly replaceDocumentChunks: ReplaceDocumentChunks;
  readonly searchChunks: SearchChunks;
  readonly getDocument: GetDocument;
  readonly listDocuments: ListDocuments;
  readonly deleteDocument: DeleteDocument;
};

/**
 * Binds the knowledge use cases.
 * @param deps.embeddingModel model id stored with the vectors; search compares only those.
 */
export const createKnowledgeServices = (deps: { readonly repository: KnowledgeRepository; readonly embeddingModel: string }): KnowledgeServices => ({
  registerDocument: makeRegisterDocument(deps),
  replaceDocumentChunks: makeReplaceDocumentChunks(deps),
  searchChunks: makeSearchChunks(deps),
  getDocument: makeGetDocument(deps),
  listDocuments: makeListDocuments(deps),
  deleteDocument: makeDeleteDocument(deps),
});
