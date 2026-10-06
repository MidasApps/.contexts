import { describe, expect, it } from "vitest";
import { CurrencySchema, MoneySchema } from "./money.schema.ts";

describe("MoneySchema", () => {
  it("accepts an integer amount in minor units with an ISO 4217 currency", () => {
    expect(MoneySchema.parse({ amountMinor: 12345, currency: "BRL" })).toEqual({ amountMinor: 12345, currency: "BRL" });
  });

  it("rejects a non-integer amountMinor", () => {
    expect(MoneySchema.safeParse({ amountMinor: 123.45, currency: "BRL" }).success).toBe(false);
  });

  it("rejects a negative amountMinor", () => {
    expect(MoneySchema.safeParse({ amountMinor: -1, currency: "BRL" }).success).toBe(false);
  });

  it("rejects a lowercase currency", () => {
    expect(MoneySchema.safeParse({ amountMinor: 100, currency: "brl" }).success).toBe(false);
  });

  it("rejects a currency that is not three letters", () => {
    expect(CurrencySchema.safeParse("BR").success).toBe(false);
    expect(CurrencySchema.safeParse("BRLX").success).toBe(false);
  });
});
