"use client";

import { useState } from "react";
import { ASSISTANT_AGENT_ID } from "#/entities/chat-agent/index.ts";

/**
 * Which conversation is on screen. `key` remounts the thread; adopting the id the server gave a
 * new conversation does not. `storedId` is the conversation the thread loads when it mounts.
 */
export type PanelThread = {
  readonly key: number;
  readonly conversationId: string | undefined;
  readonly storedId: string | undefined;
  /** Last `conversationId` prop seen, to tell "the owner navigated" from "the owner caught up". */
  readonly prop: string | undefined;
  /** The member asked for a new conversation: the composer takes the focus. */
  readonly fresh: boolean;
  readonly attempt: number;
};

const threadFor = (key: number, conversationId: string | undefined): PanelThread => ({
  key,
  conversationId,
  storedId: conversationId,
  prop: conversationId,
  fresh: false,
  attempt: 0,
});

/**
 * The thread of the chat panel and the agent that answers it, following the conversation the
 * owner of the URL passes. `started`, `startNew` and `recover` are the panel's three moves:
 * adopt the id of a new conversation, start another one, and reload the current one.
 */
export const usePanelThread = (
  conversationId: string | undefined,
  onConversationChange: ((conversationId: string | undefined) => void) | undefined,
) => {
  const [thread, setThread] = useState<PanelThread>(() => threadFor(0, conversationId));
  // The agent picked for a new conversation, or the one a stored conversation names.
  const [agentId, setAgentId] = useState<string>(ASSISTANT_AGENT_ID);

  // The owner of the URL moved to another conversation: start that thread. When it only caught
  // up with the id this thread got from the server, nothing remounts (the answer is streaming).
  if (conversationId !== thread.prop) {
    const caughtUp = conversationId === thread.conversationId;
    setThread(caughtUp ? { ...thread, prop: conversationId } : threadFor(thread.key + 1, conversationId));
    // Another conversation: a stored one names its agent once loaded, a new one starts with the assistant.
    if (!caughtUp) setAgentId(ASSISTANT_AGENT_ID);
  }

  const started = (id: string) => {
    setThread((current) => ({ ...current, conversationId: id }));
    onConversationChange?.(id);
  };

  const startNew = () => {
    setThread((current) => ({ ...threadFor(current.key + 1, undefined), prop: current.prop, fresh: true }));
    setAgentId(ASSISTANT_AGENT_ID);
    onConversationChange?.(undefined);
  };

  const recover = () =>
    setThread((current) => ({
      ...current,
      key: current.key + 1,
      storedId: current.conversationId,
      fresh: false,
      attempt: current.attempt + 1,
    }));

  return { thread, agentId, setAgentId, started, startNew, recover };
};
