import { describe, expect, it } from "vitest";
import { resolveRegionalSettings } from "./regional-settings.ts";

const organization = { defaults: { locale: "pt-BR", timeZone: "America/Sao_Paulo", currency: "BRL" } } as const;

describe("resolveRegionalSettings (SP1 spec §4)", () => {
  it("uses the organization defaults when nothing overrides them", () => {
    expect(resolveRegionalSettings({ organization })).toEqual({
      locale: "pt-BR",
      displayTimeZone: "America/Sao_Paulo",
      nodeTimeZone: "America/Sao_Paulo",
      currency: "BRL",
    });
  });

  it("takes currency and node time zone from the project over the organization", () => {
    const project = { settings: { timeZone: "America/Manaus", currency: "USD" } } as const;
    expect(resolveRegionalSettings({ organization, project })).toMatchObject({
      nodeTimeZone: "America/Manaus",
      currency: "USD",
      displayTimeZone: "America/Manaus",
    });
  });

  it("takes them from the unit over the project, and from the nearest unit of the chain", () => {
    const project = { settings: { timeZone: "America/Manaus", currency: "USD" } } as const;
    const root = { settings: { timeZone: "Europe/Lisbon", currency: "EUR" } } as const;
    const leaf = { settings: { currency: "GBP" } } as const;
    expect(resolveRegionalSettings({ organization, project, units: [root, leaf] })).toMatchObject({
      nodeTimeZone: "Europe/Lisbon",
      currency: "GBP",
    });
    expect(resolveRegionalSettings({ organization, project, units: [{ settings: {} }] })).toMatchObject({
      nodeTimeZone: "America/Manaus",
      currency: "USD",
    });
  });

  it("displays in the user's time zone, else the node's", () => {
    const project = { settings: { timeZone: "America/Manaus" } } as const;
    expect(resolveRegionalSettings({ organization, project, user: { timeZone: "Asia/Tokyo" } })).toMatchObject({
      displayTimeZone: "Asia/Tokyo",
      nodeTimeZone: "America/Manaus",
    });
  });

  it("uses the user's locale, else the organization's; a user currency preference never changes the node currency", () => {
    expect(resolveRegionalSettings({ organization, user: { locale: "en-US", currency: "JPY" } })).toMatchObject({
      locale: "en-US",
      currency: "BRL",
    });
  });
});
