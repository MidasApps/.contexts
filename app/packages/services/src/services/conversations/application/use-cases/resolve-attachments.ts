import type { MessageAttachment, StoredFile } from "@core/contracts";
import type { GetReadyFile, ReadFileBytes } from "#/services/files/application/use-cases/read-file-bytes.ts";
import { err, ok, type Result } from "#/services/shared/result/result.ts";

/** Bytes `/v1` inlines per attachment (decision 0035, D4-08). */
export const MAX_INLINE_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const INLINE_TYPES = [/^image\//, /^application\/pdf$/, /^text\//, /^application\/json$/];
const MEDIA_TYPES = [/^video\//, /^audio\//];

/** A `file` part with the bytes as a data URL: the provider never gets a signed or local URL. */
export type InlineFilePart = {
  readonly type: "file";
  readonly mediaType: string;
  readonly filename: string;
  readonly url: string;
};
export type NoteTextPart = { readonly type: "text"; readonly text: string };

export type ResolvedAttachments = {
  readonly parts: readonly (InlineFilePart | NoteTextPart)[];
  /** Listed in the user message metadata, so the history shows them. */
  readonly attachments: readonly MessageAttachment[];
};

export type AttachmentIssue = {
  readonly field: string;
  readonly issue: "FILE_NOT_FOUND" | "FILE_NOT_READY" | "FILE_PURPOSE_MISMATCH";
};

export type ResolveAttachments = (input: {
  readonly tenantId: string;
  readonly ownerId: string;
  readonly fileIds: readonly string[];
}) => Promise<
  Result<ResolvedAttachments, { readonly code: "ATTACHMENTS_INVALID"; readonly details: readonly AttachmentIssue[] }>
>;

const noteOf = (file: StoredFile, reason: "not-viewable" | "too-large"): NoteTextPart => ({
  type: "text",
  text:
    reason === "not-viewable"
      ? `[Attachment "${file.fileName}" (${file.contentType}) is not viewable by the current model.]`
      : `[Attachment "${file.fileName}" is larger than 10 MB; offer to add it to the knowledge base.]`,
});

const isInline = (file: StoredFile) =>
  INLINE_TYPES.some((pattern) => pattern.test(file.contentType)) && file.sizeBytes <= MAX_INLINE_ATTACHMENT_BYTES;

const metadataOf = (file: StoredFile): MessageAttachment => ({
  fileId: file.id,
  name: file.fileName,
  mediaType: file.contentType,
  sizeBytes: file.sizeBytes,
});

/**
 * Chat attachments (spec §4.3, decision 0035): only `ready` `chat-attachment` files of the same
 * tenant uploaded by the caller. Images, PDFs and text files ≤ 10 MB become `file` parts with a
 * data URL; video and audio get a text note (no provider capability check in v1: every video is
 * noted), and larger documents a note offering knowledge-base ingestion. A file of another tenant
 * or member answers like a missing one.
 */
export const makeResolveAttachments =
  (deps: { readonly getReadyFile: GetReadyFile; readonly readFileBytes: ReadFileBytes }): ResolveAttachments =>
  async ({ tenantId, ownerId, fileIds }) => {
    const found = await Promise.all(
      fileIds.map((fileId) => deps.getReadyFile({ tenantId, fileId, purpose: "chat-attachment" })),
    );
    const details: AttachmentIssue[] = [];
    const files: StoredFile[] = [];
    found.forEach((result, index) => {
      if (!result.ok) details.push({ field: `attachments.${index}`, issue: result.error.code });
      else if (result.data.createdBy !== ownerId)
        details.push({ field: `attachments.${index}`, issue: "FILE_NOT_FOUND" });
      else files.push(result.data);
    });
    if (details.length > 0) return err({ code: "ATTACHMENTS_INVALID", details });
    const parts = await Promise.all(files.map((file) => partOf(deps, tenantId, file)));
    return ok({ parts, attachments: files.map(metadataOf) });
  };

const partOf = async (
  deps: { readonly readFileBytes: ReadFileBytes },
  tenantId: string,
  file: StoredFile,
): Promise<InlineFilePart | NoteTextPart> => {
  if (MEDIA_TYPES.some((pattern) => pattern.test(file.contentType))) return noteOf(file, "not-viewable");
  if (!isInline(file)) return noteOf(file, "too-large");
  const read = await deps.readFileBytes({ tenantId, fileId: file.id, purpose: "chat-attachment" });
  if (!read.ok) return noteOf(file, "not-viewable");
  return {
    type: "file",
    mediaType: file.contentType,
    filename: file.fileName,
    url: `data:${file.contentType};base64,${Buffer.from(read.data.bytes).toString("base64")}`,
  };
};
