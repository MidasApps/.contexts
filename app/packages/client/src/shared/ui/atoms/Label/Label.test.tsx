import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Label } from "./Label.tsx";

describe("Label", () => {
  it("names its control and moves focus to it on click", async () => {
    const { user, container } = renderWithProviders(
      <>
        <Label htmlFor="email">E-mail</Label>
        <input id="email" type="email" />
      </>,
    );
    await user.click(screen.getByText("E-mail"));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "E-mail" }));
    await expectNoAxeViolations(container);
  });
});
