"use client";

import { type DateTimeStyle, formatDateTime } from "@core/i18n";
import { useCallback } from "react";
import { useLocale, useTimeZone } from "use-intl";

/**
 * Formats a UTC ISO instant in the UI locale and the display time zone. The app-shell gives the
 * intl provider `AccessContext.regional.displayTimeZone` (decision 0013 §5); without a provider
 * zone (no tenant context) the browser zone is used.
 */
export const useFormatDateTime = (): ((iso: string, style?: DateTimeStyle) => string) => {
  const locale = useLocale();
  const timeZone = useTimeZone() ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Stable per locale and zone: tables list it in their column dependencies, and new columns remount cells.
  return useCallback(
    (iso: string, style: DateTimeStyle = "datetime") => formatDateTime(iso, { locale, timeZone, style }),
    [locale, timeZone],
  );
};
