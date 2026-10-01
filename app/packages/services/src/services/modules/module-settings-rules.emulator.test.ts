import { readFileSync } from "node:fs";
import path from "node:path";
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MODULE_SETTINGS_COLLECTION } from "./adapters/driven/firestore-module-settings-repository.ts";

// Runs inside `firebase emulators:exec`; `demo-*` guarantees no remote project is hit.
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../../..");
const DOC = `${MODULE_SETTINGS_COLLECTION}/org-1_sample`;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-core",
    firestore: { rules: readFileSync(path.join(WORKSPACE_ROOT, "firestore.rules"), "utf8") },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (admin) => {
    await admin.firestore().doc(DOC).set({ tenantId: "org-1", moduleId: "sample", values: {} });
  });
});

describe("module-settings Security Rules (decision 0015 §6: server-only store)", () => {
  const clients = [
    ["an anonymous client", () => testEnv.unauthenticatedContext()],
    ["a member of the tenant", () => testEnv.authenticatedContext("user-1", { tenantId: "org-1" })],
  ] as const;

  it.each(clients)("denies reads to %s", async (_label, makeContext) => {
    await expect(assertFails(makeContext().firestore().doc(DOC).get())).resolves.toBeDefined();
  });

  it.each(clients)("denies writes to %s", async (_label, makeContext) => {
    const write = makeContext().firestore().doc(DOC).set({ tenantId: "org-1", moduleId: "sample", values: { greeting: "x" } });
    await expect(assertFails(write)).resolves.toBeDefined();
  });
});
