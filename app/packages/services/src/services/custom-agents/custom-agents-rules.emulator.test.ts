import { readFileSync } from "node:fs";
import path from "node:path";
import { assertFails, initializeTestEnvironment, type RulesTestContext, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

// Custom agents and skills are server-only (decision 0046): no client reads or writes them
// directly, in its own tenant or in another one.
const PROJECT_ID = "demo-core";
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../../..");
const COLLECTIONS = ["custom-agents", "custom-skills"] as const;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules: readFileSync(path.join(WORKSPACE_ROOT, "firestore.rules"), "utf8") } });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.withSecurityRulesDisabled(async (admin) => {
    for (const collection of COLLECTIONS) await admin.firestore().doc(`${collection}/rules-1`).set({ tenantId: "org-1", name: "x", instructions: "private" });
  });
});

const contexts: [string, () => RulesTestContext][] = [
  ["an anonymous client", () => testEnv.unauthenticatedContext()],
  ["an owner of the tenant", () => testEnv.authenticatedContext("owner-1", { tenantId: "org-1" })],
  ["a member of another tenant", () => testEnv.authenticatedContext("member-2", { tenantId: "org-2" })],
];

describe.each(contexts)("custom agents and skills rules for %s", (_name, contextOf) => {
  it.each(COLLECTIONS)("denies reading %s", async (collection) => {
    const db = contextOf().firestore();
    await assertFails(db.doc(`${collection}/rules-1`).get());
    await assertFails(db.collection(collection).where("tenantId", "==", "org-1").get());
    await assertFails(db.collection(collection).where("tenantId", "==", "org-2").get());
  });

  it.each(COLLECTIONS)("denies writing %s", async (collection) => {
    const db = contextOf().firestore();
    await assertFails(db.doc(`${collection}/rules-2`).set({ tenantId: "org-2" }));
    await assertFails(db.doc(`${collection}/rules-1`).update({ instructions: "changed" }));
    await assertFails(db.doc(`${collection}/rules-1`).delete());
  });
});
