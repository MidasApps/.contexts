import type { KnowledgeRepository, UpsertedDocument } from "../ports/knowledge-repository.ts";
import {
  inputErrorOf,
  type KnowledgeInputError,
  type RegisterDocumentInput,
  RegisterDocumentInputSchema,
} from "./knowledge-input.schema.ts";

export type RegisterDocument = (
  input: RegisterDocumentInput,
) => Promise<{ ok: true; data: UpsertedDocument } | { ok: false; error: KnowledgeInputError }>;

/**
 * Registers (or re-registers) a document before chunking (SP3 spec §11):
 * idempotent by `(tenant, source, sourceRef)`; `unchanged: true` lets ingestion
 * skip re-embedding the same content.
 */
export const makeRegisterDocument =
  (deps: { readonly repository: KnowledgeRepository }): RegisterDocument =>
  async (input) => {
    const parsed = RegisterDocumentInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: inputErrorOf(parsed.error) };
    return { ok: true, data: await deps.repository.upsertDocument(parsed.data) };
  };
