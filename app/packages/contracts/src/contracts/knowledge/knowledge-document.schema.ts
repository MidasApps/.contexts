import { z } from "zod";
import { defineContract } from "../contract.ts";
import { TenantIdSchema, UserIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";

const none = (description: string) => ({ description, pii: "none" as const });

/** Postgres `uuidv7()` id of `ai.documents` (decision 0022). */
export const KnowledgeDocumentIdSchema = z.uuid().brand<"KnowledgeDocumentId">();
export type KnowledgeDocumentId = z.infer<typeof KnowledgeDocumentIdSchema>;

/** Reserved tenant id for platform content readable by every tenant (decision 0022, D3-08). */
export const PLATFORM_TENANT_ID = "_platform";

/** `tenant`, `catalog`, `project:<projectId>` or `module:<moduleId>` (SP3 spec §11). */
export const KnowledgeNamespaceSchema = z
  .string()
  .regex(/^(?:tenant|catalog|project:[A-Za-z0-9_-]+|module:[a-z][a-z0-9-]*)$/, {
    error: "Expected tenant, catalog, project:<id> or module:<id>.",
  });
export type KnowledgeNamespace = z.infer<typeof KnowledgeNamespaceSchema>;

export const KnowledgeDocumentSourceSchema = z.enum(["upload", "url", "catalog", "module"]);
export type KnowledgeDocumentSource = z.infer<typeof KnowledgeDocumentSourceSchema>;

export const KnowledgeDocumentStatusSchema = z.enum(["pending", "ready", "failed", "deleted"]);
export type KnowledgeDocumentStatus = z.infer<typeof KnowledgeDocumentStatusSchema>;

/** One indexed document of the knowledge base (`ai.documents`, SP3 spec §11). */
export const KnowledgeDocumentSchema = z.strictObject({
  id: KnowledgeDocumentIdSchema.meta(none("Document id (uuidv7).")),
  tenantId: TenantIdSchema.meta(none("Owning organization, or _platform for shared platform content.")),
  namespace: KnowledgeNamespaceSchema.meta(none("Namespace the search tool filters on.")),
  source: KnowledgeDocumentSourceSchema.meta(none("Where the content came from.")),
  sourceRef: z
    .string()
    .min(1)
    .max(2048)
    .meta(none("File id, URL, contract id or module doc path; unique per tenant and source.")),
  title: z.string().max(500).nullable().meta({ description: "Document title shown in citations.", pii: "personal" }),
  sourceUrl: z.url().nullable().meta(none("Public URL of the source, when there is one.")),
  mimeType: z.string().max(255).nullable().meta(none("Media type of the original content.")),
  contentHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .meta(none("SHA-256 of the extracted text; unchanged content is not re-indexed.")),
  status: KnowledgeDocumentStatusSchema.meta(none("Indexing status.")),
  createdBy: UserIdSchema.nullable().meta({
    description: "Uid of the user who added it; null for platform content.",
    pii: "personal",
  }),
  createdAt: IsoDateTimeSchema.meta(none("When the document was registered (UTC).")),
  updatedAt: IsoDateTimeSchema.meta(none("When the document last changed (UTC).")),
});
export type KnowledgeDocument = z.infer<typeof KnowledgeDocumentSchema>;

export const KnowledgeDocumentContract = defineContract(KnowledgeDocumentSchema, {
  id: "knowledge.KnowledgeDocument",
  kind: "entity",
  description: "A document indexed in the knowledge base; agents cite its chunks when answering.",
  examples: [
    {
      id: "01928f6e-7b2a-7c3d-9e4f-5a6b7c8d9e0f",
      tenantId: "Jd8sK2lPq0WnR5tYu3bV",
      namespace: "tenant",
      source: "upload",
      sourceRef: "Fz9sK2lPq0WnR5tYu3bV",
      title: "Onboarding guide",
      sourceUrl: null,
      mimeType: "text/markdown",
      contentHash: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      status: "ready",
      createdBy: "uA1b2C3d4E5f6G7h8I9j",
      createdAt: "2026-09-29T14:30:00.000Z",
      updatedAt: "2026-09-29T14:31:00.000Z",
    },
  ],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "core.knowledge.read",
});
