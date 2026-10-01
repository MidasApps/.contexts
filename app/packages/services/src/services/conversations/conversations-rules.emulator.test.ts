import { readFileSync } from "node:fs";
import path from "node:path";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

// Conversations (decision 0033): the owner reads their own conversations of the active
// organization for realtime history; nobody writes them directly (writes go through `/v1`).
const PROJECT_ID = "demo-core";
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../../..");

// Ids of this file only: the emulator is shared by every rules test, and an access projection
// left here must not make another file's principal a member (firebase-rules.emulator.test.ts).
const TENANT = "conv-rules-org";
const OTHER_TENANT = "conv-rules-other-org";
const OWNER = "conv-rules-owner";
const MEMBER = "conv-rules-member";
const STRANGER = "conv-rules-stranger";
const OWNER_ACCESS = `access/${TENANT}_${OWNER}`;
const MEMBER_ACCESS = `access/${TENANT}_${MEMBER}`;
const OWN = "conversations/conv-own";
const OTHERS = "conversations/conv-other-user";
const DELETED = "conversations/conv-deleted";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules: readFileSync(path.join(WORKSPACE_ROOT, "firestore.rules"), "utf8") } });
});

afterAll(async () => {
  await testEnv.withSecurityRulesDisabled(async (admin) => {
    await Promise.all([OWNER_ACCESS, MEMBER_ACCESS].map((doc) => admin.firestore().doc(doc).delete()));
  });
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.withSecurityRulesDisabled(async (admin) => {
    const db = admin.firestore();
    await db.doc(OWNER_ACCESS).set({ tenantId: TENANT, principalId: OWNER, isRevoked: false, orgWide: true });
    await db.doc(MEMBER_ACCESS).set({ tenantId: TENANT, principalId: MEMBER, isRevoked: false, orgWide: true });
    await db.doc(OWN).set({ tenantId: TENANT, ownerId: OWNER, deletedAt: null, title: "Mine" });
    await db.doc(OTHERS).set({ tenantId: TENANT, ownerId: MEMBER, deletedAt: null, title: "Theirs" });
    await db.doc(DELETED).set({ tenantId: TENANT, ownerId: OWNER, deletedAt: "2026-09-30T10:00:00.000Z" });
  });
});

describe("conversations rules", () => {
  it("lets the owner read their own conversations of the active organization", async () => {
    const db = testEnv.authenticatedContext(OWNER, { tenantId: TENANT }).firestore();
    await assertSucceeds(db.doc(OWN).get());
    await assertSucceeds(db.collection("conversations").where("tenantId", "==", TENANT).where("ownerId", "==", OWNER).where("deletedAt", "==", null).get());
  });

  it("denies another member, another active tenant, deleted conversations and anonymous clients", async () => {
    await assertFails(testEnv.authenticatedContext(OWNER, { tenantId: TENANT }).firestore().doc(OTHERS).get());
    await assertFails(testEnv.authenticatedContext(OWNER, { tenantId: TENANT }).firestore().doc(DELETED).get());
    await assertFails(testEnv.authenticatedContext(OWNER, { tenantId: OTHER_TENANT }).firestore().doc(OWN).get());
    await assertFails(testEnv.authenticatedContext(STRANGER, { tenantId: TENANT }).firestore().doc(OWN).get());
    await assertFails(testEnv.unauthenticatedContext().firestore().doc(OWN).get());
  });

  it("denies every client write, the owner's included", async () => {
    const db = testEnv.authenticatedContext(OWNER, { tenantId: TENANT }).firestore();
    await assertFails(db.doc(OWN).update({ title: "Renamed" }));
    await assertFails(db.doc("conversations/new").set({ tenantId: TENANT, ownerId: OWNER, deletedAt: null }));
    await assertFails(db.doc(OWN).delete());
  });
});
