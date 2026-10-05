"use client";

import { type MessageFeedbackInput, recordMessageFeedbackEndpoint } from "@core/contracts";
import { ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { useTranslations } from "use-intl";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useDescribeError } from "#/shared/lib/errors/describe-error.ts";
import { MessageAction } from "#/shared/ui/ai/message.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Checkbox } from "#/shared/ui/atoms/Checkbox/Checkbox.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Textarea } from "#/shared/ui/atoms/Textarea/Textarea.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { ApiErrorAlert } from "#/shared/ui/molecules/ErrorState/ApiErrorAlert.tsx";
import { Field, FieldControl, FieldDescription, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";

type Rating = MessageFeedbackInput["rating"];

export type RateAnswerActionsProps = {
  conversationId: string;
  messageId: string;
  /** core.eval.write: the rating may also go to the organization's `feedback` dataset. */
  canAddToDataset: boolean;
};

const COMMENT_MAX = 1000;

/** What went wrong with an answer: an optional comment and, for eval writers, the dataset choice. */
function ThumbsDownDialog({
  open,
  onOpenChange,
  canAddToDataset,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canAddToDataset: boolean;
  onSubmit: (extra: { comment?: string; addToDataset?: boolean }) => Promise<void>;
}) {
  const t = useTranslations("chat.feedback");
  const datasetId = useId();
  const [comment, setComment] = useState("");
  const [addToDataset, setAddToDataset] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const trimmed = comment.trim();
      await onSubmit({
        ...(trimmed === "" ? {} : { comment: trimmed }),
        ...(canAddToDataset && addToDataset ? { addToDataset: true } : {}),
      });
      onOpenChange(false);
    } catch (failure: unknown) {
      setError(failure);
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("downTitle")}</DialogTitle>
          <DialogDescription>{t("downDescription")}</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
          {error === null ? null : <ApiErrorAlert error={error} />}
          <Field>
            <FieldLabel>{t("comment")}</FieldLabel>
            <FieldControl>
              <Textarea
                value={comment}
                maxLength={COMMENT_MAX}
                rows={4}
                onChange={(event) => setComment(event.target.value)}
              />
            </FieldControl>
            <FieldDescription>{t("commentHint")}</FieldDescription>
          </Field>
          {canAddToDataset ? (
            <div className="flex items-start gap-2">
              <Checkbox
                id={datasetId}
                checked={addToDataset}
                onCheckedChange={(checked) => setAddToDataset(checked === true)}
              />
              <Label htmlFor={datasetId} className="font-normal">
                {t("addToDataset")}
              </Label>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" pending={pending}>
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Thumbs up or down on an answer (`POST /v1/conversations/{id}/feedback`): one rating per answer
 * and member, a second one replaces it. Up is sent at once; down asks what went wrong first
 * (optional). The chosen thumb stays pressed for this view of the conversation.
 */
export function RateAnswerActions({ conversationId, messageId, canAddToDataset }: RateAnswerActionsProps) {
  const t = useTranslations("chat.feedback");
  const callEndpoint = useCallEndpoint();
  const describe = useDescribeError();
  const [rating, setRating] = useState<Rating | null>(null);
  const [asking, setAsking] = useState(false);
  const send = async (next: Rating, extra: { comment?: string; addToDataset?: boolean } = {}): Promise<void> => {
    await callEndpoint(recordMessageFeedbackEndpoint, {
      params: { conversationId },
      body: { messageId, rating: next, ...extra },
    });
    setRating(next);
    notify.success(t("thanks"));
  };
  const rateUp = async (): Promise<void> => {
    try {
      await send("up");
    } catch (error: unknown) {
      notify.error(describe(error).message);
    }
  };
  return (
    <>
      <MessageAction label={t("up")} aria-pressed={rating === "up"} onClick={() => void rateUp()}>
        <ThumbsUpIcon aria-hidden="true" />
      </MessageAction>
      <MessageAction label={t("down")} aria-pressed={rating === "down"} onClick={() => setAsking(true)}>
        <ThumbsDownIcon aria-hidden="true" />
      </MessageAction>
      <ThumbsDownDialog
        key={String(asking)}
        open={asking}
        onOpenChange={setAsking}
        canAddToDataset={canAddToDataset}
        onSubmit={(extra) => send("down", extra)}
      />
    </>
  );
}
