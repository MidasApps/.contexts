import { readFileSync } from "node:fs";
import path from "node:path";
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

// Connectors and local secrets are server-only (decision 0027): no client, not even an
// owner of the tenant, reads or writes them directly.
const PROJECT_ID = "demo-core";
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../../..");

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(path.join(WORKSPACE_ROOT, "firestore.rules"), "utf8") },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.withSecurityRulesDisabled(async (admin) => {
    await admin.firestore().doc("connectors/conn-1").set({ tenantId: "org-1", secretRef: "connector-org-1-conn-1" });
    await admin.firestore().doc("local-secrets/connector-org-1-conn-1").set({ value: "secret" });
  });
});

const contexts: [string, () => RulesTestContext][] = [
  ["an anonymous client", () => testEnv.unauthenticatedContext()],
  ["an owner of the tenant", () => testEnv.authenticatedContext("owner-1", { tenantId: "org-1" })],
];

describe.each(contexts)("connectors rules for %s", (_name, contextOf) => {
  it("denies reading and writing connectors", async () => {
    const db = contextOf().firestore();
    await assertFails(db.doc("connectors/conn-1").get());
    await assertFails(db.collection("connectors").where("tenantId", "==", "org-1").get());
    await assertFails(db.doc("connectors/conn-2").set({ tenantId: "org-1" }));
  });

  it("denies the local secret store", async () => {
    const db = contextOf().firestore();
    await assertFails(db.doc("local-secrets/connector-org-1-conn-1").get());
    await assertFails(db.doc("local-secrets/any").set({ value: "x" }));
  });
});
