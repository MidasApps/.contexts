import { describe, expect, it, vi } from "vitest";
import { createEndpointCaller } from "#/shared/api/call-endpoint.ts";
import { createHttpClient } from "#/shared/api/http-client.ts";
import { apiError, createFakeApi, type FakeApi, ok } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { createFakeTransfers, type FilesApiScript, routeFilesApi, source, storedFile } from "../testing/fake-upload.ts";
import {
  createUploadQueue,
  hasUploadProblems,
  hasUploadsInFlight,
  type UploadItem,
  type UploadQueueDeps,
} from "./upload-queue.ts";

const FILE_A = "FileA000000000000001";
const FILE_B = "FileB000000000000002";
const SOURCES_PATH = `/v1/organizations/${IDS.organization}/knowledge/sources`;

const setup = (script?: FilesApiScript, deps: Partial<UploadQueueDeps> = {}, api: FakeApi = createFakeApi()) => {
  routeFilesApi(api, [FILE_A, FILE_B], script);
  api.route(`POST ${SOURCES_PATH}`, { status: 202, body: { data: { runId: "run-1" } } });
  const { transfers, createRequest } = createFakeTransfers();
  const callEndpoint = createEndpointCaller(
    createHttpClient({ baseUrl: "", getIdToken: () => Promise.resolve("token"), fetch: api.fetch }),
  );
  let id = 0;
  const revoked: string[] = [];
  const queue = createUploadQueue({
    callEndpoint,
    getOrganizationId: () => IDS.organization,
    newId: () => `u-${(id += 1)}`,
    transfer: { createRequest },
    wait: { sleep: () => Promise.resolve(), now: () => 0 },
    previews: { create: () => "blob:preview", revoke: (url) => void revoked.push(url) },
    ...deps,
  });
  const seen: string[][] = [];
  queue.subscribe(() => seen.push(queue.getSnapshot().map((item) => item.status)));
  const item = (index = 0): UploadItem => {
    const found = queue.getSnapshot()[index];
    if (found === undefined) throw new Error(`no upload item at ${index}`);
    return found;
  };
  const transfer = async (index = 0) => {
    await vi.waitFor(() => expect(transfers.length).toBeGreaterThan(index));
    const found = transfers[index];
    if (found === undefined) throw new Error("transfer not started");
    return found;
  };
  return { api, queue, transfers, transfer, item, seen, revoked };
};

