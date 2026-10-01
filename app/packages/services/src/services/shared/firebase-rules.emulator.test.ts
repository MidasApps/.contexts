import { readFileSync } from "node:fs";
import path from "node:path";
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs inside `firebase emulators:exec`, which exports the emulator hosts;
// rules-unit-testing discovers them from FIRESTORE_EMULATOR_HOST and
// FIREBASE_STORAGE_EMULATOR_HOST. `demo-*` guarantees no remote project is hit.
const PROJECT_ID = "demo-core";
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../../..");
const readRules = (file: string) => readFileSync(path.join(WORKSPACE_ROOT, file), "utf8");

// Ids of this file only. Other rules tests seed access projections in the same emulator (the
// conversations rules write `access/org-1_user-1`), which made the "org-1" principal of this test
// a real member whose read of `organizations/org-1` the rules rightly allow.
const TENANT = "deny-default-org";
const USER = "deny-default-user";
const SEEDED_DOC = `organizations/${TENANT}`;
const ACCESS_DOC = `access/${TENANT}_${USER}`;
const SEEDED_OBJECT = `uploads/${TENANT}/seeded.txt`;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readRules("firestore.rules") },
    storage: { rules: readRules("storage.rules") },
  });
  // Seed with rules disabled so reads target data that actually exists. No clear: every
  // package's emulator tests share these emulators (the Storage trigger of @core/functions
  // included), and every write under test is denied, so the seed never changes.
  await testEnv.withSecurityRulesDisabled(async (admin) => {
    await admin.firestore().doc(SEEDED_DOC).set({ tenantId: TENANT, name: "Deny by default", deletedAt: null });
    // The denial under test is "not a member": make sure no access projection says otherwise.
    await admin.firestore().doc(ACCESS_DOC).delete();
    await admin.storage().ref(SEEDED_OBJECT).putString("seed");
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

const contexts: Array<[string, () => RulesTestContext]> = [
  ["an anonymous client", () => testEnv.unauthenticatedContext()],
  [
    "an authenticated client",
    () => testEnv.authenticatedContext(USER, { tenantId: TENANT }),
  ],
];

describe.each(contexts)("deny-by-default rules for %s", (_label, makeContext) => {
  it("denies reading an existing Firestore document", async () => {
    await expect(assertFails(makeContext().firestore().doc(SEEDED_DOC).get())).resolves.toBeDefined();
  });

  it("denies writing a Firestore document", async () => {
    const write = makeContext().firestore().doc(`organizations/${TENANT}-new`).set({ tenantId: TENANT });
    await expect(assertFails(write)).resolves.toBeDefined();
  });

  it("denies reading an existing Storage object", async () => {
    const read = makeContext().storage().ref(SEEDED_OBJECT).getDownloadURL();
    await expect(assertFails(read)).resolves.toBeDefined();
  });

  it("denies uploading a Storage object", async () => {
    // UploadTask is only thenable; `.then()` turns it into the Promise assertFails expects.
    const upload = makeContext().storage().ref(`uploads/${TENANT}/new.txt`).putString("data").then();
    await expect(assertFails(upload)).resolves.toBeDefined();
  });
});
