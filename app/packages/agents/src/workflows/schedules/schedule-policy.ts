import { CronExpressionSchema, TimeZoneSchema } from "@core/contracts";
import { computeNextFireAt, validateCron } from "@mastra/core/workflows";

/**
 * Tenant schedule policy (SP5 spec §3.5, decision 0037). Cron and next fires come from Mastra's
 * scheduler helpers, which wrap Croner: the same engine that fires the schedule, so the check
 * and the scheduler never disagree on DST or day-of-week rules.
 */

/** Platform minimum between two fires; 1 minute is allowed only in `local` (e2e). */
export const DEFAULT_MIN_INTERVAL_MINUTES = 15;
export const LOCAL_MIN_INTERVAL_FLOOR = 1;
/** Fires inspected for the shortest gap; covers every 5-field pattern that repeats within a day or a week. */
const FIRES_CHECKED = 200;

export type SchedulePolicyEnv = { readonly APP_ENV: string; readonly SCHEDULE_MIN_INTERVAL_MINUTES?: number | undefined };

/**
 * The minimum interval in force: `SCHEDULE_MIN_INTERVAL_MINUTES` when valid, never below 15 outside
 * `local` and never below 1 anywhere. Invalid config falls back to the safe default, never to "no limit".
 */
export const minIntervalMinutesOf = (env: SchedulePolicyEnv): number => {
  const value = env.SCHEDULE_MIN_INTERVAL_MINUTES;
  const configured = typeof value === "number" && Number.isInteger(value) && value >= LOCAL_MIN_INTERVAL_FLOOR ? value : DEFAULT_MIN_INTERVAL_MINUTES;
  return env.APP_ENV === "local" ? configured : Math.max(configured, DEFAULT_MIN_INTERVAL_MINUTES);
};

export type ScheduleViolation =
  | { readonly code: "VALIDATION_FAILED"; readonly field: "cron" | "timezone"; readonly issue: string }
  | { readonly code: "SCHEDULE_INTERVAL_TOO_SHORT"; readonly field: "cron"; readonly issue: "TOO_FREQUENT" };

/** The next `count` fires (epoch ms) of a valid cron in its zone, after `after`. */
export const nextFires = (cron: string, timezone: string, after: number, count: number): number[] => {
  const fires: number[] = [];
  let cursor = after;
  for (let index = 0; index < count; index += 1) {
    cursor = computeNextFireAt(cron, { timezone, after: cursor });
    fires.push(cursor);
  }
  return fires;
};

/**
 * The next `count` fires (epoch ms) of an unsaved cron from `now`, for the editor's preview. No
 * minimum interval here: the write refuses that with its own code.
 * @returns `null` when the scheduler cannot read the cron in that zone.
 */
export const previewFires = (input: { readonly cron: string; readonly timezone: string; readonly now: number; readonly count: number }): number[] | null => {
  try {
    validateCron(input.cron, input.timezone);
    return nextFires(input.cron, input.timezone, input.now, input.count);
  } catch {
    return null;
  }
};

const shortestGapMinutes =(fires: readonly number[]): number => {
  let shortest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < fires.length; index += 1) shortest = Math.min(shortest, ((fires[index] ?? 0) - (fires[index - 1] ?? 0)) / 60_000);
  return shortest;
};

/**
 * Checks a tenant schedule: 5-field cron, IANA zone, Croner-valid, and no two fires closer than the
 * minimum interval among the next fires from `now`.
 * @returns `null` when the schedule is acceptable.
 */
export const checkSchedule = (input: { readonly cron: string; readonly timezone: string; readonly minIntervalMinutes: number; readonly now: number }): ScheduleViolation | null => {
  if (!CronExpressionSchema.safeParse(input.cron).success) return { code: "VALIDATION_FAILED", field: "cron", issue: "INVALID_CRON" };
  if (!TimeZoneSchema.safeParse(input.timezone).success) return { code: "VALIDATION_FAILED", field: "timezone", issue: "INVALID_TIME_ZONE" };
  try {
    validateCron(input.cron, input.timezone);
  } catch {
    return { code: "VALIDATION_FAILED", field: "cron", issue: "INVALID_CRON" };
  }
  const gap = shortestGapMinutes(nextFires(input.cron, input.timezone, input.now, FIRES_CHECKED));
  return gap < input.minIntervalMinutes ? { code: "SCHEDULE_INTERVAL_TOO_SHORT", field: "cron", issue: "TOO_FREQUENT" } : null;
};
