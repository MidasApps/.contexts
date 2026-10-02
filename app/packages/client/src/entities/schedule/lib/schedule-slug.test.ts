import { describe, expect, it } from "vitest";
import { scheduleSlugOf } from "./schedule-slug.ts";

describe("scheduleSlugOf", () => {
  it("reads the slug the organization chose out of a tenant schedule id", () => {
    expect(scheduleSlugOf("schedule_3fa9c0e1b2d4a6f8-daily-usage")).toBe("daily-usage");
  });

  it("has no slug for platform schedules or unknown shapes", () => {
    expect(scheduleSlugOf("schedule_platform-usage-report")).toBeNull();
    expect(scheduleSlugOf("whatever")).toBeNull();
  });
});
