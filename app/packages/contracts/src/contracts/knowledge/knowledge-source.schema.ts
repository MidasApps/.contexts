import { z } from "zod";
import { defineContract } from "../contract.ts";
import { firestoreIdSchema } from "../primitives/ids.schema.ts";

const none = (description: string) => ({ description, pii: "none" as const });

/** Body of `POST /v1/knowledge/sources` (SP3 spec §11): starts the ingestion workflow. */
export const KnowledgeSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("file").meta(none("Ingest an uploaded file.")),
    fileId: firestoreIdSchema<"FileId">().meta(none("Id of a ready file uploaded with purpose knowledge.")),
  }),
  z.strictObject({
    kind: z.literal("url").meta(none("Ingest a public web page.")),
    url: z.url({ protocol: /^https$/ }).max(2048).meta(none("Public https URL to scrape.")),
  }),
]);
export type KnowledgeSource = z.infer<typeof KnowledgeSourceSchema>;

export const KnowledgeSourceContract = defineContract(KnowledgeSourceSchema, {
  id: "knowledge.KnowledgeSource",
  kind: "command",
  description: "Adds a file or a web page to the organization knowledge base; indexing runs in the background.",
  examples: [
    { kind: "file", fileId: "Fz9sK2lPq0WnR5tYu3bV" },
    { kind: "url", url: "https://docs.example.com/guide" },
  ],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
  permission: "core.knowledge.write",
});
