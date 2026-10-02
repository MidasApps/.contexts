import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, ok } from "#/shared/testing/fake-api.ts";
import { buildMe } from "#/shared/testing/fixtures.ts";
import type { ShellNavItem } from "#/shared/lib/shell/shell-types.ts";
import { SidebarTrigger } from "#/shared/ui/organisms/Sidebar/Sidebar.tsx";
import { SidebarProvider } from "#/shared/ui/organisms/Sidebar/sidebar-context.tsx";
import { isAdminAreaActive } from "../model/use-admin-items.ts";
import { AdminSidebar } from "./AdminSidebar.tsx";

const STAFF_ONLY_ITEM: ShellNavItem = {
  id: "core.admin.staff",
  slot: "admin",
  labelKey: "shell.nav.admin.users",
  icon: "shield",
  permission: "platform.staff.manage",
  order: 5,
  target: { kind: "admin", rest: "staff" },
};

const renderSidebar = (path: string, role: "platform-admin" | "platform-support" = "platform-support", routes = {}) =>
  renderApp(
    <SidebarProvider>
      <AdminSidebar footer={<p>rodapé</p>} />
    </SidebarProvider>,
    { path, navigation: [STAFF_ONLY_ITEM], routes: { "GET /v1/me": ok(buildMe({ isPlatformStaff: true, platformRole: role })), ...routes } },
  );

describe("AdminSidebar", () => {
  it("lists the admin areas the staff role may open and marks the current one", async () => {
    const { container } = renderSidebar("/admin/users");
    const nav = screen.getByRole("navigation", { name: "Áreas da administração" });
    // Grouped by what staff come to do, each group a labelled list (UX review U-30).
    const customers = await within(nav).findByRole("list", { name: "Clientes" });
    expect(within(customers).getAllByRole("link").map((link) => link.textContent)).toEqual(["Organizações", "Usuários"]);
    expect(within(within(nav).getByRole("list", { name: "IA" })).getAllByRole("link").map((link) => link.textContent)).toEqual(["Traces", "Logs", "Custos"]);
    expect(within(within(nav).getByRole("list", { name: "Operação" })).getAllByRole("link").map((link) => link.textContent)).toEqual(["Conectores"]);
    expect(within(customers).getByRole("link", { name: "Usuários" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: "Voltar ao app" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Administração" }).getAttribute("href")).toBe("/admin");
    expect(screen.getByText("rodapé")).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("shows an area that needs a stronger role only to that role", async () => {
    const support = renderSidebar("/admin");
    await screen.findByRole("list", { name: "Clientes" });
    expect(screen.getAllByRole("link", { name: "Usuários" })).toHaveLength(1);
    support.unmount();

    renderSidebar("/admin", "platform-admin");
    await screen.findByRole("list", { name: "Clientes" });
    // A contributed area without a group sits under "Outras", after the core groups.
    expect(screen.getAllByRole("link", { name: "Usuários" }).map((link) => link.getAttribute("href"))).toEqual(["/admin/users", "/admin/staff"]);
    expect(within(screen.getByRole("list", { name: "Outras" })).getByRole("link", { name: "Usuários" }).getAttribute("href")).toBe("/admin/staff");
  });

  it("offers a retry when the profile cannot be read", async () => {
    renderSidebar("/admin", "platform-support", { "GET /v1/me": apiError(503, "INTERNAL_ERROR") });
    expect(await screen.findByRole("button", { name: "Tentar novamente" }, { timeout: 8000 })).toBeDefined();
  }, 15_000);

  it("treats an area's sub-pages as the area", () => {
    expect(isAdminAreaActive({ id: "admin", rest: "users" }, "/admin/users/u-1")).toBe(true);
    expect(isAdminAreaActive({ id: "admin", rest: "users" }, "/admin/users-archive")).toBe(false);
    expect(isAdminAreaActive({ id: "admin", rest: "" }, "/admin/users")).toBe(false);
  });
  it("closes the phone sheet after moving to another admin area", async () => {
    const matchMedia = globalThis.matchMedia;
    globalThis.matchMedia = (query: string) => ({ ...matchMedia(query), matches: query.includes("max-width") });
    try {
      const { user, router } = renderApp(
        <SidebarProvider>
          <SidebarTrigger />
          <AdminSidebar footer={<p>rodapé</p>} />
        </SidebarProvider>,
        { path: "/admin", routes: { "GET /v1/me": ok(buildMe({ isPlatformStaff: true, platformRole: "platform-support" })) } },
      );
      await user.click(await screen.findByRole("button", { name: "Mostrar ou ocultar a barra lateral" }));
      expect(await screen.findByRole("dialog", { name: "Navegação" })).toBeDefined();
      act(() => router.navigate({ id: "admin", rest: "users" }));
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Navegação" })).toBeNull());
    } finally {
      globalThis.matchMedia = matchMedia;
    }
  });
});
