import { describe, expect, it } from "vitest";
import { checkSchedule, minIntervalMinutesOf, nextFires } from "./schedule-policy.ts";

const NOW = Date.UTC(2026, 9, 30, 12, 0, 0); // 2026-10-30T12:00Z, days before the US DST end
const iso = (ms: number) => new Date(ms).toISOString();

describe("next fires in the schedule's zone", () => {
  it("fires 0 9 * * * at 09:00 São Paulo (UTC-3, no DST) every day", () => {
    expect(nextFires("0 9 * * *", "America/Sao_Paulo", NOW, 2).map(iso)).toEqual(["2026-10-31T12:00:00.000Z", "2026-11-01T12:00:00.000Z"]);
  });

  it("follows New York across the end of DST (UTC-4 then UTC-5)", () => {
    expect(nextFires("0 9 * * *", "America/New_York", NOW, 3).map(iso)).toEqual([
      "2026-10-30T13:00:00.000Z",
      "2026-10-31T13:00:00.000Z",
      "2026-11-01T14:00:00.000Z",
    ]);
  });
});

describe("minimum interval", () => {
  it("is 15 minutes by default and never below it outside local", () => {
    expect(minIntervalMinutesOf({ APP_ENV: "prod" })).toBe(15);
    expect(minIntervalMinutesOf({ APP_ENV: "prod", SCHEDULE_MIN_INTERVAL_MINUTES: 1 })).toBe(15);
    expect(minIntervalMinutesOf({ APP_ENV: "staging", SCHEDULE_MIN_INTERVAL_MINUTES: 30 })).toBe(30);
    expect(minIntervalMinutesOf({ APP_ENV: "local", SCHEDULE_MIN_INTERVAL_MINUTES: 1 })).toBe(1);
    expect(minIntervalMinutesOf({ APP_ENV: "local", SCHEDULE_MIN_INTERVAL_MINUTES: 0 })).toBe(15);
  });

  it("rejects every minute in the prod config and accepts it in local with 1 minute", () => {
    const prod = minIntervalMinutesOf({ APP_ENV: "prod" });
    expect(checkSchedule({ cron: "* * * * *", timezone: "UTC", minIntervalMinutes: prod, now: NOW })).toEqual({ code: "SCHEDULE_INTERVAL_TOO_SHORT", field: "cron", issue: "TOO_FREQUENT" });
    expect(checkSchedule({ cron: "* * * * *", timezone: "UTC", minIntervalMinutes: minIntervalMinutesOf({ APP_ENV: "local", SCHEDULE_MIN_INTERVAL_MINUTES: 1 }), now: NOW })).toBeNull();
  });

  it("catches a short gap hidden in a list and accepts a quarter-hour cadence", () => {
    expect(checkSchedule({ cron: "0,5 9 * * *", timezone: "UTC", minIntervalMinutes: 15, now: NOW })?.code).toBe("SCHEDULE_INTERVAL_TOO_SHORT");
    expect(checkSchedule({ cron: "*/15 * * * *", timezone: "UTC", minIntervalMinutes: 15, now: NOW })).toBeNull();
  });
});

describe("cron and zone validation", () => {
  it("refuses seconds, macros, impossible values and non-IANA zones", () => {
    expect(checkSchedule({ cron: "0 0 9 * * *", timezone: "UTC", minIntervalMinutes: 15, now: NOW })).toMatchObject({ code: "VALIDATION_FAILED", field: "cron" });
    expect(checkSchedule({ cron: "@daily", timezone: "UTC", minIntervalMinutes: 15, now: NOW })).toMatchObject({ code: "VALIDATION_FAILED", field: "cron" });
    expect(checkSchedule({ cron: "99 9 * * *", timezone: "UTC", minIntervalMinutes: 15, now: NOW })).toMatchObject({ code: "VALIDATION_FAILED", field: "cron" });
    expect(checkSchedule({ cron: "0 9 * * *", timezone: "Mars/Olympus", minIntervalMinutes: 15, now: NOW })).toMatchObject({ code: "VALIDATION_FAILED", field: "timezone" });
  });
});
