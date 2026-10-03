"use client";

import { SCHEDULE_PREVIEW_FIRES } from "@core/contracts";
import { useId } from "react";
import { useTranslations } from "use-intl";
import { useSchedulePreview } from "#/entities/schedule/index.ts";
import { FireTime } from "./FireTime.tsx";

export type NextFiresProps = {
  organizationId: string;
  /** Cron of the draft; `null` while it is incomplete or invalid. */
  cron: string | null;
  timezone: string;
};

/**
 * The next five fires of the draft, before it is saved (`POST /v1/schedules/preview`): the server
 * computes them with the scheduler's own engine, so the editor needs no cron library. A failed
 * preview says so quietly; saving still validates.
 */
export function NextFires({ organizationId, cron, timezone }: NextFiresProps) {
  const t = useTranslations("settings.workflows.editor.nextFires");
  const headingId = useId();
  const preview = useSchedulePreview(organizationId, cron === null || timezone === "" ? null : { cron, timezone });
  const fires = preview.data;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1.5 text-xs">
      <h3 id={headingId} className="font-medium">
        {t("title", { count: SCHEDULE_PREVIEW_FIRES })}
      </h3>
      {fires === undefined ? (
        <p className="text-muted-foreground" aria-live="polite">
          {preview.isError ? t("unavailable") : cron === null ? t("invalidCron") : t("loading")}
        </p>
      ) : (
        <ol aria-labelledby={headingId} className="flex flex-col gap-1">
          {fires.map((iso) => (
            <li key={iso}>
              <FireTime iso={iso} timezone={timezone} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
