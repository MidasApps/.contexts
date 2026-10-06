import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { StatusPill } from "./StatusPill.tsx";

describe("StatusPill", () => {
  it("states the status in words with the AA text token and a decorative mark", async () => {
    const { container } = renderWithProviders(
      <p>
        <StatusPill tone="amber">Pendente</StatusPill>
        <StatusPill tone="emerald" icon="circle-check">
          Aprovado
        </StatusPill>
        <StatusPill tone="danger">Recusado</StatusPill>
      </p>,
    );
    const pending = screen.getByText("Pendente");
    expect(pending.className).toContain("text-amber-foreground");
    expect(pending.className).toContain("bg-amber/14");
    expect(pending.querySelector("[data-slot=status-mark]")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("Recusado").className).toContain("text-destructive-text");
    expect(screen.getByText("Aprovado").querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    await expectNoAxeViolations(container);
  });
});
