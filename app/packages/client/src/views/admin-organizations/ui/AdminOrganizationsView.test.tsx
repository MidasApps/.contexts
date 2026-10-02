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
    await expectNoAxeViolations(container);
  });

  it("sends the search and the status of the URL to the server and writes changes back to the URL", async () => {
    const { user, router, api } = render({
      path: "/admin/organizations?status=suspended",
      routes: {
        ...routes(),
        "GET /v1/admin/organizations": (request) => page(request.query.get("query") === "north" ? [] : request.query.get("status") === "suspended" ? [CONTOSO] : [NORTHWIND, CONTOSO]),
      },
    });
    const table = await screen.findByRole("table", { name: "Organizações da plataforma" });
    expect(within(table).queryByRole("row", { name: /Northwind/u })).toBeNull();
    expect(within(table).getByRole("row", { name: /Contoso/u })).toBeDefined();
    await user.type(screen.getByRole("searchbox", { name: "Buscar organização" }), "north");
    expect(router.current()).toBe("/admin/organizations?status=suspended&q=north");
    expect(await screen.findByRole("heading", { level: 2, name: "Nenhuma organização com esses filtros" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(router.current()).toBe("/admin/organizations");
    expect(await screen.findByRole("row", { name: /Northwind/u })).toBeDefined();
    const asked = api.calls.filter((call) => call.path === "/v1/admin/organizations").map((call) => call.query);
    expect(asked[0]).toBe("?limit=20&status=suspended");
    // Typing a word asks once, after the pause: never one request per key.
    expect(asked).toContain("?limit=20&query=north&status=suspended");
    expect(asked.filter((query) => query.includes("query=")).length).toBe(1);
    expect(asked.at(-1)).toBe("?limit=20");
  });

  it("pages by the API cursor and keeps the loaded pages", async () => {
    const many = Array.from({ length: 25 }, (_, index) => buildOrganizationSummary({ id: `Org${String(index).padStart(17, "0")}`, name: `Org ${String(index + 1).padStart(2, "0")}` }));
    const { user, api } = render({
      routes: {
        ...routes(),
        "GET /v1/admin/organizations": (request) => (request.query.get("cursor") === "next" ? page(many.slice(20), { limit: 20 }) : page(many.slice(0, 20), { cursor: "next", limit: 20 })),
      },
    });
    const table = await screen.findByRole("table", { name: "Organizações da plataforma" });
    expect(within(table).getAllByRole("row")).toHaveLength(21);
    const pages = screen.getByRole("navigation", { name: "Páginas de organizações" });
    await user.click(within(pages).getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(within(screen.getByRole("table", { name: "Organizações da plataforma" })).getAllByRole("row")).toHaveLength(6));
    expect(within(pages).getByRole("button", { name: "Próxima" }).hasAttribute("disabled")).toBe(true);
    await user.click(within(pages).getByRole("button", { name: "Anterior" }));
    await waitFor(() => expect(within(screen.getByRole("table", { name: "Organizações da plataforma" })).getAllByRole("row")).toHaveLength(21));
    expect(api.calls.filter((call) => call.path === "/v1/admin/organizations").map((call) => call.query)).toEqual(["?limit=20", "?limit=20&cursor=next"]);
  });

  it("shows the plan id to a role that cannot read the plan catalog", async () => {
    const { api } = render({ role: "platform-support" });
    const northwind = await screen.findByRole("row", { name: /Northwind/u });
    expect(within(northwind).getByText(ADMIN_IDS.plan)).toBeDefined();
    expect(api.callLines()).not.toContain("GET /v1/admin/plans");
  });

  it("explains how organizations appear, without leaving the console", async () => {
    const { container } = render({ routes: routes([]) });
    expect(await screen.findByRole("heading", { level: 2, name: "Nenhuma organização ainda" })).toBeDefined();
    expect(screen.getByText("As organizações aparecem aqui quando alguém cria uma no app.")).toBeDefined();
    expect(screen.queryByRole("link", { name: "Ver minhas organizações" })).toBeNull();
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
