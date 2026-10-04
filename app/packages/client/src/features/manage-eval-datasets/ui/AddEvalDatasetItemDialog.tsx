"use client";

import { addEvalDatasetItemEndpoint } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslations } from "use-intl";
import { tenantEvalKeys } from "#/entities/eval-experiment/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
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
import {
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "#/shared/ui/molecules/Field/Field.tsx";
import { OfflineNotice } from "#/shared/ui/molecules/OfflineNotice/OfflineNotice.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import {
  ITEM_TEXT_MAX,
  type ItemDraft,
  type ItemDraftProblems,
  itemBody,
  validateItemDraft,
} from "../model/dataset-drafts.ts";

export type AddEvalDatasetItemDialogProps = {
  organizationId: string;
  dataset: { id: string; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function AddItemForm({
  organizationId,
  datasetId,
  onClose,
}: {
  organizationId: string;
  datasetId: string;
  onClose: () => void;
}) {
  const t = useTranslations("settings.evals.items.add");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const [draft, setDraft] = useState<ItemDraft>({ input: "", expectedOutput: "" });
  const [problems, setProblems] = useState<ItemDraftProblems>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    const found = validateItemDraft(draft);
    setProblems(found);
    setFailure(null);
    if (found.input !== undefined) return;
    setPending(true);
    try {
      await callEndpoint(addEvalDatasetItemEndpoint, {
        params: { datasetId },
        query: { organizationId },
        body: itemBody(draft),
      });
      // The dataset's version changes with its items: refresh the whole evals scope.
      await queryClient.invalidateQueries({ queryKey: tenantEvalKeys.all(organizationId) });
      notify.success(t("done"));
      onClose();
    } catch (error: unknown) {
      setFailure(error);
    } finally {
      setPending(false);
    }
  };

  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
      {online ? null : <OfflineNotice />}
      <FieldGroup>
        <Field invalid={problems.input !== undefined}>
          <FieldLabel>{t("input")}</FieldLabel>
          <FieldControl>
            <Textarea
              value={draft.input}
              onChange={(event) => setDraft({ ...draft, input: event.target.value })}
              required
              maxLength={ITEM_TEXT_MAX}
              rows={4}
            />
          </FieldControl>
          <FieldDescription>{t("inputHint")}</FieldDescription>
          <FieldError errors={[problems.input === undefined ? undefined : t(problems.input)]} />
        </Field>
        <Field>
          <FieldLabel>{t("expectedOutput")}</FieldLabel>
          <FieldControl>
            <Textarea
              value={draft.expectedOutput}
              onChange={(event) => setDraft({ ...draft, expectedOutput: event.target.value })}
              maxLength={ITEM_TEXT_MAX}
              rows={4}
            />
          </FieldControl>
          <FieldDescription>{t("expectedOutputHint")}</FieldDescription>
        </Field>
      </FieldGroup>
      {failure === null ? null : <ApiErrorAlert error={failure} />}
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button type="submit" pending={pending} disabled={!online}>
          {t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * "Add item" (`POST /v1/evals/datasets/{id}/items`, core.eval.write, decision 0062): the message
 * the agent receives and, optionally, the expected answer the scorers compare with.
 */
export function AddEvalDatasetItemDialog({
  organizationId,
  dataset,
  open,
  onOpenChange,
}: AddEvalDatasetItemDialogProps) {
  const t = useTranslations("settings.evals.items.add");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { name: dataset.name })}</DialogDescription>
        </DialogHeader>
        {open ? (
          <AddItemForm organizationId={organizationId} datasetId={dataset.id} onClose={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
