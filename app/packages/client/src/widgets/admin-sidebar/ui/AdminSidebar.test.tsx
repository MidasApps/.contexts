import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { MEMBER_PERMISSIONS, shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import type { ShellNavItem } from "#/shared/lib/shell/shell-types.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, ok } from "#/shared/testing/fake-api.ts";
import { buildMe, IDS } from "#/shared/testing/fixtures.ts";
import { SidebarTrigger } from "#/shared/ui/organisms/Sidebar/Sidebar.tsx";
import { SidebarProvider } from "#/shared/ui/organisms/Sidebar/sidebar-context.tsx";
import { adminContextOf, isAdminAreaActive } from "../model/use-admin-items.ts";
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

const SIDEBAR = (
  <SidebarProvider>
    <AdminSidebar header={<p>cabeçalho</p>} footer={<p>rodapé</p>} />
  </SidebarProvider>
);

const staffMe = (role: "platform-admin" | "platform-support", lastOrganization?: string) =>
  ok(
    buildMe({
      isPlatformStaff: true,
      platformRole: role,
      lastContext: lastOrganization === undefined ? {} : { organizationId: lastOrganization },
    }),
  );

const renderPlatform = (path: string, role: "platform-admin" | "platform-support" = "platform-support", routes = {}) =>
  renderApp(SIDEBAR, {
    path,
    navigation: [STAFF_ONLY_ITEM],
    routes: { "GET /v1/me": staffMe(role), ...routes },
  });

const linkTexts = (list: HTMLElement): (string | null)[] =>
  within(list)
    .getAllByRole("link")
    .map((link) => link.textContent);

describe("AdminSidebar in an organization", () => {
  it("lists the settings sections the member may read, grouped, with the way back to the app", async () => {
    const { container } = renderApp(SIDEBAR, {
      path: `/admin/o/${IDS.organization}/members`,
      routes: shellRoutes(MEMBER_PERMISSIONS),
    });
    const nav = screen.getByRole("navigation", { name: "Seções da administração" });
    const organization = await within(nav).findByRole("list", { name: "Organização" });
    expect(linkTexts(organization)).toEqual(["Geral", "Membros", "Unidades"]);
    expect(within(organization).getByRole("link", { name: "Membros" }).getAttribute("aria-current")).toBe("page");
    expect(within(organization).getByRole("link", { name: "Geral" }).getAttribute("href")).toBe(
      `/admin/o/${IDS.organization}/general`,
    );
    // Sections the viewer cannot read are not offered, and members never see the platform console.
    expect(within(nav).queryByRole("list", { name: "IA" })).toBeNull();
    const goTo = within(nav).getByRole("list", { name: "Ir para" });
    expect(linkTexts(goTo)).toEqual(["Abrir a aplicação"]);
    expect(within(goTo).getByRole("link", { name: "Abrir a aplicação" }).getAttribute("href")).toBe(
      `/o/${IDS.organization}`,
    );
    expect(screen.getByText("cabeçalho")).toBeDefined();
    expect(screen.getByText("rodapé")).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("keeps a section current on its detail pages", async () => {
    renderApp(SIDEBAR, {
      path: `/admin/o/${IDS.organization}/workflows/runs/run-1`,
      routes: shellRoutes([...MEMBER_PERMISSIONS, "core.workflow-run.read"]),
    });
    const operations = await screen.findByRole("list", { name: "Operação" });
    expect(within(operations).getByRole("link", { name: "Fluxos e agendamentos" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("offers staff the platform console", async () => {
    renderApp(SIDEBAR, {
      path: `/admin/o/${IDS.organization}/general`,
      routes: shellRoutes(MEMBER_PERMISSIONS, { "GET /v1/me": staffMe("platform-admin", IDS.organization) }),
    });
    const goTo = await screen.findByRole("list", { name: "Ir para" });
    await waitFor(() => expect(linkTexts(goTo)).toEqual(["Console da plataforma", "Abrir a aplicação"]));
    expect(within(goTo).getByRole("link", { name: "Console da plataforma" }).getAttribute("href")).toBe(
      "/admin/platform",
    );
  });

  it("asks a user without organizations to choose one", async () => {
    renderApp(SIDEBAR, {
      path: "/admin",
      routes: { "GET /v1/me": ok(buildMe({ lastContext: {} })) },
    });
    const choose = await screen.findByRole("link", { name: "Escolher uma organização" });
    expect(choose.getAttribute("href")).toBe("/organizations");
  });
});

describe("AdminSidebar in the account", () => {
  it("lists the profile sections and the way back to the organization's settings", async () => {
    renderApp(SIDEBAR, { path: "/admin/profile/security", routes: shellRoutes(MEMBER_PERMISSIONS) });
    const account = await screen.findByRole("list", { name: "Minha conta" });
    expect(linkTexts(account)).toEqual(["Conta", "Preferências", "Segurança", "Sessões", "Notificações"]);
    expect(within(account).getByRole("link", { name: "Segurança" }).getAttribute("aria-current")).toBe("page");
    const goTo = screen.getByRole("list", { name: "Ir para" });
    await waitFor(() =>
      expect(within(goTo).getByRole("link", { name: "Configurações da organização" }).getAttribute("href")).toBe(
        `/admin/o/${IDS.organization}`,
      ),
    );
  });
});

describe("AdminSidebar in the platform console", () => {
  it("lists the areas the staff role may open, grouped", async () => {
    const { container } = renderPlatform("/admin/platform/users");
    const nav = screen.getByRole("navigation", { name: "Seções da administração" });
    // Grouped by what staff come to do, each group a labelled list (UX review U-30).
    const customers = await within(nav).findByRole("list", { name: "Clientes" });
    expect(linkTexts(customers)).toEqual(["Organizações", "Usuários"]);
    expect(linkTexts(within(nav).getByRole("list", { name: "IA" }))).toEqual(["Traces", "Logs", "Custos"]);
    expect(linkTexts(within(nav).getByRole("list", { name: "Operação" }))).toEqual(["Conectores", "Auditoria"]);
    expect(within(customers).getByRole("link", { name: "Usuários" }).getAttribute("aria-current")).toBe("page");
    expect(within(customers).getByRole("link", { name: "Usuários" }).getAttribute("href")).toBe(
      "/admin/platform/users",
    );
    expect(linkTexts(within(nav).getByRole("list", { name: "Ir para" }))).toEqual(["Abrir a aplicação"]);
    await expectNoAxeViolations(container);
  });

  it("shows an area that needs a stronger role only to that role", async () => {
    const support = renderPlatform("/admin/platform");
    await screen.findByRole("list", { name: "Clientes" });
    expect(screen.getAllByRole("link", { name: "Usuários" })).toHaveLength(1);
    support.unmount();

    renderPlatform("/admin/platform", "platform-admin");
    await screen.findByRole("list", { name: "Clientes" });
    // A contributed area without a group sits under "Outras", after the core groups.
    expect(screen.getAllByRole("link", { name: "Usuários" }).map((link) => link.getAttribute("href"))).toEqual([
      "/admin/platform/users",
      "/admin/platform/staff",
    ]);
    expect(
      within(screen.getByRole("list", { name: "Outras" }))
        .getByRole("link", { name: "Usuários" })
        .getAttribute("href"),
    ).toBe("/admin/platform/staff");
  });

  it("offers a retry when the profile cannot be read", async () => {
    renderPlatform("/admin/platform", "platform-support", { "GET /v1/me": apiError(503, "INTERNAL_ERROR") });
    expect(await screen.findByRole("button", { name: "Tentar novamente" }, { timeout: 8000 })).toBeDefined();
  }, 15_000);

  it("closes the phone sheet after moving to another area", async () => {
    const matchMedia = globalThis.matchMedia;
    globalThis.matchMedia = (query: string) => ({ ...matchMedia(query), matches: query.includes("max-width") });
    try {
      const { user, router } = renderApp(
        <SidebarProvider>
          <SidebarTrigger />
          <AdminSidebar header={<p>cabeçalho</p>} footer={<p>rodapé</p>} />
        </SidebarProvider>,
        { path: "/admin/platform", routes: { "GET /v1/me": staffMe("platform-support") } },
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

describe("admin sidebar model", () => {
  it("treats a section's sub-pages as the section", () => {
    expect(isAdminAreaActive({ id: "admin", rest: "users" }, "/admin/platform/users/u-1")).toBe(true);
    expect(isAdminAreaActive({ id: "admin", rest: "users" }, "/admin/platform/users-archive")).toBe(false);
    expect(isAdminAreaActive({ id: "admin", rest: "" }, "/admin/platform/users")).toBe(false);
    expect(isAdminAreaActive({ id: "settings", organizationId: "o", section: "traces" }, "/admin/o/o/traces/t1")).toBe(
      true,
    );
  });

  it("tells which part of the administration a path is in", () => {
    expect(adminContextOf("/admin/platform/users")).toBe("platform");
    expect(adminContextOf("/admin/profile/account")).toBe("account");
    expect(adminContextOf("/admin/o/org-1/members")).toBe("organization");
    expect(adminContextOf("/admin")).toBe("organization");
  });
});
