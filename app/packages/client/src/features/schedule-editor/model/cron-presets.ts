import { CronExpressionSchema } from "@core/contracts";
import { z } from "zod";

/** How often a schedule fires, as the editor offers it; `custom` is a hand-written 5-field cron. */
export const CRON_PRESET_KINDS = ["hourly", "daily", "weekdays", "weekly", "monthly", "custom"] as const;
export type CronPresetKind = (typeof CRON_PRESET_KINDS)[number];

/** The editor's cron choice. `time` is `HH:mm` in the schedule's time zone. */
export type CronDraft = {
  readonly kind: CronPresetKind;
  /** Minute of the hour (hourly), 0–59. */
  readonly minute: number;
  readonly time: string;
  /** Day of the week (weekly), 0 = Sunday … 6 = Saturday. */
  readonly weekday: number;
  /** Day of the month (monthly), 1–28 so every month has it. */
  readonly monthDay: number;
  readonly custom: string;
};

export const DEFAULT_CRON_DRAFT: CronDraft = { kind: "daily", minute: 0, time: "09:00", weekday: 1, monthDay: 1, custom: "" };

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/u;

const timeParts = (time: string): { hour: number; minute: number } | null => {
  const match = TIME.exec(time);
  return match === null ? null : { hour: Number(match[1]), minute: Number(match[2]) };
};

const inRange = (value: number, min: number, max: number): boolean => Number.isInteger(value) && value >= min && value <= max;

/**
 * The 5-field cron of a draft, or `null` when the draft is incomplete or invalid (a bad time, a
 * custom expression that is not five cron fields). The server still checks the semantics and the
 * minimum interval.
 * @example cronOfDraft({ ...DEFAULT_CRON_DRAFT, kind: "weekdays", time: "08:30" }) // "30 8 * * 1-5"
 */
export const cronOfDraft = (draft: CronDraft): string | null => {
  if (draft.kind === "custom") {
    const cron = draft.custom.trim().split(/\s+/u).join(" ");
    return CronExpressionSchema.safeParse(cron).success ? cron : null;
  }
  if (draft.kind === "hourly") return inRange(draft.minute, 0, 59) ? `${draft.minute} * * * *` : null;
  const at = timeParts(draft.time);
  if (at === null) return null;
  const head = `${at.minute} ${at.hour}`;
  if (draft.kind === "daily") return `${head} * * *`;
  if (draft.kind === "weekdays") return `${head} * * 1-5`;
  if (draft.kind === "weekly") return inRange(draft.weekday, 0, 6) ? `${head} * * ${draft.weekday}` : null;
  return inRange(draft.monthDay, 1, 28) ? `${head} ${draft.monthDay} * *` : null;
};

const NUMBER = /^\d{1,2}$/u;
const pad = (value: number): string => String(value).padStart(2, "0");

/**
 * The draft that shows an existing cron: one of the presets when the expression has exactly that
 * shape, else `custom` with the expression as written (nothing is lost on edit).
 */
export const draftOfCron = (cron: string): CronDraft => {
  const custom: CronDraft = { ...DEFAULT_CRON_DRAFT, kind: "custom", custom: cron };
  const [minute = "", hour = "", monthDay = "", month = "", weekday = ""] = cron.trim().split(/\s+/u);
  if (!NUMBER.test(minute) || month !== "*" || !inRange(Number(minute), 0, 59)) return custom;
  if (hour === "*" && monthDay === "*" && weekday === "*") return { ...DEFAULT_CRON_DRAFT, kind: "hourly", minute: Number(minute) };
  if (!NUMBER.test(hour) || !inRange(Number(hour), 0, 23)) return custom;
  const time = `${pad(Number(hour))}:${pad(Number(minute))}`;
  if (monthDay === "*" && weekday === "*") return { ...DEFAULT_CRON_DRAFT, kind: "daily", time };
  if (monthDay === "*" && weekday === "1-5") return { ...DEFAULT_CRON_DRAFT, kind: "weekdays", time };
  if (monthDay === "*" && /^[0-6]$/u.test(weekday)) return { ...DEFAULT_CRON_DRAFT, kind: "weekly", time, weekday: Number(weekday) };
  if (weekday === "*" && NUMBER.test(monthDay) && inRange(Number(monthDay), 1, 28)) return { ...DEFAULT_CRON_DRAFT, kind: "monthly", time, monthDay: Number(monthDay) };
  return custom;
};

const JsonObjectSchema = z.record(z.string(), z.unknown());

/** A JSON object typed in a text field, or `null` when the text is not one (arrays and scalars are refused). */
export const parseJsonObject = (text: string): Record<string, unknown> | null => {
  if (text.trim() === "") return {};
  try {
    const parsed = JsonObjectSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};
