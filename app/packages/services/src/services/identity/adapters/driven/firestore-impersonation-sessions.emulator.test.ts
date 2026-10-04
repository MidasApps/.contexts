import { type ImpersonationSession, ImpersonationSessionSchema } from "@core/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { CORE_COLLECTIONS } from "../../../shared/firestore/collections.ts";
import { runInTransaction } from "../../../shared/firestore/transaction-runner.ts";
import { type CursorPosition, decodeCursor } from "../../../shared/pagination/cursor.ts";
import { emulatorFirebase } from "../../../shared/testing/core-server-emulator.fixture.ts";
import { createFirestoreImpersonationSessionRepository } from "./firestore-platform-repositories.ts";

const { firestore } = emulatorFirebase();
const repository = createFirestoreImpersonationSessionRepository({ firestore });
const NOW = new Date("2099-10-01T12:00:00.000Z");
/** Every row of this file carries this staff uid, so a re-run can remove what an earlier run left. */
const STAFF_UID = "list-staff";
const PAGE_SIZE = 3;

const session = (createdAt: string, overrides: Record<string, unknown> = {}): ImpersonationSession =>
  ImpersonationSessionSchema.parse({
    id: repository.newId(),
    staffUid: STAFF_UID,
    targetUid: "list-target",
    tenantId: "ListTenantAaaaaaaaaaa",
    reason: "Ticket 4821: user cannot see project Launch.",
    createdAt,
    expiresAt: new Date(Date.parse(createdAt) + 60 * 60_000).toISOString(),
    endedAt: null,
    ...overrides,
  });

/**
 * Walks `listRecent` page by page (each cursor must point at its page's last row) and keeps the
 * rows of `ids`, in the order the pages returned them. Rows of other tests are skipped, so the
 * result does not depend on what the shared emulator already holds.
 */
const recentRowsOf = async (ids: ReadonlySet<string>): Promise<ImpersonationSession[]> => {
  const found: ImpersonationSession[] = [];
  let after: CursorPosition | undefined;
  for (;;) {
    const page = await repository.listRecent({ after, limit: PAGE_SIZE });
    found.push(...page.items.filter((row) => ids.has(row.id)));
    if (page.nextCursor === null || found.length === ids.size) return found;
    const last = page.items.at(-1);
    const position = decodeCursor(page.nextCursor);
    expect(position).toEqual([last?.createdAt, last?.id]);
    after = position ?? undefined;
  }
};

describe("Firestore impersonation sessions for staff (emulator)", () => {
  beforeEach(async () => {
    const leftovers = await firestore
      .collection(CORE_COLLECTIONS.impersonationSessions)
      .where("staffUid", "==", STAFF_UID)
      .get();
    await Promise.all(leftovers.docs.map((doc) => doc.ref.delete()));
  });

  it("lists every session newest first by cursor, and the open ones by soonest expiry", async () => {
    const open = session("2099-10-01T11:30:00.000Z");
    const closing = session("2099-10-01T11:10:00.000Z");
    const ended = session("2099-10-01T11:40:00.000Z");
    const expired = session("2099-10-01T09:00:00.000Z");
    await runInTransaction(firestore, (tx) => {
      for (const row of [open, closing, ended, expired]) repository.create(tx, { session: row, actorId: row.staffUid });
      return Promise.resolve();
    });
    await runInTransaction(firestore, (tx) => {
      repository.end(tx, { id: ended.id, endedAt: "2099-10-01T11:45:00.000Z", actorId: STAFF_UID });
      return Promise.resolve();
    });
    const created = new Set([open.id, closing.id, ended.id, expired.id]);

    const recent = await recentRowsOf(created);
    expect(recent.map((row) => row.id)).toEqual([ended.id, open.id, closing.id, expired.id]);
    expect(recent[0]?.endedAt).toBe("2099-10-01T11:45:00.000Z");

    const openRows = await repository.listOpen({ now: NOW, limit: 100 });
    expect(openRows.filter((row) => created.has(row.id)).map((row) => row.id)).toEqual([closing.id, open.id]);
  });
});
