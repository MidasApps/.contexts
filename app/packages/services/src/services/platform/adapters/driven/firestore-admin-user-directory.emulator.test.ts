import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { backfillUserSearchNames } from "#/services/shared/firestore/backfill-user-search-names.ts";
import { CORE_COLLECTIONS } from "#/services/shared/firestore/collections.ts";
import { userSearchFields } from "#/services/shared/firestore/user-search-fields.ts";
import { emulatorFirebase } from "#/services/shared/testing/core-server-emulator.fixture.ts";
import { createFirestoreAdminUserDirectory } from "./firestore-admin-user-directory.ts";

const { firestore } = emulatorFirebase();
// A per-run marker in names and emails keeps the prefix ranges of this file apart from other data.
const RUN = `q${Date.now().toString(36)}`;
const users = firestore.collection(CORE_COLLECTIONS.users);
const directory = createFirestoreAdminUserDirectory({ firestore });
const AT = Timestamp.fromDate(new Date("2026-10-01T12:00:00.000Z"));

const put = (id: string, displayName: string, email: string, extra: Record<string, unknown> = {}) =>
  users.doc(`${RUN}-${id}`).set({
    email: `${RUN}.${email}`,
    displayName: `${RUN} ${displayName}`,
    ...userSearchFields(`${RUN} ${displayName}`),
    status: "active",
    createdAt: AT,
    ...extra,
  });

describe("Firestore admin user directory (emulator)", () => {
  it("finds by normalized name prefix and by email prefix, paging by cursor position", async () => {
    await put("ana", "Ana Souza", "ana@example.com");
    await put("andre", "André Lima", "andre@example.com", { status: "disabled" });
    await put("bob", "Bob", "bob@example.com");
    const first = await directory.searchByName({ prefix: `${RUN} an`, page: { after: undefined, limit: 1 } });
    expect(first.items).toEqual([
      {
        id: `${RUN}-ana`,
        email: `${RUN}.ana@example.com`,
        displayName: `${RUN} Ana Souza`,
        status: "active",
        createdAt: "2026-10-01T12:00:00.000Z",
      },
    ]);
    expect(first.nextCursor).not.toBeNull();
    const second = await directory.searchByName({
      prefix: `${RUN} an`,
      page: { after: [`${RUN} ana souza`, `${RUN}-ana`], limit: 1 },
    });
    expect(second.items.map((user) => [user.id, user.status])).toEqual([[`${RUN}-andre`, "disabled"]]);
    expect(second.nextCursor).toBeNull();
    const byEmail = await directory.searchByEmail({ prefix: `${RUN}.b`, page: { after: undefined, limit: 20 } });
    expect(byEmail.items.map((user) => user.id)).toEqual([`${RUN}-bob`]);
  });

  it("reads many ids in the order asked, keeps a partial doc and skips unknown ids", async () => {
    await put("carla", "Carla", "carla@example.com");
    await users.doc(`${RUN}-bare`).set({ status: "active", accessVersion: 0, lastContext: {} });
    const found = await directory.getMany([`${RUN}-bare`, `${RUN}-missing`, `${RUN}-carla`]);
    expect(found.map((user) => [user.id, user.email, user.displayName, user.createdAt])).toEqual([
      [`${RUN}-bare`, null, "", null],
      [`${RUN}-carla`, `${RUN}.carla@example.com`, `${RUN} Carla`, "2026-10-01T12:00:00.000Z"],
    ]);
  });

  it("backfills searchName on docs written before it existed, idempotently", async () => {
    await users
      .doc(`${RUN}-old`)
      .set({ email: `${RUN}.old@example.com`, displayName: `${RUN} Élodie Old`, status: "active", createdAt: AT });
    expect(
      (await directory.searchByName({ prefix: `${RUN} elodie`, page: { after: undefined, limit: 5 } })).items,
    ).toEqual([]);
    const firstRun = await backfillUserSearchNames({ firestore, batchSize: 2 });
    expect(firstRun.updated).toBeGreaterThanOrEqual(1);
    expect(
      (await directory.searchByName({ prefix: `${RUN} elodie`, page: { after: undefined, limit: 5 } })).items.map(
        (user) => user.id,
      ),
    ).toEqual([`${RUN}-old`]);
    const secondRun = await backfillUserSearchNames({ firestore, batchSize: 2 });
    expect(secondRun.updated).toBe(0);
    expect(secondRun.scanned).toBe(firstRun.scanned);
  });
});
