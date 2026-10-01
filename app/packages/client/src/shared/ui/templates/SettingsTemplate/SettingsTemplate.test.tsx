import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { SettingsTemplate } from "./SettingsTemplate.tsx";

describe("SettingsTemplate", () => {
  it("renders a labelled section navigation next to the content", async () => {
    const { container } = renderWithProviders(
      <main>
        <SettingsTemplate
          header={<h1>Configurações</h1>}
          navigationLabel="Seções das configurações"
          navigation={
            <ul>
              <li>
                <a href="/settings/general" aria-current="page">
                  Geral
                </a>
              </li>
              <li>
                <a href="/settings/members">Membros</a>
              </li>
            </ul>
          }
        >
          <h2>Geral</h2>
        </SettingsTemplate>
      </main>,
    );
    const nav = screen.getByRole("navigation", { name: "Seções das configurações" });
    expect(nav.querySelector("[aria-current=page]")?.textContent).toBe("Geral");
    expect(screen.getByRole("heading", { level: 2, name: "Geral" })).toBeDefined();
    await expectNoAxeViolations(container);
  });
});