describe("upload queue", () => {
  it("goes pending → uploading (with progress) → validating → ready and sends the bytes as the ticket says", async () => {
    const { api, queue, transfer, item, seen } = setup({
      files: {
        [FILE_A]: [
          ok(storedFile(FILE_A, { status: "pending" })),
          ok(storedFile(FILE_A, { purpose: "chat-attachment", contentType: "image/png", sizeBytes: 5 })),
        ],
      },
    });
    queue.add([source("diagram.png", "image/png")], "chat-attachment");
    expect(item()).toMatchObject({
      status: "pending",
      name: "diagram.png",
      purpose: "chat-attachment",
      previewUrl: "blob:preview",
    });
    const sent = await transfer();
    expect(item()).toMatchObject({ status: "uploading", progress: 0, fileId: FILE_A });
    expect(sent).toMatchObject({
      method: "PUT",
      headers: { "content-type": "image/png", "x-goog-content-length-range": "0,5" },
    });
    expect(sent.headers).not.toHaveProperty("authorization");
    sent.progress(2, 5);
    expect(item().progress).toBeCloseTo(0.4);
    sent.finish();
    await vi.waitFor(() => expect(item().status).toBe("ready"));
    expect(seen.map((statuses) => statuses[0])).toEqual(["pending", "uploading", "uploading", "validating", "ready"]);
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({
      purpose: "chat-attachment",
      fileName: "diagram.png",
      contentType: "image/png",
      sizeBytes: 5,
    });
    expect(api.callLines().filter((line) => line === `GET /v1/files/${FILE_A}`)).toHaveLength(2);
    expect(hasUploadsInFlight(queue.getSnapshot())).toBe(false);
  });

  it("marks a file the server refuses after the upload as rejected with the reason, and never hands it to the message", async () => {
    const { queue, transfer, item } = setup({
      files: { [FILE_A]: [ok(storedFile(FILE_A, { status: "rejected", rejectionReason: "CONTENT_MISMATCH" }))] },
    });
    queue.add([source("renamed.png", "image/png")], "chat-attachment");
    (await transfer()).finish();
    await vi.waitFor(() => expect(item()).toMatchObject({ status: "rejected", problem: "CONTENT_MISMATCH" }));
    expect(queue.take()).toEqual([]);
    expect(queue.getSnapshot()).toHaveLength(1);
    expect(hasUploadProblems(queue.getSnapshot())).toBe(true);
    queue.retry(item().id);
    expect(item().status).toBe("rejected");
  });

  it("marks a declared type or size the server refuses as rejected before any byte is sent", async () => {
    const api = createFakeApi();
    const { queue, transfers, item } = setup(undefined, {}, api);
    api.route(
      `POST /v1/organizations/${IDS.organization}/files`,
      apiError(400, "VALIDATION_FAILED", [{ field: "contentType", issue: "TYPE_NOT_ALLOWED" }]),
    );
    queue.add([source("tool.exe", "application/octet-stream")], "chat-attachment");
    await vi.waitFor(() => expect(item()).toMatchObject({ status: "rejected", problem: "TYPE_NOT_ALLOWED" }));
    expect(transfers).toHaveLength(0);
  });

  it("fails when the storage refuses the bytes, and retry starts over", async () => {
    const { queue, transfer, item } = setup();
    queue.add([source("notes.txt", "text/plain")], "chat-attachment");
    (await transfer(0)).finish(403);
    await vi.waitFor(() => expect(item()).toMatchObject({ status: "failed", problem: "failed" }));
    queue.retry(item().id);
    expect(item()).toMatchObject({ status: "pending", progress: 0 });
    (await transfer(1)).finish();
    await vi.waitFor(() => expect(item().status).toBe("ready"));
  });

  // Follow-up 79: the first Functions trigger of a fresh stack can take about a minute.
  it("keeps validating past 30 s with a visible processing state, then becomes ready", async () => {
    let now = 0;
    const pending = ok(storedFile(FILE_A, { status: "pending" }));
    const { queue, transfer, item, seen } = setup(
      { files: { [FILE_A]: [pending, pending, pending, pending, pending, pending, ok(storedFile(FILE_A))] } },
      { wait: { now: () => now, sleep: () => Promise.resolve().then(() => void (now += 10_000)) } },
    );
    queue.add([source("notes.txt", "text/plain")], "chat-attachment");
    (await transfer()).finish();
    await vi.waitFor(() => expect(item().status).toBe("ready"));
    expect(seen.flat()).not.toContain("failed");
    // It was marked slow while it waited, and a ready item is no longer slow.
    expect(item().slow).toBe(false);
  });

  it("marks the item slow after 30 s of validation, without failing it", async () => {
    let now = 0;
    let release!: () => void;
    const hold = new Promise<void>((resolve) => (release = resolve));
    const { queue, transfer, item } = setup(
      {
        files: {
          [FILE_A]: [
            ok(storedFile(FILE_A, { status: "pending" })),
            ok(storedFile(FILE_A, { status: "pending" })),
            ok(storedFile(FILE_A, { status: "pending" })),
            ok(storedFile(FILE_A, { status: "pending" })),
            ok(storedFile(FILE_A)),
          ],
        },
      },
      {
        wait: {
          now: () => now,
          sleep: () => (now >= 30_000 ? hold : Promise.resolve()).then(() => void (now += 10_000)),
        },
      },
    );
    queue.add([source("notes.txt", "text/plain")], "chat-attachment");
    (await transfer()).finish();
    await vi.waitFor(() => expect(item()).toMatchObject({ status: "validating", slow: true }));
    release();
    await vi.waitFor(() => expect(item()).toMatchObject({ status: "ready", slow: false }));
  });

  it("fails with a timeout when validation takes longer than the limit", async () => {
    let now = 0;
    const { queue, transfer, item } = setup(
      { files: { [FILE_A]: [ok(storedFile(FILE_A, { status: "pending" }))] } },
      { wait: { now: () => now, sleep: () => Promise.resolve().then(() => void (now += 10_000)), timeoutMs: 30_000 } },
    );
    queue.add([source("notes.txt", "text/plain")], "chat-attachment");
    (await transfer()).finish();
    await vi.waitFor(() => expect(item()).toMatchObject({ status: "failed", problem: "timeout" }));
  });

  it("cancels an upload in flight when the item is removed and releases its preview", async () => {
    const { queue, transfer, item, revoked } = setup();
    queue.add([source("diagram.png", "image/png")], "chat-attachment");
    const sent = await transfer();
    queue.remove(item().id);
    expect(sent.aborted()).toBe(true);
    expect(queue.getSnapshot()).toEqual([]);
    expect(revoked).toEqual(["blob:preview"]);
  });

  it("takes the ready chat attachments out of the queue as message attachments", async () => {
    const { queue, transfer } = setup({
      files: {
        [FILE_A]: [ok(storedFile(FILE_A, { fileName: "a.png", contentType: "image/png", sizeBytes: 5 }))],
        [FILE_B]: [ok(storedFile(FILE_B, { status: "pending" }))],
      },
    });
    queue.add([source("a.png", "image/png"), source("b.pdf", "application/pdf")], "chat-attachment");
    (await transfer(0)).finish();
    await vi.waitFor(() => expect(queue.getSnapshot()[0]?.status).toBe("ready"));
    expect(queue.take()).toEqual([{ fileId: FILE_A, name: "a.png", mediaType: "image/png", sizeBytes: 5 }]);
    expect(queue.getSnapshot().map((entry) => entry.name)).toEqual(["b.pdf"]);
  });

  it("refuses files beyond the per-message limit without uploading them", () => {
    const { queue, item } = setup(undefined, { maxAttachments: 1 });
    queue.add([source("a.txt", "text/plain"), source("b.txt", "text/plain")], "chat-attachment");
    expect(item(1)).toMatchObject({ status: "rejected", problem: "TOO_MANY" });
  });

  it("posts a knowledge file as a knowledge source once it is ready, and keeps it out of the message", async () => {
    const { api, queue, transfer, item } = setup({ files: { [FILE_A]: [ok(storedFile(FILE_A))] } });
    queue.add([source("guide.md", "text/markdown")], "knowledge");
    (await transfer()).finish();
    await vi.waitFor(() => expect(item().status).toBe("ready"));
    const posted = api.calls.find((call) => call.path === SOURCES_PATH);
    expect(posted?.body).toEqual({ kind: "file", fileId: FILE_A });
    expect(api.calls.find((call) => call.method === "POST" && call.path.endsWith("/files"))?.body).toMatchObject({
      purpose: "knowledge",
    });
    expect(queue.take()).toEqual([]);
    expect(item().purpose).toBe("knowledge");
  });

  it("empties the queue and cancels everything on clear", async () => {
    const { queue, transfer } = setup();
    queue.add([source("a.txt", "text/plain")], "chat-attachment");
    const sent = await transfer();
    queue.clear();
    expect(sent.aborted()).toBe(true);
    expect(queue.getSnapshot()).toEqual([]);
  });
});
