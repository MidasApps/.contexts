// Public API of the conversations context (SP4 Tasks 4–6): chat conversation metadata and the
// `/v1/chat` and `/v1/conversations` handlers.

export { CONVERSATIONS_COLLECTION } from "./adapters/driven/conversation-storage.ts";
export { createFirestoreConversationRepository } from "./adapters/driven/firestore-conversation-repository.ts";
export {
  createInMemoryConversationRepository,
  type InMemoryConversationRepository,
} from "./adapters/driven/in-memory-conversation-repository.ts";
export type { ChatRoutesDeps } from "./adapters/driving/chat-http.ts";
export { buildChatRoutes, sendChatErrorResponse } from "./adapters/driving/chat-route-handler.ts";
export { buildConversationsRoutes, CONVERSATION_PERMISSIONS } from "./adapters/driving/conversations-route-handler.ts";
export { trackRunStream } from "./adapters/driving/run-stream.ts";
export type {
  ConversationListQuery,
  ConversationRepository,
  RunEnd,
} from "./application/ports/conversation-repository.ts";
export type { DeleteConversation, DeleteConversationError } from "./application/use-cases/delete-conversation.ts";
export type { ConversationNotFound, GetConversation } from "./application/use-cases/get-conversation.ts";
export type { ListConversations } from "./application/use-cases/list-conversations.ts";
export { type ListMessages, type MessagesPage, makeListMessages } from "./application/use-cases/list-messages.ts";
export {
  decisionOf,
  makeRecordToolDecisions,
  type RecordToolDecisions,
} from "./application/use-cases/record-tool-decision.ts";
export {
  MAX_INLINE_ATTACHMENT_BYTES,
  makeResolveAttachments,
  type ResolveAttachments,
} from "./application/use-cases/resolve-attachments.ts";
export {
  CONVERSATION_SEND_PERMISSION,
  makeSendChatMessage,
  type SendChatError,
  type SendChatMessage,
} from "./application/use-cases/send-chat-message.ts";
export type { ActiveRuns } from "./application/use-cases/set-active-run.ts";
export type { StartConversation } from "./application/use-cases/start-conversation.ts";
export {
  makeSummarizeConversation,
  type SummarizeConversation,
} from "./application/use-cases/summarize-conversation.ts";
export type { UpdateConversation } from "./application/use-cases/update-conversation.ts";
export {
  type ConversationsServices,
  createConversationsServices,
  createFirestoreConversationsServices,
} from "./composition.ts";
export {
  ACTIVE_RUN_TTL_MS,
  applyConversationPatch,
  createConversation,
  endRunOf,
  isVisibleTo,
  liveActiveRunId,
  MAX_ACTIVE_STREAMS_PER_TENANT,
  type NewConversation,
  type RunEndFacts,
} from "./domain/conversation.ts";
export { buildSearchTokens, MAX_QUERY_TOKENS, queryTokens } from "./domain/search-tokens.ts";
