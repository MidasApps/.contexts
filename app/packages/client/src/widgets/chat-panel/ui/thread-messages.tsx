"use client";

import type { UIMessage } from "ai";
import { CheckIcon, CopyIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "use-intl";
import { ChatMessage, textOf } from "#/entities/message/index.ts";
import { ReadAloudAction, type ReadAloudActionProps } from "#/features/chat-voice/index.ts";
import { MessageAction, MessageActions } from "#/shared/ui/ai/message.tsx";
import type { ChatSession } from "../model/use-chat-session.ts";
import { createCoreToolRenderer } from "./chat-tool-part.tsx";
import { OpenAttachment } from "./open-attachment.tsx";

const COPIED_MS = 2000;

/** Read aloud for one answer; `undefined` while voice is off. */
type AnswerSpeech = {
  readonly organizationId: string;
  readonly autoPlay: boolean;
  readonly seams: ReadAloudActionProps["seams"];
};

function AnswerActions({
  message,
  canRegenerate,
  onRegenerate,
  speech,
}: {
  message: UIMessage;
  canRegenerate: boolean;
  onRegenerate: () => void;
  speech?: AnswerSpeech | undefined;
}) {
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
      {speech === undefined || text === "" ? null : (
        <ReadAloudAction
          organizationId={speech.organizationId}
          text={text}
          autoPlay={speech.autoPlay}
          seams={speech.seams}
        />
      )}
      <span role="status" className="sr-only">
        {copied ? t("copied") : ""}
      </span>
    </MessageActions>
  );
}

export type ThreadMessagesProps = {
  session: ChatSession;
  organizationId: string;
  showReasoning?: boolean | undefined;
  assistantName?: string | undefined;
  /** Voice preferences of the member; `undefined` while voice is off. */
  voice: { readonly autoRead: boolean } | undefined;
  speechSeams?: ReadAloudActionProps["seams"];
};

/**
 * The messages of the thread. A settled answer gets its actions (copy, regenerate on the last
 * one, read aloud); the one that just finished reads itself aloud when "read answers aloud" is on.
 */
export function ThreadMessages({
  session,
  organizationId,
  showReasoning,
  assistantName,
  voice,
  speechSeams,
}: ThreadMessagesProps) {
  const { messages, phase, busy } = session;
  const renderTool = createCoreToolRenderer(session);
  const lastId = messages.at(-1)?.id;
  const finishedAnswerId =
    phase === "finished" ? messages.findLast((message) => message.role === "assistant")?.id : undefined;
  const speechFor = (messageId: string): AnswerSpeech | undefined =>
    voice === undefined
      ? undefined
      : { organizationId, autoPlay: voice.autoRead && messageId === finishedAnswerId, seams: speechSeams };
  return messages.map((message) => {
    const last = message.id === lastId;
    const settled = !(busy && last);
    return (
      <ChatMessage
        key={message.id}
        message={message}
        streaming={busy && last && message.role === "assistant"}
        interrupted={message.id === session.interruptedMessageId}
        incomplete={message.id === session.incompleteMessageId}
        showReasoning={showReasoning}
        assistantName={assistantName}
        renderTool={renderTool}
        attachmentAction={(file) => <OpenAttachment file={file} />}
        actions={
          message.role === "assistant" && settled ? (
            <AnswerActions
              message={message}
              canRegenerate={last && phase !== "awaiting-approval"}
              onRegenerate={session.regenerate}
              speech={speechFor(message.id)}
            />
          ) : undefined
        }
      />
    );
  });
}
