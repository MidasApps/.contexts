"use client";

import { MAX_CHAT_TEXT_CHARS } from "@core/contracts";
import { type ClipboardEvent, type DragEvent, type ReactNode, type Ref, useId, useState } from "react";
import { useTranslations } from "use-intl";
import {
  PromptInput,
  PromptInputFooter,
  type PromptInputStatus,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "#/shared/ui/ai/prompt-input.tsx";

export type ChatInputProps = {
  status: PromptInputStatus;
  /** Receives the trimmed text; the field clears only when this is called. */
  onSend: (text: string) => void;
  /** Stops the answer in progress (stop button, or Esc in the field). */
  onStop: () => void;
  /** No connection: typing stays possible, sending does not (SP4 spec §5.3). */
  offline?: boolean | undefined;
  /** Blocks typing and sending (history loading, a failed chat waiting for retry). */
  disabled?: boolean | undefined;
  /** Tools on the left of the footer: the attach menu, push-to-talk. */
  tools?: ReactNode;
  /** Files pasted or dropped on the composer; without it they are ignored (no upload permission, offline). */
  onFiles?: ((files: readonly File[]) => void) | undefined;
  /** The files of the message being written, above the field (the upload feature's chips). */
  attachments?: ReactNode;
  /** Why sending must wait (uploads in flight, an attachment with an error); said under the field. */
  blocked?: string | undefined;
  /** The draft, when the owner needs to write into it (a transcription); kept here otherwise. */
  value?: string | undefined;
  onValueChange?: ((text: string) => void) | undefined;
  /** The field, so the panel can focus it (new conversation, suggestion chosen). */
  inputRef?: Ref<HTMLTextAreaElement> | undefined;
  maxLength?: number | undefined;
};

/** Characters left before the counter shows up: quiet until the limit is in sight. */
const COUNTER_FROM = 0.9;

/**
 * The chat composer (chat.html §23.2): Enter sends, Shift+Enter breaks the line, Esc stops the
 * answer. While the answer streams the field stays editable — the next message can be drafted —
 * and the send button becomes stop. Over the limit the text is kept and the reason is said;
 * nothing is truncated silently.
 */
export function ChatInput({
  status,
  onSend,
  onStop,
  offline = false,
  disabled = false,
  tools,
  onFiles,
  attachments,
  blocked,
  value,
  onValueChange,
  inputRef,
  maxLength = MAX_CHAT_TEXT_CHARS,
}: ChatInputProps) {
  const t = useTranslations("chat.input");
  const [ownText, setOwnText] = useState("");
  const text = value ?? ownText;
  const setText = (next: string) => {
    setOwnText(next);
    onValueChange?.(next);
  };
  const hintId = useId();
  const problemId = useId();
  const busy = status === "submitted" || status === "streaming";
  const trimmed = text.trim();
  const over = trimmed.length - maxLength;
  const tooLong = over > 0;
  const canSend = !busy && !offline && !disabled && trimmed !== "" && !tooLong && blocked === undefined;
  const problem = tooLong ? t("tooLong", { max: maxLength, over }) : offline ? t("offline") : (blocked ?? null);

  const [dragging, setDragging] = useState(false);
  const carriesFiles = (types: readonly string[]): boolean => onFiles !== undefined && types.includes("Files");
  // Pasted or dropped files join the message like picked ones; plain pasted text stays text.
  const onPaste = (event: ClipboardEvent<HTMLFormElement>) => {
    const files = [...event.clipboardData.files];
    if (onFiles === undefined || files.length === 0) return;
    event.preventDefault();
    onFiles(files);
  };
  const onDragOver = (event: DragEvent<HTMLFormElement>) => {
    if (!carriesFiles([...event.dataTransfer.types])) return;
    event.preventDefault();
    setDragging(true);
  };
  const onDrop = (event: DragEvent<HTMLFormElement>) => {
    setDragging(false);
    if (!carriesFiles([...event.dataTransfer.types])) return;
    event.preventDefault();
    onFiles?.([...event.dataTransfer.files]);
  };

  const submit = () => {
    if (!canSend) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <div data-slot="chat-input" className="flex flex-col gap-1.5">
      <PromptInput
        onSubmit={submit}
        aria-label={t("label")}
        onPaste={onPaste}
        onDragOver={onDragOver}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        data-dragging={dragging || undefined}
        className="data-dragging:border-ring data-dragging:bg-accent"
      >
        {attachments}
        <PromptInputTextarea
          ref={inputRef}
          label={t("label")}
          placeholder={t("placeholder")}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onEscape={busy ? onStop : undefined}
          disabled={disabled}
          aria-invalid={tooLong || undefined}
          aria-describedby={problem === null ? hintId : `${problemId} ${hintId}`}
        />
        <PromptInputFooter>
          <PromptInputTools>{tools}</PromptInputTools>
          <div className="flex items-center gap-2">
            {trimmed.length >= maxLength * COUNTER_FROM ? (
              <span
                className={
                  tooLong
                    ? "font-mono text-caption text-destructive-text tabular-nums"
                    : "font-mono text-caption text-muted-foreground tabular-nums"
                }
              >
                {t("counter", { count: trimmed.length, max: maxLength })}
              </span>
            ) : null}
            <PromptInputSubmit status={status} onStop={onStop} disabled={!canSend} />
          </div>
        </PromptInputFooter>
      </PromptInput>
      <p
        id={problemId}
        role="status"
        className={
          problem === null
            ? "sr-only"
            : tooLong
              ? "text-body-sm text-destructive-text"
              : "text-body-sm text-amber-foreground"
        }
      >
        {problem ?? ""}
      </p>
      {/* Keyboard keys mean nothing on a touch screen; the hint stays in the field description. */}
      <p id={hintId} className="text-caption text-muted-foreground pointer-coarse:hidden">
        {t("hint")}
      </p>
    </div>
  );
}
