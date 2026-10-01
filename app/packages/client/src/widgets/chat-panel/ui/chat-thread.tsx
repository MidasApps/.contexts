"use client";

import type { ContractDefinition } from "@core/contracts";
import type { ChatTransport, UIMessage } from "ai";
import { CheckIcon, CopyIcon, RefreshCwIcon, SparklesIcon } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { UseUploadQueueArgs } from "#/features/chat-upload/index.ts";
import { ReadAloudAction, type ComposerVoiceProps, type ReadAloudActionProps } from "#/features/chat-voice/index.ts";
import { useTranslations } from "use-intl";
import { approvalRequestRoute } from "#/entities/approval-request/index.ts";
import { ChatMessage, formatUiSubmission, textOf, type UiSubmission } from "#/entities/message/index.ts";
import { GenerativeUiProvider, type UiRegistry } from "#/features/generative-ui/index.ts";
import type { ChatScope } from "#/shared/api/chat-transport.ts";
import { routeHref } from "#/shared/lib/router/route-paths.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Conversation, ConversationEmptyState, ConversationScrollButton } from "#/shared/ui/ai/conversation.tsx";
import { Message, MessageAction, MessageActions, MessageContent } from "#/shared/ui/ai/message.tsx";
import { Shimmer } from "#/shared/ui/ai/shimmer.tsx";
import { Suggestion, Suggestions } from "#/shared/ui/ai/suggestion.tsx";
import { useChatSession } from "../model/use-chat-session.ts";
import { useChatVoice } from "../model/use-chat-voice.ts";
import { useOlderMessages } from "../model/use-older-messages.ts";
import { ChatComposer } from "./chat-composer.tsx";
import { createCoreToolRenderer } from "./chat-tool-part.tsx";
import { StatusLine } from "./status-line.tsx";

/** A quick-start card of the empty conversation (chat.html §23.1). */
export type ChatSuggestion = { readonly id: string; readonly title: string; readonly description?: string | undefined; readonly prompt: string };

export type ChatThreadProps = {
  scope: ChatScope;
  conversationId?: string | undefined;
  initialMessages?: UIMessage[] | undefined;
  /** Cursor of the messages before `initialMessages`. */
  olderCursor?: string | undefined;
  resume?: boolean | undefined;
  /** Focus the composer when the thread mounts (the member asked for a new conversation). */
  focusOnMount?: boolean | undefined;
  showReasoning?: boolean | undefined;
  /** Name of the agent that answers, on its messages; the assistant by default. */
  assistantName?: string | undefined;
  suggestions: readonly ChatSuggestion[];
  onConversationStarted?: ((conversationId: string) => void) | undefined;
  /** The turn on screen stopped being busy (answered, stopped, failed or lost). */
  onTurnSettled?: (() => void) | undefined;
  /** Reloads the conversation from the server (a lost stream may still be running there). */
  onRecover?: (() => void) | undefined;
  /** Generative UI components the chat may render (core plus modules). */
  uiRegistry: UiRegistry;
  /** Contracts forms may render (core plus modules). */
  contracts: readonly ContractDefinition[];
  approvalHref?: ((approvalId: string) => string) | undefined;
  can?: ((permission: string) => boolean) | undefined;
  defaultCurrency?: string | undefined;
  /** Extra composer tools of the host (the attach menu is the thread's own). */
  tools?: ReactNode;
  transport?: ChatTransport<UIMessage> | undefined;
  /** Tests pass scripted uploads, a fake microphone and fake audio URLs. */
  uploadSeams?: UseUploadQueueArgs["seams"];
  voiceSeams?: ComposerVoiceProps["seams"];
  speechSeams?: ReadAloudActionProps["seams"];
};

const COPIED_MS = 2000;

/** Read aloud for one answer; `undefined` while voice is off. */
type AnswerSpeech = { readonly organizationId: string; readonly autoPlay: boolean; readonly seams: ReadAloudActionProps["seams"] };

function AnswerActions({ message, canRegenerate, onRegenerate, speech }: { message: UIMessage; canRegenerate: boolean; onRegenerate: () => void; speech?: AnswerSpeech | undefined }) {
  const t = useTranslations("chat.message");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);
  const text = textOf(message);
  if (text === "" && !canRegenerate) return null;
  const copy = () => {
    navigator.clipboard.writeText(text).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };
  return (
    <MessageActions className="flex-wrap">
      {text === "" ? null : (
        <MessageAction label={copied ? t("copied") : t("copy")} onClick={copy}>
          {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
        </MessageAction>
      )}
      {canRegenerate ? (
        <MessageAction label={t("regenerate")} onClick={onRegenerate}>
          <RefreshCwIcon aria-hidden="true" />
        </MessageAction>
      ) : null}
      {speech === undefined || text === "" ? null : <ReadAloudAction organizationId={speech.organizationId} text={text} autoPlay={speech.autoPlay} seams={speech.seams} />}
      <span role="status" className="sr-only">
        {copied ? t("copied") : ""}
      </span>
    </MessageActions>
  );
}

/**
 * One live conversation: the message log, the status line and the composer over a chat
 * session. Esc anywhere in the thread stops the answer; focus goes back to the composer after
 * a stop, a suggestion or a new conversation, so the keyboard flow never dead-ends.
 */
