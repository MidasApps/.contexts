import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { IMPERSONATION_STORAGE_KEY, useImpersonationStore } from "#/features/admin-impersonation/index.ts";
import { buildImpersonationStart, IMPERSONATION_IDS, storedImpersonation } from "#/shared/testing/admin-accounts-fixtures.ts";
import { buildOrganizationSummary } from "#/shared/testing/admin-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, noContent, ok, page } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { AdminUsersView } from "./AdminUsersView.tsx";

const REASON = "Chamado 4821: usuário não vê o projeto.";
const ORGANIZATIONS = { "GET /v1/admin/organizations": page([buildOrganizationSummary()]) };

const render = (options: Parameters<typeof renderAdmin>[1] = {}) => renderAdmin(<AdminUsersView />, { path: "/admin/users", routes: ORGANIZATIONS, ...options });

const fillForm = async (user: ReturnType<typeof render>["user"]): Promise<HTMLElement> => {
  const start = await screen.findByRole("region", { name: "Iniciar acesso como usuário" });
  await user.type(within(start).getByRole("textbox", { name: "Id do usuário" }), IMPERSONATION_IDS.target);
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
    expect(await within(start).findByText("Informe o id do usuário.")).toBeDefined();
    expect(within(start).getByText("Escolha a organização.")).toBeDefined();
    expect(within(start).getByText("Explique o motivo com 10 a 500 caracteres.")).toBeDefined();
    expect(within(start).getByRole("textbox", { name: "Id do usuário" }).getAttribute("aria-invalid")).toBe("true");
    expect(api.calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("starts a session, opens the app as the user and keeps only the session data in storage", async () => {
    const { user, api, router, container } = render({ routes: { ...ORGANIZATIONS, "POST /v1/platform/impersonation-sessions": ok(buildImpersonationStart(), 201) } });
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
    expect(useImpersonationStore.getState().customToken).toBeNull();
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

  it("offers to end the session started earlier in this tab, after a confirmation", async () => {
    globalThis.sessionStorage.setItem(IMPERSONATION_STORAGE_KEY, storedImpersonation());
    const { user, api } = render({ routes: { ...ORGANIZATIONS, "POST /v1/platform/impersonation-sessions/:sessionId/end": noContent() } });
    const session = await screen.findByRole("region", { name: "Sessão aberta nesta aba" });
    expect(await within(session).findByText(IMPERSONATION_IDS.target)).toBeDefined();
    expect(within(session).queryByRole("button", { name: "Abrir o app como este usuário" })).toBeNull();
    expect(within(session).getByText(/já foi usado ou a página foi recarregada/u)).toBeDefined();
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
