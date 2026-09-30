// Knowledge base `/v1` descriptors (SP3 spec §11; decision 0022 amendment of Task 14).
import { z } from "zod";
import { none } from "../field-docs.ts";
import { defineEndpoint, type EndpointDefinition } from "../http/endpoint.ts";
import { dataEnvelope, listEnvelope, PageQuerySchema } from "../http/envelopes.schema.ts";
import { OrganizationIdSchema } from "../tenancy/ids.schema.ts";
import { KnowledgeDocumentIdSchema, KnowledgeDocumentSchema, KnowledgeNamespaceSchema } from "./knowledge-document.schema.ts";
import { KnowledgeSourceSchema } from "./knowledge-source.schema.ts";

const organizationId = OrganizationIdSchema.meta(none("Organization that owns the knowledge base."));
const organizationParams = z.object({ organizationId });
const documentParams = z.object({ organizationId, documentId: KnowledgeDocumentIdSchema.meta(none("Knowledge document id.")) });

/** Body of `202` from `POST .../knowledge/sources`: the ingestion workflow run to follow. */
export const KnowledgeIngestionRunSchema = z.strictObject({
  runId: z.string().min(1).max(128).meta(none("Id of the knowledge-ingest workflow run.")),
});
export type KnowledgeIngestionRun = z.infer<typeof KnowledgeIngestionRunSchema>;

export const listKnowledgeDocumentsEndpoint = defineEndpoint({
  id: "knowledge.listDocuments",
  method: "GET",
  path: "/v1/organizations/{organizationId}/knowledge/documents",
  auth: "principal",
  params: organizationParams,
  query: PageQuerySchema.extend({ namespace: KnowledgeNamespaceSchema.optional().meta(none("Only documents of this namespace.")) }),
  responses: { 200: listEnvelope(KnowledgeDocumentSchema) },
  errors: { 403: ["FORBIDDEN"] },
  summary: "Lists the organization's knowledge documents, newest first (core.knowledge.read).",
});

export const getKnowledgeDocumentEndpoint = defineEndpoint({
  id: "knowledge.getDocument",
  method: "GET",
  path: "/v1/organizations/{organizationId}/knowledge/documents/{documentId}",
  auth: "principal",
  params: documentParams,
  responses: { 200: dataEnvelope(KnowledgeDocumentSchema) },
  errors: { 403: ["FORBIDDEN"], 404: ["NOT_FOUND"] },
  summary: "Reads one knowledge document of the organization (core.knowledge.read).",
});

export const deleteKnowledgeDocumentEndpoint = defineEndpoint({
  id: "knowledge.deleteDocument",
  method: "DELETE",
  path: "/v1/organizations/{organizationId}/knowledge/documents/{documentId}",
  auth: "principal",
  params: documentParams,
  responses: { 204: null },
  errors: { 403: ["FORBIDDEN"], 404: ["NOT_FOUND"] },
  summary: "Deletes a knowledge document and its chunks (core.knowledge.delete).",
});

export const addKnowledgeSourceEndpoint = defineEndpoint({
  id: "knowledge.addSource",
  method: "POST",
  path: "/v1/organizations/{organizationId}/knowledge/sources",
  auth: "principal",
  params: organizationParams,
  body: KnowledgeSourceSchema,
  responses: { 202: dataEnvelope(KnowledgeIngestionRunSchema) },
  errors: { 403: ["FORBIDDEN"], 404: ["NOT_FOUND"], 409: ["CONFLICT"] },
  idempotency: "optional",
  summary: "Starts the knowledge-ingest workflow for a ready knowledge file or a public https URL (core.knowledge.write).",
});

export const KNOWLEDGE_ENDPOINTS: readonly EndpointDefinition[] = [
  listKnowledgeDocumentsEndpoint,
  getKnowledgeDocumentEndpoint,
  deleteKnowledgeDocumentEndpoint,
  addKnowledgeSourceEndpoint,
];
