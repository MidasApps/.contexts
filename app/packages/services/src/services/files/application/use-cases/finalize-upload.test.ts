import { type StoredFile, StoredFileSchema } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../../shared/clock/clock.ts";
import { createLogger } from "../../../shared/observability/logger.ts";
import { detectContentType } from "../../adapters/driven/file-type-detector.ts";
import { createInMemoryFileRepository, createInMemoryObjectStore, createRecordingFileEvents } from "../../adapters/driven/in-memory-file-adapters.ts";
import { makeFinalizeUpload } from "./finalize-upload.ts";
import { makeReadFileBytes } from "./read-file-bytes.ts";

const TENANT = "OrgAaaaaaaaaaaaaaaaaa";
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
const ZIP = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00, ...new Array<number>(30).fill(0)]);
const TEXT = new TextEncoder().encode("# Guide\n\nMembers join after an owner approves them. Olá!\n");

const pendingFile = (id: string, overrides: Partial<StoredFile> = {}): StoredFile =>
  StoredFileSchema.parse({
    id,
    tenantId: TENANT,
    purpose: "chat-attachment",
    fileName: "a.png",
    contentType: "image/png",
    sizeBytes: 1024,
    status: "pending",
    rejectionReason: null,
    storagePath: `tenants/${TENANT}/files/${id}`,
    createdBy: "alice",
    createdAt: "2026-09-29T12:00:00.000Z",
    updatedAt: "2026-09-29T12:00:00.000Z",
    ...overrides,
  });

const setup = () => {
  const files = createInMemoryFileRepository();
  const objects = createInMemoryObjectStore();
  const events = createRecordingFileEvents();
  const finalize = makeFinalizeUpload({
    files,
    objects,
    events,
    detect: detectContentType,
    clock: fixedClock("2026-09-29T12:01:00.000Z"),
    logger: createLogger({ context: { service: "test", env: "local" }, sink: () => undefined }),
  });
  const put = async (file: StoredFile, bytes: Uint8Array) => {
    await files.create(file);
    objects.objects.set(file.storagePath, bytes);
    return { name: file.storagePath, size: bytes.length, contentType: file.contentType };
  };
  return { files, objects, events, finalize, put };
};

describe("finalizeUpload", () => {
  it("marks PNG bytes declared as image/png ready and emits FILE_UPLOADED", async () => {
    const { finalize, put, events, files } = setup();
    const outcome = await finalize(await put(pendingFile("f1"), PNG));
    expect(outcome).toMatchObject({ kind: "ready", file: { status: "ready", sizeBytes: PNG.length, updatedAt: "2026-09-29T12:01:00.000Z" } });
    expect(events.events).toHaveLength(1);
    expect(events.events[0]).toMatchObject({ eventName: "FILE_UPLOADED", tenantId: TENANT, schemaVersion: 1, data: { fileId: "f1", purpose: "chat-attachment" } });
    expect(await makeReadFileBytes({ files, objects: setup().objects })({ tenantId: "other", fileId: "f1" })).toEqual({ ok: false, error: { code: "FILE_NOT_FOUND" } });
  });

  it("rejects and deletes ZIP bytes uploaded as a .png", async () => {
    const { finalize, put, objects, events } = setup();
    const object = await put(pendingFile("f2"), ZIP);
    expect(await finalize(object)).toMatchObject({ kind: "rejected", reason: "CONTENT_MISMATCH", file: { status: "rejected", rejectionReason: "CONTENT_MISMATCH" } });
    expect(objects.objects.has(object.name)).toBe(false);
    expect(events.events).toEqual([]);
  });

  it("accepts UTF-8 markdown and refuses binary bytes declared as text", async () => {
    const { finalize, put } = setup();
    const markdown = pendingFile("f3", { purpose: "knowledge", fileName: "g.md", contentType: "text/markdown" });
    expect(await finalize(await put(markdown, TEXT))).toMatchObject({ kind: "ready" });
    const fake = pendingFile("f4", { purpose: "knowledge", fileName: "g.md", contentType: "text/markdown" });
    expect(await finalize(await put(fake, PNG))).toMatchObject({ kind: "rejected", reason: "CONTENT_MISMATCH" });
  });

  it("rejects an object larger than declared, or with another Content-Type", async () => {
    const { finalize, put } = setup();
    const small = await put(pendingFile("f5", { sizeBytes: 4 }), PNG);
    expect(await finalize(small)).toMatchObject({ kind: "rejected", reason: "TOO_LARGE" });
    const retyped = await put(pendingFile("f6"), PNG);
    expect(await finalize({ ...retyped, contentType: "image/gif" })).toMatchObject({ kind: "rejected", reason: "CONTENT_MISMATCH" });
  });

  it("ignores other paths, deletes objects without a record, and is idempotent on redelivery", async () => {
    const { finalize, put, objects, events } = setup();
    expect(await finalize({ name: "avatars/x.png", size: 1, contentType: "image/png" })).toEqual({ kind: "ignored", reason: "NOT_A_FILE_PATH" });
    objects.objects.set(`tenants/${TENANT}/files/ghost`, PNG);
    expect(await finalize({ name: `tenants/${TENANT}/files/ghost`, size: PNG.length, contentType: "image/png" })).toEqual({ kind: "ignored", reason: "UNKNOWN_FILE" });
    expect(objects.objects.size).toBe(0);
    const object = await put(pendingFile("f7"), PNG);
    await finalize(object);
    expect(await finalize(object)).toEqual({ kind: "ignored", reason: "ALREADY_SETTLED" });
    expect(events.events).toHaveLength(1);
  });

  it("refuses a record whose tenant differs from the path", async () => {
    const { finalize, files, objects } = setup();
    await files.create(pendingFile("f8"));
    objects.objects.set("tenants/OtherTenant/files/f8", PNG);
    expect(await finalize({ name: "tenants/OtherTenant/files/f8", size: PNG.length, contentType: "image/png" })).toMatchObject({ kind: "ignored", reason: "UNKNOWN_FILE" });
    expect((await files.get("f8"))?.status).toBe("pending");
  });
});

describe("readFileBytes", () => {
  it("reads only ready files of the caller's tenant and purpose", async () => {
    const { finalize, put, files, objects } = setup();
    const read = makeReadFileBytes({ files, objects });
    const object = await put(pendingFile("f9", { purpose: "knowledge", fileName: "g.md", contentType: "text/markdown" }), TEXT);
    expect(await read({ tenantId: TENANT, fileId: "f9" })).toEqual({ ok: false, error: { code: "FILE_NOT_READY" } });
    await finalize(object);
    expect(await read({ tenantId: TENANT, fileId: "f9", purpose: "chat-attachment" })).toEqual({ ok: false, error: { code: "FILE_PURPOSE_MISMATCH" } });
    const result = await read({ tenantId: TENANT, fileId: "f9", purpose: "knowledge" });
    expect(result.ok && new TextDecoder().decode(result.data.bytes)).toContain("# Guide");
  });
});
