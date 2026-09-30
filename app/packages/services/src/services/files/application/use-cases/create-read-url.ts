import type { FileReadUrl } from "@core/contracts";
import type { Clock } from "../../../shared/clock/clock.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import { dispositionOf } from "../../domain/file-policy.ts";
import type { FileRepository, FileUrlSigner } from "../ports/file-ports.ts";
import type { FilesCaller } from "./file-access.ts";
import { makeGetFile } from "./get-file.ts";

/** A signed read URL lives 5 minutes (SP4 previews). */
export const READ_URL_TTL_MS = 5 * 60 * 1000;

export type CreateReadUrl = (
  input: FilesCaller & { readonly fileId: string },
) => Promise<Result<FileReadUrl, { readonly code: "FILE_NOT_FOUND" } | { readonly code: "FILE_NOT_READY" }>>;

/**
 * `GET /v1/files/{fileId}/read-url`: a 5-minute signed download URL of a
 * `ready` file. The response type is pinned to the validated type, and only
 * images, video and audio are served inline.
 */
export const makeCreateReadUrl =
  (deps: { readonly files: FileRepository; readonly signer: FileUrlSigner; readonly clock: Clock }): CreateReadUrl =>
  async (input) => {
    const found = await makeGetFile(deps)(input);
    if (!found.ok) return found;
    const file = found.data;
    if (file.status !== "ready") return err({ code: "FILE_NOT_READY" });
    const expiresAt = new Date(deps.clock.now().getTime() + READ_URL_TTL_MS);
    const url = await deps.signer.signRead({
      path: file.storagePath,
      contentType: file.contentType,
      fileName: file.fileName,
      disposition: dispositionOf(file.contentType),
      expiresAt,
    });
    return ok({ url, expiresAt: expiresAt.toISOString() });
  };
