import {
  addKnowledgeSourceEndpoint,
  getFileEndpoint,
  requestFileUploadEndpoint,
  type FilePurpose,
  type FileUploadTicket,
  type StoredFile,
  type UploadInstructions,
} from "@core/contracts";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";

/** What the queue knows about a picked file before any byte leaves the browser. */
export type UploadSource = { readonly name: string; readonly mediaType: string; readonly sizeBytes: number; readonly blob: Blob };

/** Declared type of a file the browser could not name a type for. */
export const FALLBACK_MEDIA_TYPE = "application/octet-stream";

/**
 * `POST /v1/organizations/{id}/files` (SP3 files, umbrella §16.2): registers the pending file and
 * answers where to send the bytes. The server checks type and size for the purpose; a refusal is
 * a 400 `VALIDATION_FAILED` whose detail names `TYPE_NOT_ALLOWED` or `TOO_LARGE`.
 */
export const requestUpload = async (callEndpoint: CallEndpoint, input: { organizationId: string; purpose: FilePurpose; source: UploadSource; signal?: AbortSignal }): Promise<FileUploadTicket> => {
  const answer = await callEndpoint(requestFileUploadEndpoint, {
    params: { organizationId: input.organizationId },
    body: { purpose: input.purpose, fileName: input.source.name, contentType: input.source.mediaType, sizeBytes: input.source.sizeBytes },
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  return answer.data;
};

/** The upload did not reach the storage, or the storage refused it (never carries the URL). */
export class UploadTransferError extends Error {
  readonly code = "UPLOAD_TRANSFER_FAILED";
  readonly status: number;
  constructor(status: number, options?: ErrorOptions) {
    super("the upload was not accepted", options);
    this.name = "UploadTransferError";
    this.status = status;
  }
}

/** The subset of `XMLHttpRequest` the transfer uses (a fake in tests). */
export type UploadRequest = {
  open: (method: string, url: string) => void;
  setRequestHeader: (name: string, value: string) => void;
  send: (body: Blob) => void;
  abort: () => void;
  readonly status: number;
  upload: { onprogress: ((event: { loaded: number; total: number; lengthComputable: boolean }) => void) | null };
  onload: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
};

export type SendBytesOptions = {
  /** 0–1 as the bytes go out. */
  readonly onProgress?: ((fraction: number) => void) | undefined;
  readonly signal?: AbortSignal | undefined;
  /** Defaults to a real `XMLHttpRequest` (`fetch` reports no upload progress). */
  readonly createRequest?: (() => UploadRequest) | undefined;
};

const abortError = (): DOMException => new DOMException("The upload was cancelled.", "AbortError");

/**
 * Sends the bytes to the signed URL exactly as the ticket says (method and headers unchanged, or
 * the storage rejects the signature). No `Authorization` and no cookies: the URL is the grant.
 * @throws {UploadTransferError} when the storage refuses or the network drops.
 * @throws {DOMException} `AbortError` when `signal` aborts.
 */
export const sendBytes = (upload: UploadInstructions, blob: Blob, options: SendBytesOptions = {}): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (options.signal?.aborted === true) {
      reject(abortError());
      return;
    }
    const request = (options.createRequest ?? ((): UploadRequest => new XMLHttpRequest() as unknown as UploadRequest))();
    request.open(upload.method, upload.url);
    for (const [name, value] of Object.entries(upload.headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) options.onProgress?.(Math.min(1, event.loaded / event.total));
    };
    request.onload = () => (request.status >= 200 && request.status < 300 ? resolve() : reject(new UploadTransferError(request.status)));
    request.onerror = () => reject(new UploadTransferError(0));
    request.onabort = () => reject(abortError());
    options.signal?.addEventListener("abort", () => request.abort(), { once: true });
    request.send(blob);
  });

/** Validation did not finish in time (`onObjectFinalized` is asynchronous). */
export class UploadValidationTimeoutError extends Error {
  readonly code = "UPLOAD_VALIDATION_TIMEOUT";
  constructor() {
    super("the upload was not validated in time");
    this.name = "UploadValidationTimeoutError";
  }
}

export type WaitOptions = {
  readonly signal?: AbortSignal | undefined;
  /** Spec §4.3 / plan Task 11: at most 30 s. */
  readonly timeoutMs?: number | undefined;
  readonly intervalMs?: number | undefined;
  /** Test seams. */
  readonly sleep?: ((ms: number, signal?: AbortSignal) => Promise<void>) | undefined;
  readonly now?: (() => number) | undefined;
};

export const VALIDATION_TIMEOUT_MS = 30_000;
export const VALIDATION_POLL_MS = 1000;

const defaultSleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(abortError());
      },
      { once: true },
    );
  });

/**
 * Polls `GET /v1/files/{id}` until the server validated the bytes (`ready`) or refused them
 * (`rejected`): the client never decides that a file is acceptable.
 * @throws {UploadValidationTimeoutError} after `timeoutMs`.
 */
export const waitForValidation = async (callEndpoint: CallEndpoint, fileId: string, options: WaitOptions = {}): Promise<StoredFile> => {
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const deadline = now() + (options.timeoutMs ?? VALIDATION_TIMEOUT_MS);
  for (;;) {
    const answer = await callEndpoint(getFileEndpoint, { params: { fileId }, ...(options.signal === undefined ? {} : { signal: options.signal }) });
    if (answer.data.status !== "pending") return answer.data;
    if (now() >= deadline) throw new UploadValidationTimeoutError();
    await sleep(options.intervalMs ?? VALIDATION_POLL_MS, options.signal);
  }
};

/** `POST …/knowledge/sources { kind: "file", fileId }`: starts the ingestion of a ready knowledge file. */
export const addKnowledgeSource = async (callEndpoint: CallEndpoint, input: { organizationId: string; fileId: string; signal?: AbortSignal }): Promise<void> => {
  await callEndpoint(addKnowledgeSourceEndpoint, {
    params: { organizationId: input.organizationId },
    body: { kind: "file", fileId: input.fileId },
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
};
