import type { Clock } from "../../../shared/clock/clock.ts";
import type { DeletedConversationStore } from "../ports/deleted-conversation-store.ts";

/** Days a deleted conversation is kept before it is purged (SP5 spec §3.2). */
export const PURGE_AFTER_DAYS = 30;
/** Conversations purged per run; the next daily run takes the rest. */
export const PURGE_BATCH = 200;

export type PurgeDeletedConversations = (input: {
  /** Deletes the conversation's Mastra memory thread (thread id = conversation id); `true` when gone. */
  readonly deleteThread: (threadId: string) => Promise<boolean>;
  readonly limit?: number;
}) => Promise<{ readonly purged: number; readonly failed: number }>;

/**
 * `conversation-purge` (SP5 spec §3.2): hard-deletes conversations soft-deleted more than 30 days ago,
 * the Mastra thread first and the Firestore metadata after, so a failure leaves the metadata and the
 * next run tries again. Newer deletions and restored conversations are never touched.
 */
export const makePurgeDeletedConversations =
  (deps: { readonly store: DeletedConversationStore; readonly clock: Clock }): PurgeDeletedConversations =>
  async ({ deleteThread, limit = PURGE_BATCH }) => {
    const before = new Date(deps.clock.now().getTime() - PURGE_AFTER_DAYS * 86_400_000).toISOString();
    const candidates = await deps.store.listDeletedBefore({ before, limit });
    let purged = 0;
    let failed = 0;
    for (const conversation of candidates) {
      if (!(await deleteThread(conversation.id))) {
        failed += 1;
        continue;
      }
      if (await deps.store.hardDelete({ id: conversation.id, before })) purged += 1;
    }
    return { purged, failed };
  };
