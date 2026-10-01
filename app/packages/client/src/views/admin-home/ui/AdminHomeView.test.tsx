import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, ok } from "#/shared/testing/fake-api.ts";
import { buildMe } from "#/shared/testing/fixtures.ts";
import { AdminHomeView } from "./AdminHomeView.tsx";

const STAFF = buildMe({ isPlatformStaff: true, platformRole: "platform-support" });

const renderView = (routes = {}) =>
  renderApp(
    <main>
      <AdminHomeView />
    </main>,
    { path: "/admin", routes: { "GET /v1/me": ok(STAFF), ...routes } },
  );

describe("AdminHomeView", () => {
  it("lists every admin area the role may open, each linking to its page", async () => {
    const { container } = renderView();
    expect(await screen.findByRole("heading", { level: 1, name: /Administração da plataforma/u })).toBeDefined();
    expect(screen.getByText("Equipe da plataforma")).toBeDefined();
    const areas = screen.getByRole("region", { name: "Áreas" });
    const links = within(areas).getAllByRole("link");
    expect(links).toHaveLength(9);
    expect(within(areas).getByRole("link", { name: /Usuários.*Contas de usuário/u }).getAttribute("href")).toBe("/admin/users");
    await expectNoAxeViolations(container);
  });

  it("shows an error with a retry when the profile cannot be read", async () => {
    renderView({ "GET /v1/me": apiError(503, "INTERNAL_ERROR") });

    expect(await screen.findByRole("button", { name: "Tentar novamente" }, { timeout: 8000 })).toBeDefined();
  }, 15_000);
});
