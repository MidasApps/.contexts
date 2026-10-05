"use client";

import { deleteEvalDatasetEndpoint, type EvalDataset } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { tenantEvalKeys } from "#/entities/eval-experiment/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";

export type DeleteEvalDatasetDialogProps = {
  organizationId: string;
  /** The dataset to delete; `null` closes the dialog. */
  dataset: EvalDataset | null;
  onOpenChange: (open: boolean) => void;
};

/**
 * Deletes a dataset with its items (`DELETE /v1/evals/datasets/{id}`, core.eval.write, decision
 * 0075). A dataset experiments ran on is refused (`DATASET_IN_USE`) and the dialog says why.
 */
export function DeleteEvalDatasetDialog({ organizationId, dataset, onOpenChange }: DeleteEvalDatasetDialogProps) {
  const t = useTranslations("settings.evals.datasets.delete");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const name = dataset?.name ?? "";
  const action = useConfirmedAction(
    async () => {
      if (dataset === null) return;
      await callEndpoint(deleteEvalDatasetEndpoint, { params: { datasetId: dataset.id }, query: { organizationId } });
      await queryClient.invalidateQueries({ queryKey: tenantEvalKeys.all(organizationId) });
    },
    () => notify.success(t("done", { name })),
  );
  return (
    <ConfirmDialog
      open={dataset !== null}
      onOpenChange={(open) => {
        if (!open) action.reset();
        onOpenChange(open);
      }}
      title={t("title", { name })}
      description={t("description")}
      confirmLabel={t("confirm")}
      destructive
      onConfirm={action.confirm}
      error={action.error}
    />
  );
}
