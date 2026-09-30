import type { KnowledgeDocument } from "@core/contracts";
import type { KnowledgeRepository } from "../ports/knowledge-repository.ts";
import { type DocumentRefInput, DocumentRefInputSchema, inputErrorOf, type KnowledgeInputError } from "./knowledge-input.schema.ts";

export type GetDocument = (
  input: DocumentRefInput,
) => Promise<{ ok: true; data: KnowledgeDocument } | { ok: false; error: KnowledgeInputError | { readonly code: "DOCUMENT_NOT_FOUND" } }>;

/** One of the tenant's documents (`GET /v1/organizations/{organizationId}/knowledge/documents/{documentId}`). */
export const makeGetDocument =
  (deps: { readonly repository: KnowledgeRepository }): GetDocument =>
  async (input) => {
    const parsed = DocumentRefInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: inputErrorOf(parsed.error) };
    const document = await deps.repository.getDocument(parsed.data);
    return document === null ? { ok: false, error: { code: "DOCUMENT_NOT_FOUND" } } : { ok: true, data: document };
  };
