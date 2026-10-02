import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, ok, type FakeRequest } from "#/shared/testing/fake-api.ts";
import { buildMe } from "#/shared/testing/fixtures.ts";
import { ProfileAccountView } from "./ProfileAccountView.tsx";

const renderView = (routes = {}) =>
  renderApp(
    <main>
      <ProfileAccountView />
    </main>,
    { path: "/profile/account", routes },
  );

describe("ProfileAccountView", () => {
  it("shows the account, marks the current section and saves a new display name", async () => {
    const patches: unknown[] = [];
    const { user, container } = renderView({
      "PATCH /v1/me": (request: FakeRequest) => {
        patches.push(request.body);
        return ok(buildMe({ displayName: "Ana S." }));
      },
    });
    expect(await screen.findByRole("heading", { level: 1, name: "Conta" })).toBeDefined();
    expect(await screen.findByText("ana@example.com")).toBeDefined();
    const nav = screen.getByRole("navigation", { name: "Seções do perfil" });
    expect(within(nav).getByRole("link", { name: "Conta" }).getAttribute("aria-current")).toBe("page");
    await expectNoAxeViolations(container);

    const name = screen.getByRole("textbox", { name: /Nome de exibição/u });
    await user.clear(name);
    await user.type(name, "Ana S.");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Alterações salvas.")).toBeDefined();
    expect(patches).toEqual([{ displayName: "Ana S." }]);
  });

  it("does not call the API when the name did not change, and maps a server field error", async () => {
    const { user, api } = renderView({ "PATCH /v1/me": apiError(400, "VALIDATION_FAILED", [{ field: "displayName", issue: "TOO_BIG" }]) });
    await screen.findByText("ana@example.com");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await screen.findByText("Alterações salvas.");
    expect(api.callLines()).not.toContain("PATCH /v1/me");

    const name = screen.getByRole("textbox", { name: /Nome de exibição/u });
    await user.type(name, " Jr.");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(name.getAttribute("aria-invalid")).toBe("true"));
    expect(document.activeElement).toBe(name);
  });

  it("is read-only while support staff view the account as the user, and says so", async () => {
    const { auth, api, container } = renderView();
    auth.setClaims({ accessVersion: 3, imp: "Im5sK2lPq0WnR5tYu3bV", impBy: "staff-1" });
    expect(await screen.findByText(/Modo suporte: este perfil é somente leitura/u)).toBeDefined();
    await waitFor(() => expect(screen.getByRole("textbox", { name: /Nome de exibição/u }).matches(":disabled")).toBe(true));
    expect(screen.getByRole("button", { name: "Salvar" }).matches(":disabled")).toBe(true);
    expect(api.callLines()).not.toContain("PATCH /v1/me");
    await expectNoAxeViolations(container);
  });
});
