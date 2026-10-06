"use client";

import { type EvalDataset, renameEvalDatasetEndpoint } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { tenantEvalKeys } from "#/entities/eval-experiment/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { DatasetNameForm } from "./DatasetNameForm.tsx";

export type RenameEvalDatasetDialogProps = {
  organizationId: string;
  /** The dataset to rename; `null` closes the dialog. */
  dataset: EvalDataset | null;
  onOpenChange: (open: boolean) => void;
};

/**
 * Renames a dataset (`PATCH /v1/evals/datasets/{id}`, core.eval.write, decision 0075). Experiments
 * keep pointing at it; a name the organization already uses shows on the field.
 */
export function RenameEvalDatasetDialog({ organizationId, dataset, onOpenChange }: RenameEvalDatasetDialogProps) {
  const t = useTranslations("settings.evals.datasets.rename");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  return (
    <Dialog open={dataset !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { name: dataset?.name ?? "" })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {dataset === null ? null : (
          <DatasetNameForm
            initialName={dataset.name}
            submitLabel={t("submit")}
            save={async (name) => {
              const { data } = await callEndpoint(renameEvalDatasetEndpoint, {
                params: { datasetId: dataset.id },
                query: { organizationId },
                body: { name },
              });
              await queryClient.invalidateQueries({ queryKey: tenantEvalKeys.all(organizationId) });
              notify.success(t("done", { name: data.name }));
              return data;
            }}
            onClose={() => onOpenChange(false)}
            onSaved={() => undefined}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
