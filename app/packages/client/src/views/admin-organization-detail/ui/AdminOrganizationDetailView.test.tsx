import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { ADMIN_IDS, buildOrganizationDetail, buildOrganizationSummary, buildPlan } from "#/shared/testing/admin-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, FAKE_REQUEST_ID, ok } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { AdminOrganizationDetailView } from "./AdminOrganizationDetailView.tsx";

const plain = (text: string | null): string => (text ?? "").replace(/\s/gu, " ");
const PATH = `/admin/organizations/${IDS.organization}`;
const NORTHWIND = buildOrganizationDetail();
const OVERRIDE = { monthlyMicroUsd: 80_000_000, monthlyTokens: 30_000_000 };
const OVERRIDDEN = buildOrganizationDetail({ budget: { caps: OVERRIDE, source: "override", override: OVERRIDE } });
const PRO = buildPlan({ id: ADMIN_IDS.otherPlan, name: "Pro" });

const routes = (organization: unknown = NORTHWIND, extra = {}) => ({
  "GET /v1/admin/organizations/:organizationId": ok(organization),
  "GET /v1/admin/plans": ok([buildPlan(), PRO]),
  ...extra,
});

const render = (options: Parameters<typeof renderAdmin>[1] = {}) => renderAdmin(<AdminOrganizationDetailView />, { path: PATH, routes: routes(), ...options });
const section = (name: string | RegExp): HTMLElement => screen.getByRole("region", { name });

const setOnline = (online: boolean): void => {
  Object.defineProperty(globalThis.navigator, "onLine", { configurable: true, get: () => online });
  act(() => void globalThis.dispatchEvent(new Event(online ? "online" : "offline")));
};

