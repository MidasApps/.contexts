import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Separator } from "./Separator.tsx";

describe("Separator", () => {
  it("is decorative by default and semantic on request", async () => {
    const { container } = renderWithProviders(
      <div>
        <Separator />
        <Separator decorative={false} orientation="vertical" />
      </div>,
    );
    const separators = screen.getAllByRole("separator", { hidden: false });
    expect(separators).toHaveLength(1);
    expect(separators[0]?.getAttribute("aria-orientation")).toBe("vertical");
    expect(container.querySelectorAll("[data-slot=separator]")).toHaveLength(2);
    await expectNoAxeViolations(container);
  });
});
