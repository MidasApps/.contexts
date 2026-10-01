import { describe, expect, it } from "vitest";
import { listCurrencies } from "./currencies.ts";
import { listTimeZonesByRegion } from "./time-zones.ts";

describe("listCurrencies", () => {
  it("lists ISO 4217 codes with localized names", () => {
    const currencies = listCurrencies("pt-BR");
    expect(currencies.find((currency) => currency.code === "BRL")?.name).toBe("Real brasileiro");
    expect(currencies.every((currency) => /^[A-Z]{3}$/.test(currency.code))).toBe(true);
  });
});

describe("listTimeZonesByRegion", () => {
  it("groups IANA zones by region and includes UTC", () => {
    const groups = listTimeZonesByRegion();
    expect(groups.find((group) => group.region === "America")?.zones).toContain("America/Sao_Paulo");
    expect(groups.find((group) => group.region === "UTC")?.zones).toEqual(["UTC"]);
  });

  it("lists current IANA names instead of CLDR's legacy ids", () => {
    const zones = listTimeZonesByRegion().flatMap((group) => group.zones);
    expect(zones).toContain("Asia/Kolkata");
    expect(zones).toContain("Europe/Kyiv");
    expect(zones).not.toContain("Asia/Calcutta");
    expect(new Set(zones).size).toBe(zones.length);
  });
});
