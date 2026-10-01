import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { SettingsSlotView } from "./SettingsSlotView.tsx";

const renderView = (section: string, permissions: string[]) =>
  renderApp(
    <main>
      <SettingsSlotView />
    </main>,
    { path: `/o/${IDS.organization}/settings/${section}`, routes: shellRoutes(["core.organization.read", ...permissions] as never) },
  );

describe("SettingsSlotView", () => {
  it.each([
    ["connectors", "core.connector.read", "Nenhum conector disponível ainda"],
    ["agents", "core.agent-settings.read", "Nenhuma configuração de agentes ainda"],
    ["usage", "core.usage.read", "Nenhum dado de uso ainda"],
  ])("renders the %s slot empty state with a way back", async (section, permission, title) => {
    const { container } = renderView(section, [permission]);
    expect(await screen.findByRole("heading", { name: title })).toBeDefined();
    expect(screen.getByRole("link", { name: "Ir para Geral" }).getAttribute("href")).toBe(`/o/${IDS.organization}/settings/general`);
    await expectNoAxeViolations(container);
  });

  it("shows no-access without the slot permission and not-found for another section", async () => {
    const denied = renderView("usage", []);
    expect(await screen.findByRole("heading", { name: "Você não tem acesso a esta página" })).toBeDefined();
    denied.unmount();
    renderView("general", []);
    expect(await screen.findByRole("heading", { level: 1, name: "Página não encontrada" })).toBeDefined();
  });
});
