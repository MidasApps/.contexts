import type { MoneyValue, ParseMoneyInputError } from "@core/i18n";
import { screen } from "@testing-library/react";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Field, FieldControl, FieldError, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { MoneyInput } from "./MoneyInput.tsx";
import { formatMoneyInputText } from "./money-input-text.ts";

const Budget = ({
  onValue,
  initial = null,
}: {
  onValue: (value: MoneyValue | null) => void;
  initial?: MoneyValue | null;
}) => {
  const t = useTranslations("common.money");
  const [value, setValue] = useState<MoneyValue | null>(initial);
  const [error, setError] = useState<ParseMoneyInputError | null>(null);
  return (
    <Field>
      <FieldLabel>Orçamento</FieldLabel>
      <FieldControl>
        <MoneyInput
          currency="BRL"
          value={value}
          onValueChange={(next) => {
            setValue(next);
            onValue(next);
          }}
          onParseError={setError}
        />
      </FieldControl>
      <FieldError errors={[error === null ? undefined : t("invalid", { example: "1.234,56" })]} />
    </Field>
  );
};

describe("formatMoneyInputText", () => {
  it("formats minor units with the locale's separators and the currency's digits", () => {
    expect(formatMoneyInputText({ amountMinor: 123456, currency: "BRL" }, "pt-BR")).toBe("1.234,56");
    expect(formatMoneyInputText({ amountMinor: 1234, currency: "JPY" }, "en-US")).toBe("1,234");
  });
});

describe("MoneyInput", () => {
  it("round-trips pt-BR text to minor units and reformats on blur", async () => {
    const onValue = vi.fn();
    const { user, container } = renderWithProviders(<Budget onValue={onValue} />);
    const input = screen.getByRole("textbox", { name: "Orçamento" });
    await user.type(input, "1234,5");
    await user.tab();
    expect(onValue).toHaveBeenLastCalledWith({ amountMinor: 123450, currency: "BRL" });
    expect((input as HTMLInputElement).value).toBe("1.234,50");
    await user.clear(input);
    await user.type(input, "1.234,56");
    await user.tab();
    expect(onValue).toHaveBeenLastCalledWith({ amountMinor: 123456, currency: "BRL" });
    expect(input.getAttribute("aria-describedby")).toContain(screen.getByText("BRL").id);
    await expectNoAxeViolations(container);
  });

  it("flags unparseable text through the field error", async () => {
    const onValue = vi.fn();
    const { user, container } = renderWithProviders(
      <Budget onValue={onValue} initial={{ amountMinor: 500, currency: "BRL" }} />,
    );
    const input = screen.getByRole("textbox", { name: "Orçamento" });
    expect((input as HTMLInputElement).value).toBe("5,00");
    await user.clear(input);
    await user.type(input, "12,3,4");
    await user.tab();
    expect(onValue).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Digite um valor válido, por exemplo 1.234,56.")).toBeDefined();
    await expectNoAxeViolations(container);
  });
});
