import { describe, expect, it } from "vitest";
import { formatUsdPriceText, parseUsdPriceText } from "./usd-price-text.ts";

describe("parseUsdPriceText", () => {
  it("reads dollars in the locale's format as micro-USD, down to the millionth", () => {
    expect(parseUsdPriceText("0,075", "pt-BR")).toBe(75_000);
    expect(parseUsdPriceText("1.234,5", "pt-BR")).toBe(1_234_500_000);
    expect(parseUsdPriceText("1,234.5", "en-US")).toBe(1_234_500_000);
    expect(parseUsdPriceText(" 2 ", "pt-BR")).toBe(2_000_000);
    expect(parseUsdPriceText("0,000001", "pt-BR")).toBe(1);
  });

  it("refuses text that is not a non-negative amount", () => {
    expect(parseUsdPriceText("", "pt-BR")).toBeNull();
    expect(parseUsdPriceText("-1", "pt-BR")).toBeNull();
    expect(parseUsdPriceText("abc", "pt-BR")).toBeNull();
    expect(parseUsdPriceText("1,2,3", "pt-BR")).toBeNull();
    expect(parseUsdPriceText("0,0000001", "pt-BR")).toBeNull();
    expect(parseUsdPriceText("2000000", "pt-BR")).toBeNull();
  });
});

describe("formatUsdPriceText", () => {
  it("keeps two to six decimals", () => {
    expect(formatUsdPriceText(2_000_000, "pt-BR")).toBe("2,00");
    expect(formatUsdPriceText(75_000, "pt-BR")).toBe("0,075");
    expect(formatUsdPriceText(1_234_500_000, "en-US")).toBe("1,234.50");
  });
});
