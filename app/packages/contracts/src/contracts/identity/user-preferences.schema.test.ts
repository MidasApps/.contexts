import { describe, expect, it } from "vitest";
import { DEFAULT_USER_PREFERENCES, UserPreferencesContract, UserPreferencesSchema } from "./user-preferences.schema.ts";

const valid = { ...DEFAULT_USER_PREFERENCES, locale: "pt-BR", timeZone: "America/Sao_Paulo", currency: "BRL" };

describe("UserPreferencesSchema", () => {
  it("accepts a canonical locale, an IANA zone and an ISO 4217 currency", () => {
    expect(UserPreferencesSchema.parse(valid)).toEqual(valid);
  });

  it("accepts the defaults: no regional preference, system theme", () => {
    expect(UserPreferencesSchema.parse(DEFAULT_USER_PREFERENCES)).toEqual({
      theme: "system",
      notifications: { productUpdates: false, securityAlerts: true },
    });
  });

  it("rejects a non-canonical locale", () => {
    expect(UserPreferencesSchema.safeParse({ ...valid, locale: "pt-br" }).success).toBe(false);
    expect(UserPreferencesSchema.safeParse({ ...valid, locale: "pt_BR" }).success).toBe(false);
  });

  it("rejects a raw offset or an unknown zone", () => {
    expect(UserPreferencesSchema.safeParse({ ...valid, timeZone: "-03:00" }).success).toBe(false);
    expect(UserPreferencesSchema.safeParse({ ...valid, timeZone: "Mars/Olympus" }).success).toBe(false);
  });

  it("rejects a currency that is not ISO 4217 shaped", () => {
    expect(UserPreferencesSchema.safeParse({ ...valid, currency: "brl" }).success).toBe(false);
    expect(UserPreferencesSchema.safeParse({ ...valid, currency: "REAL" }).success).toBe(false);
  });

  it("never lets security alerts be turned off", () => {
    expect(UserPreferencesSchema.safeParse({ ...valid, notifications: { productUpdates: true, securityAlerts: false } }).success).toBe(false);
  });

  it("parses its catalog examples", () => {
    for (const example of UserPreferencesContract.meta.examples) expect(UserPreferencesSchema.safeParse(example).success).toBe(true);
  });
});
