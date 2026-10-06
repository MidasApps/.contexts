import type { Logger } from "#/services/shared/observability/logger.ts";
import type { FinalizeOutcome, FinalizeUpload } from "../../application/use-cases/finalize-upload.ts";

/** The fields of a Cloud Storage `StorageObjectData` the handler reads (`size` arrives as a string). */
export type ObjectFinalizedData = {
  readonly name?: string | undefined;
  readonly size?: string | number | undefined;
  readonly contentType?: string | undefined;
};

/** What the single log line says about the outcome: no file contents, only ids and the reason. */
const outcomeFields = (outcome: FinalizeOutcome) => {
  if (outcome.kind === "ignored") return { outcome: outcome.kind, reason: outcome.reason };
  const file = { fileId: outcome.file?.id, tenantId: outcome.file?.tenantId, purpose: outcome.file?.purpose };
  return outcome.kind === "rejected"
    ? { outcome: outcome.kind, reason: outcome.reason, ...file }
    : { outcome: outcome.kind, ...file, contentType: outcome.file.contentType };
};

/**
 * Driving adapter of `onObjectFinalized` (the trigger lives in
 * `apps/functions/src/files/on-file-finalized.ts`): maps the event to
 * `finalizeUpload` and logs once, with the delivery's `eventId` so redeliveries correlate.
 * Infrastructure errors throw, so the platform retries the at-least-once delivery; the use
 * case is idempotent.
 */
export const makeObjectFinalizedHandler =
  (deps: { readonly finalizeUpload: FinalizeUpload; readonly logger: Logger }) =>
  async (data: ObjectFinalizedData, delivery: { readonly eventId: string }): Promise<FinalizeOutcome> => {
    const startedAt = performance.now();
    const size = Number(data.size ?? 0);
    const outcome = await deps.finalizeUpload({
      name: data.name ?? "",
      size: Number.isFinite(size) ? size : 0,
      contentType: data.contentType,
    });
    deps.logger.info("file_finalized", {
      eventId: delivery.eventId,
      ...outcomeFields(outcome),
      durationMs: Math.round(performance.now() - startedAt),
    });
    return outcome;
  };
