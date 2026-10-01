"use client";

import { formatDateTime, type DateTimeStyle } from "@core/i18n";
import { useLocale, useTimeZone } from "use-intl";

/**
 * Formats a UTC ISO instant in the UI locale and the display time zone. The app-shell gives the
 * intl provider `AccessContext.regional.displayTimeZone` (decision 0013 §5); without a provider
 * zone (no tenant context) the browser zone is used.
 */
export const useFormatDateTime = (): ((iso: string, style?: DateTimeStyle) => string) => {
  const locale = useLocale();
  const timeZone = useTimeZone() ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (iso, style = "datetime") => formatDateTime(iso, { locale, timeZone, style });
};
