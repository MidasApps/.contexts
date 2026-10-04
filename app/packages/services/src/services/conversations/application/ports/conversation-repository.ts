import type { Conversation, ConversationId } from "@core/contracts";
import type { Page, PageRequest } from "#/services/shared/pagination/page.ts";
import type { RunEndFacts } from "../../domain/conversation.ts";

/** Filters of the history list (spec §4.1): always one owner in one tenant, never deleted ones. */
export type ConversationListQuery = {
  readonly tenantId: string;
  readonly ownerId: string;
  readonly archived: boolean;
  readonly pinned?: boolean;
  /** Folded search tokens (`array-contains-any`, ≤ 30). */
  readonly tokens?: readonly string[];
  readonly page: PageRequest;
};

/** A run to end on one conversation. */
export type RunEnd = RunEndFacts & { readonly conversationId: ConversationId };

/**
 * Driven port of the `conversations` context (Firestore `conversations/{id}`, decision 0033).
 * Writes happen only through `/v1` (Security Rules deny every client write).
 */
export type ConversationRepository = {
  /** A new automatic id; also the Mastra memory thread id. */
  readonly newId: () => ConversationId;
  /** The stored conversation (deleted ones included), or `null`. */
  readonly get: (id: string) => Promise<Conversation | null>;
  readonly create: (conversation: Conversation) => Promise<void>;
  /** Replaces the stored metadata with `conversation`. */
  readonly save: (conversation: Conversation) => Promise<void>;
  /** Pinned first, then the most recent turn first (`pinned desc, lastMessageAt desc, id desc`). */
  readonly list: (query: ConversationListQuery) => Promise<Page<Conversation>>;
  /** Marks `runId` as the active run (a new run replaces a stale one). */
  readonly startRun: (input: {
    readonly conversationId: ConversationId;
    readonly runId: string;
    readonly startedAt: string;
  }) => Promise<void>;
  /**
   * Ends `runId` in one transaction: clears `activeRunId` only when it is still `runId`, counts the
   * turn, stamps `lastMessageAt` and copies an automatic title while `titleSource` is `auto`.
   * @returns the updated conversation, or `null` when it is gone.
   */
  readonly endRun: (input: RunEnd) => Promise<Conversation | null>;
  /** Streams of the tenant that started after `since` and are still active (the 5-stream cap). */
  readonly countActiveRuns: (input: { readonly tenantId: string; readonly since: string }) => Promise<number>;
};
