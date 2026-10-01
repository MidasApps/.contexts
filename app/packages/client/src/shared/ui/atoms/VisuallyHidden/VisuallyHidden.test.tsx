import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { VisuallyHidden } from "./VisuallyHidden.tsx";

describe("VisuallyHidden", () => {
  it("keeps text in the accessibility tree without showing it", async () => {
    const { container } = renderWithProviders(
      <button type="button">
        <span aria-hidden="true">×</span>
        <VisuallyHidden>Fechar</VisuallyHidden>
      </button>,
    );
    expect(screen.getByRole("button", { name: "Fechar" })).toBeDefined();
    expect(screen.getByText("Fechar").className).toBe("sr-only");
    await expectNoAxeViolations(container);
  });

  it("reappears on focus when focusable (skip links)", () => {
    renderWithProviders(
      <VisuallyHidden asChild focusable>
        <a href="#main">Pular para o conteúdo</a>
      </VisuallyHidden>,
    );
    expect(screen.getByRole("link", { name: "Pular para o conteúdo" }).className).toContain("focus:not-sr-only");
  });
});
