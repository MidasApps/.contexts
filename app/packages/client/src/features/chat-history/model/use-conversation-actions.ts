"use client";

import type { Conversation, ConversationPatch } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import {
  conversationListsKey,
  deleteConversation,
  summarizeConversation,
  updateConversation,
} from "#/entities/conversation/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useDescribeError } from "#/shared/lib/errors/describe-error.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";

export type ConversationActions = {
  /** @throws the API failure, so the rename form can show it next to the field. */
  readonly rename: (conversation: Conversation, title: string) => Promise<void>;
  readonly togglePin: (conversation: Conversation) => Promise<void>;
  readonly toggleArchive: (conversation: Conversation) => Promise<void>;
  /** @throws the API failure (the summary dialog shows it). */
  readonly summarize: (conversation: Conversation) => Promise<Conversation>;
  /** @throws the API failure (the confirmation dialog shows it). */
  readonly remove: (conversation: Conversation) => Promise<void>;
};

/**
 * The owner's actions on a conversation (SP4 spec §4.1). Every change refreshes the history
 * lists: order (pinned first), membership (archived, deleted) and search words all come from the
 * server. Pin and archive report their own outcome as a toast; the others leave it to their form.
 */
export const useConversationActions = (organizationId: string): ConversationActions => {
  const t = useTranslations("chat.history");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const describe = useDescribeError();
  const refresh = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: conversationListsKey(organizationId) });

  const patch = async (conversation: Conversation, change: ConversationPatch): Promise<void> => {
    await updateConversation(callEndpoint, conversation.id, change);
    await refresh();
  };

  const quick = async (conversation: Conversation, change: ConversationPatch, done: string): Promise<void> => {
    try {
      await patch(conversation, change);
      notify.success(done);
    } catch (error: unknown) {
      notify.error(describe(error).message);
    }
  };

  return {
    rename: (conversation, title) => patch(conversation, { title }),
    togglePin: (conversation) =>
      quick(conversation, { pinned: !conversation.pinned }, t(conversation.pinned ? "unpinnedDone" : "pinnedDone")),
    toggleArchive: (conversation) =>
      quick(
        conversation,
        { archived: conversation.archivedAt === null },
        t(conversation.archivedAt === null ? "archivedDone" : "restoredDone"),
      ),
    summarize: async (conversation) => {
      const summarized = await summarizeConversation(callEndpoint, conversation.id);
      await refresh();
      return summarized;
    },
    remove: async (conversation) => {
      await deleteConversation(callEndpoint, conversation.id);
      await refresh();
    },
  };
};
