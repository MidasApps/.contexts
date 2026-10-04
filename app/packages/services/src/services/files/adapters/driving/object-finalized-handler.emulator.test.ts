import { type StoredFile, StoredFileSchema } from "@core/contracts";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createFirebaseAdmin } from "../../../shared/firebase/firebase-admin.ts";
import { createLogger } from "../../../shared/observability/logger.ts";
import { makeFinalizeUpload } from "../../application/use-cases/finalize-upload.ts";
import { createEmulatorUrlSigner } from "../driven/emulator-signed-url.ts";
import { detectContentType } from "../driven/file-type-detector.ts";
import { createFirestoreFileRepository, FILES_COLLECTION } from "../driven/firestore-file-repository.ts";
import { createGcsObjectStore, filesBucketOf } from "../driven/gcs-signed-url.ts";
import { createRecordingFileEvents } from "../driven/in-memory-file-adapters.ts";
import { makeObjectFinalizedHandler } from "./object-finalized-handler.ts";

// Not the default bucket: the Functions emulator's onObjectFinalized trigger (root
// `pnpm test:emulators`) listens there and would race this direct handler call.
const BUCKET = "files-handler-test";
const TENANT = "OrgFilesEmulator0001";
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0,
  1, 8, 6, 0, 0, 0,
]);
const ZIP = Uint8Array.from([
  0x50,
  0x4b,
  0x03,
  0x04,
  0x14,
  0x00,
  0x00,
  0x00,
  0x08,
  0x00,
  ...new Array<number>(30).fill(0),
]);

const firebase = createFirebaseAdmin({
  env: { APP_ENV: "local", FIREBASE_PROJECT_ID: "demo-core" },
  processEnv: process.env,
});
const bucket = filesBucketOf(firebase.app, BUCKET);
const files = createFirestoreFileRepository({ firestore: firebase.firestore });
const events = createRecordingFileEvents();
const logger = createLogger({ context: { service: "test", env: "local" }, sink: () => undefined });
const handle = makeObjectFinalizedHandler({
  finalizeUpload: makeFinalizeUpload({
    files,
    objects: createGcsObjectStore(bucket),
    detect: detectContentType,
    events,
    clock: { now: () => new Date("2026-09-29T12:01:00.000Z") },
    logger,
  }),
  logger,
});

const pending = (id: string, overrides: Partial<StoredFile> = {}): StoredFile =>
  StoredFileSchema.parse({
    id,
    tenantId: TENANT,
    purpose: "chat-attachment",
    fileName: "photo.png",
    contentType: "image/png",
    sizeBytes: 4096,
    status: "pending",
    rejectionReason: null,
    storagePath: `tenants/${TENANT}/files/${id}`,
    createdBy: "alice",
    createdAt: "2026-09-29T12:00:00.000Z",
    updatedAt: "2026-09-29T12:00:00.000Z",
    ...overrides,
  });

const uploadObject = async (file: StoredFile, bytes: Uint8Array) => {
  await bucket.file(file.storagePath).save(Buffer.from(bytes), { contentType: file.contentType, resumable: false });
  const [metadata] = await bucket.file(file.storagePath).getMetadata();
  return { name: file.storagePath, size: metadata.size, contentType: metadata.contentType };
};

const objectExists = async (path: string) => (await bucket.file(path).exists())[0];

beforeEach(async () => {
  events.events.length = 0;
  await firebase.firestore.recursiveDelete(firebase.firestore.collection(FILES_COLLECTION));
});

afterAll(async () => {
  await bucket.deleteFiles({ prefix: `tenants/${TENANT}/`, force: true });
});

describe("onObjectFinalized handler on the Storage and Firestore emulators", () => {
  it("marks real PNG bytes ready and keeps the object", async () => {
    const file = pending(files.newId());
    await files.create(file);
    const outcome = await handle(await uploadObject(file, PNG));
    expect(outcome.kind).toBe("ready");
    expect(await files.get(file.id)).toMatchObject({
      status: "ready",
      sizeBytes: PNG.length,
      contentType: "image/png",
    });
    expect(await objectExists(file.storagePath)).toBe(true);
    expect(events.events.map((event) => event.eventName)).toEqual(["FILE_UPLOADED"]);
  });

  it("rejects ZIP bytes uploaded as a .png and deletes the object", async () => {
    const file = pending(files.newId(), { fileName: "photo.png" });
    await files.create(file);
    const outcome = await handle(await uploadObject(file, ZIP));
    expect(outcome).toMatchObject({ kind: "rejected", reason: "CONTENT_MISMATCH" });
    expect(await files.get(file.id)).toMatchObject({ status: "rejected", rejectionReason: "CONTENT_MISMATCH" });
    expect(await objectExists(file.storagePath)).toBe(false);
    expect(events.events).toEqual([]);
  });

  it("does nothing on a redelivered event", async () => {
    const file = pending(files.newId());
    await files.create(file);
    const object = await uploadObject(file, PNG);
    await handle(object);
    expect(await handle(object)).toEqual({ kind: "ignored", reason: "ALREADY_SETTLED" });
  });

  it("uploads through the local emulator URL of a ticket", async () => {
    const host = process.env["FIREBASE_STORAGE_EMULATOR_HOST"] ?? "127.0.0.1:9199";
    const signer = createEmulatorUrlSigner({ appEnv: "local", host, bucket: BUCKET });
    const path = `tenants/${TENANT}/files/${files.newId()}`;
    const ticket = await signer.signUpload({
      path,
      contentType: "image/png",
      sizeBytes: PNG.length,
      expiresAt: new Date("2026-09-29T12:15:00.000Z"),
    });
    const response = await fetch(ticket.url, { method: ticket.method, headers: ticket.headers, body: PNG });
    expect(response.status).toBe(200);
    expect(await objectExists(path)).toBe(true);
  });
});