describe("AdminOrganizationDetailView", () => {
  it("shows the organization's status, plan, cost and budget, and links to its other areas", async () => {
    const { container } = render();
    expect(await screen.findByRole("heading", { level: 1, name: "Northwind" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Organizações" }).getAttribute("href")).toBe("/admin/organizations");
    const summary = section("Resumo");
    await waitFor(() => expect(within(summary).getByText("Standard")).toBeDefined());
    expect(plain(summary.textContent)).toContain("US$ 1,25");
    expect(plain(summary.textContent)).toContain("US$ 50,00");
    expect(within(summary).getByText("Do plano")).toBeDefined();
    expect(plain(summary.textContent)).toContain("20.000.000");
    // Value and hint are separate words for assistive tech (the e2e read "12pessoas com acesso").
    expect(plain(within(summary).getByText("Membros").parentElement?.textContent ?? null)).toContain("12 pessoas com acesso");
    const related = section("Ver esta organização em");
    expect(within(related).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(
      ["agents", "connectors", "workflows", "traces", "flags", "costs"].map((area) => `/admin/${area}?organizationId=${IDS.organization}`),
    );
    await expectNoAxeViolations(container);
  });

  it("assigns another plan and shows the answer without refetching the organization", async () => {
    const saved = buildOrganizationSummary({ planId: ADMIN_IDS.otherPlan });
    const { user, api } = render({ routes: routes(NORTHWIND, { "PATCH /v1/admin/organizations/:organizationId": ok(saved) }) });
    const plan = await screen.findByRole("region", { name: "Plano" });
    const save = within(plan).getByRole("button", { name: "Salvar plano" });
    expect(save.hasAttribute("disabled")).toBe(true);
    await user.click(within(plan).getByRole("combobox", { name: "Plano da organização" }));
    await user.click(await screen.findByRole("option", { name: "Pro" }));
    await user.click(save);
    expect(await screen.findByText("Plano de Northwind atualizado.")).toBeDefined();
    expect(api.calls.find((call) => call.method === "PATCH")?.body).toEqual({ planId: ADMIN_IDS.otherPlan });
    await waitFor(() => expect(within(section("Resumo")).getByText("Pro")).toBeDefined());
    expect(within(section("Resumo")).getByText("Membros")).toBeDefined();
    expect(api.calls.filter((call) => call.method === "GET" && call.path === `/v1/admin/organizations/${IDS.organization}`)).toHaveLength(1);
    expect(api.callLines()).not.toContain("GET /v1/admin/organizations");
  });

  it("returns the organization to the platform default plan", async () => {
    const { user, api } = render({ routes: routes(NORTHWIND, { "PATCH /v1/admin/organizations/:organizationId": ok(buildOrganizationSummary({ planId: null })) }) });
    const plan = await screen.findByRole("region", { name: "Plano" });
    await user.click(within(plan).getByRole("combobox", { name: "Plano da organização" }));
    await user.click(await screen.findByRole("option", { name: "Padrão da plataforma (sem plano)" }));
    await user.click(within(plan).getByRole("button", { name: "Salvar plano" }));
    await waitFor(() => expect(api.calls.find((call) => call.method === "PATCH")?.body).toEqual({ planId: null }));
  });

  it("saves a budget override in micro-USD", async () => {
    const { user, api } = render({ routes: routes(NORTHWIND, { "PUT /v1/admin/organizations/:organizationId/budget": ok(buildOrganizationSummary({ budget: { caps: OVERRIDE, source: "override", override: OVERRIDE } })) }) });
    const budget = await screen.findByRole("region", { name: "Ajuste de orçamento" });
    expect(within(budget).queryByRole("button", { name: "Voltar ao plano" })).toBeNull();
    const money = within(budget).getByRole("textbox", { name: "Gasto mensal com modelos" });
    await user.clear(money);
    await user.type(money, "80,00");
    const tokens = within(budget).getByRole("textbox", { name: "Tokens por mês" });
    await user.clear(tokens);
    await user.type(tokens, "30000000");
    await user.click(within(budget).getByRole("button", { name: "Salvar ajuste" }));
    expect(await screen.findByText("Orçamento de Northwind ajustado.")).toBeDefined();
    expect(api.calls.find((call) => call.method === "PUT")?.body).toEqual({ override: OVERRIDE });
    await waitFor(() => expect(within(section("Resumo")).getByText("Ajuste da equipe")).toBeDefined());
    expect(within(section("Ajuste de orçamento")).getByRole("button", { name: "Voltar ao plano" })).toBeDefined();
  });

  it("refuses an invalid override before calling the API", async () => {
    const { user, api } = render();
    const budget = await screen.findByRole("region", { name: "Ajuste de orçamento" });
    const tokens = within(budget).getByRole("textbox", { name: "Tokens por mês" });
    await user.clear(tokens);
    await user.type(tokens, "1.5");
    await user.click(within(budget).getByRole("button", { name: "Salvar ajuste" }));
    const message = await within(budget).findByText("Informe um número inteiro de tokens, por exemplo 20.000.000.");
    expect(tokens.getAttribute("aria-invalid")).toBe("true");
    expect(tokens.getAttribute("aria-describedby")).toBe(message.id);
    expect(api.calls.some((call) => call.method === "PUT")).toBe(false);
    // The error goes away as soon as the value is being fixed.
    await user.type(tokens, "0");
    expect(within(budget).queryByText("Informe um número inteiro de tokens, por exemplo 20.000.000.")).toBeNull();
  });

  it("keeps the budget save off until a value changes, and groups the token cap", async () => {
    const { user } = render();
    const budget = await screen.findByRole("region", { name: "Ajuste de orçamento" });
    const save = within(budget).getByRole("button", { name: "Salvar ajuste" });
    expect(save.hasAttribute("disabled")).toBe(true);
    const tokens = within(budget).getByRole<HTMLInputElement>("textbox", { name: "Tokens por mês" });
    expect(tokens.value).toMatch(/^\d{1,3}(\.\d{3})+$/u);
    await user.type(tokens, "0");
    expect(save.hasAttribute("disabled")).toBe(false);
  });

  it("clears the override after a confirmation", async () => {
    const { user, api, container } = render({ routes: routes(OVERRIDDEN, { "PUT /v1/admin/organizations/:organizationId/budget": ok(buildOrganizationSummary()) }) });
    const budget = await screen.findByRole("region", { name: "Ajuste de orçamento" });
    expect(within(budget).getByText(/Há um ajuste da equipe em vigor/u)).toBeDefined();
    await user.click(within(budget).getByRole("button", { name: "Voltar ao plano" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Remover o ajuste de Northwind?" });
    await expectNoAxeViolations(container.ownerDocument.body);
    await user.click(within(dialog).getByRole("button", { name: "Remover ajuste" }));
    expect(await screen.findByText("Northwind voltou aos limites do plano.")).toBeDefined();
    expect(api.calls.find((call) => call.method === "PUT")?.body).toEqual({ override: null });
  });

  it("suspends after a confirmation and can reactivate", async () => {
    const suspended = buildOrganizationSummary({ status: "suspended" });
    const { user, api } = render({ routes: routes(NORTHWIND, { "PATCH /v1/admin/organizations/:organizationId": ok(suspended) }) });
    await user.click(await screen.findByRole("button", { name: "Suspender organização" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Suspender Northwind?" });
    expect(api.calls.some((call) => call.method === "PATCH")).toBe(false);
    await user.click(within(dialog).getByRole("button", { name: "Suspender" }));
    expect(await screen.findByText("Northwind foi suspensa.")).toBeDefined();
    expect(api.calls.find((call) => call.method === "PATCH")?.body).toEqual({ status: "suspended" });
    expect(await screen.findByRole("button", { name: "Reativar organização" })).toBeDefined();
    expect(screen.getAllByText("Suspensa").length).toBeGreaterThan(0);
  });

  it("keeps the confirmation open with the error and its reference when the write fails", async () => {
    const { user } = render({ routes: routes(NORTHWIND, { "PATCH /v1/admin/organizations/:organizationId": apiError(403, "FORBIDDEN") }) });
    await user.click(await screen.findByRole("button", { name: "Suspender organização" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Suspender Northwind?" });
    await user.click(within(dialog).getByRole("button", { name: "Suspender" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("Você não tem permissão para fazer isso.");
    expect(alert.textContent).toContain(FAKE_REQUEST_ID);
  });

  it("is read-only for the support role", async () => {
    const { api, container } = render({ role: "platform-support" });
    expect(await screen.findByRole("region", { name: "Resumo" })).toBeDefined();
    expect(screen.getByText(/Seu papel na equipe só permite consultar/u)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Suspender organização" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Plano" })).toBeNull();
    expect(within(section("Ver esta organização em")).getAllByRole("link").map((link) => link.textContent)).toEqual(["Conectores", "Traces", "Custos"]);
    expect(api.callLines()).not.toContain("GET /v1/admin/plans");
    await expectNoAxeViolations(container);
  });

  it("holds writes while offline", async () => {
    render();
    const suspend = await screen.findByRole("button", { name: "Suspender organização" });
    try {
      setOnline(false);
      await waitFor(() => expect(suspend.hasAttribute("disabled")).toBe(true));
      expect(screen.getByRole("button", { name: "Salvar ajuste" }).hasAttribute("disabled")).toBe(true);
    } finally {
      setOnline(true);
    }
  });

  it("is not found when the API answers 404", async () => {
    render({ path: "/admin/organizations/Unknown0000000000001", routes: routes(NORTHWIND, { "GET /v1/admin/organizations/:organizationId": apiError(404, "NOT_FOUND") }) });
    expect(await screen.findByRole("heading", { level: 1, name: "Página não encontrada" })).toBeDefined();
  });

  it("shows an error with the request reference and a retry", async () => {
    const { user, api, container } = render({ routes: routes(NORTHWIND, { "GET /v1/admin/organizations/:organizationId": apiError(409, "CONFLICT") }) });
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(screen.getByText(new RegExp(FAKE_REQUEST_ID, "u"))).toBeDefined();
    await expectNoAxeViolations(container);
    api.route("GET /v1/admin/organizations/:organizationId", ok(NORTHWIND));
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Northwind" })).toBeDefined();
  });

  it("asks for the second factor when the API answers MFA_REQUIRED, and shows no access on another 403", async () => {
    const mfa = render({ routes: routes(NORTHWIND, { "GET /v1/admin/organizations/:organizationId": apiError(403, "MFA_REQUIRED") }) });
    expect(await screen.findByRole("link", { name: /segundo fator|verificação em duas etapas|segurança/iu })).toBeDefined();
    mfa.unmount();
    render({ routes: routes(NORTHWIND, { "GET /v1/admin/organizations/:organizationId": apiError(403, "FORBIDDEN") }) });
    await waitFor(() => expect(screen.queryByRole("region", { name: "Resumo" })).toBeNull());
    expect(await screen.findByText(/Peça a um administrador da plataforma/u)).toBeDefined();
  });
});
