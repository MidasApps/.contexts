import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { MEMBER_PERMISSIONS, shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError } from "#/shared/testing/fake-api.ts";
import { buildAccessContext, IDS } from "#/shared/testing/fixtures.ts";
import { SidebarTrigger } from "#/shared/ui/organisms/Sidebar/Sidebar.tsx";
import { SidebarProvider } from "#/shared/ui/organisms/Sidebar/sidebar-context.tsx";
import { isRouteActive } from "../model/active-route.ts";
import { AppSidebar } from "./AppSidebar.tsx";

const renderSidebar = (path: string, routes = shellRoutes(MEMBER_PERMISSIONS)) =>
  renderApp(
    <SidebarProvider>
      <AppSidebar header={<p>cabeçalho</p>} context={<p>contexto</p>} footer={<p>rodapé</p>} />
    </SidebarProvider>,
    { path, routes },
  );

describe("AppSidebar", () => {
  it("groups the project and organization slots and marks the current section", async () => {
    const { container } = renderSidebar(`/o/${IDS.organization}/settings/members`);
    const nav = screen.getByRole("navigation", { name: "Navegação" });
    const organization = await within(nav).findByRole("list", { name: "Organização" });
    expect(within(organization).getByRole("link", { name: "Configurações" }).getAttribute("aria-current")).toBe("page");
    expect(within(organization).getByRole("link", { name: "Projetos" }).getAttribute("aria-current")).toBeNull();
    expect(within(nav).queryByRole("list", { name: "Projeto" })).toBeNull();
    expect(screen.getByText("contexto")).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("hides items without permission and offers a retry when the access context fails", async () => {
    const only = renderSidebar(
      `/o/${IDS.organization}`,
      shellRoutes([], {
        "GET /v1/me/context": { status: 200, body: { data: buildAccessContext({ permissions: [] }) } },
      }),
    );
    await waitFor(() => expect(screen.queryByRole("status", { name: "Carregando a navegação…" })).toBeNull());
    expect(screen.queryByRole("link", { name: "Projetos" })).toBeNull();
    only.unmount();

    const failing = renderSidebar(
      `/o/${IDS.organization}`,
      shellRoutes(MEMBER_PERMISSIONS, { "GET /v1/me/context": apiError(503, "INTERNAL_ERROR") }),
    );
    expect(await screen.findByRole("status", { name: "Carregando a navegação…" })).toBeDefined();
    expect(await screen.findByRole("button", { name: "Recarregar a navegação" }, { timeout: 8000 })).toBeDefined();
    await expectNoAxeViolations(failing.container);
  }, 15_000);

  it("closes the phone sheet when the route changes (organization or project switch, nav item)", async () => {
    const matchMedia = globalThis.matchMedia;
    globalThis.matchMedia = (query: string) => ({ ...matchMedia(query), matches: query.includes("max-width") });
    try {
      const { user, router, container } = renderApp(
        <SidebarProvider>
          <SidebarTrigger />
          <AppSidebar header={<p>cabeçalho</p>} footer={<p>rodapé</p>} />
        </SidebarProvider>,
        { path: `/o/${IDS.organization}`, routes: shellRoutes(MEMBER_PERMISSIONS) },
      );
      await user.click(await screen.findByRole("button", { name: "Mostrar ou ocultar a barra lateral" }));
      expect(await screen.findByRole("dialog", { name: "Navegação" })).toBeDefined();
      await expectNoAxeViolations(container);

      act(() => router.navigate({ id: "project", organizationId: IDS.organization, projectId: IDS.project }));
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Navegação" })).toBeNull());
    } finally {
      globalThis.matchMedia = matchMedia;
    }
  });

  it("matches sections and module sub-pages as active", () => {
    expect(isRouteActive({ id: "settings", organizationId: "o", section: "general" }, "/o/o/settings/roles")).toBe(
      true,
    );
    expect(
      isRouteActive(
        { id: "module", organizationId: "o", projectId: "p", moduleId: "m", rest: "" },
        "/o/o/p/p/m/m/items/1",
      ),
    ).toBe(true);
    expect(isRouteActive({ id: "project", organizationId: "o", projectId: "p" }, "/o/o/p/p/m/m")).toBe(false);
    expect(isRouteActive({ id: "chat", organizationId: "o", projectId: "p" }, "/o/o/p/p/chat/c1")).toBe(true);
    expect(isRouteActive({ id: "project", organizationId: "o", projectId: "p" }, "/o/o/p/p/chat")).toBe(false);
  });
});
