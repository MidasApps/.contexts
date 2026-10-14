import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createFakeAuth } from "#/shared/lib/auth/fake-auth.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { ok } from "#/shared/testing/fake-api.ts";
import { buildMe, IDS } from "#/shared/testing/fixtures.ts";
import { TEST_USER } from "#/shared/testing/render-client.tsx";
import { AdminLayout } from "./admin-layout.tsx";
import { renderApp } from "./testing/render-app.tsx";
import { MEMBER_PERMISSIONS, shellRoutes } from "./testing/shell-routes.ts";

const STAFF_ME = ok(buildMe({ isPlatformStaff: true, platformRole: "platform-admin" }));
const PAGE = (
  <AdminLayout>
    <h1>Página</h1>
  </AdminLayout>
);

describe("AdminLayout", () => {
  it("frames an organization's settings with its sections, the trail and the way back to the app", async () => {
    const { container } = renderApp(PAGE, {
      path: `/admin/o/${IDS.organization}/members`,
      routes: shellRoutes(MEMBER_PERMISSIONS),
    });
    const nav = screen.getByRole("navigation", { name: "Seções da administração" });
    expect(await within(nav).findByRole("link", { name: "Membros" })).toBeDefined();
    const banner = screen.getByRole("banner");
    expect(within(banner).getByText("Administração")).toBeDefined();
    expect(within(banner).getByText("Organização")).toBeDefined();
    expect(within(banner).getByText("Membros")).toBeDefined();
    // The staff badge belongs to the platform console only.
    expect(within(banner).queryByText("Equipe da plataforma")).toBeNull();
    expect(within(banner).getByRole("link", { name: "Abrir a aplicação" }).getAttribute("href")).toBe(
      `/o/${IDS.organization}`,
    );
    // No chat while configuring.
    expect(screen.queryByRole("button", { name: "Assistente" })).toBeNull();
    expect(screen.getByRole("main").textContent).toContain("Página");
    expect(await screen.findByRole("button", { name: "Ana Souza, menu da conta" })).toBeDefined();
    expect(container.querySelector("[data-surface='admin']")).not.toBeNull();
    await expectNoAxeViolations(container);
  });

  it("frames the platform console with its areas and the staff badge", async () => {
    renderApp(PAGE, { path: "/admin/platform", routes: { "GET /v1/me": STAFF_ME } });
    const nav = screen.getByRole("navigation", { name: "Seções da administração" });
    expect(await within(nav).findByRole("link", { name: "Organizações" })).toBeDefined();
    const banner = screen.getByRole("banner");
    expect(within(banner).getByText("Console da plataforma")).toBeDefined();
    expect(within(banner).getByText("Equipe da plataforma")).toBeDefined();
  });

  // Follow-up 92: the staff cookie passes the server guard, but the tab's token is the user's.
  it("explains instead of loading the console while the tab is in support mode, and leaves it", async () => {
    const auth = createFakeAuth(TEST_USER);
    const { container, user, router, bridge } = renderApp(PAGE, {
      path: "/admin/platform/organizations",
      auth,
      routes: { "GET /v1/me": STAFF_ME },
    });
    auth.setClaims({ accessVersion: 3, imp: "Im5sK2lPq0WnR5tYu3bV", impBy: "staff-1" });
    expect(
      await screen.findByRole("heading", { name: "O console da plataforma não abre no modo suporte" }),
    ).toBeDefined();
    expect(screen.getByRole("main").textContent).not.toContain("Página");
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("button", { name: "Sair do modo suporte" }));
    await waitFor(() => expect(router.current()).toBe("/admin/platform/users"));
    expect(bridge.left).toBe(1);
  });

  it("opens the organization's settings in support mode, read-only like the user sees them", async () => {
    const auth = createFakeAuth(TEST_USER);
    renderApp(PAGE, {
      path: `/admin/o/${IDS.organization}/general`,
      auth,
      routes: shellRoutes(MEMBER_PERMISSIONS),
    });
    auth.setClaims({ accessVersion: 3, imp: "Im5sK2lPq0WnR5tYu3bV", impBy: "staff-1" });
    await waitFor(() => expect(screen.getByRole("main").textContent).toContain("Página"));
    expect(screen.queryByRole("heading", { name: "O console da plataforma não abre no modo suporte" })).toBeNull();
  });
});
