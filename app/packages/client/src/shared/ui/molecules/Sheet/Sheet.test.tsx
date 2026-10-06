import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "./Sheet.tsx";

describe("Sheet", () => {
  it("opens from the chosen side as a labelled modal and closes with the translated button", async () => {
    const { user } = renderWithProviders(
      <Sheet>
        <SheetTrigger asChild>
          <Button>Menu</Button>
        </SheetTrigger>
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle>Navegação</SheetTitle>
            <SheetDescription>Seções do app.</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>,
    );
    const trigger = screen.getByRole("button", { name: "Menu" });
    await user.click(trigger);
    const sheet = await screen.findByRole("dialog", { name: "Navegação" });
    expect(sheet.className).toContain("slide-in-from-left");
    await expectNoAxeViolations(document.body);
    await user.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
