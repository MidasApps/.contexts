"use client";

import type { ReactNode, RefObject } from "react";
import { useTranslations } from "use-intl";
import { ChatInput } from "#/features/chat-send/index.ts";
import {
  AttachMenu,
  AttachmentChips,
  hasUploadProblems,
  hasUploadsInFlight,
  type UseUploadQueueArgs,
  uploadSourcesOf,
  useUploadQueue,
} from "#/features/chat-upload/index.ts";
import { ComposerVoice, type ComposerVoiceProps, type VoicePreferences } from "#/features/chat-voice/index.ts";
import type { ChatSession } from "../model/use-chat-session.ts";

export type ChatComposerProps = {
  session: ChatSession;
  /** The message being written (owned by the thread, so a suggestion can fill it). */
  draft: string;
  onDraftChange: (draft: string) => void;
  organizationId: string;
  offline: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onStop: () => void;
  /** Permission check of the access context; without it nothing optional is offered. */
  can?: ((permission: string) => boolean) | undefined;
  /** Voice of this thread; `undefined` keeps every voice control out (flag off, no permission). */
  voice?: VoicePreferences | undefined;
  /** Extra composer tools of the host. */
  tools?: ReactNode;
  /** Tests pass scripted uploads and a fake microphone. */
  uploadSeams?: UseUploadQueueArgs["seams"];
  voiceSeams?: ComposerVoiceProps["seams"];
};

type BlockedArgs = {
  awaitingApproval: boolean;
  items: Parameters<typeof hasUploadsInFlight>[0];
  t: ReturnType<typeof useTranslations<"chat.input">>;
};

/** Why the next message must wait, in words; `undefined` when nothing holds it. */
const blockedReason = ({ awaitingApproval, items, t }: BlockedArgs): string | undefined => {
  if (awaitingApproval) return t("awaitingApproval");
  if (hasUploadsInFlight(items)) return t("uploading");
  return hasUploadProblems(items) ? t("attachmentProblem") : undefined;
};

/**
 * The composer of a chat thread: the draft, the upload queue of the message being written and
 * push-to-talk around the prompt input (FSD: the widget composes the send, upload and voice
 * features). A message waits for its uploads and for a pending approval, and a rejected file
 * never goes with it. A transcript lands in the draft for review; with auto-send on it goes at
 * once when nothing blocks.
 */
export function ChatComposer({
  session,
  draft,
  onDraftChange: setDraft,
  organizationId,
  offline,
  inputRef,
  onStop,
  can,
  voice,
  tools,
  uploadSeams,
  voiceSeams,
}: ChatComposerProps) {
  const t = useTranslations("chat.input");
  const { queue, items } = useUploadQueue({ organizationId, seams: uploadSeams });
  const canUpload = can?.("core.file.upload") === true;
  const blocked = blockedReason({ awaitingApproval: session.awaitingApproval, items, t });

  const send = (text: string) => {
    session.send(text, queue.take());
    setDraft("");
    inputRef.current?.focus();
  };

  const onTranscript = (text: string) => {
    const next = draft.trim() === "" ? text : `${draft.trimEnd()} ${text}`;
    const ready = !session.busy && !offline && blocked === undefined;
    if (voice?.autoSend === true && ready) return send(next.trim());
    setDraft(next);
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
      onFiles={canUpload && !offline ? (files) => queue.add(uploadSourcesOf(files), "chat-attachment") : undefined}
      attachments={<AttachmentChips items={items} onRemove={queue.remove} onRetry={queue.retry} />}
      tools={
        <>
          {canUpload ? (
            <AttachMenu
              onPick={queue.add}
              canAddKnowledge={can?.("core.knowledge.write") === true}
              disabled={offline}
            />
          ) : null}
          {voice === undefined ? null : (
            <ComposerVoice
              organizationId={organizationId}
              voice={voice}
              disabled={offline}
              onTranscript={onTranscript}
              seams={voiceSeams}
            />
          )}
          {tools}
        </>
      }
    />
  );
}
