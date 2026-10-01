"use client";

import { adminCancelWorkflowRunEndpoint, type AdminWorkflowRun } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { workflowRunKeys } from "#/entities/workflow-run/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";

export type CancelRunDialogProps = { run: AdminWorkflowRun | null; onOpenChange: (open: boolean) => void };

/**
 * Cancels a workflow run of any organization (`POST /v1/admin/workflow-runs/{runId}/cancel`,
 * platform.workflow.manage; audited with `targetTenantId`). It cannot be undone. A suspended run
 * that waited for an approval leaves that request behind: nobody is told, it expires on its own —
 * the dialog says so. A failure stays in the dialog with the request reference.
 */
export function CancelRunDialog({ run, onOpenChange }: CancelRunDialogProps) {
  const t = useTranslations("admin.workflows.cancel");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const action = useConfirmedAction(
    async () => {
      if (run === null) return;
      await callEndpoint(adminCancelWorkflowRunEndpoint, { params: { runId: run.runId } });
      await queryClient.invalidateQueries({ queryKey: workflowRunKeys.all() });
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
      description={run?.approvalRequestId === null || run === null ? t("description") : t("descriptionSuspended")}
      confirmLabel={t("confirm")}
      cancelLabel={t("keep")}
      destructive
      onConfirm={action.confirm}
      error={action.error}
    />
  );
}
