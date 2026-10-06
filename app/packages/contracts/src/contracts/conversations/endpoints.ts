// Chat and conversation history `/v1` descriptors (SP4 spec §4.1, decisions 0031 and 0033).
import { z } from "zod";
import { none, personal } from "../field-docs.ts";
import { defineEndpoint, type EndpointDefinition } from "../http/endpoint.ts";
import { dataEnvelope, listEnvelope } from "../http/envelopes.schema.ts";
import { OrganizationIdSchema } from "../tenancy/ids.schema.ts";
import { ChatRequestSchema } from "./chat-request.schema.ts";
import { ConversationIdSchema, ConversationSchema } from "./conversation.schema.ts";
import { ConversationPatchSchema } from "./conversation-patch.schema.ts";

const conversationParams = z.object({ conversationId: ConversationIdSchema.meta(none("Conversation id.")) });

/**
 * `200` of the chat routes: the AI SDK UI message stream (SSE `data:` lines, header
 * `x-vercel-ai-ui-message-stream: v1`), a documented deviation from `api.md` §14 (decision 0031).
 */
export const ChatStreamSchema = z
  .string()
  .meta(personal("AI SDK UI message stream (text/event-stream) of the assistant's answer."));

/** A stored chat message as `useChat` reads it (AI SDK v7 `UIMessage`). */
export const ChatUiMessageSchema = z
  .looseObject({
    id: z.string().min(1).meta(none("Message id.")),
    role: z.enum(["user", "assistant", "system"]).meta(none("Author role.")),
    parts: z
      .array(z.looseObject({ type: z.string().min(1).meta(none("Part type.")) }).meta(personal("A message part.")))
      .meta(personal("Message parts.")),
  })
  .meta(personal("A chat message in AI SDK UI message form."));

const MAX_CONVERSATION_PAGE = 50;

const booleanQuery = (description: string) =>
  z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional()
    .meta(none(description));

export const ListConversationsQuerySchema = z.strictObject({
  organizationId: OrganizationIdSchema.meta(none("Organization whose conversations to list.")),
  cursor: z.string().min(1).max(500).optional().meta(none("Cursor returned by the previous page.")),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_CONVERSATION_PAGE)
    .default(20)
    .meta(none("Page size, 1-50 (default 20).")),
  archived: booleanQuery("true lists archived conversations only (default false)."),
  pinned: booleanQuery("Only pinned (true) or unpinned (false) conversations."),
  q: z.string().trim().min(1).max(200).optional().meta(personal("Search words matched against title and summary.")),
});

export const sendChatMessageEndpoint = defineEndpoint({
  id: "chat.sendMessage",
  method: "POST",
  path: "/v1/chat",
  auth: "user",
  body: ChatRequestSchema,
  responses: { 200: ChatStreamSchema },
  errors: { 403: ["FORBIDDEN"], 404: ["NOT_FOUND"], 409: ["CONFLICT"] },
  rateLimit: "chat-turn",
  summary: "Sends one chat turn and streams the answer as an AI SDK UI message stream (core.conversation.send).",
});

export const resumeChatStreamEndpoint = defineEndpoint({
  id: "chat.resumeStream",
  method: "GET",
  path: "/v1/chat/{conversationId}/stream",
  auth: "user",
  params: conversationParams,
  responses: { 200: ChatStreamSchema, 204: null },
  errors: { 404: ["NOT_FOUND"] },
  summary: "Re-attaches to the conversation's active run; 204 when none is streaming (core.conversation.send).",
});

export const stopChatRunEndpoint = defineEndpoint({
  id: "chat.stopRun",
  method: "POST",
  path: "/v1/chat/{conversationId}/stop",
  auth: "user",
  params: conversationParams,
  responses: { 204: null },
  errors: { 404: ["NOT_FOUND"] },
  summary: "Stops the conversation's active run; the partial answer stays in memory (core.conversation.send).",
});

export const listConversationsEndpoint = defineEndpoint({
  id: "conversations.list",
  method: "GET",
  path: "/v1/conversations",
  auth: "user",
  query: ListConversationsQuerySchema,
  responses: { 200: listEnvelope(ConversationSchema) },
  errors: { 403: ["FORBIDDEN"] },
  summary: "Lists the caller's conversations, pinned first then most recent (core.conversation.read).",
});

export const getConversationEndpoint = defineEndpoint({
  id: "conversations.get",
  method: "GET",
  path: "/v1/conversations/{conversationId}",
  auth: "user",
  params: conversationParams,
  responses: { 200: dataEnvelope(ConversationSchema) },
  errors: { 404: ["NOT_FOUND"] },
  summary: "Reads one of the caller's conversations (core.conversation.read).",
});

export const updateConversationEndpoint = defineEndpoint({
  id: "conversations.update",
  method: "PATCH",
  path: "/v1/conversations/{conversationId}",
  auth: "user",
  params: conversationParams,
  body: ConversationPatchSchema,
  responses: { 200: dataEnvelope(ConversationSchema) },
  errors: { 404: ["NOT_FOUND"] },
  summary: "Renames, pins or archives one of the caller's conversations (core.conversation.update).",
});

export const deleteConversationEndpoint = defineEndpoint({
  id: "conversations.delete",
  method: "DELETE",
  path: "/v1/conversations/{conversationId}",
  auth: "user",
  params: conversationParams,
  responses: { 204: null },
  errors: { 404: ["NOT_FOUND"], 409: ["CONFLICT"] },
  summary: "Deletes a conversation: soft delete, its memory thread removed, audited (core.conversation.delete).",
});

export const listConversationMessagesEndpoint = defineEndpoint({
  id: "conversations.listMessages",
  method: "GET",
  path: "/v1/conversations/{conversationId}/messages",
  auth: "user",
  params: conversationParams,
  query: z.strictObject({
    cursor: z
      .string()
      .regex(/^\d{1,6}$/)
      .optional()
      .meta(none("Cursor returned by the previous page (older messages).")),
    limit: z.coerce.number().int().min(1).max(100).default(50).meta(none("Page size, 1-100 (default 50).")),
  }),
  responses: { 200: listEnvelope(ChatUiMessageSchema) },
  errors: { 404: ["NOT_FOUND"] },
  summary: "Lists a conversation's messages as AI SDK UI messages, newest page first (core.conversation.read).",
});

export const summarizeConversationEndpoint = defineEndpoint({
  id: "conversations.summarize",
  method: "POST",
  path: "/v1/conversations/{conversationId}/summary",
  auth: "user",
  params: conversationParams,
  responses: { 200: dataEnvelope(ConversationSchema) },
  errors: { 404: ["NOT_FOUND"], 409: ["CONFLICT"] },
  summary: "Summarizes the last 100 messages and stores the summary for search (core.conversation.update).",
});

export const CONVERSATIONS_ENDPOINTS: readonly EndpointDefinition[] = [
  sendChatMessageEndpoint,
  resumeChatStreamEndpoint,
  stopChatRunEndpoint,
  listConversationsEndpoint,
  getConversationEndpoint,
  updateConversationEndpoint,
  deleteConversationEndpoint,
  listConversationMessagesEndpoint,
  summarizeConversationEndpoint,
];
