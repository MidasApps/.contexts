"use client";

import { type AdminSchedule, adminPauseScheduleEndpoint, adminResumeScheduleEndpoint } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { scheduleKeys } from "#/entities/schedule/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { useWorkflowLabel } from "#/shared/lib/labels/use-catalog-labels.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";

/** A pause or resume staff asked for, waiting for the confirmation. */
export type ScheduleStateRequest = { readonly schedule: AdminSchedule; readonly action: "pause" | "resume" };

export type ScheduleStateDialogProps = { request: ScheduleStateRequest | null; onOpenChange: (open: boolean) => void };

const descriptionKey = (request: ScheduleStateRequest | null) => {
  const platform = request?.schedule.scope === "platform";
  if (request?.action === "resume") return platform ? "resumePlatform" : "resumeTenant";
  return platform ? "pausePlatform" : "pauseTenant";
};

/**
 * Confirms a pause or resume of any schedule (`POST /v1/admin/schedules/{id}/pause|resume`,
 * platform.workflow.manage; audited). Pausing a platform schedule stops a core job for every
 * organization, so that confirmation is destructive and says so. The list refetches after the API
 * accepts; a failure stays in the dialog with the request reference.
 */
export function ScheduleStateDialog({ request, onOpenChange }: ScheduleStateDialogProps) {
  const t = useTranslations("admin.workflows.scheduleState");
  const workflowLabel = useWorkflowLabel();
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const workflow = request === null ? "" : workflowLabel.name(request.schedule.workflowId);
  const pausing = request?.action !== "resume";
  const platformPause = pausing && request?.schedule.scope === "platform";
  const action = useConfirmedAction(
    async () => {
      if (request === null) return;
      await callEndpoint(request.action === "pause" ? adminPauseScheduleEndpoint : adminResumeScheduleEndpoint, {
        params: { scheduleId: request.schedule.id },
      });
      await queryClient.invalidateQueries({ queryKey: scheduleKeys.all() });
    },
    () => notify.success(t(pausing ? "paused" : "resumed", { workflow })),
  );
  return (
    <ConfirmDialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) action.reset();
        onOpenChange(open);
      }}
      title={t(pausing ? "pauseTitle" : "resumeTitle", { workflow })}
      description={t(descriptionKey(request))}
      confirmLabel={t(platformPause ? "confirmPausePlatform" : pausing ? "confirmPause" : "confirmResume")}
      destructive={platformPause}
      onConfirm={action.confirm}
      error={action.error}
    />
  );
}
