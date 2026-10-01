import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { PageHeader } from "./PageHeader.tsx";

describe("PageHeader", () => {
  it("renders the page h1 with context, description, status and actions", async () => {
    const { container } = renderWithProviders(
      <PageHeader eyebrow="Northwind" title="Launch" description="Rollout of the new catalog." meta={<span>Arquivado</span>} actions={<Button>Criar</Button>} />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Launch" })).toBeDefined();
    expect(screen.getByText("Northwind")).toBeDefined();
    expect(screen.getByText("Rollout of the new catalog.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Criar" })).toBeDefined();
    await expectNoAxeViolations(container);
  });
});
