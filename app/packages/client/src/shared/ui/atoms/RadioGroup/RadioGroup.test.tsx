import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { RadioGroup, RadioGroupItem } from "./RadioGroup.tsx";

const OPTIONS = ["private", "team", "public"] as const;

const Visibility = () => (
  <RadioGroup aria-label="Visibilidade" defaultValue="private">
    {OPTIONS.map((value) => (
      <div key={value} className="flex items-center gap-2">
        <RadioGroupItem value={value} id={`v-${value}`} />
        <Label htmlFor={`v-${value}`}>{value}</Label>
      </div>
    ))}
  </RadioGroup>
);

describe("RadioGroup", () => {
  it("moves and selects with the arrow keys", async () => {
    const { user, container } = renderWithProviders(<Visibility />);
    screen.getByRole("radio", { name: "private" }).focus();
    // Radix selects on focus while the arrow key is held; roving focus moves in a timeout, so hold then release.
    await user.keyboard("{ArrowDown>}");
    await user.keyboard("{/ArrowDown}");
    const second = screen.getByRole("radio", { name: "team" });
    expect(document.activeElement).toBe(second);
    expect(second.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radiogroup", { name: "Visibilidade" })).toBeDefined();
    await expectNoAxeViolations(container);
  });
});
