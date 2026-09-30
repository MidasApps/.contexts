import { readFileSync } from "node:fs";
import path from "node:path";
import { assertFails, initializeTestEnvironment, type RulesTestContext, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

// Uploads go through `POST /v1/.../files` signed URLs and reads through `/v1` (umbrella §16.2):
// no client, not even the uploader of the tenant, touches `files` docs or `tenants/**` objects.
const PROJECT_ID = "demo-core";
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../../..");
const readRules = (file: string) => readFileSync(path.join(WORKSPACE_ROOT, file), "utf8");

const FILE_DOC = "files/file-1";
const FILE_OBJECT = "tenants/org-1/files/file-1";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readRules("firestore.rules") },
    storage: { rules: readRules("storage.rules") },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.withSecurityRulesDisabled(async (admin) => {
    await admin.firestore().doc(FILE_DOC).set({ tenantId: "org-1", createdBy: "user-1", status: "ready" });
    await admin.storage().ref(FILE_OBJECT).putString("seed");
  });
});

const contexts: [string, () => RulesTestContext][] = [
  ["an anonymous client", () => testEnv.unauthenticatedContext()],
  ["the uploader, a member of the tenant", () => testEnv.authenticatedContext("user-1", { tenantId: "org-1" })],
];

describe.each(contexts)("files rules for %s", (_name, contextOf) => {
  it("denies reading and writing file records", async () => {
    const db = contextOf().firestore();
    await assertFails(db.doc(FILE_DOC).get());
    await assertFails(db.collection("files").where("tenantId", "==", "org-1").get());
    await assertFails(db.doc("files/file-2").set({ tenantId: "org-1" }));
  });

  it("denies reading, uploading and deleting objects under tenants/", async () => {
    const storage = contextOf().storage();
    await assertFails(storage.ref(FILE_OBJECT).getDownloadURL());
    // UploadTask is a thenable, not a Promise.
    await assertFails(Promise.resolve(storage.ref("tenants/org-1/files/file-2").putString("x")));
    await assertFails(storage.ref(FILE_OBJECT).delete());
  });
});
