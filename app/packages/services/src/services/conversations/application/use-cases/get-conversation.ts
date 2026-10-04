import type { Conversation } from "@core/contracts";
import { err, ok, type Result } from "#/services/shared/result/result.ts";
import { isVisibleTo } from "../../domain/conversation.ts";
import type { ConversationRepository } from "../ports/conversation-repository.ts";

export type ConversationNotFound = { readonly code: "CONVERSATION_NOT_FOUND" };

export type GetConversation = (input: {
  readonly conversationId: string;
  readonly ownerId: string;
}) => Promise<Result<Conversation, ConversationNotFound>>;

export const CONVERSATION_NOT_FOUND: ConversationNotFound = { code: "CONVERSATION_NOT_FOUND" };

/** One conversation of its owner; another member's, a deleted or an unknown one answer the same (no IDOR leak). */
export const makeGetConversation =
  (deps: { readonly conversations: ConversationRepository }): GetConversation =>
  async ({ conversationId, ownerId }) => {
    const conversation = await deps.conversations.get(conversationId);
    return conversation !== null && isVisibleTo(conversation, ownerId) ? ok(conversation) : err(CONVERSATION_NOT_FOUND);
  };
