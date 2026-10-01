import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { IMPERSONATION_STORAGE_KEY, useImpersonationStore } from "#/features/admin-impersonation/index.ts";
import { buildAdminImpersonationSession, buildAdminUser, buildImpersonationStart, IMPERSONATION_IDS, storedImpersonation } from "#/shared/testing/admin-accounts-fixtures.ts";
import { buildOrganizationSummary } from "#/shared/testing/admin-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, noContent, ok, page } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { AdminUsersView } from "./AdminUsersView.tsx";

const REASON = "Chamado 4821: usuário não vê o projeto.";
const ORGANIZATIONS = {
  "GET /v1/admin/organizations": page([buildOrganizationSummary()]),
  "GET /v1/admin/users": page([buildAdminUser()]),
  "GET /v1/admin/impersonation-sessions": page([]),
};

const render = (options: Parameters<typeof renderAdmin>[1] = {}) => renderAdmin(<AdminUsersView />, { path: "/admin/users", routes: ORGANIZATIONS, ...options });

const searchFor = async (user: ReturnType<typeof render>["user"], text: string): Promise<HTMLElement> => {
  const search = await screen.findByRole("region", { name: "Buscar usuário" });
  await user.type(within(search).getByRole("searchbox", { name: "Nome, e-mail ou id" }), text);
  await user.click(within(search).getByRole("button", { name: "Buscar" }));
  return search;
};

const fillForm = async (user: ReturnType<typeof render>["user"]): Promise<HTMLElement> => {
  const start = await screen.findByRole("region", { name: "Iniciar acesso como usuário" });
  const search = await searchFor(user, "ana");
  await user.click(await within(search).findByRole("button", { name: "Selecionar Ana Souza para o acesso de suporte" }));
  await user.click(within(start).getByRole("combobox", { name: "Organização" }));
  await user.click(await screen.findByRole("option", { name: "Northwind" }));
  await user.type(within(start).getByRole("textbox", { name: "Motivo" }), REASON);
  return start;
};

afterEach(() => {
  act(() => useImpersonationStore.getState().reset());
  globalThis.sessionStorage.clear();
});

// Forms typed key by key: the default 5 s is too tight when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 20_000 });

