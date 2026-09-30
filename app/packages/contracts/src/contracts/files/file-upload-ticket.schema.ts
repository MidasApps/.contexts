import { z } from "zod";
import { defineContract } from "../contract.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { FileIdSchema } from "./stored-file.schema.ts";

const none = (description: string) => ({ description, pii: "none" as const });

/**
 * Where and how the client sends the bytes (umbrella §16.2): a V4 signed URL
 * valid for 15 minutes, bound to the declared `Content-Type` and size range.
 * The client sends every header listed, unchanged, or the storage rejects it.
 */
export const UploadInstructionsSchema = z.strictObject({
  method: z.enum(["PUT", "POST"]).meta(none("HTTP method of the upload: PUT for a signed URL; POST only for the local Storage Emulator.")),
  url: z.url().meta(none("Short-lived upload URL; it grants write access to one object only.")),
  headers: z.record(z.string(), z.string()).meta(none("Headers the upload must carry exactly (Content-Type, x-goog-content-length-range).")),
  expiresAt: IsoDateTimeSchema.meta(none("When the upload URL stops working (UTC).")),
});
export type UploadInstructions = z.infer<typeof UploadInstructionsSchema>;

/** Body of `201` from `POST /v1/organizations/{organizationId}/files`. */
export const FileUploadTicketSchema = z.strictObject({
  fileId: FileIdSchema.meta(none("Id of the pending file; poll GET /v1/files/{fileId} until it is ready or rejected.")),
  upload: UploadInstructionsSchema.meta(none("How to send the bytes.")),
});
export type FileUploadTicket = z.infer<typeof FileUploadTicketSchema>;

export const FileUploadTicketContract = defineContract(FileUploadTicketSchema, {
  id: "files.FileUploadTicket",
  kind: "view",
  description: "A pending upload: the file id and the short-lived signed URL the client sends the bytes to.",
  examples: [
    {
      fileId: "Fz9sK2lPq0WnR5tYu3bV",
      upload: {
        method: "PUT",
        url: "https://storage.googleapis.com/core-files/tenants/Jd8sK2lPq0WnR5tYu3bV/files/Fz9sK2lPq0WnR5tYu3bV?X-Goog-Signature=abc",
        headers: { "content-type": "text/markdown", "x-goog-content-length-range": "0,18432" },
        expiresAt: "2026-09-29T14:45:00.000Z",
      },
    },
  ],
  pii: "none",
  tenancyScope: "organization",
  relations: [{ target: "files.StoredFile", type: "references", field: "fileId" }],
  permission: "core.file.upload",
});

/** Body of `200` from `GET /v1/files/{fileId}/read-url`: a 5-minute signed download URL. */
export const FileReadUrlSchema = z.strictObject({
  url: z.url().meta(none("Short-lived download URL of a ready file.")),
  expiresAt: IsoDateTimeSchema.meta(none("When the URL stops working (UTC).")),
});
export type FileReadUrl = z.infer<typeof FileReadUrlSchema>;

export const FileReadUrlContract = defineContract(FileReadUrlSchema, {
  id: "files.FileReadUrl",
  kind: "view",
  description: "A short-lived signed URL to download or preview a validated file.",
  examples: [
    {
      url: "https://storage.googleapis.com/core-files/tenants/Jd8sK2lPq0WnR5tYu3bV/files/Fz9sK2lPq0WnR5tYu3bV?X-Goog-Signature=def",
      expiresAt: "2026-09-29T14:40:00.000Z",
    },
  ],
  pii: "none",
  tenancyScope: "organization",
  relations: [],
});
