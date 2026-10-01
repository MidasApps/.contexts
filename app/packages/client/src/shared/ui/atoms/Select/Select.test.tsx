import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "./Select.tsx";

const ThemeSelect = ({ onValueChange }: { onValueChange: (value: string) => void }) => (
  <>
    <Label htmlFor="theme">Tema</Label>
    <Select onValueChange={onValueChange}>
      <SelectTrigger id="theme">
        <SelectValue placeholder="Escolha" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Temas</SelectLabel>
          <SelectItem value="system">Sistema</SelectItem>
          <SelectItem value="light">Claro</SelectItem>
          <SelectItem value="dark">Escuro</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  </>
);

describe("Select", () => {
  it("opens with Enter, moves with arrows and selects with Enter", async () => {
    const onValueChange = vi.fn();
    const { user, container } = renderWithProviders(<ThemeSelect onValueChange={onValueChange} />);
    await expectNoAxeViolations(container);
    const trigger = screen.getByRole("combobox", { name: "Tema" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const listbox = await screen.findByRole("listbox");
    expect(listbox).toBeDefined();
    await expectNoAxeViolations(document.body);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onValueChange).toHaveBeenCalledWith("light");
    expect(trigger.textContent).toContain("Claro");
  });
});
