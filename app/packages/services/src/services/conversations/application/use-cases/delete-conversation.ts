import type { Conversation } from "@core/contracts";
import type { Clock } from "../../../shared/clock/clock.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import { isVisibleTo, liveActiveRunId } from "../../domain/conversation.ts";
import type { ConversationRepository } from "../ports/conversation-repository.ts";
import { CONVERSATION_NOT_FOUND, type ConversationNotFound } from "./get-conversation.ts";

export type DeleteConversationError =
  | ConversationNotFound
  | { readonly code: "CONVERSATION_STREAMING" }
  | { readonly code: "THREAD_DELETE_FAILED" };

export type DeleteConversation = (input: {
  readonly conversationId: string;
  readonly ownerId: string;
  /** Removes the Mastra memory thread (the messages); `false` when the runtime refused or failed. */
  readonly deleteMessages: (conversation: Conversation) => Promise<boolean>;
}) => Promise<Result<Conversation, DeleteConversationError>>;

/**
 * Deletes a conversation (decision 0033): its messages first (the Mastra thread), then the
 * metadata is soft-deleted (`deletedAt`; purged after 30 days by SP5). A conversation that is
 * streaming answers `CONVERSATION_STREAMING` (stop it first); a failed thread delete leaves the
 * metadata untouched so the owner can retry.
 */
export const makeDeleteConversation =
  (deps: { readonly conversations: ConversationRepository; readonly clock: Clock }): DeleteConversation =>
  async ({ conversationId, ownerId, deleteMessages }) => {
    const current = await deps.conversations.get(conversationId);
    if (current === null || !isVisibleTo(current, ownerId)) return err(CONVERSATION_NOT_FOUND);
    const now = deps.clock.now();
    if (liveActiveRunId(current, now) !== null) return err({ code: "CONVERSATION_STREAMING" });
    if (!(await deleteMessages(current))) return err({ code: "THREAD_DELETE_FAILED" });
    const deleted = { ...current, deletedAt: now.toISOString(), updatedAt: now.toISOString() };
    await deps.conversations.save(deleted);
    return ok(deleted);
  };
