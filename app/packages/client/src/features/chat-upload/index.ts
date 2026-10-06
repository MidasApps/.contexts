// Public API of the chat-upload feature (SP4 Task 11): the composer's upload queue (signed URL
// upload with progress, cancel, retry, server validation) and its chips and menu.
export { FALLBACK_MEDIA_TYPE, type UploadRequest, type UploadSource } from "./api/request-upload.ts";
export {
  hasUploadProblems,
  hasUploadsInFlight,
  type UploadItem,
  type UploadProblem,
  type UploadQueue,
  type UploadQueueDeps,
  type UploadStatus,
} from "./model/upload-queue.ts";
export { uploadSourcesOf } from "./model/upload-sources.ts";
export { type UseUploadQueueArgs, useUploadQueue } from "./model/use-upload-queue.ts";
export { AttachMenu, type AttachMenuProps } from "./ui/attach-menu.tsx";
export { AttachmentChips, type AttachmentChipsProps } from "./ui/attachment-chips.tsx";
