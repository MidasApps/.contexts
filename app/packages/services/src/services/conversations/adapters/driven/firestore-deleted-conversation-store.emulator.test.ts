import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { emulatorFirebase } from "#/services/shared/testing/core-server-emulator.fixture.ts";
import {
  createFirestoreDeletedConversationStore,
  PURGEABLE_CONVERSATIONS_COLLECTION,
} from "./firestore-deleted-conversation-store.ts";

// The purge query and delete over SP4-shaped conversation documents (Timestamp `deletedAt`).
const firebase = emulatorFirebase();
const store = createFirestoreDeletedConversationStore({ firestore: firebase.firestore });
const RUN = Date.now().toString(36);
const at = (iso: string) => Timestamp.fromDate(new Date(iso));

describe("Firestore deleted conversation store (emulator)", () => {
  it("lists only conversations deleted before the cutoff and deletes them after a re-read", async () => {
    const collection = firebase.firestore.collection(PURGEABLE_CONVERSATIONS_COLLECTION);
    await collection
      .doc(`old${RUN}`)
      .set({ tenantId: `t${RUN}`, title: "secret", deletedAt: at("2000-01-01T00:00:00.000Z") });
    await collection
      .doc(`new${RUN}`)
      .set({ tenantId: `t${RUN}`, title: "secret", deletedAt: at("2000-03-01T00:00:00.000Z") });
    await collection.doc(`live${RUN}`).set({ tenantId: `t${RUN}`, title: "secret", deletedAt: null });
    const before = "2000-02-01T00:00:00.000Z";
    const listed = (await store.listDeletedBefore({ before, limit: 500 })).filter((row) => row.id.endsWith(RUN));
    expect(listed).toEqual([{ id: `old${RUN}`, tenantId: `t${RUN}`, deletedAt: "2000-01-01T00:00:00.000Z" }]);
    expect(await store.hardDelete({ id: `new${RUN}`, before })).toBe(false);
    expect(await store.hardDelete({ id: `old${RUN}`, before })).toBe(true);
    expect((await collection.doc(`old${RUN}`).get()).exists).toBe(false);
    expect((await collection.doc(`new${RUN}`).get()).exists).toBe(true);
  });
});
