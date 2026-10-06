"use client";

import type { AccessContext } from "@core/contracts";
import { useTenantSchedules } from "#/entities/schedule/index.ts";
import { useScheduleLabels } from "#/features/schedule-editor/index.ts";

/**
 * The organization's schedules in words by id, for runs a schedule started. Read only for holders
 * of core.schedule.read (the same cached list as the schedules tab); everyone else, and a failed
 * read, gets `undefined` and the run says "a schedule".
 */
export const useTenantScheduleLabels = (context: AccessContext): ((scheduleId: string) => string | undefined) => {
  const canRead = context.permissions.includes("core.schedule.read");
  const schedules = useTenantSchedules(context.organization.id, { enabled: canRead });
  return useScheduleLabels(canRead ? schedules.data : undefined);
};
