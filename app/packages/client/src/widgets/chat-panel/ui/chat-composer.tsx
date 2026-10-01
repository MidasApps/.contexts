"use client";

import { useState, type ReactNode, type RefObject } from "react";
import { useTranslations } from "use-intl";
import { ChatInput } from "#/features/chat-send/index.ts";
import { AttachMenu, AttachmentChips, hasUploadProblems, hasUploadsInFlight, useUploadQueue, type UseUploadQueueArgs } from "#/features/chat-upload/index.ts";
import type { ChatSession } from "../model/use-chat-session.ts";

export type ChatComposerProps = {
  session: ChatSession;
  organizationId: string;
  offline: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onStop: () => void;
  /** Permission check of the access context; without it nothing optional is offered. */
  can?: ((permission: string) => boolean) | undefined;
  /** Extra composer tools of the host. */
  tools?: ReactNode;
  /** Tests pass scripted uploads. */
  uploadSeams?: UseUploadQueueArgs["seams"];
};

/**
 * The composer of a chat thread: the draft and the upload queue of the message being written
 * around the prompt input (FSD: the widget composes the send and upload features). A message
 * waits for its uploads, and a rejected file never goes with it.
 */
export function ChatComposer({ session, organizationId, offline, inputRef, onStop, can, tools, uploadSeams }: ChatComposerProps) {
  const t = useTranslations("chat.input");
  const [draft, setDraft] = useState("");
  const { queue, items } = useUploadQueue({ organizationId, seams: uploadSeams });
  const canUpload = can?.("core.file.upload") === true;
  const blocked = hasUploadsInFlight(items) ? t("uploading") : hasUploadProblems(items) ? t("attachmentProblem") : undefined;

  const send = (text: string) => {
    session.send(text, queue.take());
    setDraft("");
    inputRef.current?.focus();
  };

  return (
    <ChatInput
      status={session.status}
      onSend={send}
      onStop={onStop}
      offline={offline}
      inputRef={inputRef}
      value={draft}
      onValueChange={setDraft}
      blocked={blocked}
      attachments={<AttachmentChips items={items} onRemove={queue.remove} onRetry={queue.retry} />}
      tools={
        <>
          {canUpload ? <AttachMenu onPick={queue.add} canAddKnowledge={can?.("core.knowledge.write") === true} disabled={offline} /> : null}
          {tools}
        </>
      }
    />
  );
}
