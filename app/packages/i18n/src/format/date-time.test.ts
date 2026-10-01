import { describe, expect, it } from "vitest";
import { formatDateTime, utcToZonedWallTime, zonedWallTimeToUtc } from "./date-time.ts";

const plain = (text: string): string => text.replace(/[\u00a0\u202f]/g, " ");

describe("formatDateTime", () => {
  const iso = "2026-01-15T12:00:00.000Z";

  it("shows a UTC instant in America/Sao_Paulo", () => {
    expect(formatDateTime(iso, { locale: "pt-BR", timeZone: "America/Sao_Paulo", style: "time" })).toBe("09:00");
  });

  it("shows a UTC instant in Asia/Kolkata (half-hour offset)", () => {
    expect(plain(formatDateTime(iso, { locale: "en-US", timeZone: "Asia/Kolkata", style: "time" }))).toBe("5:30 PM");
  });

  it("formats date and date-time styles", () => {
    expect(formatDateTime(iso, { locale: "pt-BR", timeZone: "UTC", style: "date" })).toBe("15 de jan. de 2026");
    expect(plain(formatDateTime(iso, { locale: "en-US", timeZone: "UTC", style: "datetime" }))).toBe(
      "Jan 15, 2026, 12:00 PM",
    );
  });

  it("rejects strings that are not UTC ISO instants", () => {
    expect(() => formatDateTime("2026-01-15 12:00", { locale: "pt-BR", timeZone: "UTC" })).toThrow(RangeError);
  });
});

describe("zonedWallTimeToUtc", () => {
  it("converts a wall time without DST", () => {
    expect(zonedWallTimeToUtc("2026-01-15T09:00", "America/Sao_Paulo")).toBe("2026-01-15T12:00:00.000Z");
    expect(zonedWallTimeToUtc("2026-01-15T17:30:00", "Asia/Kolkata")).toBe("2026-01-15T12:00:00.000Z");
  });

  it("handles the spring-forward boundary in America/New_York", () => {
    expect(zonedWallTimeToUtc("2026-03-08T01:30", "America/New_York")).toBe("2026-03-08T06:30:00.000Z");
    expect(zonedWallTimeToUtc("2026-03-08T03:30", "America/New_York")).toBe("2026-03-08T07:30:00.000Z");
    // 02:30 does not exist that day; it resolves forward to 03:30 EDT.
    expect(zonedWallTimeToUtc("2026-03-08T02:30", "America/New_York")).toBe("2026-03-08T07:30:00.000Z");
  });

  it("picks the earlier instant for a repeated wall time (fall back)", () => {
    expect(zonedWallTimeToUtc("2026-11-01T01:30", "America/New_York")).toBe("2026-11-01T05:30:00.000Z");
  });

  it("rejects malformed wall times and unknown zones", () => {
    expect(() => zonedWallTimeToUtc("2026-13-01T00:00", "UTC")).toThrow(RangeError);
    expect(() => zonedWallTimeToUtc("2026-01-01T10:60", "UTC")).toThrow(RangeError);
    expect(() => zonedWallTimeToUtc("2026-01-01T10:00:61", "UTC")).toThrow(RangeError);
    expect(() => zonedWallTimeToUtc("2026-01-01T00:00Z", "UTC")).toThrow(RangeError);
    expect(() => zonedWallTimeToUtc("2026-01-01T00:00", "Mars/Olympus")).toThrow(RangeError);
  });
});

describe("utcToZonedWallTime", () => {
  it("shows a UTC instant as the wall time of the zone (datetime-local value)", () => {
    expect(utcToZonedWallTime("2026-01-15T12:00:00.000Z", "America/Sao_Paulo")).toBe("2026-01-15T09:00");
    expect(utcToZonedWallTime("2026-01-15T12:00:00Z", "Asia/Kolkata")).toBe("2026-01-15T17:30");
  });

  it("crosses midnight and round-trips with zonedWallTimeToUtc", () => {
    expect(utcToZonedWallTime("2026-01-16T01:15:00.000Z", "America/Sao_Paulo")).toBe("2026-01-15T22:15");
    const wall = "2026-03-08T01:30";
    expect(utcToZonedWallTime(zonedWallTimeToUtc(wall, "America/New_York"), "America/New_York")).toBe(wall);
  });

  it("rejects instants that are not UTC ISO", () => {
    expect(() => utcToZonedWallTime("2026-01-15T12:00:00-03:00", "UTC")).toThrow(RangeError);
  });
});
