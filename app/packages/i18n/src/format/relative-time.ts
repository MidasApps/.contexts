export type FormatRelativeTimeOptions = {
  /** Reference instant (UTC ISO); injected so callers and tests control the clock. */
  now: string;
  locale: string;
};

const UNITS: ReadonlyArray<{ unit: Intl.RelativeTimeFormatUnit; seconds: number }> = [
  { unit: "year", seconds: 31_536_000 },
  { unit: "month", seconds: 2_592_000 },
  { unit: "week", seconds: 604_800 },
  { unit: "day", seconds: 86_400 },
  { unit: "hour", seconds: 3_600 },
  { unit: "minute", seconds: 60 },
];

/** "3 hours ago", "tomorrow", "há 3 dias": the largest unit that fits, via `Intl.RelativeTimeFormat`. */
export const formatRelativeTime = (iso: string, { now, locale }: FormatRelativeTimeOptions): string => {
  const deltaSeconds = Math.round((Date.parse(iso) - Date.parse(now)) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const fitting = UNITS.find(({ seconds }) => Math.abs(deltaSeconds) >= seconds);
  if (fitting === undefined) return formatter.format(deltaSeconds, "second");
  return formatter.format(Math.trunc(deltaSeconds / fitting.seconds), fitting.unit);
};
