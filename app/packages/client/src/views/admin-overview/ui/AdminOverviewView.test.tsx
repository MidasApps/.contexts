import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { buildAdminOverview } from "#/shared/testing/admin-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, FAKE_REQUEST_ID, ok } from "#/shared/testing/fake-api.ts";
import { AdminOverviewView } from "./AdminOverviewView.tsx";

const plain = (text: string | null): string => (text ?? "").replace(/\s/gu, " ");
const kpi = (label: string): HTMLElement => {
  const term = screen.getByText(label);
  const card = term.closest("[data-slot='kpi-card']");
  if (!(card instanceof HTMLElement)) throw new Error(`no KPI card for ${label}`);
  return card;
};

describe("AdminOverviewView", () => {
  it("shows the platform numbers with money and rates formatted for the locale", async () => {
    const { container } = renderAdmin(<AdminOverviewView />, {
      routes: { "GET /v1/admin/overview": ok(buildAdminOverview()) },
    });
    expect(await screen.findByRole("heading", { level: 2, name: "Números da plataforma" })).toBeDefined();
    expect(screen.getByRole("heading", { level: 1, name: "Administração da plataforma" })).toBeDefined();
    expect(within(kpi("Organizações ativas")).getByText("12")).toBeDefined();
    expect(within(kpi("Usuários ativos")).getByText("87")).toBeDefined();
    const cost = kpi("Custo no mês").querySelector("dd");
    expect(plain(cost?.textContent ?? null)).toBe("US$ 12,50");
    expect(cost?.className).toContain("tabular-nums");
    expect(cost?.className).toContain("font-mono");
    expect(plain(kpi("Paradas por guardrail").querySelector("dd")?.textContent ?? null)).toBe("1,2%");
    expect(plain(kpi("Aprovações").querySelector("dd")?.textContent ?? null)).toBe("92%");
    expect(within(kpi("Avaliação dos agentes")).getByText("Aprovada")).toBeDefined();
    // 12:00 UTC shown in the browser zone of the test run is still a formatted instant, never the ISO string.
    expect(screen.getByText(/^Atualizado em /u).textContent).not.toContain("T12:00");
    await expectNoAxeViolations(container);
  });

  it("says a number is not measured instead of showing its placeholder value", async () => {
    const { container } = renderAdmin(<AdminOverviewView />, {
      routes: { "GET /v1/admin/overview": ok(buildAdminOverview({ tripwireRate: 0, unmeasured: ["tripwireRate"] })) },
    });
    await screen.findByRole("heading", { level: 2, name: "Números da plataforma" });
    const card = kpi("Paradas por guardrail");
    expect(card.textContent).not.toContain("0%");
    expect(within(card).getByText("Não medido")).toBeDefined();
    expect(within(card).getByText("As paradas por guardrail ainda não são registradas")).toBeDefined();
    expect(plain(kpi("Aprovações").querySelector("dd")?.textContent ?? null)).toBe("92%");
    await expectNoAxeViolations(container);
  });

  it("links each KPI to its area, only when the role may open it, and shows no second staff badge", async () => {
    const { container } = renderAdmin(<AdminOverviewView />, {
      routes: { "GET /v1/admin/overview": ok(buildAdminOverview()) },
    });
    await screen.findByRole("heading", { level: 2, name: "Números da plataforma" });
    expect(
      within(kpi("Organizações ativas")).getByRole("link", { name: "Organizações ativas" }).getAttribute("href"),
    ).toBe("/admin/organizations");
    expect(within(kpi("Custo no mês")).getByRole("link", { name: "Custo no mês" }).getAttribute("href")).toBe(
      "/admin/costs",
    );
    expect(
      within(kpi("Avaliação dos agentes")).getByRole("link", { name: "Avaliação dos agentes" }).getAttribute("href"),
    ).toBe("/admin/evals");
    expect(within(kpi("Aprovações")).queryByRole("link")).toBeNull();
    expect(screen.queryByText("Equipe da plataforma")).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("keeps a KPI as plain text when the role cannot open its area", async () => {
    renderAdmin(<AdminOverviewView />, {
      role: "platform-support",
      routes: { "GET /v1/admin/overview": ok(buildAdminOverview()) },
    });
    await screen.findByRole("heading", { level: 2, name: "Números da plataforma" });
    expect(within(kpi("Avaliação dos agentes")).queryByRole("link")).toBeNull();
    expect(within(kpi("Custo no mês")).getByRole("link", { name: "Custo no mês" })).toBeDefined();
  });

  it("formats the numbers in another locale", async () => {
    renderAdmin(<AdminOverviewView />, {
      locale: "en-US",
      routes: { "GET /v1/admin/overview": ok(buildAdminOverview({ evalStatus: "failed" })) },
    });
    expect(await screen.findByRole("heading", { level: 2, name: "Platform numbers" })).toBeDefined();
    expect(plain(kpi("Cost this month").querySelector("dd")?.textContent ?? null)).toBe("$12.50");
    expect(within(kpi("Agent evaluation")).getByText("Failed")).toBeDefined();
  });

  it("lists the areas the support role may open, each linking to its page", async () => {
    renderAdmin(<AdminOverviewView />, {
      role: "platform-support",
      routes: { "GET /v1/admin/overview": ok(buildAdminOverview()) },
    });
    const areas = await screen.findByRole("region", { name: "Áreas" });
    expect(
      within(areas)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual([
      "/admin/organizations",
      "/admin/users",
      "/admin/traces",
      "/admin/logs",
      "/admin/costs",
      "/admin/connectors",
    ]);
    expect(within(areas).getByRole("link", { name: /Custos.*Uso e custos por organização/u })).toBeDefined();
  });

  it("gives the platform administrator every area", async () => {
    renderAdmin(<AdminOverviewView />, { routes: { "GET /v1/admin/overview": ok(buildAdminOverview()) } });
    const areas = await screen.findByRole("region", { name: "Áreas" });
    expect(within(areas).getAllByRole("link")).toHaveLength(11);
  });

  it("keeps the areas reachable when the numbers fail, with the reference and a retry", async () => {
    const { user, api, container } = renderAdmin(<AdminOverviewView />, {
      routes: { "GET /v1/admin/overview": apiError(409, "CONFLICT") },
    });
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(screen.getByText(new RegExp(FAKE_REQUEST_ID, "u"))).toBeDefined();
    expect(screen.getByRole("region", { name: "Áreas" })).toBeDefined();
    await expectNoAxeViolations(container);
    api.route("GET /v1/admin/overview", ok(buildAdminOverview({ evalStatus: "unknown" })));
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(
      await within(await screen.findByRole("region", { name: "Números da plataforma" })).findByText("Sem resultado"),
    ).toBeDefined();
  });

  it("asks for the second factor when the session has none", async () => {
    renderAdmin(<AdminOverviewView />, { routes: { "GET /v1/admin/overview": apiError(403, "MFA_REQUIRED") } });
    expect(
      await screen.findByRole("heading", { level: 2, name: "Confirme a verificação em duas etapas" }),
    ).toBeDefined();
  });

  it("shows a skeleton while the numbers load", async () => {
    let release: (value: unknown) => void = () => undefined;
    const gate = new Promise((resolve) => (release = resolve));
    renderAdmin(<AdminOverviewView />, {
      routes: { "GET /v1/admin/overview": async () => (await gate, ok(buildAdminOverview())) },
    });
    expect(
      (await screen.findByText("Carregando os números da plataforma…"))
        .closest("[role=status]")
        ?.getAttribute("aria-busy"),
    ).toBe("true");
    release(undefined);
    expect(await screen.findByRole("heading", { level: 2, name: "Números da plataforma" })).toBeDefined();
  });
});
