"use client";

import { adminPauseScheduleEndpoint, adminResumeScheduleEndpoint, type AdminSchedule } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { scheduleKeys } from "#/entities/schedule/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useDescribeError } from "#/shared/lib/errors/describe-error.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";

export type ScheduleActions = {
  /** Schedule whose pause or resume is in flight (its buttons wait). */
  readonly pendingId: string | null;
  readonly pause: (schedule: AdminSchedule) => void;
  readonly resume: (schedule: AdminSchedule) => void;
};

/**
 * Pause and resume of any schedule by staff (`POST /v1/admin/schedules/{id}/pause|resume`,
 * platform.workflow.manage; audited). One at a time; the list refetches; success and failure are
 * toasts (the failure with `errors.<CODE>` and the request reference, never the raw message).
 */
export const useScheduleActions = (): ScheduleActions => {
  const t = useTranslations("admin.workflows.scheduleActions");
  const tError = useTranslations("common.errorState");
  const describe = useDescribeError();
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const run = async (schedule: AdminSchedule, action: "pause" | "resume"): Promise<void> => {
    if (pendingId !== null) return;
    setPendingId(schedule.id);
    try {
      await callEndpoint(action === "pause" ? adminPauseScheduleEndpoint : adminResumeScheduleEndpoint, { params: { scheduleId: schedule.id } });
      await queryClient.invalidateQueries({ queryKey: scheduleKeys.all() });
      notify.success(t(action === "pause" ? "paused" : "resumed", { workflow: schedule.workflowId }));
    } catch (failure: unknown) {
      const described = describe(failure);
      notify.error(t(action === "pause" ? "pauseFailed" : "resumeFailed", { workflow: schedule.workflowId }), {
        description: described.requestId === undefined ? described.message : tError("messageWithReference", { message: described.message, requestId: described.requestId }),
      });
    } finally {
      setPendingId(null);
    }
  };
  return { pendingId, pause: (schedule) => void run(schedule, "pause"), resume: (schedule) => void run(schedule, "resume") };
};
