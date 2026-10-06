"use client";

import type { EvalDataset } from "@core/contracts";
import { type FormEvent, useState } from "react";
import { useTranslations } from "use-intl";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { DialogFooter } from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { ApiErrorAlert } from "#/shared/ui/molecules/ErrorState/ApiErrorAlert.tsx";
import { Field, FieldControl, FieldError, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { OfflineNotice } from "#/shared/ui/molecules/OfflineNotice/OfflineNotice.tsx";
import {
  DATASET_NAME_MAX,
  type DatasetNameProblem,
  datasetRefusal,
  validateDatasetName,
} from "../model/dataset-drafts.ts";

export type DatasetNameFormProps = {
  initialName: string;
  submitLabel: string;
  /** Sends the trimmed name; a 409 shows as "name taken" on the field. */
  save: (name: string) => Promise<EvalDataset>;
  onClose: () => void;
  onSaved: (dataset: EvalDataset) => void;
};

/** The name of a dataset, for creating or renaming one (labels: `settings.evals.datasets.create`). */
export function DatasetNameForm({ initialName, submitLabel, save, onClose, onSaved }: DatasetNameFormProps) {
  const t = useTranslations("settings.evals.datasets.create");
  const online = useOnlineStatus();
  const [name, setName] = useState(initialName);
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
      const saved = await save(name.trim());
      onClose();
      onSaved(saved);
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
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
