import { screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { CommandEmpty, CommandGroup, CommandItem } from "#/shared/ui/molecules/Command/Command.tsx";
import { CommandDialog, useCommandShortcut } from "./CommandDialog.tsx";

const Palette = ({ onRun }: { onRun: (id: string) => void }) => {
  const [open, setOpen] = useState(false);
  useCommandShortcut(() => setOpen(true));
  const run = (id: string): void => {
    onRun(id);
    setOpen(false);
  };
  return (
    <>
      <input aria-label="Nota" />
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandEmpty>Nenhum comando encontrado.</CommandEmpty>
        <CommandGroup heading="Navegação">
          <CommandItem onSelect={() => run("profile")}>Perfil</CommandItem>
          <CommandItem onSelect={() => run("members")}>Membros</CommandItem>
        </CommandGroup>
      </CommandDialog>
    </>
  );
};

describe("CommandDialog", () => {
  it("opens with Ctrl+K even while typing, filters and runs the chosen command", async () => {
    const onRun = vi.fn();
    const { user } = renderWithProviders(<Palette onRun={onRun} />);
    await user.click(screen.getByRole("textbox", { name: "Nota" }));
    await user.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Paleta de comandos" });
    expect(dialog).toBeDefined();
    const search = screen.getByRole("combobox", { name: "Buscar comando ou página" });
    expect(document.activeElement).toBe(search);
    expect(screen.getByRole("listbox", { name: "Comandos" })).toBeDefined();
    await expectNoAxeViolations(document.body);
    await user.type(search, "memb");
    expect(screen.queryByRole("option", { name: "Perfil" })).toBeNull();
    await user.keyboard("{Enter}");
    expect(onRun).toHaveBeenCalledWith("members");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens with ⌘K", async () => {
    const { user } = renderWithProviders(<Palette onRun={() => undefined} />);
    await user.keyboard("{Meta>}k{/Meta}");
    expect(await screen.findByRole("dialog", { name: "Paleta de comandos" })).toBeDefined();
  });
});
