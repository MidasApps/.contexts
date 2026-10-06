import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./Card.tsx";

describe("Card", () => {
  it("renders a flat card surface with a heading at the chosen level", async () => {
    const { container } = renderWithProviders(
      <Card>
        <CardHeader>
          <CardTitle as="h2">Novo projeto</CardTitle>
          <CardDescription>Organize unidades e membros.</CardDescription>
        </CardHeader>
        <CardContent>…</CardContent>
        <CardFooter>
          <Button>Começar</Button>
        </CardFooter>
      </Card>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Novo projeto" })).toBeDefined();
    const card = container.querySelector("[data-slot=card]");
    expect(card?.className).toContain("bg-card");
    expect(card?.className).not.toContain("shadow");
    await expectNoAxeViolations(container);
  });
});
