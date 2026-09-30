import { type FileUploadRequest, type FileUploadTicket, type StoredFile, StoredFileSchema, type TenantId, UserIdSchema } from "@core/contracts";
import type { Clock } from "../../../shared/clock/clock.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import { checkUpload, storagePathOf, type UploadRejectionReason } from "../../domain/file-policy.ts";
import type { FileRepository, FileUrlSigner } from "../ports/file-ports.ts";
import { canUpload, type FilesCaller, uploaderIdOf } from "./file-access.ts";

/** A signed upload URL lives 15 minutes (umbrella §16.2). */
export const UPLOAD_URL_TTL_MS = 15 * 60 * 1000;

export type RequestUploadError =
  | { readonly code: "UPLOAD_REJECTED"; readonly field: "contentType" | "sizeBytes"; readonly reason: UploadRejectionReason }
  | { readonly code: "FORBIDDEN" };

export type RequestUpload = (
  input: FilesCaller & { readonly tenantId: TenantId; readonly request: FileUploadRequest },
) => Promise<Result<FileUploadTicket, RequestUploadError>>;

/**
 * `POST /v1/organizations/{organizationId}/files` (SP3 Task 13): checks the
 * type and size policy of the purpose, authorizes `core.file.upload`, stores a
 * `pending` record and signs a PUT URL bound to the declared type and size.
 * The object path is generated here; the client never names it.
 */
export const makeRequestUpload =
  (deps: { readonly files: FileRepository; readonly signer: FileUrlSigner; readonly clock: Clock }): RequestUpload =>
  async ({ tenantId, request, ...caller }) => {
    const check = checkUpload(request);
    if (!check.ok) return err({ code: "UPLOAD_REJECTED", field: check.field, reason: check.reason });
    if (!(await canUpload(caller, tenantId))) return err({ code: "FORBIDDEN" });
    const now = deps.clock.now();
    const id = deps.files.newId();
    const file: StoredFile = StoredFileSchema.parse({
      id,
      tenantId,
      purpose: request.purpose,
      fileName: request.fileName,
      contentType: check.rule.contentType,
      sizeBytes: request.sizeBytes,
      status: "pending",
      rejectionReason: null,
      storagePath: storagePathOf({ tenantId, id }),
      createdBy: UserIdSchema.parse(uploaderIdOf(caller.principal)),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    await deps.files.create(file);
    const upload = await deps.signer.signUpload({
      path: file.storagePath,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      expiresAt: new Date(now.getTime() + UPLOAD_URL_TTL_MS),
    });
    return ok({ fileId: id, upload });
  };