export function ChatThread(props: ChatThreadProps) {
  const t = useTranslations("chat");
  const session = useChatSession({
    scope: props.scope,
    conversationId: props.conversationId,
    initialMessages: props.initialMessages,
    resume: props.resume,
    onConversationStarted: props.onConversationStarted,
    transport: props.transport,
  });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { messages, phase, busy } = session;
  const voice = useChatVoice({ organizationId: props.scope.organizationId, can: props.can });
  const finishedAnswerId = phase === "finished" ? messages.findLast((message) => message.role === "assistant")?.id : undefined;
  // "Read answers aloud": the answer that just finished in this thread starts reading by itself.
  const speechFor = (messageId: string): AnswerSpeech | undefined =>
    voice === undefined ? undefined : { organizationId: props.scope.organizationId, autoPlay: voice.autoRead && messageId === finishedAnswerId, seams: props.speechSeams };
  const older = useOlderMessages({
    conversationId: session.conversationId,
    initialCursor: props.olderCursor,
    messages,
    prepend: (page) => session.setMessages((current) => [...page, ...current]),
  });
  const renderTool = createCoreToolRenderer(session);

  // What the member answers in a form or a picker goes as the next user turn: the tools that
  // render them already returned (`catalog.renderForm` runs on the server) and `/v1/chat` takes
  // only text in a user message (decision 0032, amendment of SP4 Task 10).
  const submitUi = (submission: UiSubmission) => session.send(formatUiSubmission(submission));

  useEffect(() => {
    if (props.focusOnMount === true) inputRef.current?.focus();
  }, [props.focusOnMount]);

  // The run ended on the server before the stream closed (`/v1/chat` clears it first), so what
  // the host shows about this conversation (answering, its generated title) is stale now.
  const { onTurnSettled } = props;
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !busy) onTurnSettled?.();
    wasBusy.current = busy;
  }, [busy, onTurnSettled]);

  // Without a router-built href from the app, the link is the inbox route itself (no locale prefix).
  const approvalHref = props.approvalHref ?? ((approvalId: string) => routeHref(approvalRequestRoute(props.scope.organizationId, approvalId)));

  const stop = () => {
    session.stop();
    inputRef.current?.focus();
  };

  const send = (text: string) => {
    session.send(text);
    inputRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // Popovers and the composer handle their own Esc first (they prevent the default).
    if (event.key !== "Escape" || event.defaultPrevented || !busy) return;
    event.preventDefault();
    stop();
  };

  const lastId = messages.at(-1)?.id;
  const waitingFirstChunk = (phase === "connecting" || phase === "resuming") && messages.at(-1)?.role !== "assistant";
  const retry = phase === "lost" && props.onRecover !== undefined && session.conversationId !== undefined ? props.onRecover : session.retry;

  return (
    <GenerativeUiProvider registry={props.uiRegistry} contracts={props.contracts} submit={submitUi} approvalHref={approvalHref} can={props.can} defaultCurrency={props.defaultCurrency}>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- Esc is a shortcut of the whole thread; every action it triggers also has a button */}
      <div data-slot="chat-thread" className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown}>
        <Conversation label={t("panel.logLabel")} overlay={<ConversationScrollButton />} scrollElementRef={older.scrollElementRef}>
          {!older.hasOlder ? null : (
            <Button variant="ghost" size="sm" className="self-center" pending={older.loading} onClick={older.load}>
              {t("panel.loadEarlier")}
            </Button>
          )}
          {messages.length === 0 ? (
            <ConversationEmptyState title={t("panel.empty.title")} description={t("panel.empty.description")} icon={<SparklesIcon className="size-5" />}>
              <Suggestions label={t("panel.empty.suggestionsLabel")}>
                {props.suggestions.map((suggestion) => (
                  <Suggestion key={suggestion.id} title={suggestion.title} description={suggestion.description} prompt={suggestion.prompt} onSelect={send} disabled={phase === "offline"} />
                ))}
              </Suggestions>
            </ConversationEmptyState>
          ) : (
            messages.map((message) => {
              const last = message.id === lastId;
              const settled = !(busy && last);
              return (
                <ChatMessage
                  key={message.id}
                  message={message}
                  streaming={busy && last && message.role === "assistant"}
                  interrupted={message.id === session.interruptedMessageId}
                  showReasoning={props.showReasoning}
                  assistantName={props.assistantName}
                  renderTool={renderTool}
                  actions={
                    message.role === "assistant" && settled ? (
                      <AnswerActions message={message} canRegenerate={last && phase !== "awaiting-approval"} onRegenerate={session.regenerate} speech={speechFor(message.id)} />
                    ) : undefined
                  }
                />
              );
            })
          )}
          {waitingFirstChunk ? (
            <Message from="assistant" author={props.assistantName ?? t("message.assistant")} aria-hidden="true" data-slot="pending-answer">
              <MessageContent>
                <Shimmer>{t("status.responding")}</Shimmer>
              </MessageContent>
            </Message>
          ) : null}
        </Conversation>
        <div className="flex flex-col gap-2 border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <StatusLine phase={phase} failure={session.failure} onRetry={retry} />
          <ChatComposer session={session} organizationId={props.scope.organizationId} offline={phase === "offline"} inputRef={inputRef} onStop={stop} can={props.can} voice={voice} tools={props.tools} uploadSeams={props.uploadSeams} voiceSeams={props.voiceSeams} />
        </div>
      </div>
    </GenerativeUiProvider>
  );
}
