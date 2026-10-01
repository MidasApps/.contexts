import { MAX_CHAT_ATTACHMENTS, type FilePurpose, type MessageAttachment } from "@core/contracts";
import { ApiError } from "#/shared/api/api-error.ts";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import {
  addKnowledgeSource,
  requestUpload,
  sendBytes,
  UploadValidationTimeoutError,
  waitForValidation,
  type SendBytesOptions,
  type UploadSource,
  type WaitOptions,
} from "../api/request-upload.ts";

/**
 * The upload queue of the chat composer (SP4 spec §4.3, decision 0035): every picked file goes
 * `pending → uploading → validating → ready | rejected | failed`. The server decides what is
 * acceptable (type and size before signing, the bytes after the upload); the client only shows
 * the outcome. Framework-free so the state machine is tested without React.
 */

export type UploadStatus = "pending" | "uploading" | "validating" | "ready" | "rejected" | "failed";

/** Why an item is `rejected` (the server's reason, or the per-message limit) or `failed` (retry may help). */
export type UploadProblem = "TYPE_NOT_ALLOWED" | "TOO_LARGE" | "CONTENT_MISMATCH" | "TOO_MANY" | "failed" | "timeout";

export type UploadItem = {
  /** Local id of the queue entry (not the file id). */
  readonly id: string;
  readonly name: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  /** `knowledge` items are ingested into the knowledge base instead of going with the message. */
  readonly purpose: FilePurpose;
  readonly status: UploadStatus;
  /** 0–1 while `uploading`. */
  readonly progress: number;
  readonly fileId?: string | undefined;
  readonly problem?: UploadProblem | undefined;
  /** Local object URL of an image, for the chip preview (never a remote URL). */
  readonly previewUrl?: string | undefined;
};

export type UploadQueueDeps = {
  readonly callEndpoint: CallEndpoint;
  readonly getOrganizationId: () => string;
  readonly newId?: (() => string) | undefined;
  readonly maxAttachments?: number | undefined;
  /** Test seams of the transfer and of the validation poll. */
  readonly transfer?: Pick<SendBytesOptions, "createRequest"> | undefined;
  readonly wait?: Pick<WaitOptions, "sleep" | "now" | "timeoutMs" | "intervalMs"> | undefined;
  readonly previews?: { readonly create: (blob: Blob) => string; readonly revoke: (url: string) => void } | undefined;
};

export type UploadQueue = {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => readonly UploadItem[];
  readonly add: (sources: readonly UploadSource[], purpose: FilePurpose) => void;
  /** Removes an item; an upload in flight is cancelled. */
  readonly remove: (id: string) => void;
  /** Starts a `failed` item again from the beginning. */
  readonly retry: (id: string) => void;
  /** The ready chat attachments, taken out of the queue: what the next message carries. */
  readonly take: () => readonly MessageAttachment[];
  /** Cancels everything and empties the queue (the composer unmounted). */
  readonly clear: () => void;
};

const SERVER_REASONS: ReadonlySet<string> = new Set(["TYPE_NOT_ALLOWED", "TOO_LARGE", "CONTENT_MISMATCH"]);
const IN_FLIGHT: ReadonlySet<UploadStatus> = new Set(["pending", "uploading", "validating"]);

/** Uploads still on their way: sending waits for them. */
export const hasUploadsInFlight = (items: readonly UploadItem[]): boolean => items.some((item) => IN_FLIGHT.has(item.status));

/** A chat attachment that will not go: the member removes or retries it before sending. */
export const hasUploadProblems = (items: readonly UploadItem[]): boolean => items.some((item) => item.purpose === "chat-attachment" && (item.status === "rejected" || item.status === "failed"));

const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === "AbortError";

/** The server's refusal of a declared upload (400 with a `TYPE_NOT_ALLOWED` / `TOO_LARGE` detail), or `undefined`. */
const refusalOf = (error: unknown): UploadProblem | undefined => {
  if (!(error instanceof ApiError) || error.status !== 400) return undefined;
  const issue = error.details?.map((detail) => detail.issue).find((code) => SERVER_REASONS.has(code));
  return issue as UploadProblem | undefined;
};

type Entry = { item: UploadItem; source: UploadSource; controller: AbortController };

const defaultPreviews = { create: (blob: Blob): string => URL.createObjectURL(blob), revoke: (url: string): void => URL.revokeObjectURL(url) };

let counter = 0;
const nextId = (): string => `upload-${(counter += 1)}`;

