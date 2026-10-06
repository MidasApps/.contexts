import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Checkbox } from "./Checkbox.tsx";

describe("Checkbox", () => {
  it("toggles with Space and exposes the checked state", async () => {
    const { user, container } = renderWithProviders(
      <div className="flex items-center gap-2">
        <Checkbox id="weekly" />
        <Label htmlFor="weekly">Resumo semanal</Label>
      </div>,
    );
    const checkbox = screen.getByRole("checkbox", { name: "Resumo semanal" });
    expect(checkbox.getAttribute("aria-checked")).toBe("false");
    checkbox.focus();
    await user.keyboard(" ");
    expect(checkbox.getAttribute("aria-checked")).toBe("true");
    expect(checkbox.className).toContain("data-[state=checked]:bg-sidebar-primary");
    await expectNoAxeViolations(container);
  });

  it("reports the indeterminate state", () => {
    renderWithProviders(<Checkbox aria-label="Todos" checked="indeterminate" />);
    expect(screen.getByRole("checkbox", { name: "Todos" }).getAttribute("aria-checked")).toBe("mixed");
  });
});
