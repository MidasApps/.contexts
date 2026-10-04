import { ConversationIdSchema } from "@core/contracts";
import { FieldPath, type Firestore, type Query, Timestamp } from "firebase-admin/firestore";
import { pageFromOverfetch } from "../../../shared/pagination/page.ts";
import type { ConversationListQuery, ConversationRepository } from "../../application/ports/conversation-repository.ts";
import { endRunOf } from "../../domain/conversation.ts";
import {
  CONVERSATIONS_COLLECTION,
  conversationPosition,
  fromConversationDocument,
  parseConversationPosition,
  toConversationDocument,
} from "./conversation-storage.ts";

// An invalid cursor position matches nothing rather than restarting the list.
const EMPTY = Symbol("empty");

const listQuery = (base: Query, query: ConversationListQuery): Query | typeof EMPTY => {
  let q = base
    .where("tenantId", "==", query.tenantId)
    .where("ownerId", "==", query.ownerId)
    .where("deletedAt", "==", null)
    .where("archived", "==", query.archived);
  if (query.pinned !== undefined) q = q.where("pinned", "==", query.pinned);
  if (query.tokens !== undefined && query.tokens.length > 0)
    q = q.where("searchTokens", "array-contains-any", [...query.tokens]);
  q = q.orderBy("pinned", "desc").orderBy("lastMessageAt", "desc").orderBy(FieldPath.documentId(), "desc");
  if (query.page.after === undefined) return q;
  const position = parseConversationPosition(query.page.after);
  if (position === null) return EMPTY;
  return q.startAfter(position.pinned, Timestamp.fromDate(new Date(position.lastMessageAt)), query.page.after[1]);
};

/**
 * Firestore `ConversationRepository` over `conversations/{autoId}` (decision 0033). Lists use the
 * composite indexes `tenantId, ownerId, deletedAt, archived[, pinned][, searchTokens], pinned desc,
 * lastMessageAt desc`; the stream cap uses `tenantId, activeStreamStartedAt`.
 */
export const createFirestoreConversationRepository = (deps: {
  readonly firestore: Firestore;
}): ConversationRepository => {
  const collection = () => deps.firestore.collection(CONVERSATIONS_COLLECTION);
  const read = async (id: string) => {
    const snapshot = await collection().doc(id).get();
    return fromConversationDocument(snapshot.id, snapshot.ref.path, snapshot.data());
  };
  return {
    newId: () => ConversationIdSchema.parse(collection().doc().id),
    get: read,
    create: async (conversation) =>
      void (await collection().doc(conversation.id).create(toConversationDocument(conversation))),
    save: async (conversation) =>
      void (await collection().doc(conversation.id).set(toConversationDocument(conversation))),
    list: async (query) => {
      const q = listQuery(collection(), query);
      if (q === EMPTY) return { items: [], nextCursor: null };
      const snapshot = await q.limit(query.page.limit + 1).get();
      const fetched = snapshot.docs.flatMap((doc) => fromConversationDocument(doc.id, doc.ref.path, doc.data()) ?? []);
      return pageFromOverfetch({ fetched, limit: query.page.limit, positionOf: conversationPosition });
    },
    startRun: async ({ conversationId, runId, startedAt }) =>
      void (await collection()
        .doc(conversationId)
        .update({
          activeRunId: runId,
          activeStreamStartedAt: Timestamp.fromDate(new Date(startedAt)),
          updatedAt: Timestamp.fromDate(new Date(startedAt)),
        })),
    endRun: (end) =>
      deps.firestore.runTransaction(async (tx) => {
        const ref = collection().doc(end.conversationId);
        const snapshot = await tx.get(ref);
        const current = fromConversationDocument(snapshot.id, ref.path, snapshot.data());
        if (current === null) return null;
        const next = endRunOf(current, end);
        tx.set(ref, toConversationDocument(next));
        return next;
      }),
    countActiveRuns: async ({ tenantId, since }) => {
      const snapshot = await collection()
        .where("tenantId", "==", tenantId)
        .where("activeStreamStartedAt", ">", Timestamp.fromDate(new Date(since)))
        .count()
        .get();
      return snapshot.data().count;
    },
  };
};
