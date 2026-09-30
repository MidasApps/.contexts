import type { KnowledgePort } from "@core/agents";
import type { KnowledgeServices } from "@core/services";

/** A knowledge use case refused its input (bad vector, namespace, topK, chunk indexes): a bug in the caller. */
export class KnowledgeSearchRejectedError extends Error {
  readonly code = "KNOWLEDGE_SEARCH_REJECTED";
  readonly fields: readonly string[];

  constructor(fields: readonly string[]) {
    super(`KNOWLEDGE_SEARCH_REJECTED: invalid ${fields.join(", ")}`);
    this.name = "KnowledgeSearchRejectedError";
    this.fields = fields;
  }
}

/** The document whose chunks are replaced is gone for this tenant (deleted meanwhile, or another tenant's). */
export class KnowledgeDocumentMissingError extends Error {
  readonly code = "KNOWLEDGE_DOCUMENT_MISSING";

  constructor() {
    super("KNOWLEDGE_DOCUMENT_MISSING: the document to index no longer exists for this tenant");
    this.name = "KnowledgeDocumentMissingError";
  }
}

type Rejected = { readonly code: "VALIDATION_FAILED"; readonly details: readonly { readonly field: string }[] } | { readonly code: "DOCUMENT_NOT_FOUND" };

const rejectionOf = (error: Rejected): Error =>
  error.code === "DOCUMENT_NOT_FOUND" ? new KnowledgeDocumentMissingError() : new KnowledgeSearchRejectedError(error.details.map((detail) => detail.field));

/**
 * Binds `KnowledgePort` to the knowledge use cases (SP3 Tasks 12, 14). Tenant and
 * namespaces come from the caller's server-side context; a rejected input rejects
 * (the tool pipeline answers `TOOL_FAILED`, a workflow step fails).
 */
export const bindKnowledgePort = (knowledge: Pick<KnowledgeServices, "searchChunks" | "registerDocument" | "replaceDocumentChunks">): KnowledgePort => ({
  searchChunks: async (input) => {
    const result = await knowledge.searchChunks({ ...input, namespaces: [...input.namespaces], embedding: [...input.embedding] });
    if (!result.ok) throw rejectionOf(result.error);
    return result.data;
  },
  registerDocument: async (input) => {
    const result = await knowledge.registerDocument({ ...input, metadata: { ...input.metadata } });
    if (!result.ok) throw rejectionOf(result.error);
    return result.data;
  },
  replaceChunks: async (input) => {
    const chunks = input.chunks.map((chunk) => ({ ...chunk, embedding: [...chunk.embedding], metadata: {} }));
    const result = await knowledge.replaceDocumentChunks({ ...input, chunks });
    if (!result.ok) throw rejectionOf(result.error);
    return result.data;
  },
});
