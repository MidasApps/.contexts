import type { DocumentPage, KnowledgeRepository } from "../ports/knowledge-repository.ts";
import {
  inputErrorOf,
  type KnowledgeInputError,
  type ListDocumentsInput,
  ListDocumentsInputSchema,
} from "./knowledge-input.schema.ts";

export type ListDocuments = (
  input: ListDocumentsInput,
) => Promise<{ ok: true; data: DocumentPage } | { ok: false; error: KnowledgeInputError }>;

/** The tenant's documents, newest first, cursor-paginated (limit 1–100, default 20; contracts/api.md §9). */
export const makeListDocuments =
  (deps: { readonly repository: KnowledgeRepository }): ListDocuments =>
  async (input) => {
    const parsed = ListDocumentsInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: inputErrorOf(parsed.error) };
    return { ok: true, data: await deps.repository.listDocuments(parsed.data) };
  };
