import { screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Combobox } from "./Combobox.tsx";

const Fruit = () => {
  const [value, setValue] = useState<string | undefined>(undefined);
  return (
    <>
      <Label htmlFor="fruit">Fruta</Label>
      <Combobox
        id="fruit"
        value={value}
        onValueChange={setValue}
        placeholder="Escolha"
        searchLabel="Buscar fruta"
        emptyText="Nada"
        groups={[
          { heading: "Cítricas", options: [{ value: "lemon", label: "Limão" }, { value: "orange", label: "Laranja" }] },
          { heading: "Outras", options: [{ value: "apple", label: "Maçã", keywords: ["apple"] }] },
        ]}
      />
    </>
  );
};

describe("Combobox", () => {
  it("opens a labelled search, filters by label or keyword and returns focus after picking", async () => {
    const { user, container } = renderWithProviders(<Fruit />);
    await expectNoAxeViolations(container);
    const trigger = screen.getByRole("combobox", { name: "Fruta" });
    await user.click(trigger);
    const search = await screen.findByRole("combobox", { name: "Buscar fruta" });
    expect(document.activeElement).toBe(search);
    expect(trigger.getAttribute("aria-controls")).toBe(screen.getByRole("dialog", { name: "Buscar fruta" }).id);
    await expectNoAxeViolations(document.body);
    await user.type(search, "apple");
    expect(screen.queryByRole("option", { name: /Limão/ })).toBeNull();
    await user.keyboard("{Enter}");
    expect(trigger.textContent).toContain("Maçã");
    expect(document.activeElement).toBe(trigger);
  });
});
