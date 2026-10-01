import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { EmptyState } from "./EmptyState.tsx";

describe("EmptyState", () => {
  it("shows a titled dashed panel with one action", async () => {
    const { container } = renderWithProviders(
      <EmptyState
        icon="folder"
        title="Nenhum projeto ainda"
        description="Crie o primeiro projeto para organizar o trabalho."
        action={<Button>Criar projeto</Button>}
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Nenhum projeto ainda" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Criar projeto" })).toBeDefined();
    const panel = container.querySelector("[data-state=empty]");
    expect(panel?.className).toContain("border-dashed");
    await expectNoAxeViolations(container);
  });

  it("adapts the heading level and frame to its container", () => {
    const { container } = renderWithProviders(<EmptyState title="Sem resultados" headingLevel={3} frame="plain" />);
    expect(screen.getByRole("heading", { level: 3, name: "Sem resultados" })).toBeDefined();
    expect(container.querySelector("[data-state=empty]")?.className).not.toContain("border-dashed");
  });
});
