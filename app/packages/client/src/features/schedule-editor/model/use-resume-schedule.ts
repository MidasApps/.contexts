"use client";

import { resumeScheduleEndpoint, type Schedule } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { tenantScheduleKeys } from "#/entities/schedule/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useDescribeError } from "#/shared/lib/errors/describe-error.ts";
import { useWorkflowLabel } from "#/shared/lib/labels/use-catalog-labels.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";

export type ResumeSchedule = {
  /** Schedule whose resume is in flight (its buttons wait). */
  readonly pendingId: string | null;
  readonly resume: (schedule: Pick<Schedule, "id" | "workflowId">) => void;
};

/**
 * Resumes a paused schedule of the organization (`POST /v1/schedules/{id}/resume`,
 * core.schedule.write). No confirmation: it only restores what was there, and missed fires are not
 * replayed. One at a time; success and failure are toasts (the failure with `errors.<CODE>` and
 * the request reference).
 */
export const useResumeSchedule = (organizationId: string): ResumeSchedule => {
  const t = useTranslations("settings.workflows.scheduleActions");
  const tError = useTranslations("common.errorState");
  const describe = useDescribeError();
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const workflowLabel = useWorkflowLabel();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const run = async (schedule: Pick<Schedule, "id" | "workflowId">): Promise<void> => {
    if (pendingId !== null) return;
    setPendingId(schedule.id);
    try {
      await callEndpoint(resumeScheduleEndpoint, { params: { scheduleId: schedule.id }, query: { organizationId } });
      await queryClient.invalidateQueries({ queryKey: tenantScheduleKeys.all(organizationId) });
      notify.success(t("resumed", { workflow: workflowLabel.name(schedule.workflowId) }));
    } catch (failure: unknown) {
      const described = describe(failure);
      notify.error(t("resumeFailed", { workflow: workflowLabel.name(schedule.workflowId) }), {
        description: described.requestId === undefined ? described.message : tError("messageWithReference", { message: described.message, requestId: described.requestId }),
      });
    } finally {
      setPendingId(null);
    }
  };
  return { pendingId, resume: (schedule) => void run(schedule) };
};
