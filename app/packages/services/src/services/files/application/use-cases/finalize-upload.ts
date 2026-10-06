import type { StoredFile } from "@core/contracts";
import { ulid } from "ulid";
import type { Clock } from "#/services/shared/clock/clock.ts";
import type { Logger } from "#/services/shared/observability/logger.ts";
import {
  contentMatchesDeclared,
  normalizeContentType,
  parseStoragePath,
  resolveUploadRule,
} from "../../domain/file-policy.ts";
import type {
  DetectContentType,
  FileEventPublisher,
  FileObjectStore,
  FileRepository,
  FileSettlement,
} from "../ports/file-ports.ts";

/** Enough for every magic-byte signature and a meaningful UTF-8 check of text files. */
export const SNIFF_BYTES = 64 * 1024;

/** A finalized Cloud Storage object, as the `onObjectFinalized` event reports it. */
export type FinalizedObject = {
  readonly name: string;
  readonly size: number;
  readonly contentType: string | undefined;
};

export type FinalizeOutcome =
  | { readonly kind: "ignored"; readonly reason: "NOT_A_FILE_PATH" | "UNKNOWN_FILE" | "ALREADY_SETTLED" }
  | { readonly kind: "ready"; readonly file: StoredFile }
  | {
      readonly kind: "rejected";
      readonly file: StoredFile | null;
      readonly reason: NonNullable<StoredFile["rejectionReason"]>;
    };

export type FinalizeUpload = (object: FinalizedObject) => Promise<FinalizeOutcome>;

type Deps = {
  readonly files: FileRepository;
  readonly objects: FileObjectStore;
  readonly detect: DetectContentType;
  readonly events: FileEventPublisher;
  readonly clock: Clock;
  readonly logger: Logger;
};

const judge = async (deps: Deps, file: StoredFile, object: FinalizedObject): Promise<FileSettlement> => {
  const rule = resolveUploadRule(file.purpose, file.contentType);
  if (rule === null) return { status: "rejected", reason: "TYPE_NOT_ALLOWED", sizeBytes: object.size };
  // The signed URL caps the size in Cloud Storage; the emulator does not, so check again.
  if (object.size <= 0 || object.size > Math.min(rule.maxBytes, file.sizeBytes))
    return { status: "rejected", reason: "TOO_LARGE", sizeBytes: object.size };
  const declaredOnObject = object.contentType === undefined ? undefined : normalizeContentType(object.contentType);
  if (declaredOnObject !== rule.contentType)
    return { status: "rejected", reason: "CONTENT_MISMATCH", sizeBytes: object.size };
  const sample = await deps.objects.readHead(file.storagePath, SNIFF_BYTES);
  const detected = await deps.detect(sample);
  if (!contentMatchesDeclared({ declared: rule.contentType, detected, sample }))
    return { status: "rejected", reason: "CONTENT_MISMATCH", sizeBytes: object.size };
  return { status: "ready", contentType: rule.contentType, sizeBytes: object.size };
};

const publishUploaded = async (deps: Deps, file: StoredFile): Promise<void> => {
  await deps.events.publish({
    eventName: "FILE_UPLOADED",
    eventId: ulid(),
    occurredAt: file.updatedAt,
    schemaVersion: 1,
    tenantId: file.tenantId,
    data: { fileId: file.id, purpose: file.purpose, contentType: file.contentType, sizeBytes: file.sizeBytes },
  });
};

/**
 * Validates an uploaded object (`onObjectFinalized`, umbrella §16.2): the path
 * must name a pending file of the same tenant, the size must fit the purpose,
 * and the magic bytes must match the declared type. A rejected object is
 * deleted; a valid one becomes `ready` and emits `FILE_UPLOADED`. Idempotent:
 * a redelivered event finds the file settled and does nothing.
 */
export const makeFinalizeUpload =
  (deps: Deps): FinalizeUpload =>
  async (object) => {
    const ref = parseStoragePath(object.name);
    if (ref === null) return { kind: "ignored", reason: "NOT_A_FILE_PATH" };
    const file = await deps.files.get(ref.fileId);
    if (file?.tenantId !== ref.tenantId) {
      // No record for this path: nobody was issued a URL for it, so the object must go.
      await deps.objects.delete(object.name);
      deps.logger.warn("file_object_orphaned", { fileId: ref.fileId, tenantId: ref.tenantId });
      return { kind: "ignored", reason: "UNKNOWN_FILE" };
    }
    if (file.status !== "pending") return { kind: "ignored", reason: "ALREADY_SETTLED" };
    const settlement = await judge(deps, file, object);
    if (settlement.status === "rejected") await deps.objects.delete(file.storagePath);
    const settled = await deps.files.settle({ fileId: file.id, settlement, updatedAt: deps.clock.now().toISOString() });
    const logFields = { fileId: file.id, tenantId: file.tenantId, purpose: file.purpose, sizeBytes: object.size };
    if (settlement.status === "rejected") {
      deps.logger.info("file_rejected", { ...logFields, reason: settlement.reason });
      return { kind: "rejected", file: settled, reason: settlement.reason };
    }
    if (settled === null) return { kind: "ignored", reason: "ALREADY_SETTLED" };
    await publishUploaded(deps, settled);
    deps.logger.info("file_ready", { ...logFields, contentType: settled.contentType });
    return { kind: "ready", file: settled };
  };
