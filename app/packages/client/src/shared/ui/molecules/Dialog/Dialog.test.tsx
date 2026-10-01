import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./Dialog.tsx";

const RenameDialog = () => (
  <Dialog>
    <DialogTrigger asChild>
      <Button>Renomear</Button>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Renomear projeto</DialogTitle>
        <DialogDescription>O nome aparece nos breadcrumbs.</DialogDescription>
      </DialogHeader>
      <Input aria-label="Nome" />
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="secondary">Cancelar</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

describe("Dialog", () => {
  it("traps focus inside and returns it to the trigger on Escape", async () => {
    const { user } = renderWithProviders(<RenameDialog />);
    const trigger = screen.getByRole("button", { name: "Renomear" });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Renomear projeto" });
    expect(dialog.getAttribute("aria-describedby")).toBe(screen.getByText("O nome aparece nos breadcrumbs.").id);
    await expectNoAxeViolations(document.body);
    for (let step = 0; step < 5; step += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("has a translated close button", async () => {
    const { user } = renderWithProviders(<RenameDialog />, { locale: "en-US" });
    await user.click(screen.getByRole("button", { name: "Renomear" }));
    await user.click(await screen.findByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
