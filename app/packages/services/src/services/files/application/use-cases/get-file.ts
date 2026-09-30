import type { StoredFile } from "@core/contracts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import type { FileRepository } from "../ports/file-ports.ts";
import { canReadFile, type FilesCaller } from "./file-access.ts";

export type GetFile = (input: FilesCaller & { readonly fileId: string }) => Promise<Result<StoredFile, { readonly code: "FILE_NOT_FOUND" }>>;

/**
 * `GET /v1/files/{fileId}`: the record, if the caller may read it. A file the
 * caller cannot read answers like a missing one (no id enumeration).
 */
export const makeGetFile =
  (deps: { readonly files: FileRepository }): GetFile =>
  async ({ fileId, ...caller }) => {
    const file = await deps.files.get(fileId);
    if (file === null || !(await canReadFile(caller, file))) return err({ code: "FILE_NOT_FOUND" });
    return ok(file);
  };
