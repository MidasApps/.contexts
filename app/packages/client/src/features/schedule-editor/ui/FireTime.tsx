"use client";

import { formatDateTime } from "@core/i18n";
import { useLocale, useTimeZone, useTranslations } from "use-intl";

/**
 * A fire in the schedule's own zone and, when it differs, in the viewer's: a cron only means
 * something in its zone, and most people read another. `null` is "no fire".
 */
export function FireTime({ iso, timezone }: { iso: string | null; timezone: string }) {
  const t = useTranslations("common.scheduleTable");
  const locale = useLocale();
  const viewerZone = useTimeZone() ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (iso === null) return <span className="text-muted-foreground">{t("noFire")}</span>;
  const inSchedule = formatDateTime(iso, { locale, timeZone: timezone, style: "datetime" });
  return (
    <span className="flex flex-col">
      <span>{t("inZone", { when: inSchedule, zone: timezone })}</span>
      {viewerZone === timezone ? null : (
        <span className="text-caption text-muted-foreground">
          {t("inYourZone", {
            when: formatDateTime(iso, { locale, timeZone: viewerZone, style: "datetime" }),
            zone: viewerZone,
          })}
        </span>
      )}
    </span>
  );
}
