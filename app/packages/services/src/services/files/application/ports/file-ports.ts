import type { FileId, StoredFile, UploadInstructions } from "@core/contracts";

/**
 * Driven ports of the `files` context (SP3 Task 13). Firestore keeps the file
 * records, Cloud Storage the bytes; both adapters live in `adapters/driven`.
 */

export type FileSettlement =
  | { readonly status: "ready"; readonly contentType: string; readonly sizeBytes: number }
  | {
      readonly status: "rejected";
      readonly reason: NonNullable<StoredFile["rejectionReason"]>;
      readonly sizeBytes: number;
    };

export type FileRepository = {
  /** A fresh Firestore automatic id (ADR 0005). */
  readonly newId: () => FileId;
  readonly create: (file: StoredFile) => Promise<void>;
  readonly get: (fileId: string) => Promise<StoredFile | null>;
  /**
   * Moves a `pending` file to `ready` or `rejected` in one transaction.
   * @returns the settled file, or `null` when it is missing or already settled
   *   (Storage events are at-least-once, so a second delivery is a no-op).
   */
  readonly settle: (input: {
    readonly fileId: string;
    readonly settlement: FileSettlement;
    readonly updatedAt: string;
  }) => Promise<StoredFile | null>;
};

export type SignUploadInput = {
  readonly path: string;
  readonly contentType: string;
  /** Largest body the URL accepts (`x-goog-content-length-range: 0,<sizeBytes>`). */
  readonly sizeBytes: number;
  readonly expiresAt: Date;
};

export type SignReadInput = {
  readonly path: string;
  /** Served as the response `Content-Type`, whatever the object metadata says. */
  readonly contentType: string;
  readonly fileName: string;
  readonly disposition: "inline" | "attachment";
  readonly expiresAt: Date;
};

/** Signs short-lived URLs; the client never gets bucket credentials (umbrella §16.2). */
export type FileUrlSigner = {
  readonly signUpload: (input: SignUploadInput) => Promise<UploadInstructions>;
  readonly signRead: (input: SignReadInput) => Promise<string>;
};

/** Reads and deletes stored objects (Admin SDK; Storage Rules deny every client). */
export type FileObjectStore = {
  /** The first `maxBytes` bytes (fewer when the object is smaller). */
  readonly readHead: (path: string, maxBytes: number) => Promise<Uint8Array>;
  readonly readAll: (path: string) => Promise<Uint8Array>;
  /** Idempotent: deleting a missing object succeeds. */
  readonly delete: (path: string) => Promise<void>;
};

/** Magic-byte detection; `undefined` when the bytes carry no known signature (plain text). */
export type DetectContentType = (sample: Uint8Array) => Promise<string | undefined>;

/** `FILE_UPLOADED` (contracts/events.md naming): a file passed validation and can be read. */
export type FileUploadedEvent = {
  readonly eventName: "FILE_UPLOADED";
  readonly eventId: string;
  readonly occurredAt: string;
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly data: {
    readonly fileId: string;
    readonly purpose: StoredFile["purpose"];
    readonly contentType: string;
    readonly sizeBytes: number;
  };
};

export type FileEventPublisher = { readonly publish: (event: FileUploadedEvent) => Promise<void> };
