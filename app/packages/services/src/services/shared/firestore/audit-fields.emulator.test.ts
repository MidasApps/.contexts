import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import { createFirebaseAdmin } from "../firebase/firebase-admin.ts";
import { SYSTEM_ACTOR } from "#/services/audit/domain/audit-actor.ts";
import { withCreateAudit, withUpdateAudit } from "./audit-fields.ts";
import { initialSoftDeleteFields, notDeleted, softDeleteFields } from "./soft-delete.ts";
import { runInTransaction } from "./transaction-runner.ts";

// Runs inside `firebase emulators:exec`, which exports FIRESTORE_EMULATOR_HOST.
const { firestore } = createFirebaseAdmin({
  env: { APP_ENV: "local", FIREBASE_PROJECT_ID: "demo-core" },
  processEnv: process.env,
});

const COLLECTION = "audit-fields-test-docs";
const collection = () => firestore.collection(COLLECTION);

const readRaw = async (id: string) => (await collection().doc(id).get()).data() ?? {};

beforeEach(async () => {
  await firestore.recursiveDelete(collection());
});

describe("audit fields", () => {
  it("sets createdAt/updatedAt from the server clock and the actor on create", async () => {
    const ref = collection().doc();
    await ref.set(withCreateAudit({ tenantId: "tenant-1", name: "first" }, "user-1"));

    const raw = await readRaw(ref.id);
    expect(raw["createdAt"]).toBeInstanceOf(Timestamp);
    expect(raw["updatedAt"]).toEqual(raw["createdAt"]);
    expect(raw).toMatchObject({ createdBy: "user-1", updatedBy: "user-1", name: "first" });
  });

  it("moves only updatedAt/updatedBy on update", async () => {
    const ref = collection().doc();
    await ref.set(withCreateAudit({ name: "first" }, SYSTEM_ACTOR));
    const created = await readRaw(ref.id);

    await ref.update(withUpdateAudit({ name: "second" }, "user-2"));

    const updated = await readRaw(ref.id);
    expect(updated["createdAt"]).toEqual(created["createdAt"]);
    expect(updated).toMatchObject({ createdBy: "system", updatedBy: "user-2", name: "second" });
    expect((updated["updatedAt"] as Timestamp).toMillis()).toBeGreaterThanOrEqual(
      (created["updatedAt"] as Timestamp).toMillis(),
    );
  });

  it("hides soft-deleted documents from notDeleted queries", async () => {
    const live = collection().doc();
    const gone = collection().doc();
    await live.set(withCreateAudit({ ...initialSoftDeleteFields(), name: "live" }, "user-1"));
    await gone.set(withCreateAudit({ ...initialSoftDeleteFields(), name: "gone" }, "user-1"));

    await gone.update(softDeleteFields("user-2"));

    const visible = await notDeleted(collection()).get();
    expect(visible.docs.map((doc) => doc.id)).toEqual([live.id]);
    const raw = await readRaw(gone.id);
    expect(raw["deletedAt"]).toBeInstanceOf(Timestamp);
    expect(raw).toMatchObject({ deletedBy: "user-2", updatedBy: "user-2" });
  });

  it("writes audit fields inside a transaction", async () => {
    const ref = collection().doc();
    await runInTransaction(firestore, (tx) => {
      tx.create(ref, withCreateAudit({ name: "tx" }, "user-3"));
      return Promise.resolve();
    });

    expect(await readRaw(ref.id)).toMatchObject({ createdBy: "user-3", name: "tx" });
  });
});
