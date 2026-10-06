import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { NoAccessState } from "./NoAccessState.tsx";

describe("NoAccessState", () => {
  it("explains the missing permission and what to do next", async () => {
    const { container } = renderWithProviders(
      <NoAccessState action={<Button variant="secondary">Voltar ao início</Button>} />,
      {
        locale: "es-419",
      },
    );
    expect(screen.getByRole("heading", { name: "No tienes acceso a esta página" })).toBeDefined();
    expect(screen.getByText("Pide a un administrador de la organización que te dé acceso.")).toBeDefined();
    expect(container.querySelector("[data-state=no-access]")).not.toBeNull();
    await expectNoAxeViolations(container);
  });
});
