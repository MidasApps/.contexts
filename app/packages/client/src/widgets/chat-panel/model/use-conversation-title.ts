"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { conversationKey, conversationQuery } from "#/entities/conversation/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";

/** What the chat header calls the conversation on screen. */
export type ConversationTitle =
  | { readonly kind: "new" }
  | { readonly kind: "loading" }
  /** No title yet (generated after the first answer) or it could not be read: "untitled". */
  | { readonly kind: "untitled" }
  | { readonly kind: "titled"; readonly title: string };

/**
 * The title of the conversation on screen and `refresh`, called when a turn settles: the server
 * writes the generated title when the run ends, before the stream closes.
 */
export const useConversationTitle = (
  organizationId: string,
  conversationId: string | undefined,
): { readonly title: ConversationTitle; readonly refresh: () => void } => {
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const query = useQuery({
    ...conversationQuery(callEndpoint, organizationId, conversationId ?? ""),
    enabled: conversationId !== undefined,
  });
  const refresh = useCallback(() => {
    if (conversationId !== undefined)
      void queryClient.invalidateQueries({ queryKey: conversationKey(organizationId, conversationId) });
  }, [queryClient, organizationId, conversationId]);
  return { title: titleOf(conversationId, query), refresh };
};

const titleOf = (
  conversationId: string | undefined,
  query: { readonly isPending: boolean; readonly data?: { readonly title: string | null } | undefined },
): ConversationTitle => {
  if (conversationId === undefined) return { kind: "new" };
  const title = query.data?.title;
  if (title !== undefined && title !== null && title !== "") return { kind: "titled", title };
  // An error falls back to "untitled": the thread below reports problems with the conversation itself.
  return query.isPending && query.data === undefined ? { kind: "loading" } : { kind: "untitled" };
};
