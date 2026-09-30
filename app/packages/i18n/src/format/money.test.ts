import { describe, expect, it } from "vitest";
import { currencyMinorDigits, formatMoney } from "./money.ts";

// Intl uses NBSP / narrow NBSP between symbol and amount; compare with plain spaces.
const plain = (text: string): string => text.replace(/[\u00a0\u202f]/g, " ");

describe("currencyMinorDigits", () => {
  it("reads minor digits from Intl", () => {
    expect(currencyMinorDigits("BRL")).toBe(2);
    expect(currencyMinorDigits("JPY")).toBe(0);
    expect(currencyMinorDigits("KWD")).toBe(3);
  });
});

describe("formatMoney", () => {
  it("formats BRL in pt-BR", () => {
    expect(plain(formatMoney({ amountMinor: 12345, currency: "BRL" }, "pt-BR"))).toBe("R$ 123,45");
  });

  it("formats USD in en-US with grouping", () => {
    expect(formatMoney({ amountMinor: 123456, currency: "USD" }, "en-US")).toBe("$1,234.56");
  });

  it("formats zero-digit and three-digit currencies", () => {
    expect(formatMoney({ amountMinor: 1234, currency: "JPY" }, "en-US")).toBe("¥1,234");
    expect(plain(formatMoney({ amountMinor: 1234, currency: "KWD" }, "en-US"))).toBe("KWD 1.234");
  });

  it("keeps precision for amounts beyond float-safe decimals", () => {
    expect(formatMoney({ amountMinor: 900719925474099, currency: "USD" }, "en-US")).toBe("$9,007,199,254,740.99");
  });

  it("pads small amounts with leading zeros in the fraction", () => {
    expect(formatMoney({ amountMinor: 5, currency: "USD" }, "en-US")).toBe("$0.05");
  });
});
