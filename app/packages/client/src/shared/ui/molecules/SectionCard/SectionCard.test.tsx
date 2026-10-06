import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { SectionCard } from "./SectionCard.tsx";

describe("SectionCard", () => {
  it("is a region named by its h2, with description and actions", async () => {
    const { container } = renderWithProviders(
      <main>
        <h1>Página</h1>
        <SectionCard title="Senha" description="Troque a senha." actions={<button type="button">Ação</button>}>
          <p>Conteúdo</p>
        </SectionCard>
      </main>,
    );
    expect(screen.getByRole("region", { name: "Senha" })).toBeDefined();
    expect(screen.getByRole("heading", { level: 2, name: "Senha" })).toBeDefined();
    expect(screen.getByText("Troque a senha.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Ação" })).toBeDefined();
    await expectNoAxeViolations(container);
  });
});
