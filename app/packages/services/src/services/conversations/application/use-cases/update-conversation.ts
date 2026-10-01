import type { Conversation, ConversationPatch } from "@core/contracts";
import type { Clock } from "../../../shared/clock/clock.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import { applyConversationPatch, isVisibleTo } from "../../domain/conversation.ts";
import type { ConversationRepository } from "../ports/conversation-repository.ts";
import { CONVERSATION_NOT_FOUND, type ConversationNotFound } from "./get-conversation.ts";

export type UpdateConversation = (input: {
  readonly conversationId: string;
  readonly ownerId: string;
  readonly patch: ConversationPatch;
}) => Promise<Result<Conversation, ConversationNotFound>>;

/** Renames (`titleSource: user`), pins or archives one of the owner's conversations. */
export const makeUpdateConversation =
  (deps: { readonly conversations: ConversationRepository; readonly clock: Clock }): UpdateConversation =>
  async ({ conversationId, ownerId, patch }) => {
    const current = await deps.conversations.get(conversationId);
    if (current === null || !isVisibleTo(current, ownerId)) return err(CONVERSATION_NOT_FOUND);
    const next = applyConversationPatch(current, patch, deps.clock.now());
    await deps.conversations.save(next);
    return ok(next);
  };
