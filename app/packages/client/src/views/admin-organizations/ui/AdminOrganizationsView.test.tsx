import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { ADMIN_IDS, buildOrganizationSummary, buildPlan } from "#/shared/testing/admin-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, FAKE_REQUEST_ID, ok, page } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { AdminOrganizationsView } from "./AdminOrganizationsView.tsx";

const plain = (text: string | null): string => (text ?? "").replace(/\s/gu, " ");

const NORTHWIND = buildOrganizationSummary();
const CONTOSO = buildOrganizationSummary({
  id: IDS.otherOrganization,
  name: "Contoso",
  status: "suspended",
  planId: null,
  budget: { caps: { monthlyMicroUsd: 10_000_000, monthlyTokens: 1_000_000 }, source: "override", override: { monthlyMicroUsd: 10_000_000, monthlyTokens: 1_000_000 } },
  costMtdMicroUsd: 12_000_000,
});

const routes = (organizations: readonly unknown[] = [NORTHWIND, CONTOSO]) => ({
  "GET /v1/admin/organizations": page(organizations),
  "GET /v1/admin/plans": ok([buildPlan()]),
});

const render = (options: Parameters<typeof renderAdmin>[1] = {}) => renderAdmin(<AdminOrganizationsView />, { path: "/admin/organizations", routes: routes(), ...options });

describe("AdminOrganizationsView", () => {
  it("lists organizations with status, plan, cost and budget use", async () => {
    const { container } = render();
    const table = await screen.findByRole("table", { name: "Organizações da plataforma" });
    const northwind = within(table).getByRole("row", { name: /Northwind/u });
    expect(within(northwind).getByText("Ativa")).toBeDefined();
    await waitFor(() => expect(within(northwind).getByText("Standard")).toBeDefined());
    expect(plain(northwind.textContent)).toContain("US$ 1,25");
    expect(plain(northwind.textContent)).toContain("US$ 50,00");
    expect(within(northwind).getByText("Do plano")).toBeDefined();
    expect(within(northwind).getByRole("link", { name: "Abrir Northwind" }).getAttribute("href")).toBe(`/admin/organizations/${IDS.organization}`);
    const contoso = within(table).getByRole("row", { name: /Contoso/u });
    expect(within(contoso).getByText("Suspensa")).toBeDefined();
    expect(within(contoso).getAllByText("Padrão da plataforma")).toHaveLength(1);
    expect(within(contoso).getByText("Ajuste da equipe")).toBeDefined();
    expect(plain(within(contoso).getByText(/Acima do limite/u).textContent)).toBe("Acima do limite: 120%");
    expect(screen.getByRole("status").textContent).toBe("2 organizações");
    await expectNoAxeViolations(container);
  });

  it("filters by the search and status in the URL and writes changes back to it", async () => {
    const { user, router } = render({ path: "/admin/organizations?status=suspended" });
    const table = await screen.findByRole("table", { name: "Organizações da plataforma" });
    expect(within(table).queryByRole("row", { name: /Northwind/u })).toBeNull();
    expect(within(table).getByRole("row", { name: /Contoso/u })).toBeDefined();
    await user.type(screen.getByRole("searchbox", { name: "Buscar organização" }), "north");
    expect(router.current()).toBe("/admin/organizations?status=suspended&q=north");
    expect(await screen.findByRole("heading", { level: 2, name: "Nenhuma organização com esses filtros" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(router.current()).toBe("/admin/organizations");
    expect(await screen.findByRole("row", { name: /Northwind/u })).toBeDefined();
  });

  it("finds an organization by id, ignoring accents and case", async () => {
    render({ path: `/admin/organizations?q=${IDS.otherOrganization.toLowerCase()}` });
    const table = await screen.findByRole("table", { name: "Organizações da plataforma" });
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(within(table).getByRole("row", { name: /Contoso/u })).toBeDefined();
  });

  it("pages the list and keeps the page in the URL", async () => {
    const many = Array.from({ length: 25 }, (_, index) => buildOrganizationSummary({ id: `Org${String(index).padStart(17, "0")}`, name: `Org ${String(index + 1).padStart(2, "0")}` }));
    const { user, router } = render({ routes: routes(many) });
    const table = await screen.findByRole("table", { name: "Organizações da plataforma" });
    expect(within(table).getAllByRole("row")).toHaveLength(21);
    const pages = screen.getByRole("navigation", { name: "Páginas de organizações" });
    await user.click(within(pages).getByRole("button", { name: "Próxima" }));
    expect(router.current()).toBe("/admin/organizations?page=2");
    await waitFor(() => expect(within(screen.getByRole("table", { name: "Organizações da plataforma" })).getAllByRole("row")).toHaveLength(6));
    expect(within(pages).getByRole("button", { name: "Próxima" }).hasAttribute("disabled")).toBe(true);
  });

  it("reads every cursor page of the API", async () => {
    const { api } = render({
      routes: {
        ...routes(),
        "GET /v1/admin/organizations": (request) => (request.query.get("cursor") === "next" ? page([CONTOSO]) : page([NORTHWIND], { cursor: "next" })),
      },
    });
    expect(await screen.findByRole("row", { name: /Contoso/u })).toBeDefined();
    expect(api.calls.filter((call) => call.path === "/v1/admin/organizations").map((call) => call.query)).toEqual(["?limit=100", "?limit=100&cursor=next"]);
  });

  it("shows the plan id to a role that cannot read the plan catalog", async () => {
    const { api } = render({ role: "platform-support" });
    const northwind = await screen.findByRole("row", { name: /Northwind/u });
    expect(within(northwind).getByText(ADMIN_IDS.plan)).toBeDefined();
    expect(api.callLines()).not.toContain("GET /v1/admin/plans");
  });

  it("explains an empty platform and offers a way on", async () => {
    const { container } = render({ routes: routes([]) });
    expect(await screen.findByRole("heading", { level: 2, name: "Nenhuma organização ainda" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Ver minhas organizações" }).getAttribute("href")).toBe("/organizations");
    await expectNoAxeViolations(container);
  });

  it("shows an error with the request reference and a retry", async () => {
    const { user, api, container } = render({ routes: { ...routes(), "GET /v1/admin/organizations": apiError(409, "CONFLICT") } });
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(screen.getByText(new RegExp(FAKE_REQUEST_ID, "u"))).toBeDefined();
    await expectNoAxeViolations(container);
    api.route("GET /v1/admin/organizations", page([NORTHWIND]));
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("row", { name: /Northwind/u })).toBeDefined();
  });

  it("shows cards instead of a table on a phone", async () => {
    const matchMedia = globalThis.matchMedia;
    globalThis.matchMedia = (query: string) => ({ ...matchMedia(query), matches: query.includes("max-width") });
    try {
      const { container } = render();
      const list = await screen.findByRole("list", { name: "Organizações da plataforma" });
      expect(within(list).getAllByRole("listitem")).toHaveLength(2);
      expect(plain(within(list).getAllByRole("listitem")[0]?.textContent ?? null)).toContain("US$ 1,25 de US$ 50,00 no mês");
      expect(screen.queryByRole("table")).toBeNull();
      await expectNoAxeViolations(container);
    } finally {
      globalThis.matchMedia = matchMedia;
    }
  });
});
