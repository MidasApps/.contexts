export type DateTimeStyle = "date" | "time" | "datetime";

export type FormatDateTimeOptions = {
  locale: string;
  /** IANA zone the user sees (`regional.displayTimeZone`, decision 0013). */
  timeZone: string;
  style?: DateTimeStyle;
};

// API timestamps are UTC ISO 8601 with `Z` (contracts/api.md §8.1); anything else is a caller bug.
const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/;

const STYLE_OPTIONS: Record<DateTimeStyle, Intl.DateTimeFormatOptions> = {
  date: { dateStyle: "medium" },
  time: { timeStyle: "short" },
  datetime: { dateStyle: "medium", timeStyle: "short" },
};

const parseUtcIso = (iso: string): Date => {
  const date = new Date(iso);
  if (!UTC_ISO.test(iso) || Number.isNaN(date.getTime())) throw new RangeError(`Expected a UTC ISO instant: ${iso}`);
  return date;
};

/** Formats a UTC instant for display in the user's time zone. */
export const formatDateTime = (iso: string, { locale, timeZone, style = "datetime" }: FormatDateTimeOptions): string =>
  new Intl.DateTimeFormat(locale, { ...STYLE_OPTIONS[style], timeZone }).format(parseUtcIso(iso));

const WALL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** Epoch ms of the wall time as if it were UTC; validates ranges by round-tripping. */
const wallTimeAsUtcMs = (local: string): number => {
  const match = WALL_TIME.exec(local);
  if (match === null) throw new RangeError(`Expected a wall time YYYY-MM-DDTHH:mm[:ss]: ${local}`);
  const [year, month, day, hour, minute, second] = match.slice(1).map((part) => Number(part ?? "0")) as [
    number, number, number, number, number, number,
  ];
  const ms = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(ms);
  const roundTrips =
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day &&
    check.getUTCHours() === hour &&
    check.getUTCMinutes() === minute &&
    check.getUTCSeconds() === second;
  if (!roundTrips) {
    throw new RangeError(`Invalid wall time: ${local}`);
  }
  return ms;
};

const offsetFormatter = (timeZone: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

/** Offset (ms) of `timeZone` at the instant `utcMs`: local wall clock minus UTC. */
const zoneOffsetMs = (formatter: Intl.DateTimeFormat, utcMs: number): number => {
  const parts = Object.fromEntries(formatter.formatToParts(utcMs).map((part) => [part.type, Number(part.value)]));
  const asUtc = Date.UTC(parts["year"] ?? 0, (parts["month"] ?? 1) - 1, parts["day"], parts["hour"], parts["minute"], parts["second"]);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
};

const DAY_MS = 86_400_000;

/**
 * Converts a wall time typed in `timeZone` to a UTC ISO instant, DST-aware (Temporal's
 * "compatible" disambiguation): a repeated wall time takes the earlier instant; a skipped one
 * moves forward by the gap (02:30 on a spring-forward day becomes 03:30).
 *
 * @throws {RangeError} malformed wall time or unknown time zone.
 */
export const zonedWallTimeToUtc = (local: string, timeZone: string): string => {
  const wallMs = wallTimeAsUtcMs(local);
  const formatter = offsetFormatter(timeZone);
  const offsetBefore = zoneOffsetMs(formatter, wallMs - DAY_MS);
  const offsetAfter = zoneOffsetMs(formatter, wallMs + DAY_MS);
  const candidates = [offsetBefore, offsetAfter]
    .map((offset) => wallMs - offset)
    .filter((utcMs) => wallMs - zoneOffsetMs(formatter, utcMs) === utcMs)
    .sort((a, b) => a - b);
  const resolved = candidates[0] ?? wallMs - offsetBefore;
  return new Date(resolved).toISOString();
};

const pad2 = (value: number | undefined): string => String(value ?? 0).padStart(2, "0");

/**
 * The wall time (`YYYY-MM-DDTHH:mm`, the `datetime-local` input value) that a UTC instant shows
 * in `timeZone`; the inverse of `zonedWallTimeToUtc` for editing dates in the display zone.
 *
 * @throws {RangeError} not a UTC ISO instant, or unknown time zone.
 */
export const utcToZonedWallTime = (iso: string, timeZone: string): string => {
  const parts = Object.fromEntries(
    offsetFormatter(timeZone)
      .formatToParts(parseUtcIso(iso))
      .map((part) => [part.type, Number(part.value)]),
  );
  return `${String(parts["year"])}-${pad2(parts["month"])}-${pad2(parts["day"])}T${pad2(parts["hour"])}:${pad2(parts["minute"])}`;
};
