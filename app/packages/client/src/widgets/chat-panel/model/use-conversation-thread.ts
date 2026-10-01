"use client";

import { getConversationEndpoint, listConversationMessagesEndpoint } from "@core/contracts";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { nextCursor, nullOnNotFound } from "#/shared/api/cursor-list.ts";
import { queryKeys } from "#/shared/api/query-keys.ts";

/** A stored conversation as the chat thread starts from it. */
export type ConversationThread = {
  /** The newest page of messages, oldest first. */
  readonly messages: UIMessage[];
  /** Cursor of the page before it; `undefined` when the whole history is loaded. */
  readonly olderCursor: string | undefined;
  /** A run is streaming on the server: the thread re-attaches to it (decision 0031). */
  readonly resume: boolean;
};

const PAGE = 50;

/** One page of stored messages, oldest first, and the cursor of the page before it. */
export const fetchMessagePage = async (callEndpoint: CallEndpoint, conversationId: string, cursor: string | undefined, signal?: AbortSignal): Promise<{ messages: UIMessage[]; olderCursor: string | undefined }> => {
  const page = await callEndpoint(listConversationMessagesEndpoint, {
    params: { conversationId },
    query: { limit: PAGE, ...(cursor === undefined ? {} : { cursor }) },
    ...(signal === undefined ? {} : { signal }),
  });
  // The endpoint schema checked id, role and part types; the part guards read the rest leniently.
  return { messages: page.data as unknown as UIMessage[], olderCursor: nextCursor(page) };
};

/**
 * Loads a conversation to continue it: its metadata (is a run streaming?) and its newest
 * messages, in parallel. `data === null` means it is not visible to the caller (404). The
 * result seeds `useChat` once; it is never refetched under a live thread — `attempt` asks for a
 * fresh load (recovering a lost stream).
 */
export const useConversationThread = (args: { organizationId: string; conversationId: string | undefined; attempt: number }): UseQueryResult<ConversationThread | null> => {
  const callEndpoint = useCallEndpoint();
  const conversationId = args.conversationId ?? "";
  return useQuery({
    queryKey: queryKeys.organizationScoped(args.organizationId, "conversations", conversationId, "thread", args.attempt),
    enabled: conversationId !== "",
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: ({ signal }): Promise<ConversationThread | null> =>
      nullOnNotFound(async () => {
        const [conversation, page] = await Promise.all([
          callEndpoint(getConversationEndpoint, { params: { conversationId }, signal }),
          fetchMessagePage(callEndpoint, conversationId, undefined, signal),
        ]);
        return { ...page, resume: conversation.data.activeRunId !== null };
      }),
  });
};
