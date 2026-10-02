import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { buildAdminOverview, buildAdminUsage, buildOrganizationSummary } from "#/shared/testing/admin-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, FAKE_REQUEST_ID, ok, page, type FakeRoutes } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { AdminCostsView } from "./AdminCostsView.tsx";

const plain = (text: string | null | undefined): string => (text ?? "").replace(/\s/gu, " ");
const caps = (monthlyMicroUsd: number) => ({ caps: { monthlyMicroUsd, monthlyTokens: 20_000_000 }, source: "plan", override: null });

const NORTHWIND = buildOrganizationSummary(); // 1.25 of 50: fine
const CONTOSO = buildOrganizationSummary({ id: IDS.otherOrganization, name: "Contoso", budget: caps(10_000_000), costMtdMicroUsd: 12_000_000 }); // over
const FABRIKAM = buildOrganizationSummary({ id: "Fab0000000000000000A", name: "Fabrikam", budget: caps(10_000_000), costMtdMicroUsd: 8_500_000 }); // alert

const routes = (extra: FakeRoutes = {}): FakeRoutes => ({
  "GET /v1/admin/organizations": page([NORTHWIND, CONTOSO, FABRIKAM]),
  "GET /v1/admin/overview": ok(buildAdminOverview({ costMtdMicroUsd: 21_750_000 })),
  "GET /v1/admin/usage": ok(buildAdminUsage()),
  ...extra,
});

const render = (options: Parameters<typeof renderAdmin>[1] = {}) => renderAdmin(<AdminCostsView />, { path: "/admin/costs", routes: routes(), ...options });
const kpi = (label: string): string => plain(screen.getByText(label, { selector: "dt" }).closest("[data-slot='kpi-card']")?.querySelector("dd")?.textContent);

