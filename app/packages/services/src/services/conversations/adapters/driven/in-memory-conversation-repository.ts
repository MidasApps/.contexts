import { type Conversation, ConversationIdSchema } from "@core/contracts";
import { pageFromOverfetch } from "#/services/shared/pagination/page.ts";
import type { ConversationListQuery, ConversationRepository } from "../../application/ports/conversation-repository.ts";
import { endRunOf } from "../../domain/conversation.ts";
import { conversationPosition, parseConversationPosition } from "./conversation-storage.ts";

export type InMemoryConversationRepository = ConversationRepository & {
  /** Every stored conversation, for assertions. */
  readonly all: () => readonly Conversation[];
};

// `pinned desc, lastMessageAt desc, id desc`, like the Firestore query.
const compare = (left: Conversation, right: Conversation): number => {
  if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
  if (left.lastMessageAt !== right.lastMessageAt) return left.lastMessageAt < right.lastMessageAt ? 1 : -1;
  return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
};

const matches = (conversation: Conversation, query: ConversationListQuery): boolean =>
  conversation.tenantId === query.tenantId &&
  conversation.ownerId === query.ownerId &&
  conversation.deletedAt === null &&
  (conversation.archivedAt !== null) === query.archived &&
  (query.pinned === undefined || conversation.pinned === query.pinned) &&
  (query.tokens === undefined ||
    query.tokens.length === 0 ||
    query.tokens.some((token) => conversation.searchTokens.includes(token)));

const isAfter = (conversation: Conversation, after: NonNullable<ConversationListQuery["page"]["after"]>): boolean => {
  const position = parseConversationPosition(after);
  if (position === null) return false;
  const cursor = { pinned: position.pinned, lastMessageAt: position.lastMessageAt, id: after[1] } as Conversation;
  return compare(conversation, cursor) > 0;
};

/** In-memory `ConversationRepository` for unit tests (same order and filters as Firestore). */
export const createInMemoryConversationRepository = (
  seed: readonly Conversation[] = [],
): InMemoryConversationRepository => {
  const store = new Map<string, Conversation>(seed.map((conversation) => [conversation.id, conversation]));
  let next = 0;
  const put = (conversation: Conversation) => void store.set(conversation.id, conversation);
  return {
    all: () => [...store.values()],
    newId: () => ConversationIdSchema.parse(`conv${String(++next).padStart(16, "0")}`),
    get: (id) => Promise.resolve(store.get(id) ?? null),
    create: (conversation) => {
      if (store.has(conversation.id)) return Promise.reject(new Error("ALREADY_EXISTS"));
      put(conversation);
      return Promise.resolve();
    },
    save: (conversation) => Promise.resolve(put(conversation)),
    list: (query) => {
      const sorted = [...store.values()].filter((conversation) => matches(conversation, query)).sort(compare);
      const after = query.page.after;
      const remaining = after === undefined ? sorted : sorted.filter((conversation) => isAfter(conversation, after));
      return Promise.resolve(
        pageFromOverfetch({
          fetched: remaining.slice(0, query.page.limit + 1),
          limit: query.page.limit,
          positionOf: conversationPosition,
        }),
      );
    },
    startRun: ({ conversationId, runId, startedAt }) => {
      const current = store.get(conversationId);
      if (current !== undefined)
        put({ ...current, activeRunId: runId, activeStreamStartedAt: startedAt, updatedAt: startedAt });
      return Promise.resolve();
    },
    endRun: (end) => {
      const current = store.get(end.conversationId);
      if (current === undefined) return Promise.resolve(null);
      const updated = endRunOf(current, end);
      put(updated);
      return Promise.resolve(updated);
    },
    countActiveRuns: ({ tenantId, since }) =>
      Promise.resolve(
        [...store.values()].filter(
          (conversation) =>
            conversation.tenantId === tenantId &&
            conversation.activeStreamStartedAt !== null &&
            conversation.activeStreamStartedAt > since,
        ).length,
      ),
  };
};
