"use client";

import type { FilePurpose } from "@core/contracts";
import { LibraryBigIcon, PaperclipIcon } from "lucide-react";
import { useRef, type ChangeEvent } from "react";
import { useTranslations } from "use-intl";
import { PromptInputActionMenu, PromptInputActionMenuItem } from "#/shared/ui/ai/prompt-input.tsx";
import type { UploadSource } from "../api/request-upload.ts";
import { uploadSourcesOf } from "../model/upload-sources.ts";

export type AttachMenuProps = {
  /** Files the member picked, and what they are for. */
  onPick: (sources: readonly UploadSource[], purpose: FilePurpose) => void;
  /** Shows "add to knowledge base" (`core.knowledge.write`); the API authorizes it again. */
  canAddKnowledge?: boolean | undefined;
  disabled?: boolean | undefined;
};

/**
 * The "+" menu of the composer (decision 0035): attach files to the message, or send documents
 * to the knowledge base instead. No `accept` filter narrows the picker on purpose — the server
 * decides what is allowed and the chip says why a file was refused.
 */
export function AttachMenu({ onPick, canAddKnowledge = false, disabled }: AttachMenuProps) {
  const t = useTranslations("chat.upload");
  const attachRef = useRef<HTMLInputElement>(null);
  const knowledgeRef = useRef<HTMLInputElement>(null);

  const picked = (purpose: FilePurpose) => (event: ChangeEvent<HTMLInputElement>) => {
    const sources = uploadSourcesOf(event.target.files);
    // Reset so picking the same file again fires `change`.
    event.target.value = "";
    if (sources.length > 0) onPick(sources, purpose);
  };

  return (
    <>
      <PromptInputActionMenu label={t("menu")} disabled={disabled}>
        <PromptInputActionMenuItem onSelect={() => attachRef.current?.click()}>
          <PaperclipIcon aria-hidden="true" />
          {t("attachFile")}
        </PromptInputActionMenuItem>
        {canAddKnowledge ? (
          <PromptInputActionMenuItem onSelect={() => knowledgeRef.current?.click()}>
            <LibraryBigIcon aria-hidden="true" />
            {t("addToKnowledge")}
          </PromptInputActionMenuItem>
        ) : null}
      </PromptInputActionMenu>
      <input ref={attachRef} type="file" multiple hidden aria-label={t("fileInput")} onChange={picked("chat-attachment")} />
      {canAddKnowledge ? <input ref={knowledgeRef} type="file" multiple hidden aria-label={t("knowledgeInput")} onChange={picked("knowledge")} /> : null}
    </>
  );
}
