import type { KnowledgeServices } from "@core/services";
import type { KnowledgePort } from "../runtime/runtime-ports.ts";

/** A knowledge use case refused its input; the message names the code and the fields only. */
export class KnowledgeUseCaseError extends Error {
  readonly code: string;

  constructor(code: string, fields: readonly string[]) {
    super(`${code}${fields.length === 0 ? "" : `: ${fields.join(", ")}`}`);
    this.name = "KnowledgeUseCaseError";
    this.code = code;
  }
}

type Outcome<T> = { ok: true; data: T } | { ok: false; error: { readonly code: string; readonly details?: readonly { readonly field: string }[] } };

const unwrap = <T>(result: Outcome<T>): T => {
  if (result.ok) return result.data;
  throw new KnowledgeUseCaseError(result.error.code, (result.error.details ?? []).map((detail) => detail.field));
};

/**
 * `KnowledgePort` over the knowledge use cases, for in-process runs (`pnpm seed:local`,
 * Postgres tests). `apps/mastra` keeps its own binding with typed errors
 * (`knowledge-port-binding.ts`).
 */
export const knowledgePortFromUseCases = (
  knowledge: Pick<KnowledgeServices, "searchChunks" | "registerDocument" | "replaceDocumentChunks">,
): KnowledgePort => ({
  searchChunks: async (input) => unwrap(await knowledge.searchChunks({ ...input, namespaces: [...input.namespaces], embedding: [...input.embedding] })),
  registerDocument: async (input) => unwrap(await knowledge.registerDocument({ ...input, metadata: { ...input.metadata } })),
  replaceChunks: async (input) =>
    unwrap(
      await knowledge.replaceDocumentChunks({
        ...input,
        chunks: input.chunks.map((chunk) => ({ ...chunk, embedding: [...chunk.embedding], metadata: {} })),
      }),
    ),
});
