import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { useFormatDateTime } from "./use-format-date-time.ts";
import { useFormatMoney } from "./use-format-money.ts";

const plain = (text: string | null): string => (text ?? "").replace(/[\u00a0\u202f]/gu, " ");

function Sample() {
  const money = useFormatMoney();
  const date = useFormatDateTime();
  return (
    <>
      <p data-testid="money">{money({ amountMinor: 123456, currency: "BRL" })}</p>
      <p data-testid="date">{date("2026-01-15T12:00:00.000Z", "time")}</p>
    </>
  );
}

describe("format hooks", () => {
  it("format money and instants in the provider's locale and time zone", () => {
    renderWithProviders(<Sample />, { locale: "pt-BR", timeZone: "America/Sao_Paulo" });
    expect(plain(screen.getByTestId("money").textContent)).toBe("R$ 1.234,56");
    expect(screen.getByTestId("date").textContent).toBe("09:00");
  });

  it("follow a different locale and zone", () => {
    renderWithProviders(<Sample />, { locale: "en-US", timeZone: "Asia/Kolkata" });
    expect(plain(screen.getByTestId("money").textContent)).toBe("R$1,234.56");
    expect(plain(screen.getByTestId("date").textContent)).toBe("5:30 PM");
  });
});
