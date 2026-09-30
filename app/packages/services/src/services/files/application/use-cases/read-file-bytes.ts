import type { FilePurpose, StoredFile } from "@core/contracts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import type { FileObjectStore, FileRepository } from "../ports/file-ports.ts";

export type ReadFileBytesError = { readonly code: "FILE_NOT_FOUND" } | { readonly code: "FILE_NOT_READY" } | { readonly code: "FILE_PURPOSE_MISMATCH" };

export type ReadFileBytes = (input: {
  /** From the server-side context of the caller (agent request context, workflow), never from a model or body. */
  readonly tenantId: string;
  readonly fileId: string;
  /** The purpose the reader serves: ingestion reads only `knowledge` files. */
  readonly purpose?: FilePurpose;
}) => Promise<Result<{ readonly file: StoredFile; readonly bytes: Uint8Array }, ReadFileBytesError>>;

/**
 * Bytes of a validated file for server-side readers (knowledge ingestion, SP4
 * multimodal chat). A file of another tenant answers like a missing one; only
 * `ready` files are read, so rejected or unvalidated bytes never reach a model.
 */
export const makeReadFileBytes =
  (deps: { readonly files: FileRepository; readonly objects: FileObjectStore }): ReadFileBytes =>
  async ({ tenantId, fileId, purpose }) => {
    const file = await deps.files.get(fileId);
    if (file?.tenantId !== tenantId) return err({ code: "FILE_NOT_FOUND" });
    if (file.status !== "ready") return err({ code: "FILE_NOT_READY" });
    if (purpose !== undefined && file.purpose !== purpose) return err({ code: "FILE_PURPOSE_MISMATCH" });
    return ok({ file, bytes: await deps.objects.readAll(file.storagePath) });
  };
