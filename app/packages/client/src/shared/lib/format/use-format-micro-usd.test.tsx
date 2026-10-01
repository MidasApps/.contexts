import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { microUsdToMoney, moneyToMicroUsd, useFormatMicroUsd } from "./use-format-micro-usd.ts";

// Intl separates the symbol with a no-break space; compare with plain spaces.
const plain = (text: string | null): string => (text ?? "").replace(/\s/gu, " ");

function Sample() {
  const format = useFormatMicroUsd();
  return (
    <>
      <p data-testid="cents">{format(12_504_999)}</p>
      <p data-testid="exact">{format(900, "exact")}</p>
    </>
  );
}

describe("useFormatMicroUsd", () => {
  it("formats budgets to the cent and small costs without losing them", () => {
    renderWithProviders(<Sample />, { locale: "pt-BR" });
    expect(plain(screen.getByTestId("cents").textContent)).toBe("US$ 12,50");
    expect(plain(screen.getByTestId("exact").textContent)).toBe("US$ 0,0009");
  });

  it("follows the UI locale", () => {
    renderWithProviders(<Sample />, { locale: "en-US" });
    expect(plain(screen.getByTestId("cents").textContent)).toBe("$12.50");
  });

  it("converts between micro-USD and money in cents", () => {
    expect(microUsdToMoney(50_000_000)).toEqual({ amountMinor: 5000, currency: "USD" });
    expect(moneyToMicroUsd({ amountMinor: 5000, currency: "USD" })).toBe(50_000_000);
  });
});