describe("AdminCostsView", () => {
  it("shows the API total, who is at or over the alert, the chart and the budgets", async () => {
    const { container } = render({ role: "platform-support" });
    await screen.findByRole("heading", { level: 2, name: "Resumo do mês" });
    await waitFor(() => expect(kpi("Custo no mês")).toBe("US$ 21,75"));
    expect(kpi("Em 80% ou mais")).toBe("2");
    expect(kpi("Acima do limite")).toBe("1");
    // The chart's total and rows are the API's numbers.
    expect(plain(screen.getByText(/Total do mês/u).textContent)).toBe("Total do mês: US$ 21,75");
    const chart = screen.getByRole("table", { name: "Custo no mês e limite" });
    expect(within(within(chart).getByRole("row", { name: /Contoso/u })).getAllByRole("cell").map((cell) => plain(cell.textContent))).toEqual(["US$ 12,00", "US$ 10,00"]);
    const attention = screen.getByRole("region", { name: "Precisam de atenção" });
    expect(attention.textContent).toContain("80%");
    expect(within(attention).getAllByRole("listitem").map((item) => item.querySelector(".font-medium")?.textContent)).toEqual(["Contoso", "Fabrikam"]);
    expect(plain(within(attention).getByText(/Acima do limite/u).textContent)).toBe("Acima do limite: 120%");
    const budgets = screen.getByRole("table", { name: "Orçamentos por organização" });
    const row = within(budgets).getByRole("row", { name: /Fabrikam/u });
    expect(plain(row.textContent)).toContain("US$ 8,50");
    expect(plain(row.textContent)).toContain("20.000.000");
    expect(within(row).getByText("Do plano")).toBeDefined();
    expect(within(row).getByRole("link", { name: "Ajustar o orçamento de Fabrikam" }).getAttribute("href")).toBe("/admin/organizations/Fab0000000000000000A");
    expect(await screen.findByRole("region", { name: "Uso por dia e por modelo" })).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("shows the usage of the month to date by day and by model, as the API reports it", async () => {
    const { api, container } = render();
    const usage = await screen.findByRole("region", { name: "Uso por dia e por modelo" });
    const byDay = await within(usage).findByRole("table", { name: "Custo por dia" });
    expect(within(byDay).getAllByRole("row")).toHaveLength(3);
    expect(plain(within(byDay).getByRole("row", { name: /29\/09/u }).textContent)).toContain("US$ 1,00");
    const byModel = within(usage).getByRole("table", { name: "Custo por modelo" });
    expect(plain(within(byModel).getByRole("row", { name: /gemini-3\.5-flash/u }).textContent)).toContain("US$ 3,00");
    const models = within(usage).getByRole("table", { name: "Uso por modelo" });
    const haiku = within(models).getByRole("row", { name: /claude-haiku/u });
    expect(plain(haiku.textContent)).toContain("anthropic");
    expect(plain(haiku.textContent)).toContain("US$ 0,50");
    expect(plain(within(usage).getByRole("status").textContent)).toContain("US$ 3,50");
    expect(within(usage).getByText(/1 chamada sem preço/u)).toBeDefined();
    const calls = api.calls.filter((call) => call.path === "/v1/admin/usage");
    expect(calls.map((call) => call.query)).toEqual([""]);
    await expectNoAxeViolations(container);
  });

  it("lists the usage by model as cards on phones", async () => {
    const matchMedia = globalThis.matchMedia;
    globalThis.matchMedia = (query: string) => ({ ...matchMedia(query), matches: query.includes("max-width") });
    try {
      const { container } = render();
      const usage = await screen.findByRole("region", { name: "Uso por dia e por modelo" });
      const models = await within(usage).findByRole("list", { name: "Uso por modelo" });
      expect(within(usage).queryByRole("table", { name: "Uso por modelo" })).toBeNull();
      const haiku = within(models).getAllByRole("listitem").find((item) => item.textContent.includes("claude-haiku"));
      expect(plain(haiku?.textContent)).toContain("anthropic");
      expect(plain(haiku?.textContent)).toContain("US$ 0,50");
      await expectNoAxeViolations(container);
    } finally {
      globalThis.matchMedia = matchMedia;
    }
  });

  it("sends the organization and the days of the URL, writes a picked day back and warns when truncated", async () => {
    const { api, router } = render({
      path: `/admin/costs?organizationId=${IDS.organization}&from=2026-09-01&to=2026-09-30`,
      routes: routes({ "GET /v1/admin/usage": ok(buildAdminUsage({ truncated: true, organizations: 2000 })) }),
    });
    const usage = await screen.findByRole("region", { name: "Uso por dia e por modelo" });
    expect(await within(usage).findByText("Nem todas as organizações entraram na soma")).toBeDefined();
    const first = new URLSearchParams(api.calls.find((call) => call.path === "/v1/admin/usage")?.query);
    expect(Object.fromEntries(first)).toEqual({ from: "2026-09-01", to: "2026-09-30", organizationId: IDS.organization });
    fireEvent.change(within(usage).getByLabelText("Até"), { target: { value: "2026-09-15" } });
    await waitFor(() => expect(router.current()).toBe(`/admin/costs?organizationId=${IDS.organization}&from=2026-09-01&to=2026-09-15`));
    await waitFor(() => expect(new URLSearchParams(api.calls.filter((call) => call.path === "/v1/admin/usage").at(-1)?.query).get("to")).toBe("2026-09-15"));
  });

  it("asks for an end day instead of sending a range the API refuses (more than 92 days)", async () => {
    // Found by the e2e: picking an old start day before the end day sent from=2020-01-01 with the
    // default end (today) and the API answered 400 RANGE_TOO_LONG.
    const { api } = render({ path: "/admin/costs?from=2020-01-01&to=2020-06-30" });
    const usage = await screen.findByRole("region", { name: "Uso por dia e por modelo" });
    expect(await within(usage).findByText("Escolha um período de até 92 dias, com o início antes do fim.")).toBeDefined();
    expect(api.calls.filter((call) => call.path === "/v1/admin/usage")).toHaveLength(0);
    fireEvent.change(within(usage).getByLabelText("Até"), { target: { value: "2020-01-31" } });
    await waitFor(() => expect(new URLSearchParams(api.calls.find((call) => call.path === "/v1/admin/usage")?.query).get("to")).toBe("2020-01-31"));
  });

  it("marks both days of an invalid range as a field error and offers to clear the period", async () => {
    const { router, container } = render({ path: `/admin/costs?organizationId=${IDS.organization}&from=2026-09-30&to=2026-09-01` });
    const usage = await screen.findByRole("region", { name: "Uso por dia e por modelo" });
    const message = await within(usage).findByText("Escolha um período de até 92 dias, com o início antes do fim.");
    expect(message.className).toContain("text-destructive-text");
    for (const label of ["De", "Até"]) {
      const input = within(usage).getByLabelText(label);
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(input.getAttribute("aria-describedby")).toBe(message.id);
    }
    fireEvent.click(within(usage).getByRole("button", { name: "Limpar o período" }));
    await waitFor(() => expect(router.current()).toBe(`/admin/costs?organizationId=${IDS.organization}`));
    expect(within(usage).getByLabelText("De").getAttribute("aria-invalid")).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("explains a range without usage and an unreadable ledger, without hiding the budgets", async () => {
    const zero = { calls: 0, inputTokens: 0, outputTokens: 0, costMicroUsd: 0, unpricedCalls: 0 };
    const empty = render({ path: "/admin/costs?from=2026-09-29", routes: routes({ "GET /v1/admin/usage": ok(buildAdminUsage({ totals: zero, byDay: [], byModel: [] })) }) });
    expect(await screen.findByRole("heading", { level: 3, name: "Nenhum uso no período" })).toBeDefined();
    await empty.user.click(screen.getByRole("button", { name: "Voltar ao mês atual" }));
    expect(empty.router.current()).toBe("/admin/costs");
    empty.unmount();
    const failing = render({ routes: routes({ "GET /v1/admin/usage": apiError(409, "CONFLICT") }) });
    const usage = await screen.findByRole("region", { name: "Uso por dia e por modelo" });
    expect((await within(usage).findByRole("alert")).textContent).toContain(FAKE_REQUEST_ID);
    expect(screen.getByRole("heading", { level: 2, name: "Resumo do mês" })).toBeDefined();
    failing.api.route("GET /v1/admin/usage", ok(buildAdminUsage()));
    await failing.user.click(within(usage).getByRole("button", { name: "Tentar novamente" }));
    expect(await within(usage).findByRole("table", { name: "Custo por dia" })).toBeDefined();
  });

  it("falls back to the sum of the listed organizations when the overview fails", async () => {
    render({ routes: routes({ "GET /v1/admin/overview": apiError(409, "CONFLICT") }) });
    await screen.findByRole("heading", { level: 2, name: "Resumo do mês" });
    expect(kpi("Custo no mês")).toBe("US$ 21,75");
  });

  it("filters the budgets by level from the URL and writes the filter back", async () => {
    const { user, router } = render({ path: "/admin/costs?level=over" });
    const budgets = await screen.findByRole("table", { name: "Orçamentos por organização" });
    expect(within(budgets).getAllByRole("row")).toHaveLength(2);
    expect(within(budgets).getByRole("row", { name: /Contoso/u })).toBeDefined();
    await user.click(screen.getByRole("combobox", { name: "Nível de uso" }));
    await user.click(await screen.findByRole("option", { name: "A partir do alerta" }));
    expect(router.current()).toBe("/admin/costs?level=alert");
    await waitFor(() => expect(within(screen.getByRole("table", { name: "Orçamentos por organização" })).getAllByRole("row")).toHaveLength(3));
  });

  it("says when no organization is at the chosen level and clears the filter", async () => {
    const { user, router } = render({ path: "/admin/costs?level=over", routes: routes({ "GET /v1/admin/organizations": page([NORTHWIND]) }) });
    expect(await screen.findByRole("heading", { level: 3, name: "Nenhuma organização nesse nível" })).toBeDefined();
    expect(screen.getByText("Nenhuma organização perto do limite.")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Ver todas" }));
    expect(router.current()).toBe("/admin/costs");
  });

  it("pages the budgets and keeps the page in the URL", async () => {
    const many = Array.from({ length: 25 }, (_, index) => buildOrganizationSummary({ id: `Org${String(index).padStart(17, "0")}`, name: `Org ${String(index + 1).padStart(2, "0")}` }));
    const { user, router } = render({ routes: routes({ "GET /v1/admin/organizations": page(many) }) });
    const pages = await screen.findByRole("navigation", { name: "Páginas de orçamentos" });
    await user.click(within(pages).getByRole("button", { name: "Próxima" }));
    expect(router.current()).toBe("/admin/costs?page=2");
    await waitFor(() => expect(within(screen.getByRole("table", { name: "Orçamentos por organização" })).getAllByRole("row")).toHaveLength(6));
  });

  it("warns that the counts, the alerts and the budgets cover only the organizations read when the list is capped", async () => {
    // Every page says more exist: the client stops at its page cap (20 × 100) and must say so.
    const endless: FakeRoutes[string] = (request) => {
      const index = Number(request.query.get("cursor") ?? "0");
      const over = buildOrganizationSummary({ id: `Org${String(index).padStart(17, "0")}`, name: `Org ${index}`, budget: caps(10_000_000), costMtdMicroUsd: 12_000_000 });
      return page([over], { cursor: String(index + 1) });
    };
    const { container } = render({ routes: routes({ "GET /v1/admin/organizations": endless }) });
    const warning = await screen.findByText("Os números abaixo cobrem só parte das organizações");
    expect(plain(warning.closest("[data-slot='alert']")?.textContent)).toContain("20");
    const summary = screen.getByRole("heading", { level: 2, name: "Resumo do mês" });
    expect(warning.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(kpi("Acima do limite")).toBe("20");
    await expectNoAxeViolations(container);
  });

  it("does not warn when every page was read", async () => {
    render();
    await screen.findByRole("heading", { level: 2, name: "Resumo do mês" });
    expect(screen.queryByText("Os números abaixo cobrem só parte das organizações")).toBeNull();
  });

  it("puts the organizations that need attention right under the numbers, ten at most, with a way to see them all", async () => {
    const flagged = Array.from({ length: 12 }, (_, index) =>
      buildOrganizationSummary({ id: `Org${String(index).padStart(17, "0")}`, name: `Org ${String(index + 1).padStart(2, "0")}`, budget: caps(10_000_000), costMtdMicroUsd: 9_000_000 + index }),
    );
    const { user, router } = render({ routes: routes({ "GET /v1/admin/organizations": page([NORTHWIND, ...flagged]) }) });
    const attention = await screen.findByRole("region", { name: "Precisam de atenção" });
    expect(within(attention).getAllByRole("listitem")).toHaveLength(10);
    expect(within(attention).getByText("Mostrando 10 de 12")).toBeDefined();
    const chart = screen.getByRole("table", { name: "Custo no mês e limite" });
    const summary = screen.getByRole("heading", { level: 2, name: "Resumo do mês" });
    expect(summary.compareDocumentPosition(attention) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(attention.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(within(attention).getByRole("button", { name: "Ver todas as 12" }));
    expect(router.current()).toBe("/admin/costs?level=alert");
  });

  it("explains an empty platform and links to the organizations", async () => {
    const { container } = render({ routes: routes({ "GET /v1/admin/organizations": page([]) }) });
    expect(await screen.findByRole("heading", { level: 2, name: "Nenhum custo para mostrar" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Ver organizações" }).getAttribute("href")).toBe("/admin/organizations");
    await expectNoAxeViolations(container);
  });

  it("shows an error with the request reference and a retry", async () => {
    const { user, api, container } = render({ routes: routes({ "GET /v1/admin/organizations": apiError(409, "CONFLICT") }) });
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(screen.getByText(new RegExp(FAKE_REQUEST_ID, "u"))).toBeDefined();
    await expectNoAxeViolations(container);
    api.route("GET /v1/admin/organizations", page([NORTHWIND]));
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("table", { name: "Orçamentos por organização" })).toBeDefined();
  });

  it("asks for the second factor when the session has none", async () => {
    render({ routes: routes({ "GET /v1/admin/organizations": apiError(403, "MFA_REQUIRED") }) });
    expect(await screen.findByRole("heading", { level: 2, name: "Confirme a verificação em duas etapas" })).toBeDefined();
  });

  it("shows budget cards on a phone and reads in Spanish", async () => {
    const matchMedia = globalThis.matchMedia;
    globalThis.matchMedia = (query: string) => ({ ...matchMedia(query), matches: query.includes("max-width") });
    try {
      const { container } = render({ locale: "es-419" });
      const list = await screen.findByRole("list", { name: "Presupuestos por organización" });
      expect(within(list).getAllByRole("listitem")).toHaveLength(3);
      expect(screen.getByRole("heading", { level: 2, name: "Requieren atención" })).toBeDefined();
      await expectNoAxeViolations(container);
    } finally {
      globalThis.matchMedia = matchMedia;
    }
  });
});
