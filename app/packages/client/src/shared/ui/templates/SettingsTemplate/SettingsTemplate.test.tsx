import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { SettingsTemplate } from "./SettingsTemplate.tsx";

describe("SettingsTemplate", () => {
  it("renders the header above the section content, with no navigation of its own", async () => {
    const { container } = renderWithProviders(
      <main>
        <SettingsTemplate header={<h1>Membros</h1>}>
          <h2>Pessoas</h2>
        </SettingsTemplate>
      </main>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Membros" })).toBeDefined();
    expect(screen.getByRole("heading", { level: 2, name: "Pessoas" })).toBeDefined();
    expect(screen.queryByRole("navigation")).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("spaces the blocks of a section and caps it for reading by default", () => {
    renderWithProviders(
      <SettingsTemplate header={<h1>Uso</h1>}>
        <p>Mês</p>
        <p>Resumo</p>
      </SettingsTemplate>,
    );
    const section = screen.getByText("Mês").parentElement;
    expect(section?.className).toContain("gap-6");
    expect(section?.className).toContain("max-w-[720px]");
    expect(section?.getAttribute("data-width")).toBe("reading");
  });

  it("lets list sections use the full width", () => {
    renderWithProviders(
      <SettingsTemplate header={<h1>Traces</h1>} width="wide">
        <p>Tabela</p>
      </SettingsTemplate>,
    );
    const section = screen.getByText("Tabela").parentElement;
    expect(section?.className).not.toContain("max-w-[720px]");
    expect(section?.getAttribute("data-width")).toBe("wide");
  });
});
