import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { apiError, ok } from "#/shared/testing/fake-api.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { buildProject, IDS } from "#/shared/testing/fixtures.ts";
import { createFakeAuth } from "#/shared/lib/auth/fake-auth.ts";
import { TEST_USER } from "#/shared/testing/render-client.tsx";
import { AppLayout } from "./app-layout.tsx";
import { renderApp } from "./testing/render-app.tsx";
import { MEMBER_PERMISSIONS, shellRoutes } from "./testing/shell-routes.ts";

const PROJECT_PATH = `/o/${IDS.organization}/p/${IDS.project}`;

const renderLayout = (options: Parameters<typeof renderApp>[1] = {}) =>
  renderApp(
    <AppLayout>
      <h1>Página</h1>
    </AppLayout>,
    { path: PROJECT_PATH, routes: shellRoutes(MEMBER_PERMISSIONS), ...options },
  );

describe("AppLayout", () => {
  it("renders the landmarks, permitted navigation and breadcrumbs of the node", async () => {
    const { container } = renderLayout();
    const nav = await screen.findByRole("navigation", { name: "Navegação" });
    await waitFor(() => expect(within(nav).getByRole("link", { name: "Visão geral" })).toBeDefined());
    expect(within(nav).getByRole("link", { name: "Visão geral" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: "Configurações" }).getAttribute("href")).toBe(`/o/${IDS.organization}/settings/general`);
    const breadcrumb = screen.getByRole("navigation", { name: "Trilha de navegação" });
    await waitFor(() => expect(within(breadcrumb).getByRole("link", { name: "Launch" })).toBeDefined());
    expect(within(breadcrumb).getByRole("link", { name: "Northwind" }).getAttribute("href")).toBe(`/o/${IDS.organization}`);
    expect(within(breadcrumb).getByText("Visão geral").getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("main")).toBeDefined();
    expect(screen.getByRole("banner")).toBeDefined();
    expect(await screen.findByRole("button", { name: "Ana Souza, menu da conta" })).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("warns while the tab is signed in as an impersonated user and offers to leave", async () => {
    const auth = createFakeAuth(TEST_USER);
    const { container } = renderLayout({ auth });
    // `renderApp` sets the default claims; the impersonated token carries `imp` (SP1 spec §6.6).
    auth.setClaims({ accessVersion: 3, imp: "Im5sK2lPq0WnR5tYu3bV", impBy: "staff-1" });
    expect(await screen.findByText(/Você está vendo o app como outro usuário, em modo somente leitura/u)).toBeDefined();
    expect(screen.getByRole("button", { name: "Sair do modo suporte" })).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("leaving support mode ends the impersonation and returns to the staff account on /admin/users", async () => {
    const auth = createFakeAuth(TEST_USER);
    const { user, router, bridge } = renderLayout({ auth });
    auth.setClaims({ accessVersion: 3, imp: "Im5sK2lPq0WnR5tYu3bV", impBy: "staff-1" });
    await user.click(await screen.findByRole("button", { name: "Sair do modo suporte" }));
    await waitFor(() => expect(router.current()).toBe("/admin/users"));
    expect(bridge.left).toBe(1);
    expect(bridge.ended).toBe(0);
  });

  it("signs out completely when the staff session cannot be restored", async () => {
    const auth = createFakeAuth(TEST_USER);
    const { user, router, bridge } = renderLayout({ auth, leaveImpersonation: () => Promise.reject(new Error("no staff session")) });
    auth.setClaims({ accessVersion: 3, imp: "Im5sK2lPq0WnR5tYu3bV", impBy: "staff-1" });
    await user.click(await screen.findByRole("button", { name: "Sair do modo suporte" }));
    await waitFor(() => expect(router.current()).toBe("/sign-in"));
    expect(bridge.ended).toBe(1);
  });

  it("shows no impersonation notice in a normal session", async () => {
    const { container } = renderLayout();
    await screen.findByRole("button", { name: "Ana Souza, menu da conta" });
    expect(container.querySelector("[data-slot='impersonation-banner']")?.childElementCount).toBe(0);
    expect(screen.queryByRole("button", { name: "Sair do modo suporte" })).toBeNull();
  });

  it("switches organization: navigates (dropping the project), PUTs the active organization, then refreshes the token", async () => {
    // Record when the token is force-refreshed, as a position in the API call log.
    const auth = createFakeAuth(TEST_USER);
    const getIdToken = auth.getIdToken;
    const refreshedAt: number[] = [];
    let calls: readonly unknown[] = [];
    auth.getIdToken = (options) => {
      if (options.forceRefresh) refreshedAt.push(calls.length);
      return getIdToken(options);
    };
    const { user, api, router } = renderLayout({ auth, routes: shellRoutes(MEMBER_PERMISSIONS, { "PUT /v1/me/active-organization": { status: 204 } }) });
    calls = api.calls;
    await user.click(await screen.findByRole("button", { name: "Northwind, trocar de organização" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "Contoso" }));
    await waitFor(() => expect(router.current()).toBe(`/o/${IDS.otherOrganization}`));
    await waitFor(() => expect(api.callLines()).toContain("PUT /v1/me/active-organization"));
    const put = api.calls.findIndex((call) => call.method === "PUT" && call.path === "/v1/me/active-organization");
    expect(api.calls[put]?.body).toEqual({ organizationId: IDS.otherOrganization });
    // The forced refresh comes after the PUT (the new claims exist only then) …
    await waitFor(() => expect(refreshedAt.some((position) => position > put)).toBe(true));
    expect(refreshedAt.every((position) => position > put)).toBe(true);
    // … and then every query refetches with them.
    const refresh = refreshedAt[0] ?? 0;
    await waitFor(() => expect(api.callLines().slice(refresh)).toContain("GET /v1/me"));
  });

  it("tells the user when the switch is refused", async () => {
    const { user } = renderLayout({ routes: shellRoutes(MEMBER_PERMISSIONS, { "PUT /v1/me/active-organization": apiError(403, "FORBIDDEN") }) });
    await user.click(await screen.findByRole("button", { name: "Northwind, trocar de organização" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "Contoso" }));
    expect(await screen.findByText("Não foi possível trocar de organização")).toBeDefined();
    expect(screen.getByText("Você não tem permissão para fazer isso.")).toBeDefined();
  });

  it("opens the palette with Ctrl+K and lists only the navigation the viewer may use", async () => {
    const { user, router, container } = renderLayout();
    await screen.findByRole("link", { name: "Visão geral" });
    await user.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Paleta de comandos" });
    const options = () => within(dialog).getAllByRole("option").map((option) => option.textContent);
    await waitFor(() => expect(options()).toContain("Trocar para Contoso"));
    expect(options()).toEqual(expect.arrayContaining(["Visão geral", "Geral", "Membros", "Abrir projeto Beta", "Criar projeto", "Sair"]));
    expect(options()).not.toContain("Convites");
    expect(options()).not.toContain("Chaves de API");
    await expectNoAxeViolations(container);
    await user.type(within(dialog).getByRole("combobox"), "perfil");
    await user.click(within(dialog).getByRole("option", { name: "Abrir perfil" }));
    await waitFor(() => expect(router.current()).toBe("/profile/account"));
    await user.keyboard("{Control>}k{/Control}");
    const reopened = await screen.findByRole("dialog", { name: "Paleta de comandos" });
    expect(within(reopened).getByRole("group", { name: "Recentes" }).textContent).toContain("Abrir perfil");
  });

  it("writes ?unit= from the unit picker and shows the unit in the breadcrumbs", async () => {
    const { user, router } = renderLayout();
    await user.click(await screen.findByRole("button", { name: "Unidade: Projeto inteiro. Escolher unidade" }));
    const tree = await screen.findByRole("tree", { name: "Unidades de Launch" });
    await user.click(within(tree).getByRole("treeitem", { name: "Site A" }));
    await waitFor(() => expect(router.current()).toBe(`${PROJECT_PATH}?unit=site-1`));
    const breadcrumb = screen.getByRole("navigation", { name: "Trilha de navegação" });
    expect(await within(breadcrumb).findByRole("link", { name: "Site A" })).toBeDefined();
  });

  it("creates a project from the project switcher and opens it", async () => {
    const created = buildProject({ id: "NewProject0000000001", name: "Gamma" });
    const { user, api, router } = renderLayout({ routes: shellRoutes(MEMBER_PERMISSIONS, { "POST /v1/organizations/:organizationId/projects": ok(created, 201) }) });
    await user.click(await screen.findByRole("button", { name: "Launch, trocar de projeto" }));
    await user.click(await screen.findByRole("menuitem", { name: "Novo projeto" }));
    const dialog = await screen.findByRole("dialog", { name: "Novo projeto" });
    await user.type(within(dialog).getByLabelText(/Nome do projeto/u), "Gamma");
    await user.click(within(dialog).getByRole("button", { name: "Criar projeto" }));
    await waitFor(() => expect(router.current()).toBe(`/o/${IDS.organization}/p/NewProject0000000001`));
    const post = api.calls.find((call) => call.method === "POST");
    expect(post?.body).toEqual({ name: "Gamma" });
    expect(post?.headers.get("idempotency-key")).toMatch(/^[0-9A-Z]{26}$/u);
  });
});
