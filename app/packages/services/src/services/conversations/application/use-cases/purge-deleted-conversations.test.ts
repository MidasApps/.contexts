import { describe, expect, it } from "vitest";
import { fixedClock } from "../../../shared/clock/clock.ts";
import type { DeletedConversation, DeletedConversationStore } from "../ports/deleted-conversation-store.ts";
import { makePurgeDeletedConversations } from "./purge-deleted-conversations.ts";

const NOW = "2026-09-30T12:00:00.000Z";

const memoryStore = (
  rows: DeletedConversation[],
): DeletedConversationStore & { readonly rows: DeletedConversation[] } => ({
  rows,
  listDeletedBefore: ({ before, limit }) =>
    Promise.resolve(rows.filter((row) => row.deletedAt < before).slice(0, limit)),
  hardDelete: ({ id, before }) => {
    const index = rows.findIndex((row) => row.id === id && row.deletedAt < before);
    if (index === -1) return Promise.resolve(false);
    rows.splice(index, 1);
    return Promise.resolve(true);
  },
});

describe("purgeDeletedConversations", () => {
  it("purges conversations deleted more than 30 days ago, thread first, and nothing newer", async () => {
    const store = memoryStore([
      { id: "old", tenantId: "t1", deletedAt: "2026-08-30T11:59:59.000Z" },
      { id: "edge", tenantId: "t1", deletedAt: "2026-08-31T12:00:00.000Z" },
      { id: "recent", tenantId: "t2", deletedAt: "2026-09-29T12:00:00.000Z" },
    ]);
    const threads: string[] = [];
    const purge = makePurgeDeletedConversations({ store, clock: fixedClock(NOW) });
    expect(await purge({ deleteThread: (id) => (threads.push(id), Promise.resolve(true)) })).toEqual({
      purged: 1,
      failed: 0,
    });
    expect(threads).toEqual(["old"]);
    expect(store.rows.map((row) => row.id)).toEqual(["edge", "recent"]);
  });

  it("keeps the metadata when the thread delete fails, so the next run retries", async () => {
    const store = memoryStore([{ id: "old", tenantId: "t1", deletedAt: "2026-08-01T00:00:00.000Z" }]);
    const purge = makePurgeDeletedConversations({ store, clock: fixedClock(NOW) });
    expect(await purge({ deleteThread: () => Promise.resolve(false) })).toEqual({ purged: 0, failed: 1 });
    expect(store.rows).toHaveLength(1);
  });
});
