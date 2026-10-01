import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { ok } from "#/shared/testing/fake-api.ts";
import { buildMe } from "#/shared/testing/fixtures.ts";
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
});
