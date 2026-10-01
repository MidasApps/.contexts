"use client";

import { cancelWorkflowRunEndpoint, type WorkflowRun } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { tenantWorkflowRunKeys } from "#/entities/workflow-run/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";

export type CancelWorkflowRunDialogProps = {
  organizationId: string;
  /** The run to cancel; `null` keeps the dialog closed. */
  run: Pick<WorkflowRun, "runId" | "workflowId" | "approvalRequestId"> | null;
  onOpenChange: (open: boolean) => void;
};

/**
 * Cancels a run of the organization (`POST /v1/workflows/runs/{runId}/cancel`,
 * core.workflow-run.cancel). It cannot be undone, and a run that waited for an approval leaves
 * that request without effect; the dialog says so. A failure stays in the dialog with the request
 * reference.
 */
export function CancelWorkflowRunDialog({ organizationId, run, onOpenChange }: CancelWorkflowRunDialogProps) {
  const t = useTranslations("settings.workflows.cancelDialog");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const action = useConfirmedAction(
    async () => {
      if (run === null) return;
      await callEndpoint(cancelWorkflowRunEndpoint, { params: { runId: run.runId }, query: { organizationId } });
      await queryClient.invalidateQueries({ queryKey: tenantWorkflowRunKeys.all(organizationId) });
    },
    () => notify.success(t("done", { workflow: run?.workflowId ?? "" })),
  );
  return (
    <ConfirmDialog
      open={run !== null}
      onOpenChange={(open) => {
        if (!open) action.reset();
        onOpenChange(open);
      }}
      title={t("title", { workflow: run?.workflowId ?? "" })}
      description={run === null || run.approvalRequestId === null ? t("description") : t("descriptionSuspended")}
      confirmLabel={t("confirm")}
      cancelLabel={t("keep")}
      destructive
      onConfirm={action.confirm}
      error={action.error}
    />
  );
}
