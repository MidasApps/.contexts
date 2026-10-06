"use client";

import { createEvalDatasetEndpoint, type EvalDataset } from "@core/contracts";
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

export type CreateEvalDatasetDialogProps = {
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The new dataset, so the page can open its items. */
  onCreated: (dataset: EvalDataset) => void;
};

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
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {open ? (
          <DatasetNameForm
            initialName=""
            submitLabel={t("submit")}
            save={async (name) => {
              const { data } = await callEndpoint(createEvalDatasetEndpoint, {
                query: { organizationId },
                body: { name },
              });
              await queryClient.invalidateQueries({ queryKey: tenantEvalKeys.all(organizationId) });
              notify.success(t("done", { name: data.name }));
              return data;
            }}
            onClose={() => onOpenChange(false)}
            onSaved={onCreated}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