describe("AdminUsersView user search", () => {
  it("waits for a search, then lists the users found and calls the API once with the text", async () => {
    const { user, api, router, container } = render({ routes: { ...ORGANIZATIONS, "GET /v1/admin/users": page([buildAdminUser(), buildAdminUser({ id: "uB0b", email: null, displayName: "", status: "disabled" })]) } });
    expect(await screen.findByRole("heading", { level: 3, name: "Busque um usuário" })).toBeDefined();
    expect(api.callLines()).not.toContain("GET /v1/admin/users");
    const search = await searchFor(user, "  an ");
    const table = await within(search).findByRole("table", { name: "Usuários encontrados" });
    expect(within(table).getByText("Ana Souza")).toBeDefined();
    expect(within(table).getByText("ana@example.com")).toBeDefined();
    expect(within(table).getByText("Sem nome")).toBeDefined();
    expect(within(table).getByText("Sem e-mail")).toBeDefined();
    expect(within(table).getByText("Desativado")).toBeDefined();
    // A disabled user holds no permission: it cannot be picked for support access.
    expect(within(table).getByRole("button", { name: "Selecionar uB0b para o acesso de suporte" })).toHaveProperty("disabled", true);
    const calls = api.calls.filter((call) => call.path === "/v1/admin/users");
    expect(calls.map((call) => Object.fromEntries(new URLSearchParams(call.query)))).toEqual([{ limit: "20", query: "an" }]);
    // The text is personal data: it never goes to the page URL.
    expect(router.current()).toBe("/admin/users");
    await expectNoAxeViolations(container);
  });

  it("sends the chosen reading of the text and shows the selected user in the form", async () => {
    const { user, api } = render();
    const search = await screen.findByRole("region", { name: "Buscar usuário" });
    await user.click(within(search).getByRole("combobox", { name: "Buscar por" }));
    await user.click(await screen.findByRole("option", { name: "E-mail" }));
    await searchFor(user, "ana@");
    await user.click(await within(search).findByRole("button", { name: "Selecionar Ana Souza para o acesso de suporte" }));
    expect(new URLSearchParams(api.calls.find((call) => call.path === "/v1/admin/users")?.query).get("by")).toBe("email");
    const start = screen.getByRole("region", { name: "Iniciar acesso como usuário" });
    const chosen = within(start).getByRole("group", { name: "Usuário" });
    expect(within(chosen).getByText("Ana Souza")).toBeDefined();
    expect(within(chosen).getByText(IMPERSONATION_IDS.target)).toBeDefined();
    await user.click(within(chosen).getByRole("button", { name: "Trocar o usuário selecionado (Ana Souza)" }));
    expect(within(start).getByText("Nenhum usuário selecionado. Use a busca acima e selecione o usuário.")).toBeDefined();
  });

  it("says when nothing matches and when the search fails, with a retry", async () => {
    const { user, api } = render({ routes: { ...ORGANIZATIONS, "GET /v1/admin/users": page([]) } });
    const search = await searchFor(user, "zed");
    expect(await within(search).findByRole("heading", { level: 3, name: "Nenhum usuário encontrado" })).toBeDefined();
    api.route("GET /v1/admin/users", apiError(409, "CONFLICT"));
    await user.clear(within(search).getByRole("searchbox", { name: "Nome, e-mail ou id" }));
    await searchFor(user, "other");
    const retry = await within(search).findByRole("button", { name: "Tentar novamente" });
    api.route("GET /v1/admin/users", page([buildAdminUser()]));
    await user.click(retry);
    expect(await within(search).findByText("Ana Souza")).toBeDefined();
  });

  it("pages the results by cursor", async () => {
    const first = Array.from({ length: 20 }, (_, index) => buildAdminUser({ id: `uPage${index}`, displayName: `Ana ${index}`, email: `ana${index}@example.com` }));
    const { user, api } = render({
      routes: {
        ...ORGANIZATIONS,
        "GET /v1/admin/users": ({ query }) => (query.get("cursor") === "next" ? page([buildAdminUser({ id: "uLast", displayName: "Ana Última" })], { limit: 20 }) : page(first, { cursor: "next", limit: 20 })),
      },
    });
    const search = await searchFor(user, "ana");
    expect(await within(search).findByText("Ana 19")).toBeDefined();
    await user.click(within(search).getByRole("button", { name: "Próxima" }));
    expect(await within(search).findByText("Ana Última")).toBeDefined();
    expect(api.calls.filter((call) => call.path === "/v1/admin/users")).toHaveLength(2);
  });

  it("lets support staff search; the form to start access shows the selected user", async () => {
    const { user } = render({ role: "platform-support" });
    const search = await searchFor(user, "ana");
    expect(await within(search).findByText("Ana Souza")).toBeDefined();
    expect(within(search).getByRole("button", { name: "Selecionar Ana Souza para o acesso de suporte" })).toBeDefined();
  });

  it("asks for the second factor when the search answers MFA_REQUIRED", async () => {
    const { user } = render({ routes: { ...ORGANIZATIONS, "GET /v1/admin/users": apiError(403, "MFA_REQUIRED") } });
    const search = await searchFor(user, "ana");
    expect(await within(search).findByText(/verificação em duas etapas/u)).toBeDefined();
  });
});

