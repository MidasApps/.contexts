"use client";

import { useChat } from "@ai-sdk/react";
import { MessageMetadataSchema, stopChatRunEndpoint, type MessageAttachment } from "@core/contracts";
import { lastAssistantMessageIsCompleteWithApprovalResponses, type ChatStatus, type ChatTransport, type UIMessage } from "ai";
import { useEffect, useState } from "react";
import { ApiError } from "#/shared/api/api-error.ts";
import { useApiConnection, useCallEndpoint } from "#/shared/api/api-context.tsx";
import { createChatTransport, type ChatScope } from "#/shared/api/chat-transport.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { partsOf, toolPartOf } from "#/entities/message/index.ts";

/** What the status line says (SP4 spec §5.3); derived from `useChat` status, connectivity and how the last answer ended. */
export type ChatPhase =
  | "idle"
  /** Request sent, nothing received yet. */
  | "connecting"
  /** Re-attaching to a run that was streaming before a reload. */
  | "resuming"
  | "responding"
  /** The answer ended normally (announced, not shown). */
  | "finished"
  /** The assistant waits for the member to approve or decline a tool call. */
  | "awaiting-approval"
  /** The member stopped the answer; the partial text stays. */
  | "stopped"
  /** The stream dropped mid-answer. */
  | "lost"
  | "offline"
  | "error";

/** How the last answer ended, and which message it left behind. */
type Outcome = { readonly kind: "none" | "finished" | "stopped" | "lost"; readonly messageId?: string | undefined };

export type ChatFailure = {
  /** API error code (`errors.<code>`), or `undefined` for a failure inside the stream. */
  readonly code: string | undefined;
  readonly requestId: string | undefined;
  /** No response arrived: shown as "sem conexão" with a retry. */
  readonly network: boolean;
};

export type UseChatSessionArgs = {
  /** Where a new conversation starts. */
  readonly scope: ChatScope;
  /** The conversation to continue; a new one starts when absent. */
  readonly conversationId?: string | undefined;
  /** Its stored messages (`GET /v1/conversations/{id}/messages`). */
  readonly initialMessages?: UIMessage[] | undefined;
  /** The conversation has a run streaming on the server: re-attach on mount. */
  readonly resume?: boolean | undefined;
  /** Called once the server names a new conversation (`x-conversation-id`). */
  readonly onConversationStarted?: ((conversationId: string) => void) | undefined;
  /** Tests pass a scripted transport; the default talks to `/v1/chat`. */
  readonly transport?: ChatTransport<UIMessage> | undefined;
};

export type ChatSession = {
  readonly messages: UIMessage[];
  readonly status: ChatStatus;
  readonly phase: ChatPhase;
  readonly failure: ChatFailure | undefined;
  readonly conversationId: string | undefined;
  /** The message a stop or a lost stream cut short. */
  readonly interruptedMessageId: string | undefined;
  readonly busy: boolean;
  /** Sends a turn; `attachments` are ready files of the upload queue (sent by id, shown from metadata). */
  readonly send: (text: string, attachments?: readonly MessageAttachment[]) => void;
  readonly stop: () => void;
  /** Sends the failed turn again (or the pending approval answer). */
  readonly retry: () => void;
  /** Asks for a new answer to the last member message. */
  readonly regenerate: () => void;
  readonly respondToApproval: (decision: { id: string; approved: boolean; reason?: string | undefined }) => void;
  readonly setMessages: (update: (messages: UIMessage[]) => UIMessage[]) => void;
};

type ThreadLink = {
  readonly getScope: () => ChatScope;
  readonly getConversationId: () => string | undefined;
  /** Latest scope and listener of the component (the transport outlives renders). */
  readonly update: (next: { scope: ChatScope; onConversationStarted: ((id: string) => void) | undefined }) => void;
  /** Records the id the server gave the conversation; `true` when it is new to the thread. */
  readonly adopt: (conversationId: string) => boolean;
};

/** What the transport reads at request time, kept outside React state so one transport serves the whole thread. */
const createThreadLink = (initial: { scope: ChatScope; conversationId: string | undefined; onConversationStarted: ((id: string) => void) | undefined }): ThreadLink => {
  let { scope, conversationId, onConversationStarted } = initial;
  return {
    getScope: () => scope,
    getConversationId: () => conversationId,
    update: (next) => {
      scope = next.scope;
      onConversationStarted = next.onConversationStarted;
    },
    adopt: (id) => {
      if (conversationId === id) return false;
      conversationId = id;
      onConversationStarted?.(id);
      return true;
    },
  };
};

const failureOf = (error: Error | undefined): ChatFailure | undefined => {
  if (error === undefined) return undefined;
  if (error instanceof ApiError) return { code: error.code, requestId: error.requestId, network: error.status === 0 };
  return { code: undefined, requestId: undefined, network: false };
};

const awaitsApproval = (messages: readonly UIMessage[]): boolean => {
  const last = messages.at(-1);
  return last?.role === "assistant" && partsOf(last).some((part) => toolPartOf(part)?.state === "approval-requested");
};

