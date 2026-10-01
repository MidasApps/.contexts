import { addKnowledgeSourceEndpoint, getFileEndpoint, requestFileUploadEndpoint, type StoredFile, type UploadInstructions } from "@core/contracts";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { contentTypeOfFile } from "./knowledge-file-policy.ts";

/** Steps of adding a file, in order; the dialog names the one in progress. */
export const UPLOAD_STEPS = ["requesting", "uploading", "validating", "starting"] as const;
export type UploadStep = (typeof UPLOAD_STEPS)[number];

export type KnowledgeUploadFailure = "UPLOAD_FAILED" | "VALIDATION_TIMEOUT" | NonNullable<StoredFile["rejectionReason"]>;

/** The upload did not reach the knowledge base for a reason outside `/v1` errors (storage refused it, validation rejected it or never finished). */
export class KnowledgeUploadError extends Error {
  readonly code = "KNOWLEDGE_UPLOAD_FAILED";
  readonly reason: KnowledgeUploadFailure;

  constructor(reason: KnowledgeUploadFailure, options?: ErrorOptions) {
    super(`knowledge upload failed: ${reason}`, options);
    this.name = "KnowledgeUploadError";
    this.reason = reason;
  }
}

/** Sends the bytes to the signed URL of the ticket; resolves whether the storage accepted them. */
export type SendBytes = (upload: UploadInstructions, file: Blob, signal: AbortSignal | undefined) => Promise<boolean>;

/**
 * The storage URL is not `/v1`: no Bearer goes there (the signature in the URL is the grant), and
 * the method and headers are sent exactly as the ticket says or the storage rejects the object.
 */
export const sendBytesWithFetch: SendBytes = async (upload, file, signal) => {
  const response = await fetch(upload.url, { method: upload.method, headers: upload.headers, body: file, ...(signal === undefined ? {} : { signal }) });
  return response.ok;
};

export const VALIDATION_POLL_MS = 1_000;
export const VALIDATION_MAX_POLLS = 60;

const waitFor = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

export type UploadKnowledgeFileArgs = {
  readonly callEndpoint: CallEndpoint;
  readonly organizationId: string;
  /** Index for one project (`project:<id>`); the whole organization when absent. */
  readonly projectId?: string | undefined;
  readonly file: File;
  readonly onStep: (step: UploadStep) => void;
  readonly sendBytes?: SendBytes | undefined;
  /** Pause between validation polls (tests pass a no-op). */
  readonly wait?: ((milliseconds: number) => Promise<void>) | undefined;
  readonly signal?: AbortSignal | undefined;
};

const untilValidated = async (args: UploadKnowledgeFileArgs, fileId: string): Promise<void> => {
  const wait = args.wait ?? waitFor;
  for (let attempt = 0; attempt < VALIDATION_MAX_POLLS; attempt += 1) {
    const { data } = await args.callEndpoint(getFileEndpoint, { params: { fileId }, ...(args.signal === undefined ? {} : { signal: args.signal }) });
    if (data.status === "ready") return;
    if (data.status === "rejected") throw new KnowledgeUploadError(data.rejectionReason ?? "CONTENT_MISMATCH");
    await wait(VALIDATION_POLL_MS);
  }
  throw new KnowledgeUploadError("VALIDATION_TIMEOUT");
};

/**
 * Adds a file to the knowledge base (SP3 spec §3.2, §11): asks for a signed upload URL
 * (`purpose: "knowledge"`), sends the bytes, waits until the server validated them, then starts
 * the ingestion workflow. Indexing continues in the background; the run id is what to follow.
 * @throws {KnowledgeUploadError} when the storage or the validation refuses the file.
 * @throws {ApiError} for a failed `/v1` call.
 */
export const uploadKnowledgeFile = async (args: UploadKnowledgeFileArgs): Promise<{ runId: string; fileId: string }> => {
  const { callEndpoint, organizationId, projectId, file, onStep, signal } = args;
  const withSignal = signal === undefined ? {} : { signal };
  onStep("requesting");
  const ticket = await callEndpoint(requestFileUploadEndpoint, {
    params: { organizationId },
    body: { purpose: "knowledge", fileName: file.name, contentType: contentTypeOfFile(file), sizeBytes: file.size },
    ...withSignal,
  });
  onStep("uploading");
  const accepted = await (args.sendBytes ?? sendBytesWithFetch)(ticket.data.upload, file, signal).catch((cause: unknown) => {
    throw new KnowledgeUploadError("UPLOAD_FAILED", { cause });
  });
  if (!accepted) throw new KnowledgeUploadError("UPLOAD_FAILED");
  onStep("validating");
  await untilValidated(args, ticket.data.fileId);
  onStep("starting");
  const started = await callEndpoint(addKnowledgeSourceEndpoint, {
    params: { organizationId },
    query: projectId === undefined ? {} : { projectId },
    body: { kind: "file", fileId: ticket.data.fileId },
    ...withSignal,
  });
  return { runId: started.data.runId, fileId: ticket.data.fileId };
};
