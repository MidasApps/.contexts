import type { KnowledgePort } from "@core/agents";
import type { SearchChunks } from "@core/services";

/** The search input broke a use-case rule (bad vector, namespace or topK): a bug in the calling tool. */
export class KnowledgeSearchRejectedError extends Error {
  readonly code = "KNOWLEDGE_SEARCH_REJECTED";
  readonly fields: readonly string[];

  constructor(fields: readonly string[]) {
    super(`KNOWLEDGE_SEARCH_REJECTED: invalid ${fields.join(", ")}`);
    this.name = "KnowledgeSearchRejectedError";
    this.fields = fields;
  }
}

/**
 * Binds `KnowledgePort` to the knowledge context's `searchChunks` use case
 * (SP3 Task 12). Tenant and namespaces come from the tool's server-side
 * context; a rejected input rejects (the tool pipeline answers `TOOL_FAILED`).
 */
export const bindKnowledgePort = (searchChunks: SearchChunks): KnowledgePort => ({
  searchChunks: async (input) => {
    const result = await searchChunks({ ...input, namespaces: [...input.namespaces], embedding: [...input.embedding] });
    if (!result.ok) throw new KnowledgeSearchRejectedError(result.error.details.map((detail) => detail.field));
    return result.data;
  },
});