const hasAnsweredApproval = (messages: readonly UIMessage[]): boolean => {
  const last = messages.at(-1);
  return last?.role === "assistant" && partsOf(last).some((part) => toolPartOf(part)?.state === "approval-responded");
};

const phaseOf = (args: { status: ChatStatus; online: boolean; failure: ChatFailure | undefined; outcome: Outcome; resuming: boolean; awaiting: boolean }): ChatPhase => {
  const { status, online, failure, outcome, resuming, awaiting } = args;
  if (status === "submitted") return resuming ? "resuming" : "connecting";
  if (status === "streaming") return "responding";
  if (outcome.kind === "lost") return "lost";
  if (status === "error") return failure?.network === true || !online ? "offline" : "error";
  if (!online) return "offline";
  if (outcome.kind === "stopped") return "stopped";
  if (awaiting) return "awaiting-approval";
  return outcome.kind === "finished" ? "finished" : "idle";
};

/**
 * One chat thread over `useChat` (server state stays in `useChat`, never copied to a store):
 * the transport for `/v1/chat`, stop that also aborts the run on the server (`useChat.stop`
 * only closes the connection), resume on mount, native approval responses (decision 0032 path
 * A) and the phase the status line shows.
 */
export const useChatSession = (args: UseChatSessionArgs): ChatSession => {
  const connection = useApiConnection();
  const callEndpoint = useCallEndpoint();
  const online = useOnlineStatus();
  const [conversationId, setConversationId] = useState(args.conversationId);
  const [outcome, setOutcome] = useState<Outcome>({ kind: "none" });
  const [resuming, setResuming] = useState(args.resume === true);
  const [link] = useState(() => createThreadLink({ scope: args.scope, conversationId: args.conversationId, onConversationStarted: args.onConversationStarted }));
  const { scope, onConversationStarted } = args;
  useEffect(() => link.update({ scope, onConversationStarted }), [link, scope, onConversationStarted]);

  const [transport] = useState(
    () =>
      args.transport ??
      createChatTransport({
        ...connection,
        getScope: link.getScope,
        getConversationId: link.getConversationId,
        onConversationId: (id) => {
          if (link.adopt(id)) setConversationId(id);
        },
      }),
  );

  const chat = useChat({
    transport,
    ...(args.initialMessages === undefined ? {} : { messages: args.initialMessages }),
    resume: args.resume === true,
    // The stream's metadata is checked against the contract (`confidence: low | normal`, follow-up #42).
    messageMetadataSchema: MessageMetadataSchema,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: ({ message, isAbort, isDisconnect, isError }) => {
      setResuming(false);
      // A stop is recorded when the member asks for it; an abort seen here is that same stop.
      if (isAbort) return;
      if (isDisconnect) setOutcome({ kind: "lost", messageId: message.id });
      else if (!isError) setOutcome({ kind: "finished", messageId: message.id });
    },
    onError: () => setResuming(false),
  });

  const { status } = chat;
  const { messages } = chat;
  const busy = status === "submitted" || status === "streaming";
  const failure = failureOf(chat.error);

  const send = (text: string, attachments: readonly MessageAttachment[] = []) => {
    setOutcome({ kind: "none" });
    if (attachments.length === 0) void chat.sendMessage({ text });
    else void chat.sendMessage({ text, metadata: { attachments } }, { body: { attachments: attachments.map((file) => file.fileId) } });
  };

  const stop = () => {
    if (chat.status !== "submitted" && chat.status !== "streaming") return;
    const last = chat.messages.at(-1);
    setOutcome({ kind: "stopped", messageId: last?.role === "assistant" ? last.id : undefined });
    void chat.stop();
    const id = link.getConversationId();
    // Best effort: the connection is already closed for the member; a failed stop only means the
    // run finishes by itself and its full answer shows up on the next load.
    if (id !== undefined) callEndpoint(stopChatRunEndpoint, { params: { conversationId: id } }).catch(() => undefined);
  };

  const retry = () => {
    setOutcome({ kind: "none" });
    chat.clearError();
    // An approval answer that failed to send is sent again as it is; regenerating would drop it.
    if (hasAnsweredApproval(chat.messages)) void chat.sendMessage();
    else void chat.regenerate();
  };

  const regenerate = () => {
    setOutcome({ kind: "none" });
    chat.clearError();
    void chat.regenerate();
  };

  const respondToApproval = (decision: { id: string; approved: boolean; reason?: string | undefined }) => {
    setOutcome({ kind: "none" });
    void chat.addToolApprovalResponse({ id: decision.id, approved: decision.approved, ...(decision.reason === undefined ? {} : { reason: decision.reason }) });
  };

  return {
    messages,
    status,
    phase: phaseOf({ status, online, failure, outcome, resuming, awaiting: awaitsApproval(messages) }),
    failure,
    conversationId,
    interruptedMessageId: outcome.kind === "stopped" || outcome.kind === "lost" ? outcome.messageId : undefined,
    busy,
    send,
    stop,
    retry,
    regenerate,
    respondToApproval,
    setMessages: chat.setMessages,
  };
};
