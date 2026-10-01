import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { SkipLink } from "./SkipLink.tsx";

describe("SkipLink", () => {
  it("is hidden until focused and moves focus to the main region", async () => {
    const { user, container } = renderWithProviders(
      <>
        <SkipLink />
        <button type="button">Menu</button>
        <main id="main" tabIndex={-1}>
          Conteúdo
        </main>
      </>,
    );
    await user.tab();
    const link = screen.getByRole("link", { name: "Pular para o conteúdo principal" });
    expect(document.activeElement).toBe(link);
    expect(link.className).toContain("focus:not-sr-only");
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByRole("main"));
    await expectNoAxeViolations(container);
  });
});
