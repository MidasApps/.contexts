import { createFirebaseAdmin, createFirestoreFileRepository, filesBucketOf } from "@core/services";
import { describe, expect, it } from "vitest";

// Runs inside `firebase emulators:exec --only auth,firestore,functions,storage` (root
// `pnpm test:emulators`): the built trigger in lib/ reacts to uploads to the default bucket.
const PROJECT_ID = process.env["GCLOUD_PROJECT"] ?? "demo-core";
const DEFAULT_BUCKET = `${PROJECT_ID}.appspot.com`;
const TENANT = "OrgFunctionsFiles001";
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
const SETTLE_TIMEOUT_MS = 45_000;

const firebase = createFirebaseAdmin({
  env: { APP_ENV: "local", FIREBASE_PROJECT_ID: PROJECT_ID },
  processEnv: process.env,
});
const files = createFirestoreFileRepository({ firestore: firebase.firestore });
const bucket = filesBucketOf(firebase.app, DEFAULT_BUCKET);

const createPending = async (fileName: string) => {
  const id = files.newId();
  const storagePath = `tenants/${TENANT}/files/${id}`;
  // The record as request-upload stores it (branded ids come from the repository and the fixture).
  const file = {
    id,
    tenantId: TENANT,
    purpose: "chat-attachment",
    fileName,
    contentType: "image/png",
    sizeBytes: 4096,
    status: "pending",
    rejectionReason: null,
    storagePath,
    createdBy: "alice",
    createdAt: "2026-09-29T12:00:00.000Z",
    updatedAt: "2026-09-29T12:00:00.000Z",
  } as Parameters<typeof files.create>[0];
  await files.create(file);
  return { id, storagePath };
};

// Polls the record: the trigger runs asynchronously in the Functions emulator worker.
const waitForSettled = async (fileId: string) => {
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const file = await files.get(fileId);
    if (file !== null && file.status !== "pending") return file;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`file ${fileId} still pending after ${SETTLE_TIMEOUT_MS} ms`);
};

describe("onFileFinalized on the Functions and Storage emulators", () => {
  it("marks a real PNG ready", { timeout: 60_000 }, async () => {
    const { id, storagePath } = await createPending("photo.png");
    await bucket.file(storagePath).save(Buffer.from(PNG), { contentType: "image/png", resumable: false });
    expect(await waitForSettled(id)).toMatchObject({ status: "ready", sizeBytes: PNG.length });
    expect((await bucket.file(storagePath).exists())[0]).toBe(true);
  });

  it("rejects ZIP bytes named .png and deletes the object", { timeout: 60_000 }, async () => {
    const { id, storagePath } = await createPending("photo.png");
    await bucket.file(storagePath).save(Buffer.from(ZIP), { contentType: "image/png", resumable: false });
    expect(await waitForSettled(id)).toMatchObject({ status: "rejected", rejectionReason: "CONTENT_MISMATCH" });
    expect((await bucket.file(storagePath).exists())[0]).toBe(false);
  });
});
