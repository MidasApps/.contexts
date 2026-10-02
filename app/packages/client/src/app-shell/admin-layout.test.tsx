import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { ok } from "#/shared/testing/fake-api.ts";
import { createFakeAuth } from "#/shared/lib/auth/fake-auth.ts";
import { buildMe } from "#/shared/testing/fixtures.ts";
import { TEST_USER } from "#/shared/testing/render-client.tsx";
import { AdminLayout } from "./admin-layout.tsx";
import { renderApp } from "./testing/render-app.tsx";

describe("AdminLayout", () => {
  it("frames admin pages with the admin navigation, the surface name and the user menu", async () => {
    const { container } = renderApp(
      <AdminLayout>
        <h1>Página</h1>
      </AdminLayout>,
      { path: "/admin", routes: { "GET /v1/me": ok(buildMe({ isPlatformStaff: true, platformRole: "platform-admin" })) } },
    );
    const nav = screen.getByRole("navigation", { name: "Áreas da administração" });
    expect(await within(nav).findByRole("link", { name: "Organizações" })).toBeDefined();
    expect(within(screen.getByRole("banner")).getByText("Administração da plataforma")).toBeDefined();
    expect(screen.getByRole("main").textContent).toContain("Página");
    expect(await screen.findByRole("button", { name: "Ana Souza, menu da conta" })).toBeDefined();
    expect(container.querySelector("[data-surface='admin']")).not.toBeNull();
    await expectNoAxeViolations(container);
  });

  // Follow-up 92: the staff cookie passes the server guard, but the tab's token is the user's.
  it("explains instead of loading admin pages while the tab is in support mode, and leaves it", async () => {
    const auth = createFakeAuth(TEST_USER);
    const { container, user, router, bridge } = renderApp(
      <AdminLayout>
        <h1>Página</h1>
      </AdminLayout>,
      { path: "/admin/organizations", auth, routes: { "GET /v1/me": ok(buildMe({ isPlatformStaff: true, platformRole: "platform-admin" })) } },
    );
    auth.setClaims({ accessVersion: 3, imp: "Im5sK2lPq0WnR5tYu3bV", impBy: "staff-1" });
    expect(await screen.findByRole("heading", { name: "A administração não abre no modo suporte" })).toBeDefined();
    expect(screen.getByRole("main").textContent).not.toContain("Página");
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("button", { name: "Sair do modo suporte" }));
    await waitFor(() => expect(router.current()).toBe("/admin/users"));
    expect(bridge.left).toBe(1);
  });
});