export const createUploadQueue = (deps: UploadQueueDeps): UploadQueue => {
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  let snapshot: readonly UploadItem[] = [];
  const previews = deps.previews ?? defaultPreviews;
  const max = deps.maxAttachments ?? MAX_CHAT_ATTACHMENTS;

  const publish = (): void => {
    snapshot = [...entries.values()].map((entry) => entry.item);
    listeners.forEach((listener) => listener());
  };

  /** Updates an item still in the queue; a removed one stays removed. */
  const update = (id: string, patch: Partial<UploadItem>): void => {
    const entry = entries.get(id);
    if (entry === undefined) return;
    entry.item = { ...entry.item, ...patch };
    publish();
  };

  const settle = (id: string, error: unknown): void => {
    if (isAbort(error)) return;
    const refusal = refusalOf(error);
    if (refusal !== undefined) update(id, { status: "rejected", problem: refusal });
    else update(id, { status: "failed", problem: error instanceof UploadValidationTimeoutError ? "timeout" : "failed" });
  };

  const run = async (id: string): Promise<void> => {
    const entry = entries.get(id);
    if (entry === undefined) return;
    const { source, controller } = entry;
    const { signal } = controller;
    const organizationId = deps.getOrganizationId();
    try {
      const ticket = await requestUpload(deps.callEndpoint, { organizationId, purpose: entry.item.purpose, source, signal });
      update(id, { status: "uploading", fileId: ticket.fileId, progress: 0 });
      await sendBytes(ticket.upload, source.blob, { ...deps.transfer, signal, onProgress: (progress) => update(id, { progress }) });
      update(id, { status: "validating", progress: 1 });
      const file = await waitForValidation(deps.callEndpoint, ticket.fileId, { ...deps.wait, signal });
      if (file.status === "rejected") {
        update(id, { status: "rejected", problem: file.rejectionReason ?? "CONTENT_MISMATCH" });
        return;
      }
      if (entry.item.purpose === "knowledge") await addKnowledgeSource(deps.callEndpoint, { organizationId, fileId: ticket.fileId, signal });
      // The server's view of the file (detected type, real size) is what the message shows.
      update(id, { status: "ready", mediaType: file.contentType, sizeBytes: file.sizeBytes });
    } catch (error: unknown) {
      settle(id, error);
    }
  };

  const drop = (id: string): void => {
    const entry = entries.get(id);
    if (entry === undefined) return;
    entry.controller.abort();
    if (entry.item.previewUrl !== undefined) previews.revoke(entry.item.previewUrl);
    entries.delete(id);
  };

  const chatCount = (): number => [...entries.values()].filter(({ item }) => item.purpose === "chat-attachment" && item.status !== "rejected").length;

  const add: UploadQueue["add"] = (sources, purpose) => {
    const started: string[] = [];
    for (const source of sources) {
      const id = (deps.newId ?? nextId)();
      const overLimit = purpose === "chat-attachment" && chatCount() >= max;
      const previewUrl = !overLimit && source.mediaType.startsWith("image/") ? previews.create(source.blob) : undefined;
      const item: UploadItem = {
        id,
        name: source.name,
        mediaType: source.mediaType,
        sizeBytes: source.sizeBytes,
        purpose,
        status: overLimit ? "rejected" : "pending",
        progress: 0,
        ...(overLimit ? { problem: "TOO_MANY" as const } : {}),
        ...(previewUrl === undefined ? {} : { previewUrl }),
      };
      entries.set(id, { item, source, controller: new AbortController() });
      if (!overLimit) started.push(id);
    }
    publish();
    started.forEach((id) => void run(id));
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    add,
    remove: (id) => {
      drop(id);
      publish();
    },
    retry: (id) => {
      const entry = entries.get(id);
      if (entry === undefined || entry.item.status !== "failed") return;
      entry.controller = new AbortController();
      entry.item = { ...entry.item, status: "pending", progress: 0, problem: undefined, fileId: undefined };
      publish();
      void run(id);
    },
    take: () => {
      const ready = [...entries.values()].filter(({ item }) => item.purpose === "chat-attachment" && item.status === "ready" && item.fileId !== undefined);
      const attachments = ready.map(({ item }) => ({ fileId: item.fileId, name: item.name, mediaType: item.mediaType, sizeBytes: item.sizeBytes }) as MessageAttachment);
      ready.forEach(({ item }) => drop(item.id));
      if (ready.length > 0) publish();
      return attachments;
    },
    clear: () => {
      [...entries.keys()].forEach(drop);
      publish();
    },
  };
};
