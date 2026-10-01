import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { buildAdminOverview, buildOrganizationSummary } from "#/shared/testing/admin-fixtures.ts";
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
    expect(screen.getByText("Custo por dia e por modelo ainda não disponível")).toBeDefined();
    await expectNoAxeViolations(container);
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
