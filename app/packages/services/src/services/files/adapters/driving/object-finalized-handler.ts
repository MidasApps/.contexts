import type { Logger } from "#/services/shared/observability/logger.ts";
import type { FinalizeOutcome, FinalizeUpload } from "../../application/use-cases/finalize-upload.ts";

/** The fields of a Cloud Storage `StorageObjectData` the handler reads (`size` arrives as a string). */
export type ObjectFinalizedData = {
  readonly name?: string | undefined;
  readonly size?: string | number | undefined;
  readonly contentType?: string | undefined;
};

/**
 * Driving adapter of `onObjectFinalized` (the trigger lives in
 * `apps/functions/src/files/on-file-finalized.ts`): maps the event to
 * `finalizeUpload` and logs once. Infrastructure errors throw, so the platform
 * retries the at-least-once delivery; the use case is idempotent.
 */
export const makeObjectFinalizedHandler =
  (deps: { readonly finalizeUpload: FinalizeUpload; readonly logger: Logger }) =>
  async (data: ObjectFinalizedData): Promise<FinalizeOutcome> => {
    const startedAt = performance.now();
    const size = Number(data.size ?? 0);
    const outcome = await deps.finalizeUpload({
      name: data.name ?? "",
      size: Number.isFinite(size) ? size : 0,
      contentType: data.contentType,
    });
    deps.logger.info("file_finalized", {
      outcome: outcome.kind,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return outcome;
  };
