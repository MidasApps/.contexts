import { describe, expect, it } from "vitest";
import { cronOfDraft, DEFAULT_CRON_DRAFT, draftOfCron, parseJsonObject } from "./cron-presets.ts";

describe("cron presets", () => {
  it("builds the cron of each preset", () => {
    expect(cronOfDraft({ ...DEFAULT_CRON_DRAFT, kind: "hourly", minute: 15 })).toBe("15 * * * *");
    expect(cronOfDraft({ ...DEFAULT_CRON_DRAFT, kind: "daily", time: "09:00" })).toBe("0 9 * * *");
    expect(cronOfDraft({ ...DEFAULT_CRON_DRAFT, kind: "weekdays", time: "08:30" })).toBe("30 8 * * 1-5");
    expect(cronOfDraft({ ...DEFAULT_CRON_DRAFT, kind: "weekly", time: "18:05", weekday: 5 })).toBe("5 18 * * 5");
    expect(cronOfDraft({ ...DEFAULT_CRON_DRAFT, kind: "monthly", time: "00:00", monthDay: 28 })).toBe("0 0 28 * *");
    expect(cronOfDraft({ ...DEFAULT_CRON_DRAFT, kind: "custom", custom: "  */30  9-17 * * 1-5 " })).toBe("*/30 9-17 * * 1-5");
  });

  it("refuses an incomplete or invalid draft", () => {
    expect(cronOfDraft({ ...DEFAULT_CRON_DRAFT, kind: "daily", time: "25:00" })).toBeNull();
    expect(cronOfDraft({ ...DEFAULT_CRON_DRAFT, kind: "hourly", minute: 60 })).toBeNull();
    expect(cronOfDraft({ ...DEFAULT_CRON_DRAFT, kind: "monthly", monthDay: 31 })).toBeNull();
    expect(cronOfDraft({ ...DEFAULT_CRON_DRAFT, kind: "custom", custom: "0 9 * *" })).toBeNull();
    expect(cronOfDraft({ ...DEFAULT_CRON_DRAFT, kind: "custom", custom: "0 0 9 * * *" })).toBeNull();
  });

  it("reads an existing cron back into its preset, or keeps it as custom", () => {
    for (const cron of ["15 * * * *", "0 9 * * *", "30 8 * * 1-5", "5 18 * * 5", "0 0 28 * *"]) {
      const draft = draftOfCron(cron);
      expect(draft.kind).not.toBe("custom");
      expect(cronOfDraft(draft)).toBe(cron);
    }
    expect(draftOfCron("*/30 9-17 * * 1-5")).toMatchObject({ kind: "custom", custom: "*/30 9-17 * * 1-5" });
    expect(draftOfCron("0 9 31 * *")).toMatchObject({ kind: "custom" });
  });

  it("parses workflow input as a JSON object only", () => {
    expect(parseJsonObject("")).toEqual({});
    expect(parseJsonObject('{"title":"a"}')).toEqual({ title: "a" });
    expect(parseJsonObject("[1]")).toBeNull();
    expect(parseJsonObject("{oops")).toBeNull();
  });
});
