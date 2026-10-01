import { ImpersonationSessionSchema, type ImpersonationSession } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { runInTransaction } from "../../../shared/firestore/transaction-runner.ts";
import { decodeCursor } from "../../../shared/pagination/cursor.ts";
import { emulatorFirebase } from "../../../shared/testing/core-server-emulator.fixture.ts";
import { createFirestoreImpersonationSessionRepository } from "./firestore-platform-repositories.ts";

const { firestore } = emulatorFirebase();
const repository = createFirestoreImpersonationSessionRepository({ firestore });
const NOW = new Date("2099-10-01T12:00:00.000Z");

const session = (createdAt: string, overrides: Record<string, unknown> = {}): ImpersonationSession =>
  ImpersonationSessionSchema.parse({
    id: repository.newId(),
    staffUid: "list-staff",
    targetUid: "list-target",
    tenantId: "ListTenantAaaaaaaaaaa",
    reason: "Ticket 4821: user cannot see project Launch.",
    createdAt,
    expiresAt: new Date(Date.parse(createdAt) + 60 * 60_000).toISOString(),
    endedAt: null,
    ...overrides,
  });

// Dated in 2099: newest first puts these rows ahead of whatever other tests left in the emulator.
describe("Firestore impersonation sessions for staff (emulator)", () => {
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
      repository.end(tx, { id: ended.id, endedAt: "2099-10-01T11:45:00.000Z", actorId: "list-staff" });
      return Promise.resolve();
    });

    const first = await repository.listRecent({ after: undefined, limit: 3 });
    expect(first.items.map((row) => row.id)).toEqual([ended.id, open.id, closing.id]);
    expect(first.items[0]?.endedAt).toBe("2099-10-01T11:45:00.000Z");
    const after = decodeCursor(first.nextCursor ?? "");
    expect(after).toEqual([closing.createdAt, closing.id]);
    const second = await repository.listRecent({ after: after ?? undefined, limit: 1 });
    expect(second.items.map((row) => row.id)).toEqual([expired.id]);

    expect((await repository.listOpen({ now: NOW, limit: 10 })).map((row) => row.id)).toEqual([closing.id, open.id]);
  });
});
