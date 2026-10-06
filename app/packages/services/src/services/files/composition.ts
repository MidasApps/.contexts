// Composition root of the files context (SP3 Task 13): Firestore records, Cloud Storage
// bytes, V4 signed URLs (emulator URLs in local) and the onObjectFinalized validation.

import { ulid } from "ulid";
import { type Clock, systemClock } from "../shared/clock/clock.ts";
import type { FirebaseAdmin } from "../shared/firebase/firebase-admin.ts";
import type { Logger } from "../shared/observability/logger.ts";
import { createEmulatorUrlSigner } from "./adapters/driven/emulator-signed-url.ts";
import { detectContentType } from "./adapters/driven/file-type-detector.ts";
import { createFirestoreFileRepository } from "./adapters/driven/firestore-file-repository.ts";
import { createGcsObjectStore, createGcsUrlSigner, filesBucketOf } from "./adapters/driven/gcs-signed-url.ts";
import type {
  DetectContentType,
  FileEventPublisher,
  FileObjectStore,
  FileRepository,
  FileUrlSigner,
} from "./application/ports/file-ports.ts";
import { type CreateReadUrl, makeCreateReadUrl } from "./application/use-cases/create-read-url.ts";
import { type FinalizeUpload, makeFinalizeUpload } from "./application/use-cases/finalize-upload.ts";
import { type GetFile, makeGetFile } from "./application/use-cases/get-file.ts";
import {
  type GetReadyFile,
  makeGetReadyFile,
  makeReadFileBytes,
  type ReadFileBytes,
} from "./application/use-cases/read-file-bytes.ts";
import { makeRequestUpload, type RequestUpload } from "./application/use-cases/request-upload.ts";

export type FilesServices = {
  readonly requestUpload: RequestUpload;
  readonly getFile: GetFile;
  readonly createReadUrl: CreateReadUrl;
  readonly finalizeUpload: FinalizeUpload;
  readonly readFileBytes: ReadFileBytes;
  readonly getReadyFile: GetReadyFile;
};

export type FilesAdapters = {
  readonly files: FileRepository;
  readonly objects: FileObjectStore;
  readonly signer: FileUrlSigner;
  readonly events: FileEventPublisher;
  readonly detect?: DetectContentType;
  readonly clock?: Clock;
  readonly logger: Logger;
};

/** Binds the files use cases to their adapters (tests pass in-memory ones). */
export const createFilesServices = (adapters: FilesAdapters): FilesServices => {
  const clock = adapters.clock ?? systemClock;
  const { files, objects, signer } = adapters;
  const detect = adapters.detect ?? detectContentType;
  return {
    requestUpload: makeRequestUpload({ files, signer, clock }),
    getFile: makeGetFile({ files }),
    createReadUrl: makeCreateReadUrl({ files, signer, clock }),
    finalizeUpload: makeFinalizeUpload({
      files,
      objects,
      detect,
      events: adapters.events,
      clock,
      logger: adapters.logger,
    }),
    readFileBytes: makeReadFileBytes({ files, objects }),
    getReadyFile: makeGetReadyFile({ files }),
  };
};

/** Env of the files context: `FILES_BUCKET` (the Storage bucket of uploads). */
export type FilesEnv = {
  readonly APP_ENV: string;
  readonly FILES_BUCKET: string;
  readonly FIREBASE_STORAGE_EMULATOR_HOST?: string | undefined;
};

/** Until an event bus lands (SP3 Task 25 / SP5), `FILE_UPLOADED` is a structured log line. */
export const createLogFileEventPublisher = (logger: Logger): FileEventPublisher => ({
  publish: (event) => {
    logger.info("file_uploaded_event", {
      eventId: ulid(),
      eventName: event.eventName,
      tenantId: event.tenantId,
      fileId: event.data.fileId,
    });
    return Promise.resolve();
  },
});

/**
 * The files services over Firebase: Firestore `files`, the `FILES_BUCKET` bucket,
 * V4 signed URLs, or Storage Emulator URLs when `APP_ENV=local` and the emulator runs.
 */
export const createFirebaseFilesServices = (args: {
  readonly firebase: Pick<FirebaseAdmin, "app" | "firestore">;
  readonly env: FilesEnv;
  readonly logger: Logger;
  readonly events?: FileEventPublisher;
  readonly clock?: Clock;
}): FilesServices => {
  const bucket = filesBucketOf(args.firebase.app, args.env.FILES_BUCKET);
  const emulatorHost = args.env.FIREBASE_STORAGE_EMULATOR_HOST;
  const signer =
    args.env.APP_ENV === "local" && emulatorHost !== undefined && emulatorHost !== ""
      ? createEmulatorUrlSigner({ appEnv: args.env.APP_ENV, host: emulatorHost, bucket: args.env.FILES_BUCKET })
      : createGcsUrlSigner(bucket);
  return createFilesServices({
    files: createFirestoreFileRepository({ firestore: args.firebase.firestore }),
    objects: createGcsObjectStore(bucket),
    signer,
    events: args.events ?? createLogFileEventPublisher(args.logger),
    logger: args.logger,
    ...(args.clock === undefined ? {} : { clock: args.clock }),
  });
};
