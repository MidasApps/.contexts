import type { Conversation } from "@core/contracts";
import type { Clock } from "#/services/shared/clock/clock.ts";
import { createConversation, type NewConversation } from "../../domain/conversation.ts";
import type { ConversationRepository } from "../ports/conversation-repository.ts";

export type StartConversation = (input: Omit<NewConversation, "id">) => Promise<Conversation>;

/**
 * Creates the conversation of a first chat turn (spec §4.1). Its automatic id becomes the Mastra
 * memory thread id: `/v1/chat` forwards it, and Mastra creates the thread under `tenantId:uid`.
 */
export const makeStartConversation =
  (deps: { readonly conversations: ConversationRepository; readonly clock: Clock }): StartConversation =>
  async (input) => {
    const conversation = createConversation({ ...input, id: deps.conversations.newId() }, deps.clock.now());
    await deps.conversations.create(conversation);
    return conversation;
  };
