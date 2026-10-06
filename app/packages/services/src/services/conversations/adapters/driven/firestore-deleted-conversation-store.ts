import { type Firestore, Timestamp } from "firebase-admin/firestore";
import type {
  DeletedConversation,
  DeletedConversationStore,
} from "../../application/ports/deleted-conversation-store.ts";
import { CONVERSATIONS_COLLECTION } from "./conversation-storage.ts";

/** The SP4 collection of conversation metadata (decision 0033); `deletedAt` is a Firestore Timestamp. */
export const PURGEABLE_CONVERSATIONS_COLLECTION = CONVERSATIONS_COLLECTION;

const deletedAtOf = (value: unknown): Date | null => (value instanceof Timestamp ? value.toDate() : null);

/**
 * `DeletedConversationStore` over Firestore: a range query on `deletedAt` (single-field index) reading
 * ids, tenants and deletion times only, and a transactional delete that re-checks the deletion time.
 */
export const createFirestoreDeletedConversationStore = (deps: {
  readonly firestore: Firestore;
}): DeletedConversationStore => {
  const collection = () => deps.firestore.collection(PURGEABLE_CONVERSATIONS_COLLECTION);
  return {
    listDeletedBefore: async ({ before, limit }) => {
      const snapshot = await collection()
        .where("deletedAt", "<", Timestamp.fromDate(new Date(before)))
        .orderBy("deletedAt")
        .select("tenantId", "deletedAt")
        .limit(limit)
        .get();
      return snapshot.docs.flatMap((doc): DeletedConversation[] => {
        const deletedAt = deletedAtOf(doc.get("deletedAt"));
        const tenantId: unknown = doc.get("tenantId");
        return deletedAt === null || typeof tenantId !== "string"
          ? []
          : [{ id: doc.id, tenantId, deletedAt: deletedAt.toISOString() }];
      });
    },
    hardDelete: ({ id, before }) =>
      deps.firestore.runTransaction(async (tx) => {
        const ref = collection().doc(id);
        const current = await tx.get(ref);
        const deletedAt = deletedAtOf(current.get("deletedAt"));
        if (!current.exists || deletedAt === null || deletedAt.getTime() >= Date.parse(before)) return false;
        tx.delete(ref);
        return true;
      }),
  };
};
