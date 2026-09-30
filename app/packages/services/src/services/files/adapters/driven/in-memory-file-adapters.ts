import type { StoredFile } from "@core/contracts";
import { FileIdSchema, StoredFileSchema } from "@core/contracts";
import type { FileEventPublisher, FileObjectStore, FileRepository, FileUploadedEvent, FileUrlSigner } from "../../application/ports/file-ports.ts";

/** In-memory `FileRepository` for unit tests and local fakes; ids are `file-1`, `file-2`, ... */
export const createInMemoryFileRepository = (): FileRepository & { readonly files: Map<string, StoredFile> } => {
  const files = new Map<string, StoredFile>();
  let next = 0;
  return {
    files,
    newId: () => FileIdSchema.parse(`file${String((next += 1)).padStart(3, "0")}`),
    create: (file) => {
      if (files.has(file.id)) return Promise.reject(new Error(`file ${file.id} exists`));
      files.set(file.id, file);
      return Promise.resolve();
    },
    get: (fileId) => Promise.resolve(files.get(fileId) ?? null),
    settle: ({ fileId, settlement, updatedAt }) => {
      const current = files.get(fileId);
      if (current?.status !== "pending") return Promise.resolve(null);
      const settled = StoredFileSchema.parse(
        settlement.status === "ready"
          ? { ...current, status: "ready", contentType: settlement.contentType, sizeBytes: settlement.sizeBytes, updatedAt }
          : { ...current, status: "rejected", rejectionReason: settlement.reason, sizeBytes: settlement.sizeBytes, updatedAt },
      );
      files.set(fileId, settled);
      return Promise.resolve(settled);
    },
  };
};

/** In-memory `FileObjectStore`: objects by path. */
export const createInMemoryObjectStore = (): FileObjectStore & { readonly objects: Map<string, Uint8Array> } => {
  const objects = new Map<string, Uint8Array>();
  const read = (path: string): Uint8Array => {
    const bytes = objects.get(path);
    if (bytes === undefined) throw new Error(`no object at ${path}`);
    return bytes;
  };
  return {
    objects,
    readHead: (path, maxBytes) => Promise.resolve(read(path).slice(0, maxBytes)),
    readAll: (path) => Promise.resolve(read(path)),
    delete: (path) => {
      objects.delete(path);
      return Promise.resolve();
    },
  };
};

/** Deterministic signer: `https://signed.test/<path>` URLs. */
export const createFakeUrlSigner = (): FileUrlSigner => ({
  signUpload: ({ path, contentType, sizeBytes, expiresAt }) =>
    Promise.resolve({
      method: "PUT",
      url: `https://signed.test/upload/${path}`,
      headers: { "content-type": contentType, "x-goog-content-length-range": `0,${sizeBytes}` },
      expiresAt: expiresAt.toISOString(),
    }),
  signRead: ({ path }) => Promise.resolve(`https://signed.test/read/${path}`),
});

/** Collects published events. */
export const createRecordingFileEvents = (): FileEventPublisher & { readonly events: FileUploadedEvent[] } => {
  const events: FileUploadedEvent[] = [];
  return {
    events,
    publish: (event) => {
      events.push(event);
      return Promise.resolve();
    },
  };
};
