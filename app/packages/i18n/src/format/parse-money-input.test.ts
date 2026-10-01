import { describe, expect, it } from "vitest";
import { parseMoneyInput } from "./parse-money-input.ts";

describe("parseMoneyInput", () => {
  it("parses pt-BR separators", () => {
    expect(parseMoneyInput("1.234,56", "pt-BR", "BRL")).toEqual({ ok: true, amountMinor: 123456 });
    expect(parseMoneyInput("1234,5", "pt-BR", "BRL")).toEqual({ ok: true, amountMinor: 123450 });
  });

  it("parses en-US separators and a currency symbol", () => {
    expect(parseMoneyInput("1,234.56", "en-US", "USD")).toEqual({ ok: true, amountMinor: 123456 });
    expect(parseMoneyInput(" $ 12 ", "en-US", "USD")).toEqual({ ok: true, amountMinor: 1200 });
  });

  it("parses whole units for zero-digit currencies", () => {
    expect(parseMoneyInput("1,234", "en-US", "JPY")).toEqual({ ok: true, amountMinor: 1234 });
  });

  it("reads grouping from the locale for zero-digit currencies in dot-grouping locales", () => {
    expect(parseMoneyInput("1.234", "pt-BR", "JPY")).toEqual({ ok: true, amountMinor: 1234 });
    expect(parseMoneyInput("1.234.567", "pt-BR", "JPY")).toEqual({ ok: true, amountMinor: 1234567 });
    expect(parseMoneyInput("1,234", "es-419", "CLP")).toEqual({ ok: true, amountMinor: 1234 }); // es-419 groups with ","
    expect(parseMoneyInput("1.234,5", "pt-BR", "KRW")).toEqual({ ok: false, error: "TOO_MANY_FRACTION_DIGITS" });
  });

  it("rejects two decimal separators", () => {
    expect(parseMoneyInput("1,23,4", "pt-BR", "BRL")).toEqual({ ok: false, error: "INVALID_MONEY_INPUT" });
  });

  it("rejects misplaced group separators and too many fraction digits", () => {
    expect(parseMoneyInput("1234.56", "pt-BR", "BRL")).toEqual({ ok: false, error: "INVALID_MONEY_INPUT" });
    expect(parseMoneyInput("1.234", "en-US", "USD")).toEqual({ ok: false, error: "TOO_MANY_FRACTION_DIGITS" });
    expect(parseMoneyInput("1.5", "en-US", "JPY")).toEqual({ ok: false, error: "TOO_MANY_FRACTION_DIGITS" });
  });

  it("rejects empty, negative and non-numeric input", () => {
    expect(parseMoneyInput("", "en-US", "USD")).toEqual({ ok: false, error: "INVALID_MONEY_INPUT" });
    expect(parseMoneyInput("-1", "en-US", "USD")).toEqual({ ok: false, error: "INVALID_MONEY_INPUT" });
    expect(parseMoneyInput("abc", "en-US", "USD")).toEqual({ ok: false, error: "INVALID_MONEY_INPUT" });
  });
});
