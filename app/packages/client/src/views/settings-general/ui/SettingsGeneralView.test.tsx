import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, type FakeRequest, type FakeRoutes, ok } from "#/shared/testing/fake-api.ts";
import { buildOrganization, IDS } from "#/shared/testing/fixtures.ts";
import { SettingsGeneralView } from "./SettingsGeneralView.tsx";

const renderView = (permissions: string[], routes: FakeRoutes = {}) =>
  renderApp(
    <main>
      <SettingsGeneralView />
    </main>,
    { path: `/o/${IDS.organization}/settings/general`, routes: shellRoutes(permissions, routes) },
  );

describe("SettingsGeneralView", () => {
  it("saves only the changed name and refetches the organization", async () => {
    const bodies: unknown[] = [];
    const { user, container, api } = renderView(["core.organization.read", "core.organization.update"], {
      "PATCH /v1/organizations/:organizationId": (request: FakeRequest) => {
        bodies.push(request.body);
        return ok(buildOrganization({ name: "Northwind Labs" }));
      },
    });
    const name = await screen.findByRole("textbox", { name: /Nome/u });
    await expectNoAxeViolations(container);
    await user.clear(name);
    await user.type(name, "Northwind Labs");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Alterações salvas.")).toBeDefined();
    expect(bodies).toEqual([{ name: "Northwind Labs" }]);
    expect(api.callLines().filter((line) => line === "GET /v1/me/context").length).toBeGreaterThanOrEqual(2);
  });

  it("maps a server field error back to the input", async () => {
    const { user } = renderView(["core.organization.read", "core.organization.update"], {
      "PATCH /v1/organizations/:organizationId": apiError(400, "VALIDATION_FAILED", [
        { field: "name", issue: "TOO_BIG" },
      ]),
    });
    const name = await screen.findByRole("textbox", { name: /Nome/u });
    await user.type(name, " Holding");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await screen.findByText(/Revise este campo|Use no máximo/u);
    expect(name.getAttribute("aria-invalid")).toBe("true");
  });

  it("shows the details read-only without core.organization.update", async () => {
    const { container } = renderView(["core.organization.read"]);
    // Zone and currency read as the edit widgets name them, not as raw codes.
    const list = await screen.findByText(/^\(GMT-0[23]:00\) America\/Sao Paulo$/u);
    expect(within(list.closest("dl") as HTMLElement).getByText("BRL — Real brasileiro")).toBeDefined();
    expect(within(list.closest("dl") as HTMLElement).queryByText("America/Sao_Paulo")).toBeNull();
    expect(within(list.closest("dl") as HTMLElement).getByText("Português (Brasil)")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Salvar" })).toBeNull();
    await expectNoAxeViolations(container);
  });
});
