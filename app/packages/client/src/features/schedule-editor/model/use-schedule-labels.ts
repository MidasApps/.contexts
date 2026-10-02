"use client";

import { useMemo } from "react";
import { useTranslations } from "use-intl";
import { useDescribeCron } from "./describe-cron.ts";

/** The schedule fields a label reads (tenant and staff schedules both carry them). */
export type LabelledSchedule = { readonly id: string; readonly cron: string; readonly timezone: string };

/**
 * When a schedule fires, in words, by schedule id ("Dias úteis às 09:00 (America/Sao_Paulo)"), for
 * rows that carry only the id (a run started by a schedule); `undefined` for a schedule not in the
 * list (deleted, or not readable by the viewer), so the caller says "a schedule" instead.
 */
export const useScheduleLabels = (schedules: readonly LabelledSchedule[] | undefined): ((scheduleId: string) => string | undefined) => {
  const t = useTranslations("common.cron");
  const describe = useDescribeCron();
  return useMemo(() => {
    const byId = new Map((schedules ?? []).map((schedule) => [schedule.id, schedule] as const));
    return (scheduleId: string) => {
      const schedule = byId.get(scheduleId);
      return schedule === undefined ? undefined : t("withZone", { description: describe(schedule.cron) ?? schedule.cron, zone: schedule.timezone });
    };
  }, [schedules, t, describe]);
};
