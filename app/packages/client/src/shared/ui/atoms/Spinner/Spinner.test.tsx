import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Spinner } from "./Spinner.tsx";

describe("Spinner", () => {
  it("is a status with a translated label by default", async () => {
    const { container } = renderWithProviders(<Spinner />, { locale: "en-US" });
    expect(screen.getByRole("status", { name: "Loading…" })).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("accepts a custom label or stays decorative", () => {
    const { container } = renderWithProviders(
      <>
        <Spinner label="Enviando convite" />
        <Spinner decorative />
      </>,
    );
    expect(screen.getByRole("status", { name: "Enviando convite" })).toBeDefined();
    expect(container.querySelectorAll("[aria-hidden=true][data-slot=spinner]")).toHaveLength(1);
  });
});
