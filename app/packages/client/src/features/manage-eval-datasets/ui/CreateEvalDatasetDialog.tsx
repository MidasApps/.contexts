"use client";

import { createEvalDatasetEndpoint, type EvalDataset } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslations } from "use-intl";
import { tenantEvalKeys } from "#/entities/eval-experiment/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { ApiErrorAlert } from "#/shared/ui/molecules/ErrorState/ApiErrorAlert.tsx";
import { Field, FieldControl, FieldError, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { OfflineNotice } from "#/shared/ui/molecules/OfflineNotice/OfflineNotice.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import {
  DATASET_NAME_MAX,
  type DatasetNameProblem,
  datasetRefusal,
  validateDatasetName,
} from "../model/dataset-drafts.ts";

export type CreateEvalDatasetDialogProps = {
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The new dataset, so the page can open its items. */
  onCreated: (dataset: EvalDataset) => void;
};

type FormProps = { organizationId: string; onClose: () => void; onCreated: (dataset: EvalDataset) => void };

function CreateDatasetForm({ organizationId, onClose, onCreated }: FormProps) {
  const t = useTranslations("settings.evals.datasets.create");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<DatasetNameProblem | undefined>();
  const [failure, setFailure] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    const found = validateDatasetName(name);
    setProblem(found);
    setFailure(null);
    if (found !== undefined) return;
    setPending(true);
    try {
      const { data } = await callEndpoint(createEvalDatasetEndpoint, {
        query: { organizationId },
        body: { name: name.trim() },
      });
      await queryClient.invalidateQueries({ queryKey: tenantEvalKeys.all(organizationId) });
      notify.success(t("done", { name: data.name }));
      onClose();
      onCreated(data);
    } catch (error: unknown) {
      const refused = datasetRefusal(error);
      if (refused === null) setFailure(error);
      else setProblem(refused);
    } finally {
      setPending(false);
    }
  };

  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
      {online ? null : <OfflineNotice />}
      <Field invalid={problem !== undefined}>
        <FieldLabel>{t("name")}</FieldLabel>
        <FieldControl>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={DATASET_NAME_MAX}
            autoComplete="off"
          />
        </FieldControl>
        <FieldError errors={[problem === undefined ? undefined : t(problem)]} />
      </Field>
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
 * "New dataset" (`POST /v1/evals/datasets`, core.eval.write, decision 0062): an empty dataset of the
 * organization that targets the assistant. A name the organization already uses shows on the field.
 */
export function CreateEvalDatasetDialog({
  organizationId,
  open,
  onOpenChange,
  onCreated,
}: CreateEvalDatasetDialogProps) {
  const t = useTranslations("settings.evals.datasets.create");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {open ? (
          <CreateDatasetForm
            organizationId={organizationId}
            onClose={() => onOpenChange(false)}
            onCreated={onCreated}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
