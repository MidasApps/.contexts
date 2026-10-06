import { describe, expect, it } from "vitest";
import { changedPreferences } from "./regional-preferences.contract.ts";

describe("update-preferences", () => {
  it("keeps only the changed fields", () => {
    const initial = { locale: "pt-BR", timeZone: "America/Sao_Paulo", currency: "BRL" };
    expect(changedPreferences(initial, initial)).toBeNull();
    expect(changedPreferences(initial, { ...initial, currency: "USD" })).toEqual({ currency: "USD" });
  });
});
