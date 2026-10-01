"use client";

import type { ChatTransport, UIMessage } from "ai";
import { CheckIcon, CopyIcon, RefreshCwIcon, SparklesIcon } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslations } from "use-intl";
import { ChatMessage, textOf, type RenderToolPart } from "#/entities/message/index.ts";
import { ChatInput } from "#/features/chat-send/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { ChatScope } from "#/shared/api/chat-transport.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Conversation, ConversationEmptyState, ConversationScrollButton } from "#/shared/ui/ai/conversation.tsx";
import { Message, MessageAction, MessageActions, MessageContent } from "#/shared/ui/ai/message.tsx";
import { Shimmer } from "#/shared/ui/ai/shimmer.tsx";
import { Suggestion, Suggestions } from "#/shared/ui/ai/suggestion.tsx";
import { useChatSession, type ChatSession } from "../model/use-chat-session.ts";
import { fetchMessagePage } from "../model/use-conversation-thread.ts";
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
  suggestions: readonly ChatSuggestion[];
  onConversationStarted?: ((conversationId: string) => void) | undefined;
  /** Reloads the conversation from the server (a lost stream may still be running there). */
  onRecover?: (() => void) | undefined;
  /** Builds the tool-part slot for a session (approvals, generative UI). */
  createToolRenderer?: ((session: ChatSession) => RenderToolPart) | undefined;
  /** Composer tools (attachments, voice). */
  tools?: ReactNode;
  transport?: ChatTransport<UIMessage> | undefined;
};

const COPIED_MS = 2000;

function AnswerActions({ message, canRegenerate, onRegenerate }: { message: UIMessage; canRegenerate: boolean; onRegenerate: () => void }) {
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
    <MessageActions>
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
  const callEndpoint = useCallEndpoint();
  const session = useChatSession({
    scope: props.scope,
    conversationId: props.conversationId,
    initialMessages: props.initialMessages,
    resume: props.resume,
    onConversationStarted: props.onConversationStarted,
    transport: props.transport,
  });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [olderCursor, setOlderCursor] = useState(props.olderCursor);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const { messages, phase, busy } = session;
  const renderTool = props.createToolRenderer?.(session);

  useEffect(() => {
    if (props.focusOnMount === true) inputRef.current?.focus();
  }, [props.focusOnMount]);

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

  const loadOlder = async () => {
    if (olderCursor === undefined || session.conversationId === undefined) return;
    setLoadingOlder(true);
    try {
      const page = await fetchMessagePage(callEndpoint, session.conversationId, olderCursor);
      session.setMessages((current) => [...page.messages, ...current]);
      setOlderCursor(page.olderCursor);
    } catch {
      // The button stays: the member can ask again; the conversation on screen is unaffected.
    } finally {
      setLoadingOlder(false);
    }
  };

  const lastId = messages.at(-1)?.id;
  const waitingFirstChunk = (phase === "connecting" || phase === "resuming") && messages.at(-1)?.role !== "assistant";
  const retry = phase === "lost" && props.onRecover !== undefined && session.conversationId !== undefined ? props.onRecover : session.retry;

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- Esc is a shortcut of the whole thread; every action it triggers also has a button
    <div data-slot="chat-thread" className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown}>
      <Conversation label={t("panel.logLabel")} overlay={<ConversationScrollButton />}>
        {olderCursor === undefined ? null : (
          <Button variant="ghost" size="sm" className="self-center" pending={loadingOlder} onClick={() => void loadOlder()}>
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
                renderTool={renderTool}
                actions={message.role === "assistant" && settled ? <AnswerActions message={message} canRegenerate={last && phase !== "awaiting-approval"} onRegenerate={session.regenerate} /> : undefined}
              />
            );
          })
        )}
        {waitingFirstChunk ? (
          <Message from="assistant" author={t("message.assistant")} aria-hidden="true" data-slot="pending-answer">
            <MessageContent>
              <Shimmer>{t("status.responding")}</Shimmer>
            </MessageContent>
          </Message>
        ) : null}
      </Conversation>
      <div className="flex flex-col gap-2 border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <StatusLine phase={phase} failure={session.failure} onRetry={retry} />
        <ChatInput status={session.status} onSend={send} onStop={stop} offline={phase === "offline"} inputRef={inputRef} tools={props.tools} />
      </div>
    </div>
  );
}
