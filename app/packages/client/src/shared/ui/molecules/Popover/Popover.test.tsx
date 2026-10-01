import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover.tsx";

describe("Popover", () => {
  it("opens as a non-modal dialog and returns focus on Escape", async () => {
    const { user } = renderWithProviders(
      <Popover>
        <PopoverTrigger asChild>
          <Button>Filtros</Button>
        </PopoverTrigger>
        <PopoverContent aria-label="Filtros">
          <Button variant="ghost">Aplicar</Button>
        </PopoverContent>
      </Popover>,
    );
    const trigger = screen.getByRole("button", { name: "Filtros" });
    await user.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const content = await screen.findByRole("dialog", { name: "Filtros" });
    expect(content.className).toContain("bg-popover");
    await expectNoAxeViolations(document.body);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
