"use client";

import { adminRunScheduleNowEndpoint, type AdminSchedule } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { scheduleKeys } from "#/entities/schedule/index.ts";
import { workflowRunKeys } from "#/entities/workflow-run/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { useWorkflowLabel } from "#/shared/lib/labels/use-catalog-labels.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";

export type RunScheduleNowDialogProps = { schedule: AdminSchedule | null; onOpenChange: (open: boolean) => void };

/**
 * Starts a run of a schedule now (`POST /v1/admin/schedules/{id}/run`, platform.workflow.manage;
 * audited). The run is extra: the cron keeps its next fire. A tenant schedule still runs as its
 * creator, re-authorized. A failure stays in the dialog with the request reference.
 */
export function RunScheduleNowDialog({ schedule, onOpenChange }: RunScheduleNowDialogProps) {
  const t = useTranslations("admin.workflows.runNow");
  const workflowLabel = useWorkflowLabel();
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const action = useConfirmedAction(
    async () => {
      if (schedule === null) return;
      await callEndpoint(adminRunScheduleNowEndpoint, { params: { scheduleId: schedule.id } });
      await Promise.all([queryClient.invalidateQueries({ queryKey: scheduleKeys.all() }), queryClient.invalidateQueries({ queryKey: workflowRunKeys.all() })]);
    },
    () => notify.success(t("done", { workflow: schedule === null ? "" : workflowLabel.name(schedule.workflowId) })),
  );
  return (
    <ConfirmDialog
      open={schedule !== null}
      onOpenChange={(open) => {
        if (!open) action.reset();
        onOpenChange(open);
      }}
      title={t("title", { workflow: schedule === null ? "" : workflowLabel.name(schedule.workflowId) })}
      description={schedule?.scope === "tenant" ? t("descriptionTenant") : t("descriptionPlatform")}
      confirmLabel={t("confirm")}
      onConfirm={action.confirm}
      error={action.error}
    />
  );
}
