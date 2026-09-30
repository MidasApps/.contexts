import { z } from "zod";
import { defineContract } from "../contract.ts";

const none = (description: string) => ({ description, pii: "none" as const });

/** What an upload is for; the `files` context applies a type and size policy per purpose. */
export const FilePurposeSchema = z.enum(["chat-attachment", "knowledge"]);
export type FilePurpose = z.infer<typeof FilePurposeSchema>;

/** Largest object any purpose accepts (video chat attachments, 200 MB); the per-purpose policy is stricter. */
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

/** A plain file name: no path separators, no `..`, no control characters. */
export const FileNameSchema = z
  .string()
  .min(1)
  .max(255)
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  .regex(/^(?!\.{1,2}$)[^/\\\u0000-\u001f]+$/, { error: "Expected a file name without path separators." });

/** Body of `POST /v1/files` (umbrella §16.2 uploads): returns a short-lived signed PUT URL. */
export const FileUploadRequestSchema = z.strictObject({
  purpose: FilePurposeSchema.meta(none("What the file is for; selects the allowed types and size.")),
  fileName: FileNameSchema.meta({ description: "Original file name, shown to users.", pii: "personal" }),
  contentType: z
    .string()
    .regex(/^[a-z]+\/[a-z0-9][a-z0-9.+-]*$/, { error: "Expected a media type such as image/png." })
    .meta(none("Declared media type; the bytes are checked again after upload.")),
  sizeBytes: z.int().positive().max(MAX_UPLOAD_BYTES).meta(none("Declared size; the signed URL enforces it.")),
});
export type FileUploadRequest = z.infer<typeof FileUploadRequestSchema>;

export const FileUploadRequestContract = defineContract(FileUploadRequestSchema, {
  id: "files.FileUploadRequest",
  kind: "command",
  description: "Asks for a signed URL to upload a chat attachment or a knowledge document.",
  examples: [{ purpose: "knowledge", fileName: "onboarding-guide.md", contentType: "text/markdown", sizeBytes: 18_432 }],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "core.file.upload",
});
