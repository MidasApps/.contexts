"use client";

import type { ContractDefinition } from "@core/contracts";
import type { ChatTransport, UIMessage } from "ai";
import { SparklesIcon } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { useTranslations } from "use-intl";
import { approvalRequestRoute } from "#/entities/approval-request/index.ts";
import { formatUiSubmission, type UiSubmission } from "#/entities/message/index.ts";
import type { UseUploadQueueArgs } from "#/features/chat-upload/index.ts";
import type { ComposerVoiceProps, ReadAloudActionProps } from "#/features/chat-voice/index.ts";
import { GenerativeUiProvider, type UiRegistry } from "#/features/generative-ui/index.ts";
import type { ChatScope } from "#/shared/api/chat-transport.ts";
import { routeHref } from "#/shared/lib/router/route-paths.ts";
import { Conversation, ConversationEmptyState, ConversationScrollButton } from "#/shared/ui/ai/conversation.tsx";
import { Message, MessageContent } from "#/shared/ui/ai/message.tsx";
import { Shimmer } from "#/shared/ui/ai/shimmer.tsx";
import { Suggestion, Suggestions } from "#/shared/ui/ai/suggestion.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { useChatSession } from "../model/use-chat-session.ts";
import { useChatVoice } from "../model/use-chat-voice.ts";
import { useComposerFocus } from "../model/use-composer-focus.ts";
import { useOlderMessages } from "../model/use-older-messages.ts";
import { ChatComposer } from "./chat-composer.tsx";
import { StatusLine } from "./status-line.tsx";
import { ThreadMessages } from "./thread-messages.tsx";

/** A quick-start card of the empty conversation (chat.html §23.1). */
export type ChatSuggestion = {
  readonly id: string;
  readonly title: string;
  readonly description?: string | undefined;
  readonly prompt: string;
};

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

/** The empty conversation: quick-start cards that fill the draft. */
function EmptyConversation({
  suggestions,
  onSelect,
}: {
  suggestions: readonly ChatSuggestion[];
  onSelect: (prompt: string) => void;
}) {
  const t = useTranslations("chat");
  return (
    <ConversationEmptyState
      title={t("panel.empty.title")}
      description={t("panel.empty.description")}
      icon={<SparklesIcon className="size-5" />}
    >
      <Suggestions label={t("panel.empty.suggestionsLabel")}>
        {suggestions.map((suggestion) => (
          <Suggestion
            key={suggestion.id}
            title={suggestion.title}
            description={suggestion.description}
            prompt={suggestion.prompt}
            onSelect={onSelect}
          />
        ))}
      </Suggestions>
    </ConversationEmptyState>
  );
}

/** The answer placeholder until its first chunk arrives (hidden from screen readers; the status line speaks). */
function PendingAnswer({ assistantName }: { assistantName: string | undefined }) {
  const t = useTranslations("chat");
  return (
    <Message
      from="assistant"
      author={assistantName ?? t("message.assistant")}
      aria-hidden="true"
      data-slot="pending-answer"
    >
      <MessageContent>
        <Shimmer>{t("status.responding")}</Shimmer>
      </MessageContent>
    </Message>
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
  const { messages, phase, busy } = session;
  const voice = useChatVoice({ organizationId: props.scope.organizationId, can: props.can });
  const older = useOlderMessages({
    conversationId: session.conversationId,
    initialCursor: props.olderCursor,
    messages,
    prepend: (page) => session.setMessages((current) => [...page, ...current]),
  });

  // What the member answers in a form or a picker goes as the next user turn: the tools that
  // render them already returned (`catalog.renderForm` runs on the server) and `/v1/chat` takes
  // only text in a user message (decision 0032, amendment of SP4 Task 10).
  const submitUi = (submission: UiSubmission) => session.send(formatUiSubmission(submission));

  const { inputRef, draft, setDraft, stop, suggest, onKeyDown } = useComposerFocus(session, props.focusOnMount);

  // The run ended on the server before the stream closed (`/v1/chat` clears it first), so what
  // the host shows about this conversation (answering, its generated title) is stale now.
  const { onTurnSettled } = props;
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !busy) onTurnSettled?.();
    wasBusy.current = busy;
  }, [busy, onTurnSettled]);

  // Without a router-built href from the app, the link is the inbox route itself (no locale prefix).
  const approvalHref =
    props.approvalHref ??
    ((approvalId: string) => routeHref(approvalRequestRoute(props.scope.organizationId, approvalId)));

  const waitingFirstChunk = (phase === "connecting" || phase === "resuming") && messages.at(-1)?.role !== "assistant";
  const retry =
    phase === "lost" && props.onRecover !== undefined && session.conversationId !== undefined
      ? props.onRecover
      : session.retry;

  return (
    <GenerativeUiProvider
      registry={props.uiRegistry}
      contracts={props.contracts}
      submit={submitUi}
      approvalHref={approvalHref}
      can={props.can}
      defaultCurrency={props.defaultCurrency}
    >
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- Esc is a shortcut of the whole thread; every action it triggers also has a button */}
      <div data-slot="chat-thread" className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown}>
        <Conversation
          label={t("panel.logLabel")}
          overlay={<ConversationScrollButton />}
          scrollElementRef={older.scrollElementRef}
        >
          {!older.hasOlder ? null : (
            <div className="flex flex-col items-center gap-1">
              <Button variant="ghost" size="sm" pending={older.loading} onClick={older.load}>
                {t("panel.loadEarlier")}
              </Button>
              <p role="status" className={older.failed ? "text-body-sm text-destructive-text" : "sr-only"}>
                {older.failed ? t("panel.loadEarlierFailed") : ""}
              </p>
            </div>
          )}
          {messages.length === 0 ? (
            <EmptyConversation suggestions={props.suggestions} onSelect={suggest} />
          ) : (
            <ThreadMessages
              session={session}
              organizationId={props.scope.organizationId}
              showReasoning={props.showReasoning}
              assistantName={props.assistantName}
              voice={voice}
              speechSeams={props.speechSeams}
            />
          )}
          {waitingFirstChunk ? <PendingAnswer assistantName={props.assistantName} /> : null}
        </Conversation>
        <div className="flex flex-col gap-2 border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <StatusLine phase={phase} failure={session.failure} onRetry={retry} />
          <ChatComposer
            session={session}
            draft={draft}
            onDraftChange={setDraft}
            organizationId={props.scope.organizationId}
            offline={phase === "offline"}
            inputRef={inputRef}
            onStop={stop}
            can={props.can}
            voice={voice}
            tools={props.tools}
            uploadSeams={props.uploadSeams}
            voiceSeams={props.voiceSeams}
          />
        </div>
      </div>
    </GenerativeUiProvider>
  );
}
