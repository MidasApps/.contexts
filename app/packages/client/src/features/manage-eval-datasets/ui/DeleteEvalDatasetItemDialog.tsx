"use client";

import { deleteEvalDatasetItemEndpoint, type EvalDatasetItem } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { tenantEvalKeys } from "#/entities/eval-experiment/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";

export type DeleteEvalDatasetItemDialogProps = {
  organizationId: string;
  /** The item to delete; `null` closes the dialog. */
  item: EvalDatasetItem | null;
  onOpenChange: (open: boolean) => void;
};

/**
 * Deletes a dataset item (`DELETE /v1/evals/datasets/{id}/items/{itemId}`, core.eval.write,
 * decision 0062). The dataset gets a new version; experiments already run keep their results.
 */
export function DeleteEvalDatasetItemDialog({ organizationId, item, onOpenChange }: DeleteEvalDatasetItemDialogProps) {
  const t = useTranslations("settings.evals.items.delete");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const action = useConfirmedAction(
    async () => {
      if (item === null) return;
      await callEndpoint(deleteEvalDatasetItemEndpoint, { params: { datasetId: item.datasetId, itemId: item.id }, query: { organizationId } });
      await queryClient.invalidateQueries({ queryKey: tenantEvalKeys.all(organizationId) });
    },
    () => notify.success(t("done")),
  );
  return (
    <ConfirmDialog
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) action.reset();
        onOpenChange(open);
      }}
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      destructive
      onConfirm={action.confirm}
      error={action.error}
    />
  );
}
