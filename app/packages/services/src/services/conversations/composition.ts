// Composition root of the conversations context (SP4 Task 4, decision 0033): chat conversation
// metadata in Firestore; the messages stay in Mastra memory.
import type { Firestore } from "firebase-admin/firestore";
import { type Clock, systemClock } from "../shared/clock/clock.ts";
import { createFirestoreConversationRepository } from "./adapters/driven/firestore-conversation-repository.ts";
import type { ConversationRepository } from "./application/ports/conversation-repository.ts";
import { type DeleteConversation, makeDeleteConversation } from "./application/use-cases/delete-conversation.ts";
import { type GetConversation, makeGetConversation } from "./application/use-cases/get-conversation.ts";
import { type ListConversations, makeListConversations } from "./application/use-cases/list-conversations.ts";
import { type ActiveRuns, makeActiveRuns } from "./application/use-cases/set-active-run.ts";
import { makeStartConversation, type StartConversation } from "./application/use-cases/start-conversation.ts";
import { makeUpdateConversation, type UpdateConversation } from "./application/use-cases/update-conversation.ts";

export type ConversationsServices = {
  readonly startConversation: StartConversation;
  readonly getConversation: GetConversation;
  readonly listConversations: ListConversations;
  readonly updateConversation: UpdateConversation;
  readonly deleteConversation: DeleteConversation;
  readonly activeRuns: ActiveRuns;
  /** The repository itself, for summaries (Task 6) and tests. */
  readonly conversations: ConversationRepository;
  readonly clock: Clock;
};

/** Binds the conversations use cases to a repository (tests pass the in-memory one). */
export const createConversationsServices = (deps: {
  readonly conversations: ConversationRepository;
  readonly clock?: Clock;
}): ConversationsServices => {
  const clock = deps.clock ?? systemClock;
  const { conversations } = deps;
  return {
    startConversation: makeStartConversation({ conversations, clock }),
    getConversation: makeGetConversation({ conversations }),
    listConversations: makeListConversations({ conversations }),
    updateConversation: makeUpdateConversation({ conversations, clock }),
    deleteConversation: makeDeleteConversation({ conversations, clock }),
    activeRuns: makeActiveRuns({ conversations, clock }),
    conversations,
    clock,
  };
};

/** The conversations services over Firestore `conversations`. */
export const createFirestoreConversationsServices = (deps: {
  readonly firestore: Firestore;
  readonly clock?: Clock;
}): ConversationsServices =>
  createConversationsServices({
    conversations: createFirestoreConversationRepository({ firestore: deps.firestore }),
    ...(deps.clock === undefined ? {} : { clock: deps.clock }),
  });
