import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Switch } from "./Switch.tsx";

describe("Switch", () => {
  it("toggles with Space and reports the change", async () => {
    const onCheckedChange = vi.fn();
    const { user, container } = renderWithProviders(
      <Switch aria-label="Auto-salvar" onCheckedChange={onCheckedChange} />,
    );
    const control = screen.getByRole("switch", { name: "Auto-salvar" });
    control.focus();
    await user.keyboard(" ");
    expect(control.getAttribute("aria-checked")).toBe("true");
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    await expectNoAxeViolations(container);
  });

  it("uses the sidebar-primary token when on", () => {
    renderWithProviders(<Switch aria-label="Modo" defaultChecked size="sm" />);
    const control = screen.getByRole("switch", { name: "Modo" });
    expect(control.className).toContain("data-[state=checked]:bg-sidebar-primary");
    expect(control.dataset["size"]).toBe("sm");
  });
});
