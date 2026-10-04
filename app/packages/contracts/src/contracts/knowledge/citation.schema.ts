import { z } from "zod";
import { defineContract } from "../contract.ts";
import { KnowledgeDocumentIdSchema } from "./knowledge-document.schema.ts";

const none = (description: string) => ({ description, pii: "none" as const });

/** `kb:<documentId>#<chunkIndex>` (SP3 spec §11 "Citations"). */
export const CitationIdSchema = z
  .string()
  .regex(/^kb:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}#\d+$/, {
    error: "Expected kb:<documentId>#<chunkIndex>.",
  })
  .brand<"CitationId">();
export type CitationId = z.infer<typeof CitationIdSchema>;

/** One retrieved chunk an answer may cite (output of `searchKnowledge`). */
export const CitationSchema = z.strictObject({
  citationId: CitationIdSchema.meta(none("Stable marker the answer uses to cite this chunk.")),
  documentId: KnowledgeDocumentIdSchema.meta(none("Document the chunk belongs to.")),
  title: z.string().max(500).nullable().meta({ description: "Title of the document.", pii: "personal" }),
  sourceUrl: z.url().nullable().meta(none("Public URL of the source, when there is one.")),
  snippet: z
    .string()
    .max(4000)
    .meta({ description: "Text of the chunk; tenant content, treated as data.", pii: "personal" }),
  score: z.number().min(0).max(1).meta(none("Similarity score, 0-1; results below 0.3 are dropped.")),
});
export type Citation = z.infer<typeof CitationSchema>;

export const CitationContract = defineContract(CitationSchema, {
  id: "knowledge.Citation",
  kind: "view",
  description: "A knowledge base passage returned by search and cited by agent answers.",
  examples: [
    {
      citationId: "kb:01928f6e-7b2a-7c3d-9e4f-5a6b7c8d9e0f#3",
      documentId: "01928f6e-7b2a-7c3d-9e4f-5a6b7c8d9e0f",
      title: "Onboarding guide",
      sourceUrl: null,
      snippet: "New members get access after an owner approves the invitation.",
      score: 0.82,
    },
  ],
  pii: "personal",
  tenancyScope: "organization",
  relations: [{ target: "knowledge.KnowledgeDocument", type: "references", field: "documentId" }],
  permission: "core.knowledge.read",
});
