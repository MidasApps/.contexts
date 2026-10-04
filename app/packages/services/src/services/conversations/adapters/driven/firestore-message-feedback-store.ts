import { MessageFeedbackSchema } from "@core/contracts";
import { type Firestore, Timestamp } from "firebase-admin/firestore";
import { CORE_SCHEMA_VERSION } from "../../../shared/firestore/collections.ts";
import type { MessageFeedbackStore } from "../../application/ports/message-feedback-store.ts";

/**
 * `message-feedback/{key}`: the key is a SHA-256 of tenant, conversation, message and user, so a
 * rating is idempotent per message and user without a query (the same justified exception to
 * automatic ids as `access/{tenantId}_{uid}`). Security Rules deny every client (catch-all).
 */
export const MESSAGE_FEEDBACK_COLLECTION = "message-feedback";

const isoOf = (value: unknown, fallback: string): string =>
  value instanceof Timestamp ? value.toDate().toISOString() : fallback;

export const createFirestoreMessageFeedbackStore = (deps: { readonly firestore: Firestore }): MessageFeedbackStore => ({
  upsert: ({ key, feedback, at }) =>
    deps.firestore.runTransaction(async (tx) => {
      const ref = deps.firestore.collection(MESSAGE_FEEDBACK_COLLECTION).doc(key);
      const current = await tx.get(ref);
      const createdAt = isoOf(current.get("createdAt"), at);
      const comment = feedback.comment ?? null;
      tx.set(ref, {
        ...feedback,
        comment,
        createdAt: Timestamp.fromDate(new Date(createdAt)),
        updatedAt: Timestamp.fromDate(new Date(at)),
        schemaVersion: CORE_SCHEMA_VERSION,
      });
      return MessageFeedbackSchema.parse({ ...feedback, createdAt, updatedAt: at });
    }),
});

/** In-memory store for unit tests. */
export const createInMemoryMessageFeedbackStore = () => {
  const rows = new Map<string, ReturnType<typeof MessageFeedbackSchema.parse>>();
  const store: MessageFeedbackStore = {
    upsert: ({ key, feedback, at }) => {
      const row = MessageFeedbackSchema.parse({
        ...feedback,
        createdAt: rows.get(key)?.createdAt ?? at,
        updatedAt: at,
      });
      rows.set(key, row);
      return Promise.resolve(row);
    },
  };
  return { store, rows };
};
