"use client";

import { MAX_CHAT_ATTACHMENTS } from "@core/contracts";
import { RotateCwIcon } from "lucide-react";
import { useFormatter, useTranslations } from "use-intl";
import { Attachment, AttachmentRemove, Attachments } from "#/shared/ui/ai/attachments.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import type { UploadItem } from "../model/upload-queue.ts";

export type AttachmentChipsProps = {
  items: readonly UploadItem[];
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
};

type Translate = ReturnType<typeof useTranslations<"chat.upload">>;

/** Why an item will not go, in words; `undefined` while it is fine. */
const problemOf = (item: UploadItem, t: Translate): string | undefined => {
  if (item.status !== "rejected" && item.status !== "failed") return undefined;
  if (item.problem === "timeout") return t("status.timeout");
  if (item.problem === undefined || item.problem === "failed") return t("status.failed");
  return t(`status.rejected.${item.problem}`, { max: MAX_CHAT_ATTACHMENTS });
};

const detailOf = (item: UploadItem, t: Translate, percent: (value: number) => string): string => {
  const problem = problemOf(item, t);
  if (problem !== undefined) return problem;
  if (item.status === "uploading") return t("status.uploading", { percent: percent(item.progress) });
  if (item.status === "ready") return item.purpose === "knowledge" ? t("status.indexing") : t("status.ready");
  return t(`status.${item.status as "pending" | "validating"}`);
};

/** What a screen reader hears when an upload settles (one line per item; additions are announced). */
const announcementOf = (item: UploadItem, t: Translate): string | undefined => {
  if (item.status === "ready") return t(item.purpose === "knowledge" ? "announce.indexing" : "announce.ready", { name: item.name });
  const reason = problemOf(item, t);
  return reason === undefined ? undefined : t("announce.problem", { name: item.name, reason });
};

/**
 * The files of the message being written (chat.html §23.2): one chip per upload with its state in
 * words — never colour alone — a local preview for images, cancel or remove, and retry after a
 * failure. Nothing renders while the queue is empty, except the live region that announces
 * outcomes.
 */
export function AttachmentChips({ items, onRemove, onRetry }: AttachmentChipsProps) {
  const t = useTranslations("chat.upload");
  const format = useFormatter();
  const percent = (value: number): string => format.number(value, { style: "percent", maximumFractionDigits: 0 });
  return (
    <>
      {items.length === 0 ? null : (
        <Attachments label={t("listLabel")} data-slot="attachment-chips">
          {items.map((item) => {
            const inFlight = item.status === "pending" || item.status === "uploading" || item.status === "validating";
            const broken = item.status === "rejected" || item.status === "failed";
            return (
              <Attachment
                key={item.id}
                name={item.name}
                mediaType={item.mediaType}
                tone={broken ? "error" : "default"}
                data-status={item.status}
                aria-busy={inFlight || undefined}
                detail={detailOf(item, t, percent)}
                preview={item.previewUrl === undefined ? undefined : <img src={item.previewUrl} alt="" className="size-full object-cover" />}
                action={
                  <>
                    {item.status === "failed" ? (
                      <Button variant="ghost" size="icon-xs" aria-label={t("retry", { name: item.name })} onClick={() => onRetry(item.id)}>
                        <RotateCwIcon aria-hidden="true" />
                      </Button>
                    ) : null}
                    <AttachmentRemove label={t(inFlight ? "cancel" : "remove", { name: item.name })} onClick={() => onRemove(item.id)} />
                  </>
                }
              />
            );
          })}
        </Attachments>
      )}
      <div role="status" aria-relevant="additions" className="sr-only" data-slot="upload-announcements">
        {items.map((item) => {
          const text = announcementOf(item, t);
          return text === undefined ? null : <p key={`${item.id}-${item.status}`}>{text}</p>;
        })}
      </div>
    </>
  );
}
