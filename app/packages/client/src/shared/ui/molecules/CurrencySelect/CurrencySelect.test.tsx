import { screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { CurrencySelect } from "./CurrencySelect.tsx";

const Picker = ({ initial }: { initial?: string }) => {
  const [value, setValue] = useState<string | undefined>(initial);
  return (
    <>
      <Label htmlFor="currency">Moeda</Label>
      <CurrencySelect id="currency" value={value} onValueChange={setValue} />
    </>
  );
};

describe("CurrencySelect", () => {
  it("shows the selected code with its localized name", async () => {
    const { container } = renderWithProviders(<Picker initial="BRL" />);
    expect(screen.getByRole("combobox", { name: "Moeda" }).textContent).toContain("BRL — Real brasileiro");
    await expectNoAxeViolations(container);
  });

  it("finds a currency by code", async () => {
    const { user } = renderWithProviders(<Picker />, { locale: "en-US" });
    const trigger = screen.getByRole("combobox", { name: "Moeda" });
    expect(trigger.textContent).toContain("Select a currency");
    await user.click(trigger);
    await user.type(await screen.findByRole("combobox", { name: "Search currency" }), "JPY");
    await user.keyboard("{Enter}");
    expect(trigger.textContent).toContain("JPY — Japanese Yen");
  });
});
