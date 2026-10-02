import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, ok, type FakeRequest, type FakeRoutes } from "#/shared/testing/fake-api.ts";
import { buildMe } from "#/shared/testing/fixtures.ts";
import { ProfileNotificationsView } from "./ProfileNotificationsView.tsx";

const renderView = (routes: FakeRoutes = {}) =>
  renderApp(
    <main>
      <ProfileNotificationsView />
    </main>,
    { path: "/profile/notifications", routes },
  );

describe("ProfileNotificationsView", () => {
  it("toggles product updates at once and keeps security alerts on", async () => {
    const bodies: unknown[] = [];
    const { user, container } = renderView({
      "PATCH /v1/me": (request: FakeRequest) => {
        bodies.push(request.body);
        return ok(buildMe({ preferences: { theme: "system", notifications: { productUpdates: true, securityAlerts: true } } }));
      },
    });
    const product = await screen.findByRole("switch", { name: "Novidades do produto" });
    const security = screen.getByRole("switch", { name: "Alertas de segurança" });
    expect(security.getAttribute("aria-checked")).toBe("true");
    expect(security.hasAttribute("disabled")).toBe(true);
    await expectNoAxeViolations(container);

    await user.click(product);
    expect(product.getAttribute("aria-checked")).toBe("true");
    expect(await screen.findByText("Você vai receber as novidades do produto.")).toBeDefined();
    expect(bodies).toEqual([{ preferences: { notifications: { productUpdates: true } } }]);
  });

  it("reverts the switch and explains when the save fails", async () => {
    const { user } = renderView({ "PATCH /v1/me": apiError(503, "INTERNAL_ERROR") });
    const product = await screen.findByRole("switch", { name: "Novidades do produto" });
    await user.click(product);
    expect(await screen.findByText("Não foi possível salvar a preferência.")).toBeDefined();
    await waitFor(() => expect(product.getAttribute("aria-checked")).toBe("false"));
  });

  it("keeps the switches off-limits while support staff view the app as the user", async () => {
    const { auth } = renderView();
    auth.setClaims({ accessVersion: 3, imp: "Im5sK2lPq0WnR5tYu3bV", impBy: "staff-1" });
    expect(await screen.findByText(/Modo suporte: este perfil é somente leitura/u)).toBeDefined();
    await waitFor(() => expect(screen.getByRole("switch", { name: "Novidades do produto" }).matches(":disabled")).toBe(true));
  });
});
