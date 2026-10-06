// Public API of the files context (SP3 Task 13): uploads by V4 signed URL, magic-byte validation.

export { createEmulatorUrlSigner, EmulatorSignerOutsideLocalError } from "./adapters/driven/emulator-signed-url.ts";
export { detectContentType } from "./adapters/driven/file-type-detector.ts";
export { createFirestoreFileRepository, FILES_COLLECTION } from "./adapters/driven/firestore-file-repository.ts";
export {
  createGcsObjectStore,
  createGcsUrlSigner,
  filesBucketOf,
  type StorageBucket,
} from "./adapters/driven/gcs-signed-url.ts";
export {
  createFakeUrlSigner,
  createInMemoryFileRepository,
  createInMemoryObjectStore,
  createRecordingFileEvents,
} from "./adapters/driven/in-memory-file-adapters.ts";
export { buildFilesRoutes } from "./adapters/driving/files-route-handler.ts";
export { makeObjectFinalizedHandler, type ObjectFinalizedData } from "./adapters/driving/object-finalized-handler.ts";
export type {
  DetectContentType,
  FileEventPublisher,
  FileObjectStore,
  FileRepository,
  FileSettlement,
  FileUploadedEvent,
  FileUrlSigner,
} from "./application/ports/file-ports.ts";
export { type CreateReadUrl, makeCreateReadUrl, READ_URL_TTL_MS } from "./application/use-cases/create-read-url.ts";
export {
  type FinalizedObject,
  type FinalizeOutcome,
  type FinalizeUpload,
  makeFinalizeUpload,
  SNIFF_BYTES,
} from "./application/use-cases/finalize-upload.ts";
export { type GetFile, makeGetFile } from "./application/use-cases/get-file.ts";
export {
  type GetReadyFile,
  makeGetReadyFile,
  makeReadFileBytes,
  type ReadFileBytes,
  type ReadFileBytesError,
} from "./application/use-cases/read-file-bytes.ts";
export {
  makeRequestUpload,
  type RequestUpload,
  type RequestUploadError,
  UPLOAD_URL_TTL_MS,
} from "./application/use-cases/request-upload.ts";
export {
  createFilesServices,
  createFirebaseFilesServices,
  createLogFileEventPublisher,
  type FilesAdapters,
  type FilesEnv,
  type FilesServices,
} from "./composition.ts";
export {
  checkUpload,
  contentMatchesDeclared,
  FILE_CATEGORIES,
  type FileCategory,
  PURPOSE_CATEGORIES,
  parseStoragePath,
  resolveUploadRule,
  storagePathOf,
  type UploadRule,
} from "./domain/file-policy.ts";
