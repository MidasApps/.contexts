import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { StatePanel } from "./StatePanel.tsx";

describe("StatePanel", () => {
  it("lays out a decorative glyph, a heading at the requested level and the description", async () => {
    const { container } = renderWithProviders(
      <StatePanel icon="lock" tone="amber" headingLevel={3} title="Título" description="Descrição curta." />,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Título" })).toBeDefined();
    expect(screen.getByText("Descrição curta.").className).toContain("text-muted-foreground");
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    await expectNoAxeViolations(container);
  });
});
