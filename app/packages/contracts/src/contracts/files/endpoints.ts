// Files `/v1` descriptors (umbrella §16.2 uploads; SP3 spec §3.2, decision 0019 amendment).
import { z } from "zod";
import { none } from "../field-docs.ts";
import { defineEndpoint, type EndpointDefinition } from "../http/endpoint.ts";
import { dataEnvelope } from "../http/envelopes.schema.ts";
import { OrganizationIdSchema } from "../tenancy/ids.schema.ts";
import { FileUploadRequestSchema } from "./file-upload-request.schema.ts";
import { FileReadUrlSchema, FileUploadTicketSchema } from "./file-upload-ticket.schema.ts";
import { FileIdSchema, StoredFileSchema } from "./stored-file.schema.ts";

const organizationParams = z.object({
  organizationId: OrganizationIdSchema.meta(none("Organization the file belongs to.")),
});
const fileParams = z.object({ fileId: FileIdSchema.meta(none("File id.")) });

export const requestFileUploadEndpoint = defineEndpoint({
  id: "files.requestUpload",
  method: "POST",
  path: "/v1/organizations/{organizationId}/files",
  auth: "principal",
  params: organizationParams,
  body: FileUploadRequestSchema,
  responses: { 201: dataEnvelope(FileUploadTicketSchema) },
  errors: { 403: ["FORBIDDEN"] },
  idempotency: "optional",
  summary:
    "Registers a pending file and returns a 15-minute signed upload URL (core.file.upload; type and size per purpose).",
});

export const getFileEndpoint = defineEndpoint({
  id: "files.getFile",
  method: "GET",
  path: "/v1/files/{fileId}",
  auth: "principal",
  params: fileParams,
  responses: { 200: dataEnvelope(StoredFileSchema) },
  errors: { 404: ["NOT_FOUND"] },
  summary: "Reads a file record: its uploader, or any core.knowledge.read holder for knowledge files.",
});

export const getFileReadUrlEndpoint = defineEndpoint({
  id: "files.getReadUrl",
  method: "GET",
  path: "/v1/files/{fileId}/read-url",
  auth: "principal",
  params: fileParams,
  responses: { 200: dataEnvelope(FileReadUrlSchema) },
  errors: { 404: ["NOT_FOUND"], 409: ["CONFLICT"] },
  summary: "Returns a 5-minute signed download URL of a ready file (same access as files.getFile; 409 until ready).",
});

export const FILES_ENDPOINTS: readonly EndpointDefinition[] = [
  requestFileUploadEndpoint,
  getFileEndpoint,
  getFileReadUrlEndpoint,
];
