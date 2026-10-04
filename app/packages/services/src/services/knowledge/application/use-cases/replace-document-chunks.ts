import type { KnowledgeRepository } from "../ports/knowledge-repository.ts";
import {
  inputErrorOf,
  type KnowledgeInputError,
  type ReplaceDocumentChunksInput,
  ReplaceDocumentChunksInputSchema,
} from "./knowledge-input.schema.ts";

export type ReplaceDocumentChunks = (
  input: ReplaceDocumentChunksInput,
) => Promise<
  | { ok: true; data: { chunkCount: number } }
  | { ok: false; error: KnowledgeInputError | { readonly code: "DOCUMENT_NOT_FOUND" } }
>;

/**
 * Replaces every chunk of a document in one transaction and marks it `ready`
 * (contracts/pgvector.md §3, §15: chunks are never updated in place). A
 * document of another tenant, or a platform document seen by a tenant, is
 * `DOCUMENT_NOT_FOUND`.
 */
export const makeReplaceDocumentChunks =
  (deps: { readonly repository: KnowledgeRepository }): ReplaceDocumentChunks =>
  async (input) => {
    const parsed = ReplaceDocumentChunksInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: inputErrorOf(parsed.error) };
    const replaced = await deps.repository.replaceChunks(parsed.data);
    return replaced
      ? { ok: true, data: { chunkCount: parsed.data.chunks.length } }
      : { ok: false, error: { code: "DOCUMENT_NOT_FOUND" } };
  };
