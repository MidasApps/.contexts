import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "./Command.tsx";

describe("Command", () => {
  it("filters options as the user types and selects with Enter", async () => {
    const onSelect = vi.fn();
    const { user, container } = renderWithProviders(
      <Command label="Buscar comando">
        <CommandInput />
        <CommandList label="Comandos">
          <CommandEmpty>Nada encontrado.</CommandEmpty>
          <CommandGroup heading="Navegação">
            <CommandItem onSelect={() => {
                onSelect("profile");
              }}>Perfil</CommandItem>
            <CommandItem onSelect={() => {
                onSelect("settings");
              }}>
              Configurações
              <CommandShortcut>⌘,</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>,
    );
    await expectNoAxeViolations(container);
    expect(screen.getByRole("listbox", { name: "Comandos" })).toBeDefined();
    const input = screen.getByRole("combobox", { name: "Buscar comando" });
    await user.type(input, "config");
    expect(screen.queryByRole("option", { name: /Perfil/ })).toBeNull();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith("settings");
    await user.clear(input);
    await user.type(input, "zzz");
    expect(screen.getByText("Nada encontrado.")).toBeDefined();
  });
});
