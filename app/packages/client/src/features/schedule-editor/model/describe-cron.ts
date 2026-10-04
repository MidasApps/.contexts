"use client";

import { useCallback } from "react";
import { useLocale, useTranslations } from "use-intl";
import { draftOfCron } from "./cron-presets.ts";

export type CronDescription =
  | { readonly kind: "hourly"; readonly values: { readonly minute: number } }
  | { readonly kind: "daily" | "weekdays"; readonly values: { readonly time: string } }
  | { readonly kind: "weekly"; readonly values: { readonly weekday: string; readonly time: string } }
  | { readonly kind: "monthly"; readonly values: { readonly day: number; readonly time: string } };

// 2023-01-01 was a Sunday: day `n` of that week is weekday `n` of cron (0 = Sunday).
const weekdayName = (weekday: number, locale: string): string =>
  new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(Date.UTC(2023, 0, 1 + weekday));

// The wall-clock time as the viewer writes it; the cron's time is already in the schedule's zone.
const wallTime = (time: string, locale: string): string => {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone: "UTC" }).format(
    Date.UTC(2023, 0, 1, hour, minute),
  );
};

/**
 * What a cron means, when it has the shape of one of the editor's presets (`draftOfCron`), with
 * the time and weekday localized; `null` for any other expression, which is then shown as written.
 * @example cronDescriptionOf("30 8 * * 1-5", "pt-BR") // { kind: "weekdays", values: { time: "08:30" } }
 */
export const cronDescriptionOf = (cron: string, locale: string): CronDescription | null => {
  const draft = draftOfCron(cron);
  switch (draft.kind) {
    case "hourly":
      return { kind: "hourly", values: { minute: draft.minute } };
    case "daily":
    case "weekdays":
      return { kind: draft.kind, values: { time: wallTime(draft.time, locale) } };
    case "weekly":
      return {
        kind: "weekly",
        values: { weekday: weekdayName(draft.weekday, locale), time: wallTime(draft.time, locale) },
      };
    case "monthly":
      return { kind: "monthly", values: { day: draft.monthDay, time: wallTime(draft.time, locale) } };
    case "custom":
      return null;
  }
};

/** The cron in words in the viewer's language ("Dias úteis às 09:00"), or `null` for a custom expression. */
export const useDescribeCron = (): ((cron: string) => string | null) => {
  const t = useTranslations("common.cron");
  const locale = useLocale();
  return useCallback(
    (cron) => {
      const description = cronDescriptionOf(cron, locale);
      return description === null ? null : t(description.kind, description.values);
    },
    [t, locale],
  );
};
