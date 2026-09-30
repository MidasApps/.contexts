import type { App } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import type { FileObjectStore, FileUrlSigner } from "../../application/ports/file-ports.ts";

/** A Cloud Storage bucket handle of the Admin SDK (`@google-cloud/storage` `Bucket`). */
export type StorageBucket = ReturnType<ReturnType<typeof getStorage>["bucket"]>;

/** The files bucket of the Admin SDK app (`FILES_BUCKET`). */
export const filesBucketOf = (app: App, bucketName: string): StorageBucket => getStorage(app).bucket(bucketName);

const CONTENT_LENGTH_RANGE = "x-goog-content-length-range";

// RFC 6266 `filename*`: the name is percent-encoded, so quotes or CR/LF cannot break the header.
const contentDisposition = (disposition: "inline" | "attachment", fileName: string): string =>
  `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`;

/**
 * V4 signed URLs over Cloud Storage (umbrella §16.2). Uploads are PUT URLs bound
 * to the declared `Content-Type` and `x-goog-content-length-range`, so the
 * storage itself refuses another type or a larger body. On Cloud Run / App
 * Hosting the Admin SDK signs through IAM `signBlob`, so the runtime service
 * account needs `roles/iam.serviceAccountTokenCreator` on itself.
 */
export const createGcsUrlSigner = (bucket: StorageBucket): FileUrlSigner => ({
  signUpload: async ({ path, contentType, sizeBytes, expiresAt }) => {
    const range = `0,${sizeBytes}`;
    const [url] = await bucket.file(path).getSignedUrl({
      version: "v4",
      action: "write",
      expires: expiresAt,
      contentType,
      extensionHeaders: { [CONTENT_LENGTH_RANGE]: range },
    });
    return { method: "PUT", url, headers: { "content-type": contentType, [CONTENT_LENGTH_RANGE]: range }, expiresAt: expiresAt.toISOString() };
  },
  signRead: async ({ path, contentType, fileName, disposition, expiresAt }) => {
    const [url] = await bucket.file(path).getSignedUrl({
      version: "v4",
      action: "read",
      expires: expiresAt,
      responseType: contentType,
      responseDisposition: contentDisposition(disposition, fileName),
    });
    return url;
  },
});

/** Reads and deletes objects with the Admin SDK (works against the Storage Emulator too). */
export const createGcsObjectStore = (bucket: StorageBucket): FileObjectStore => ({
  readHead: async (path, maxBytes) => {
    const [bytes] = await bucket.file(path).download({ start: 0, end: maxBytes - 1, validation: false });
    return new Uint8Array(bytes);
  },
  readAll: async (path) => {
    const [bytes] = await bucket.file(path).download();
    return new Uint8Array(bytes);
  },
  delete: async (path) => {
    await bucket.file(path).delete({ ignoreNotFound: true });
  },
});
