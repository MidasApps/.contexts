import { describe, expect, it } from "vitest";
import { fallbackChain, isSupportedLocale, SOURCE_LOCALE, SUPPORTED_LOCALES } from "./locales.ts";

describe("locales", () => {
  it("lists the three supported locales with pt-BR as source", () => {
    expect(SUPPORTED_LOCALES).toEqual(["pt-BR", "en-US", "es-419"]);
    expect(SOURCE_LOCALE).toBe("pt-BR");
  });

  it("falls back from every locale to the source", () => {
    expect(fallbackChain("pt-BR")).toEqual(["pt-BR"]);
    expect(fallbackChain("en-US")).toEqual(["en-US", "pt-BR"]);
    expect(fallbackChain("es-419")).toEqual(["es-419", "pt-BR"]);
  });

  it("recognizes only canonical supported tags", () => {
    expect(isSupportedLocale("es-419")).toBe(true);
    expect(isSupportedLocale("pt-br")).toBe(false);
    expect(isSupportedLocale("fr-FR")).toBe(false);
  });
});
