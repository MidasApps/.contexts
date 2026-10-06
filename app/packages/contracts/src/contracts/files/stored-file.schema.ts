import { z } from "zod";
import { defineContract } from "../contract.ts";
import { firestoreIdSchema, TenantIdSchema, UserIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { FileNameSchema, FilePurposeSchema, MAX_UPLOAD_BYTES } from "./file-upload-request.schema.ts";

const none = (description: string) => ({ description, pii: "none" as const });

export const FileIdSchema = firestoreIdSchema<"FileId">();
export type FileId = z.infer<typeof FileIdSchema>;

/** Uploaded object metadata (Firestore `files`, SP3 spec §3.2). Clients read it through `/v1` only. */
export const StoredFileSchema = z
  .strictObject({
    id: FileIdSchema.meta(none("Firestore automatic id of the file.")),
    tenantId: TenantIdSchema.meta(none("Owning organization.")),
    purpose: FilePurposeSchema.meta(none("What the file is for.")),
    fileName: FileNameSchema.meta({ description: "Original file name.", pii: "personal" }),
    contentType: z
      .string()
      .min(1)
      .max(255)
      .meta(none("Media type detected from the bytes once ready; declared type before.")),
    sizeBytes: z.int().nonnegative().max(MAX_UPLOAD_BYTES).meta(none("Size in bytes.")),
    status: z.enum(["pending", "ready", "rejected"]).meta(none("pending until the upload is validated.")),
    rejectionReason: z
      .enum(["TYPE_NOT_ALLOWED", "TOO_LARGE", "CONTENT_MISMATCH"])
      .nullable()
      .meta(none("Why validation rejected the upload; null otherwise.")),
    storagePath: z.string().min(1).meta(none("Object path, tenants/{tenantId}/files/{fileId}.")),
    createdBy: UserIdSchema.meta({ description: "Uid of the uploader.", pii: "personal" }),
    createdAt: IsoDateTimeSchema.meta(none("When the upload was requested (UTC).")),
    updatedAt: IsoDateTimeSchema.meta(none("When the file last changed (UTC).")),
  })
  .refine((file) => file.storagePath === `tenants/${file.tenantId}/files/${file.id}`, {
    error: "storagePath must be tenants/{tenantId}/files/{fileId}.",
    path: ["storagePath"],
  });
export type StoredFile = z.infer<typeof StoredFileSchema>;

export const StoredFileContract = defineContract(StoredFileSchema, {
  id: "files.StoredFile",
  kind: "entity",
  description: "A file uploaded by a member, validated by content before agents or the knowledge base can read it.",
  examples: [
    {
      id: "Fz9sK2lPq0WnR5tYu3bV",
      tenantId: "Jd8sK2lPq0WnR5tYu3bV",
      purpose: "knowledge",
      fileName: "onboarding-guide.md",
      contentType: "text/markdown",
      sizeBytes: 18_432,
      status: "ready",
      rejectionReason: null,
      storagePath: "tenants/Jd8sK2lPq0WnR5tYu3bV/files/Fz9sK2lPq0WnR5tYu3bV",
      createdBy: "uA1b2C3d4E5f6G7h8I9j",
      createdAt: "2026-09-29T14:30:00.000Z",
      updatedAt: "2026-09-29T14:30:05.000Z",
    },
  ],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
});
