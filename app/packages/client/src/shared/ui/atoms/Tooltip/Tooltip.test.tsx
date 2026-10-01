import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./Tooltip.tsx";

describe("Tooltip", () => {
  it("opens on keyboard focus, describes the trigger and closes with Escape", async () => {
    const { user } = renderWithProviders(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" aria-label="Copiar">
              C
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copiar para a área de transferência</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    await user.tab();
    const trigger = screen.getByRole("button", { name: "Copiar" });
    expect(document.activeElement).toBe(trigger);
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent).toContain("Copiar para a área de transferência");
    expect(trigger.getAttribute("aria-describedby")).toBe(tooltip.id);
    await expectNoAxeViolations(document.body);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
