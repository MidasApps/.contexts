"use client";

import { deleteScheduleEndpoint, pauseScheduleEndpoint, runScheduleNowEndpoint, type Schedule } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { tenantScheduleKeys } from "#/entities/schedule/index.ts";
import { tenantWorkflowRunKeys } from "#/entities/workflow-run/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { useWorkflowLabel } from "#/shared/lib/labels/use-catalog-labels.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";

/** A schedule action that needs a confirmation first. */
export type ScheduleAction = "pause" | "run" | "delete";
export type ScheduleActionTarget = {
  readonly action: ScheduleAction;
  readonly schedule: Pick<Schedule, "id" | "workflowId">;
};

export type ScheduleActionDialogProps = {
  organizationId: string;
  /** What to confirm; `null` keeps the dialog closed. */
  target: ScheduleActionTarget | null;
  onOpenChange: (open: boolean) => void;
};

const COPY = {
  pause: { title: "pauseTitle", description: "pauseDescription", confirm: "pauseConfirm", done: "paused" },
  run: { title: "runTitle", description: "runDescription", confirm: "runConfirm", done: "runQueued" },
  delete: { title: "deleteTitle", description: "deleteDescription", confirm: "deleteConfirm", done: "deleted" },
} as const;

/**
 * Confirms and performs one schedule action of the organization (core.schedule.write): pause
 * (`POST /v1/schedules/{id}/pause`; the workflow stops firing), run now (`…/run`; an extra run as
 * the creator) or delete (`DELETE /v1/schedules/{id}`). A failure stays in the dialog with the
 * request reference.
 */
export function ScheduleActionDialog({ organizationId, target, onOpenChange }: ScheduleActionDialogProps) {
  const t = useTranslations("settings.workflows.scheduleActions");
  const workflowLabel = useWorkflowLabel();
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const copy = COPY[target?.action ?? "pause"];
  const workflow = target === null ? "" : workflowLabel.name(target.schedule.workflowId);
  const action = useConfirmedAction(
    async () => {
      if (target === null) return;
      const request = { params: { scheduleId: target.schedule.id }, query: { organizationId } };
      if (target.action === "pause") await callEndpoint(pauseScheduleEndpoint, request);
      else if (target.action === "run") await callEndpoint(runScheduleNowEndpoint, request);
      else await callEndpoint(deleteScheduleEndpoint, request);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tenantScheduleKeys.all(organizationId) }),
        ...(target.action === "run"
          ? [queryClient.invalidateQueries({ queryKey: tenantWorkflowRunKeys.all(organizationId) })]
          : []),
      ]);
    },
    () => notify.success(t(copy.done, { workflow })),
  );
  return (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) action.reset();
        onOpenChange(open);
      }}
      title={t(copy.title, { workflow })}
      description={t(copy.description)}
      confirmLabel={t(copy.confirm)}
      destructive={target?.action === "delete"}
      onConfirm={action.confirm}
      error={action.error}
    />
  );
}
