import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { LoadingState } from "./LoadingState.tsx";

describe("LoadingState", () => {
  it("announces what is loading once and hides the skeleton bars", async () => {
    const { container } = renderWithProviders(<LoadingState label="Carregando membros" rows={4} />);
    const status = screen.getByRole("status", { name: "" });
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.textContent).toBe("Carregando membros");
    expect(container.querySelectorAll("[data-slot=skeleton][aria-hidden=true]")).toHaveLength(4);
    await expectNoAxeViolations(container);
  });

  it("shows a spinner with visible text", async () => {
    const { container } = renderWithProviders(<LoadingState variant="spinner" />, { locale: "en-US" });
    expect(screen.getByText("Loading…")).toBeDefined();
    expect(container.querySelector("[data-slot=spinner]")?.getAttribute("aria-hidden")).toBe("true");
    await expectNoAxeViolations(container);
  });
});
