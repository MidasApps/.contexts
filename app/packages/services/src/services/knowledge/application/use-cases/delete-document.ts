import type { KnowledgeRepository } from "../ports/knowledge-repository.ts";
import {
  type DocumentRefInput,
  DocumentRefInputSchema,
  inputErrorOf,
  type KnowledgeInputError,
} from "./knowledge-input.schema.ts";

export type DeleteDocument = (
  input: DocumentRefInput,
) => Promise<
  { ok: true; data: null } | { ok: false; error: KnowledgeInputError | { readonly code: "DOCUMENT_NOT_FOUND" } }
>;

/** Deletes a tenant document and its chunks (cascade). Platform documents are never deletable by a tenant. */
export const makeDeleteDocument =
  (deps: { readonly repository: KnowledgeRepository }): DeleteDocument =>
  async (input) => {
    const parsed = DocumentRefInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: inputErrorOf(parsed.error) };
    return (await deps.repository.deleteDocument(parsed.data))
      ? { ok: true, data: null }
      : { ok: false, error: { code: "DOCUMENT_NOT_FOUND" } };
  };
