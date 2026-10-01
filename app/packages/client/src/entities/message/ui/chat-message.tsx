"use client";

import type { UIMessage } from "ai";
import type { ReactNode } from "react";
import { useTranslations } from "use-intl";
import { Message, MessageContent } from "#/shared/ui/ai/message.tsx";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { isLowConfidence } from "../lib/part-guards.ts";
import { MessageParts, type RenderToolPart } from "./message-parts.tsx";

export type ChatMessageProps = {
  message: UIMessage;
  /** This message is being written right now. */
  streaming?: boolean | undefined;
  /** The member stopped this answer, or the stream was lost: the partial answer stays. */
  interrupted?: boolean | undefined;
  showReasoning?: boolean | undefined;
  renderTool?: RenderToolPart | undefined;
  /** Actions under an assistant message (copy, regenerate). */
  actions?: ReactNode;
  /** Who answers (an organization's agent, decision 0046); the assistant by default. */
  assistantName?: string | undefined;
};

/**
 * One turn of the chat: its parts plus what qualifies the answer — "sem certeza" when the
 * citation guard found no source (SP3), "interrompido" when it was cut short. Both are words
 * with an icon or dot, never colour alone.
 */
export function ChatMessage({ message, streaming = false, interrupted = false, showReasoning, renderTool, actions, assistantName }: ChatMessageProps) {
  const t = useTranslations("chat.message");
  const from = message.role === "user" ? "user" : "assistant";
  // Shown as soon as the stream says so (the knowledge delegation ends before the answer text).
  const lowConfidence = from === "assistant" && isLowConfidence(message);
  return (
    <Message from={from} author={from === "user" ? t("you") : (assistantName ?? t("assistant"))} data-message-id={message.id}>
      <MessageContent>
        <MessageParts message={message} streaming={streaming} showReasoning={showReasoning} renderTool={renderTool} />
      </MessageContent>
      {lowConfidence || interrupted ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
          {lowConfidence ? (
            <>
              <StatusPill tone="amber" icon="alert-triangle" data-slot="low-confidence">
                {t("lowConfidence")}
              </StatusPill>
              <span>{t("lowConfidenceHint")}</span>
            </>
          ) : null}
          {interrupted ? (
            <>
              <StatusPill tone="neutral" data-slot="interrupted">
                {t("stopped")}
              </StatusPill>
              <span>{t("stoppedHint")}</span>
            </>
          ) : null}
        </div>
      ) : null}
      {actions}
    </Message>
  );
}
