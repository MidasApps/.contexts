// Test helpers of the upload feature: a scripted `XMLHttpRequest` and the `/v1` routes of the
// files API, so the queue's state machine is driven step by step without timers or a network.
import { StoredFileContract } from "@core/contracts";
import { apiError, type FakeApi, type FakeResponse, ok } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import type { UploadRequest, UploadSource } from "../api/request-upload.ts";

export type FakeTransfer = {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Blob | undefined;
  readonly progress: (loaded: number, total: number) => void;
  /** The storage answered (default 200). */
  readonly finish: (status?: number) => void;
  readonly fail: () => void;
  readonly aborted: () => boolean;
};

/** A factory of fake upload requests; every `send` shows up in `transfers`. */
export const createFakeTransfers = (): {
  readonly transfers: FakeTransfer[];
  readonly createRequest: () => UploadRequest;
} => {
  const transfers: FakeTransfer[] = [];
  const createRequest = (): UploadRequest => {
    const headers: Record<string, string> = {};
    let method = "";
    let url = "";
    let aborted = false;
    const request: UploadRequest & { status: number } = {
      status: 0,
      upload: { onprogress: null },
      onload: null,
      onerror: null,
      onabort: null,
      open: (nextMethod, nextUrl) => {
        method = nextMethod;
        url = nextUrl;
      },
      setRequestHeader: (name, value) => {
        headers[name] = value;
      },
      abort: () => {
        aborted = true;
        request.onabort?.();
      },
      send: (body) => {
        transfers.push({
          method,
          url,
          headers,
          body,
          progress: (loaded, total) => request.upload.onprogress?.({ loaded, total, lengthComputable: true }),
          finish: (status = 200) => {
            request.status = status;
            request.onload?.();
          },
          fail: () => request.onerror?.(),
          aborted: () => aborted,
        });
      },
    };
    return request;
  };
  return { transfers, createRequest };
};

export const source = (name: string, mediaType: string, content = "bytes"): UploadSource => {
  const blob = new Blob([content], { type: mediaType });
  return { name, mediaType, sizeBytes: blob.size, blob };
};

const FILE_PATH = `/v1/organizations/${IDS.organization}/files`;
const UPLOAD_URL = "https://storage.googleapis.com/core-files/upload?X-Goog-Signature=test";

export const storedFile = (fileId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...(StoredFileContract.meta.examples[0] as object),
  id: fileId,
  tenantId: IDS.organization,
  storagePath: `tenants/${IDS.organization}/files/${fileId}`,
  status: "ready",
  rejectionReason: null,
  ...overrides,
});

export type FilesApiScript = {
  /** Answers of `GET /v1/files/{id}` by file id, consumed in order; the last one repeats. */
  readonly files: Record<string, FakeResponse[]>;
};

/**
 * Adds the files routes to a fake API: every upload request gets the next id of `fileIds` and a
 * PUT ticket; `GET /v1/files/{id}` answers from the script (default: ready at once).
 */
export const routeFilesApi = (
  api: FakeApi,
  fileIds: readonly string[],
  script: FilesApiScript = { files: {} },
): void => {
  let next = 0;
  api.route(`POST ${FILE_PATH}`, (request) => {
    const fileId = fileIds[next] ?? `File${String(next).padStart(16, "0")}`;
    next += 1;
    const body = request.body as { contentType: string; sizeBytes: number };
    return ok(
      {
        fileId,
        upload: {
          method: "PUT",
          url: UPLOAD_URL,
          headers: { "content-type": body.contentType, "x-goog-content-length-range": `0,${body.sizeBytes}` },
          expiresAt: "2026-10-01T12:15:00.000Z",
        },
      },
      201,
    );
  });
  api.route("GET /v1/files/:fileId", (request) => {
    const fileId = request.params["fileId"] ?? "";
    const answers = script.files[fileId];
    if (answers === undefined) return ok(storedFile(fileId));
    return (answers.length > 1 ? answers.shift() : answers[0]) ?? apiError(404, "NOT_FOUND");
  });
};
