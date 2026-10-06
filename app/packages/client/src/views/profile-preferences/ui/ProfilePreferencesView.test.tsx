import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, type FakeRequest, ok } from "#/shared/testing/fake-api.ts";
import { buildMe } from "#/shared/testing/fixtures.ts";
import { ProfilePreferencesView } from "./ProfilePreferencesView.tsx";

type Me = ReturnType<typeof buildMe>;

/** `/v1/me` that applies PATCHes (preferences merged), recording every body. */
const meServer = (
  initial: Me = buildMe({
    preferences: {
      locale: "pt-BR",
      timeZone: "America/Sao_Paulo",
      currency: "BRL",
      theme: "system",
      notifications: { productUpdates: false, securityAlerts: true },
    },
  }),
) => {
  let me = initial;
  const patches: unknown[] = [];
  return {
    patches,
    routes: {
      "GET /v1/me": () => ok(me),
      "PATCH /v1/me": (request: FakeRequest) => {
        patches.push(request.body);
        const body = request.body as { preferences?: Record<string, unknown> };
        me = { ...me, preferences: { ...(me["preferences"] as Record<string, unknown>), ...body.preferences } };
        return ok(me);
      },
    },
  };
};

const renderView = (routes: Record<string, unknown>) =>
  renderApp(
    <main>
      <ProfilePreferencesView />
    </main>,
    { path: "/profile/preferences", routes: routes as never },
  );

describe("ProfilePreferencesView", () => {
  it("sends only the changed field and keeps the language when it did not change", async () => {
    const server = meServer();
    const { user, container, router } = renderView(server.routes);
    const trigger = await screen.findByRole("combobox", { name: /Fuso horário/u });
    await expectNoAxeViolations(container);
    await user.click(trigger);
    await user.type(await screen.findByRole("combobox", { name: "Buscar fuso horário" }), "Recife");
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Alterações salvas.")).toBeDefined();
    expect(server.patches).toEqual([{ preferences: { timeZone: "America/Recife" } }]);
    expect(router.localeSwitches()).toEqual([]);
  });

  it("saves a new language first and then switches the page to it through the router port", async () => {
    const server = meServer();
    const { user, router } = renderView(server.routes);
    const language = await screen.findByRole("combobox", { name: /Idioma/u });
    language.focus();
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("option", { name: "English (United States)" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(router.localeSwitches()).toEqual(["en-US"]));
    expect(server.patches).toEqual([{ preferences: { locale: "en-US" } }]);
  });

  it("applies the theme at once, persists it through the provider and saves it to the profile", async () => {
    const server = meServer();
    const { user } = renderView(server.routes);
    await user.click(await screen.findByRole("radio", { name: "Escuro" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(globalThis.localStorage.getItem("theme")).toBe("dark");
    await waitFor(() => expect(server.patches).toEqual([{ preferences: { theme: "dark" } }]));
  });

  it("keeps the theme when the profile save fails and offers a retry", async () => {
    const server = meServer();
    const { user } = renderView({ ...server.routes, "PATCH /v1/me": apiError(503, "INTERNAL_ERROR") });
    await user.click(await screen.findByRole("radio", { name: "Claro" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(await screen.findByText("O tema foi aplicado aqui, mas não foi salvo no seu perfil.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeDefined();
  });
});
