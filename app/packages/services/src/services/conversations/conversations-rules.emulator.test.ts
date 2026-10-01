import { readFileSync } from "node:fs";
import path from "node:path";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

// Conversations (decision 0033): the owner reads their own conversations of the active
// organization for realtime history; nobody writes them directly (writes go through `/v1`).
const PROJECT_ID = "demo-core";
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../../..");

const OWN = "conversations/conv-own";
const OTHERS = "conversations/conv-other-user";
const DELETED = "conversations/conv-deleted";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules: readFileSync(path.join(WORKSPACE_ROOT, "firestore.rules"), "utf8") } });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.withSecurityRulesDisabled(async (admin) => {
    const db = admin.firestore();
    await db.doc("access/org-1_user-1").set({ tenantId: "org-1", principalId: "user-1", isRevoked: false, orgWide: true });
    await db.doc("access/org-1_user-2").set({ tenantId: "org-1", principalId: "user-2", isRevoked: false, orgWide: true });
    await db.doc(OWN).set({ tenantId: "org-1", ownerId: "user-1", deletedAt: null, title: "Mine" });
    await db.doc(OTHERS).set({ tenantId: "org-1", ownerId: "user-2", deletedAt: null, title: "Theirs" });
    await db.doc(DELETED).set({ tenantId: "org-1", ownerId: "user-1", deletedAt: "2026-09-30T10:00:00.000Z" });
  });
});

describe("conversations rules", () => {
  it("lets the owner read their own conversations of the active organization", async () => {
    const db = testEnv.authenticatedContext("user-1", { tenantId: "org-1" }).firestore();
    await assertSucceeds(db.doc(OWN).get());
    await assertSucceeds(db.collection("conversations").where("tenantId", "==", "org-1").where("ownerId", "==", "user-1").where("deletedAt", "==", null).get());
  });

  it("denies another member, another active tenant, deleted conversations and anonymous clients", async () => {
    await assertFails(testEnv.authenticatedContext("user-1", { tenantId: "org-1" }).firestore().doc(OTHERS).get());
    await assertFails(testEnv.authenticatedContext("user-1", { tenantId: "org-1" }).firestore().doc(DELETED).get());
    await assertFails(testEnv.authenticatedContext("user-1", { tenantId: "org-2" }).firestore().doc(OWN).get());
    await assertFails(testEnv.authenticatedContext("user-3", { tenantId: "org-1" }).firestore().doc(OWN).get());
    await assertFails(testEnv.unauthenticatedContext().firestore().doc(OWN).get());
  });

  it("denies every client write, the owner's included", async () => {
    const db = testEnv.authenticatedContext("user-1", { tenantId: "org-1" }).firestore();
    await assertFails(db.doc(OWN).update({ title: "Renamed" }));
    await assertFails(db.doc("conversations/new").set({ tenantId: "org-1", ownerId: "user-1", deletedAt: null }));
    await assertFails(db.doc(OWN).delete());
  });
});
