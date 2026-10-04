import {
  type Conversation,
  type ConversationPatch,
  deleteConversationEndpoint,
  listConversationsEndpoint,
  summarizeConversationEndpoint,
  updateConversationEndpoint,
} from "@core/contracts";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { cursorListQuery } from "#/shared/api/cursor-list.ts";
import { type QueryKey, queryKeys } from "#/shared/api/query-keys.ts";

/** What the history list shows: active or archived conversations, optionally matching words. */
export type ConversationFilter = { readonly archived: boolean; readonly q: string };

export const CONVERSATION_PAGE_SIZE = 30;

/** Every conversation list of an organization (invalidate after any change). */
export const conversationListsKey = (organizationId: string): QueryKey =>
  queryKeys.organizationScoped(organizationId, "conversations", "list");

export const conversationListKey = (organizationId: string, filter: ConversationFilter): QueryKey => [
  ...conversationListsKey(organizationId),
  { archived: filter.archived, q: filter.q.trim() },
];

/**
 * `GET /v1/conversations` as an infinite cursor list (SP4 spec §4.1): the caller's own
 * conversations, pinned first then most recent; `q` matches title and summary words.
 */
export const conversationsQuery = (callEndpoint: CallEndpoint, organizationId: string, filter: ConversationFilter) => {
  const q = filter.q.trim();
  return cursorListQuery<Conversation>({
    queryKey: conversationListKey(organizationId, filter),
    fetchPage: (cursor, signal) =>
      callEndpoint(listConversationsEndpoint, {
        query: {
          organizationId,
          limit: CONVERSATION_PAGE_SIZE,
          archived: filter.archived ? "true" : "false",
          ...(q === "" ? {} : { q }),
          ...(cursor === undefined ? {} : { cursor }),
        },
        signal,
      }),
  });
};

/** `PATCH /v1/conversations/{id}`: rename, pin or archive. */
export const updateConversation = async (
  callEndpoint: CallEndpoint,
  conversationId: string,
  patch: ConversationPatch,
): Promise<Conversation> =>
  (await callEndpoint(updateConversationEndpoint, { params: { conversationId }, body: patch })).data;

/** `DELETE /v1/conversations/{id}`: the conversation and its messages. */
export const deleteConversation = async (callEndpoint: CallEndpoint, conversationId: string): Promise<void> => {
  await callEndpoint(deleteConversationEndpoint, { params: { conversationId } });
};

/** `POST /v1/conversations/{id}/summary`: summarizes the last messages and stores the summary. */
export const summarizeConversation = async (
  callEndpoint: CallEndpoint,
  conversationId: string,
): Promise<Conversation> => (await callEndpoint(summarizeConversationEndpoint, { params: { conversationId } })).data;