describe("AdminUsersView support access sessions", () => {
  const STAFF = buildAdminUser({ id: IMPERSONATION_IDS.staff, email: "sue@example.com", displayName: "Sue Staff" });
  const sessionsRoutes = (sessions: unknown[]) => ({
    ...ORGANIZATIONS,
    "GET /v1/admin/users": page([buildAdminUser(), STAFF]),
    "GET /v1/admin/impersonation-sessions": page(sessions),
  });

  it("lists the open sessions of every staff member with names, organization and reason, from one lookup", async () => {
    const { api, container } = render({ routes: sessionsRoutes([buildAdminImpersonationSession()]) });
    const section = await screen.findByRole("region", { name: "Sessões de acesso de suporte" });
    const table = await within(section).findByRole("table", { name: "Sessões de suporte da equipe" });
    const row = within(table).getAllByRole("row")[1] as HTMLElement;
    await waitFor(() => expect(within(row).getByText("Sue Staff")).toBeDefined());
    expect(within(row).getByText("Ana Souza")).toBeDefined();
    await waitFor(() => expect(within(row).getByText("Northwind")).toBeDefined());
    expect(within(row).getByText("Ticket 4821: user cannot see project Launch.")).toBeDefined();
    expect(within(row).getByText("Aberta")).toBeDefined();
    const listed = api.calls.filter((call) => call.path === "/v1/admin/impersonation-sessions");
    expect(listed.map((call) => new URLSearchParams(call.query).get("status"))).toEqual(["active"]);
    expect(api.calls.filter((call) => call.path === "/v1/admin/users" && new URLSearchParams(call.query).has("ids"))).toHaveLength(1);
    await expectNoAxeViolations(container);
  });

  it("ends a colleague's session after a destructive confirmation and reloads the list", async () => {
    const { user, api } = render({
      routes: { ...sessionsRoutes([buildAdminImpersonationSession()]), "POST /v1/admin/impersonation-sessions/:sessionId/end": noContent() },
    });
    const section = await screen.findByRole("region", { name: "Sessões de acesso de suporte" });
    const endButton = await within(section).findByRole("button", { name: "Encerrar a sessão de Sue Staff como Ana Souza" });
    await user.click(endButton);
    const dialog = await screen.findByRole("alertdialog", { name: "Encerrar esta sessão de suporte?" });
    expect(dialog.textContent).toContain("Sue Staff");
    expect(api.callLines()).not.toContain(`POST /v1/admin/impersonation-sessions/${IMPERSONATION_IDS.session}/end`);
    api.route("GET /v1/admin/impersonation-sessions", page([]));
    await user.click(within(dialog).getByRole("button", { name: "Encerrar sessão" }));
    expect(await screen.findByText("Sessão de Sue Staff encerrada.")).toBeDefined();
    expect(api.callLines()).toContain(`POST /v1/admin/impersonation-sessions/${IMPERSONATION_IDS.session}/end`);
    expect(await within(section).findByRole("heading", { level: 3, name: "Nenhuma sessão de suporte em andamento" })).toBeDefined();
  });

  it("keeps the confirmation open with the error and its reference when ending fails", async () => {
    const { user } = render({
      routes: { ...sessionsRoutes([buildAdminImpersonationSession()]), "POST /v1/admin/impersonation-sessions/:sessionId/end": apiError(403, "FORBIDDEN") },
    });
    const section = await screen.findByRole("region", { name: "Sessões de acesso de suporte" });
    await user.click(await within(section).findByRole("button", { name: "Encerrar a sessão de Sue Staff como Ana Souza" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Encerrar esta sessão de suporte?" });
    await user.click(within(dialog).getByRole("button", { name: "Encerrar sessão" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Você não tem permissão para fazer isso.");
  });

  it("shows every session, ended and expired ones without the end action, when asked for all", async () => {
    const { user, api } = render({ routes: sessionsRoutes([]) });
    const section = await screen.findByRole("region", { name: "Sessões de acesso de suporte" });
    expect(await within(section).findByRole("heading", { level: 3, name: "Nenhuma sessão de suporte em andamento" })).toBeDefined();
    api.route(
      "GET /v1/admin/impersonation-sessions",
      page([
        buildAdminImpersonationSession({ id: "Im5sK2lPq0WnR5tYu3bA", status: "ended", endedAt: "2026-09-29T15:00:00.000Z" }),
        buildAdminImpersonationSession({ id: "Im5sK2lPq0WnR5tYu3bB", status: "expired", expiresAt: "2026-09-29T15:30:00.000Z" }),
      ]),
    );
    await user.click(within(section).getByRole("button", { name: "Ver todas as sessões" }));
    const table = await within(section).findByRole("table", { name: "Sessões de suporte da equipe" });
    expect(within(table).getByText("Encerrada")).toBeDefined();
    expect(within(table).getByText("Expirada")).toBeDefined();
    expect(within(table).queryByRole("button", { name: /^Encerrar a sessão de/u })).toBeNull();
    const last = api.calls.filter((call) => call.path === "/v1/admin/impersonation-sessions").at(-1);
    expect(new URLSearchParams(last?.query).has("status")).toBe(false);
  });

  it("shows the error with a retry when the sessions cannot be read", async () => {
    const { user, api } = render({ routes: { ...ORGANIZATIONS, "GET /v1/admin/impersonation-sessions": apiError(409, "CONFLICT") } });
    const section = await screen.findByRole("region", { name: "Sessões de acesso de suporte" });
    expect(await within(section).findByRole("alert")).toBeDefined();
    api.route("GET /v1/admin/impersonation-sessions", page([]));
    await user.click(within(section).getByRole("button", { name: "Tentar novamente" }));
    expect(await within(section).findByRole("heading", { level: 3, name: "Nenhuma sessão de suporte em andamento" })).toBeDefined();
  });
});

describe("AdminUsersView", () => {
  it("explains the audited access and shows no open session at first", async () => {
    const { container } = render();
    expect(await screen.findByRole("heading", { level: 1, name: "Usuários" })).toBeDefined();
    expect(await screen.findByText(/ficam registradas na auditoria/u)).toBeDefined();
    expect(await screen.findByRole("heading", { level: 3, name: "Nenhuma sessão aberta" })).toBeDefined();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Organização" }).textContent).toContain("Escolha uma organização"));
    await expectNoAxeViolations(container);
  });

  it("validates the form before calling the API", async () => {
    const { user, api } = render();
    const start = await screen.findByRole("region", { name: "Iniciar acesso como usuário" });
    await user.type(within(start).getByRole("textbox", { name: "Motivo" }), "curto");
    await user.click(within(start).getByRole("button", { name: "Iniciar sessão" }));
    expect(await within(start).findByText("Selecione o usuário na busca.")).toBeDefined();
    expect(within(start).getByText("Escolha a organização.")).toBeDefined();
    expect(within(start).getByText("Explique o motivo com 10 a 500 caracteres.")).toBeDefined();
    expect(within(start).getByText("Nenhum usuário selecionado. Use a busca acima e selecione o usuário.")).toBeDefined();
    expect(api.calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("starts a session, opens the app as the user and keeps only the session data in storage", async () => {
    const { user, api, router, container, bridge } = render({ routes: { ...ORGANIZATIONS, "POST /v1/platform/impersonation-sessions": ok(buildImpersonationStart(), 201) } });
    const start = await fillForm(user);
    const minutes = within(start).getByRole("spinbutton", { name: "Duração em minutos" });
    await user.clear(minutes);
    await user.type(minutes, "30");
    await user.click(within(start).getByRole("button", { name: "Iniciar sessão" }));
    expect(await screen.findByText("Sessão de suporte iniciada.")).toBeDefined();
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({ targetUid: IMPERSONATION_IDS.target, organizationId: IDS.organization, reason: REASON, durationMinutes: 30 });
    const session = screen.getByRole("region", { name: "Sessão aberta nesta aba" });
    expect(await within(session).findByText(IMPERSONATION_IDS.target)).toBeDefined();
    expect(within(session).getByText("Northwind")).toBeDefined();
    expect(within(session).getByText("Somente leitura")).toBeDefined();
    const stored = globalThis.sessionStorage.getItem(IMPERSONATION_STORAGE_KEY) ?? "";
    expect(stored).toContain(IMPERSONATION_IDS.session);
    expect(stored).not.toContain("eyJ");
    await expectNoAxeViolations(container);
    await user.click(within(session).getByRole("button", { name: "Abrir o app como este usuário" }));
    await waitFor(() => expect(router.current()).toBe("/"));
    // The server session enters it (decision 0047): no token is kept in the browser.
    expect(bridge.entered).toEqual([IMPERSONATION_IDS.session]);
    expect(JSON.stringify(useImpersonationStore.getState())).not.toContain("eyJ");
  });

  it("explains a user that cannot be impersonated in that organization", async () => {
    const { user } = render({ routes: { ...ORGANIZATIONS, "POST /v1/platform/impersonation-sessions": apiError(404, "NOT_FOUND") } });
    const start = await fillForm(user);
    await user.click(within(start).getByRole("button", { name: "Iniciar sessão" }));
    expect((await within(start).findByRole("alert")).textContent).toBe("Este usuário não existe ou não tem acesso a essa organização.");
  });

  it("asks for the second factor when the session has none", async () => {
    const { user } = render({ routes: { ...ORGANIZATIONS, "POST /v1/platform/impersonation-sessions": apiError(403, "MFA_REQUIRED") } });
    const start = await fillForm(user);
    await user.click(within(start).getByRole("button", { name: "Iniciar sessão" }));
    expect((await within(start).findByRole("alert")).textContent).toContain("Esta ação exige verificação em duas etapas.");
  });

  it("after a reload still opens the session started in this tab, or ends it after a confirmation", async () => {
    globalThis.sessionStorage.setItem(IMPERSONATION_STORAGE_KEY, storedImpersonation());
    const { user, api } = render({ routes: { ...ORGANIZATIONS, "POST /v1/platform/impersonation-sessions/:sessionId/end": noContent() } });
    const session = await screen.findByRole("region", { name: "Sessão aberta nesta aba" });
    expect(await within(session).findByText(IMPERSONATION_IDS.target)).toBeDefined();
    expect(within(session).getByRole("button", { name: "Abrir o app como este usuário" })).toBeDefined();
    expect(within(session).getByText(/Sair do modo suporte/u)).toBeDefined();
    await user.click(within(session).getByRole("button", { name: "Encerrar sessão" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Encerrar a sessão de suporte?" });
    await user.click(within(dialog).getByRole("button", { name: "Encerrar" }));
    expect(await screen.findByText("Sessão de suporte encerrada.")).toBeDefined();
    expect(api.callLines()).toContain(`POST /v1/platform/impersonation-sessions/${IMPERSONATION_IDS.session}/end`);
    expect(await screen.findByRole("heading", { level: 3, name: "Nenhuma sessão aberta" })).toBeDefined();
  });

  it("forgets a stored session that has expired and ignores a malformed one", async () => {
    globalThis.sessionStorage.setItem(IMPERSONATION_STORAGE_KEY, storedImpersonation({ expiresAt: "2020-01-01T00:00:00.000Z" }));
    const expired = render();
    expect(await screen.findByRole("heading", { level: 3, name: "Nenhuma sessão aberta" })).toBeDefined();
    expired.unmount();
    globalThis.sessionStorage.setItem(IMPERSONATION_STORAGE_KEY, JSON.stringify({ state: { session: { sessionId: 7 } }, version: 1 }));
    render();
    expect(await screen.findByRole("heading", { level: 3, name: "Nenhuma sessão aberta" })).toBeDefined();
  });
});
