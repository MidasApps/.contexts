/** A calendar day as a date input and the page URL carry it (`2026-09-30`). */
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/u;

const startOfDay = (day: string | undefined, plusDays: number): Date | undefined => {
  const match = day === undefined ? null : DAY.exec(day);
  if (match === null) return undefined;
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const start = new Date(year, month - 1, date + plusDays);
  // `new Date` rolls an impossible day over (2026-02-31 becomes March): refuse it instead.
  const asked = new Date(year, month - 1, date);
  return asked.getMonth() === month - 1 && asked.getDate() === date ? start : undefined;
};

/** A day of the URL when it is a real calendar day, else `undefined` (a hand-edited URL never becomes a 400). */
export const validDay = (day: string | undefined): string | undefined =>
  startOfDay(day, 0) === undefined ? undefined : day;

export type TraceDateRange = { readonly startedAfter?: string; readonly startedBefore?: string };

/**
 * The instants the API filters by, from the days staff picked: from the start of `from` to the
 * end of `to` (the start of the next day, exclusive), in the browser's time zone like every date
 * of `/admin` (decision 0042). A `to` before `from` is ignored.
 * @example traceDateRange("2026-09-29", "2026-09-30") // 29th 00:00 local to 1st 00:00 local, as ISO
 */
export const traceDateRange = (from: string | undefined, to: string | undefined): TraceDateRange => {
  const after = startOfDay(from, 0);
  const before = startOfDay(to, 1);
  const ordered = after === undefined || before === undefined || after.getTime() < before.getTime();
  return {
    ...(after === undefined ? {} : { startedAfter: after.toISOString() }),
    ...(before === undefined || !ordered ? {} : { startedBefore: before.toISOString() }),
  };
};
