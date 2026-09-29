import { readFileSync } from "node:fs";
import path from "node:path";
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Runs inside `firebase emulators:exec`, which exports the emulator hosts;
// rules-unit-testing discovers them from FIRESTORE_EMULATOR_HOST and
// FIREBASE_STORAGE_EMULATOR_HOST. `demo-*` guarantees no remote project is hit.
const PROJECT_ID = "demo-core";
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../../..");
const readRules = (file: string) => readFileSync(path.join(WORKSPACE_ROOT, file), "utf8");

const SEEDED_DOC = "organizations/org-1";
const SEEDED_OBJECT = "uploads/org-1/seeded.txt";

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
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  // Seed with rules disabled so reads target data that actually exists.
  await testEnv.withSecurityRulesDisabled(async (admin) => {
    await admin.firestore().doc(SEEDED_DOC).set({ tenantId: "org-1", name: "Org 1" });
    await admin.storage().ref(SEEDED_OBJECT).putString("seed");
  });
});

const contexts: Array<[string, () => RulesTestContext]> = [
  ["an anonymous client", () => testEnv.unauthenticatedContext()],
  [
    "an authenticated client",
    () => testEnv.authenticatedContext("user-1", { tenantId: "org-1" }),
  ],
];

describe.each(contexts)("deny-by-default rules for %s", (_label, makeContext) => {
  it("denies reading an existing Firestore document", async () => {
    await expect(assertFails(makeContext().firestore().doc(SEEDED_DOC).get())).resolves.toBeDefined();
  });

  it("denies writing a Firestore document", async () => {
    const write = makeContext().firestore().doc("organizations/org-2").set({ tenantId: "org-2" });
    await expect(assertFails(write)).resolves.toBeDefined();
  });

  it("denies reading an existing Storage object", async () => {
    const read = makeContext().storage().ref(SEEDED_OBJECT).getDownloadURL();
    await expect(assertFails(read)).resolves.toBeDefined();
  });

  it("denies uploading a Storage object", async () => {
    // UploadTask is only thenable; `.then()` turns it into the Promise assertFails expects.
    const upload = makeContext().storage().ref("uploads/org-1/new.txt").putString("data").then();
    await expect(assertFails(upload)).resolves.toBeDefined();
  });
});
