import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { Sidebar, SidebarTrigger } from "#/shared/ui/organisms/Sidebar/Sidebar.tsx";
import { AppShellTemplate } from "./AppShellTemplate.tsx";

const SIDEBAR = (
  <Sidebar>
    <nav aria-label="Principal">
      <a href="/home">Início</a>
    </nav>
  </Sidebar>
);

describe("AppShellTemplate", () => {
  it("has one main, a banner and a skip link that is the first stop and focuses main", async () => {
    const { user, container } = renderWithProviders(
      <AppShellTemplate sidebar={SIDEBAR} topbar={<SidebarTrigger />}>
        <h1>Projetos</h1>
      </AppShellTemplate>,
    );
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("banner")).toBeDefined();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Pular para o conteúdo principal" }));
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByRole("main"));
    expect(screen.getByRole("main").id).toBe("main");
    await expectNoAxeViolations(container);
  });

  it("renders the right panel as a labelled complementary landmark", async () => {
    const { container } = renderWithProviders(
      <AppShellTemplate
        sidebar={SIDEBAR}
        topbar={<SidebarTrigger />}
        rightPanel={{ label: "Assistente", content: <p>Painel</p>, open: true, onOpenChange: vi.fn() }}
      >
        <h1>Projeto</h1>
      </AppShellTemplate>,
    );
    expect(screen.getByRole("complementary", { name: "Assistente" }).textContent).toBe("Painel");
    await expectNoAxeViolations(container);
  });

  it("uses a sheet for the right panel on compact screens", async () => {
    renderWithProviders(
      <AppShellTemplate
        sidebar={SIDEBAR}
        topbar={<SidebarTrigger />}
        compactRightPanel
        rightPanel={{ label: "Assistente", content: <p>Painel</p>, open: true, onOpenChange: vi.fn() }}
      >
        <h1>Projeto</h1>
      </AppShellTemplate>,
    );
    const sheet = await screen.findByRole("dialog", { name: "Assistente" });
    // The panel content carries its own close in its header; a corner X would cover its actions.
    expect(within(sheet).queryByRole("button", { name: "Fechar" })).toBeNull();
  });

  it("persists the sidebar state through the injected callback", async () => {
    const persist = vi.fn();
    const { user } = renderWithProviders(
      <AppShellTemplate
        sidebar={SIDEBAR}
        topbar={<SidebarTrigger />}
        sidebarDefaultOpen={false}
        persistSidebarState={persist}
      >
        <h1>Projeto</h1>
      </AppShellTemplate>,
    );
    await user.click(screen.getByRole("button", { name: "Mostrar ou ocultar a barra lateral" }));
    expect(persist).toHaveBeenCalledWith(true);
  });
});
