import { describe, expect, it } from "vitest";
import { IsoDateTimeSchema } from "./iso-datetime.schema.ts";
import { LocaleSchema } from "./locale.schema.ts";
import { TimeZoneSchema } from "./time-zone.schema.ts";

describe("LocaleSchema", () => {
  it("accepts canonical BCP 47 tags", () => {
    for (const tag of ["pt-BR", "en-US", "es-419", "en"]) expect(LocaleSchema.safeParse(tag).success).toBe(true);
  });

  it("rejects non-canonical or malformed tags", () => {
    for (const tag of ["pt-br", "pt_BR", "", "not a locale"]) expect(LocaleSchema.safeParse(tag).success).toBe(false);
  });
});

describe("TimeZoneSchema", () => {
  it("accepts IANA time zone names", () => {
    for (const zone of ["America/Sao_Paulo", "UTC", "Asia/Kolkata"])
      expect(TimeZoneSchema.safeParse(zone).success).toBe(true);
  });

  it("rejects unknown zones and raw offsets", () => {
    for (const zone of ["Mars/Olympus", "+03:00", "", "-0300"])
      expect(TimeZoneSchema.safeParse(zone).success).toBe(false);
  });
});

describe("IsoDateTimeSchema", () => {
  it("accepts a UTC timestamp with Z", () => {
    expect(IsoDateTimeSchema.safeParse("2026-09-29T14:30:00.000Z").success).toBe(true);
  });

  it("rejects offsets and local formats", () => {
    expect(IsoDateTimeSchema.safeParse("2026-09-29T14:30:00-03:00").success).toBe(false);
    expect(IsoDateTimeSchema.safeParse("2026-09-29 14:30:00").success).toBe(false);
  });
});
