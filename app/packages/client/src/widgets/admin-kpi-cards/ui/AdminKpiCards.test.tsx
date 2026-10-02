import { AdminOverviewSchema } from "@core/contracts";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { buildAdminOverview } from "#/shared/testing/admin-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { AdminKpiCards } from "./AdminKpiCards.tsx";

const overview = (overrides: Record<string, unknown> = {}) => AdminOverviewSchema.parse(buildAdminOverview({ unmeasured: [], ...overrides }));

const stat = (term: string): HTMLElement => {
  const label = screen.getByText(term, { selector: "dt, dt a" });
  return label.closest('[data-slot="kpi-card"]') as HTMLElement;
};

describe("AdminKpiCards", () => {
  it("shows the platform numbers in the UI locale, with the eval verdict in words", async () => {
    const { container } = renderAdmin(<AdminKpiCards overview={overview()} />);
    expect(await screen.findByRole("heading", { level: 2, name: "Números da plataforma" })).toBeDefined();
    expect(within(stat("Organizações ativas")).getByText("12")).toBeDefined();
    expect(within(stat("Paradas por guardrail")).getByText(/^1,2\s?%$/u)).toBeDefined();
    expect(within(stat("Aprovações")).getByText(/^92\s?%$/u)).toBeDefined();
    expect(within(stat("Custo no mês")).getByText(/US\$\s?12,50/u)).toBeDefined();
    expect(within(stat("Avaliação dos agentes")).getByText("Aprovada")).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("never shows an unmeasured rate as a number", async () => {
    renderAdmin(<AdminKpiCards overview={overview({ unmeasured: ["tripwireRate"], tripwireRate: 0 })} />);
    const tripwire = await screen.findByText("Paradas por guardrail");
    const card = tripwire.closest('[data-slot="kpi-card"]') as HTMLElement;
    expect(within(card).getByText("Não medido")).toBeDefined();
    expect(card.textContent).not.toMatch(/0\s?%/u);
  });

  it("links the stats to their area only for a role that may open it", async () => {
    const admin = renderAdmin(<AdminKpiCards overview={overview()} />);
    expect((await screen.findByRole("link", { name: "Organizações ativas" })).getAttribute("href")).toBe("/admin/organizations");
    expect(screen.getByRole("link", { name: "Custo no mês" }).getAttribute("href")).toBe("/admin/costs");
    expect(screen.getByRole("link", { name: "Avaliação dos agentes" }).getAttribute("href")).toBe("/admin/evals");
    expect(screen.queryByRole("link", { name: "Usuários ativos" })).toBeNull();
    admin.unmount();
    renderAdmin(<AdminKpiCards overview={overview({ evalStatus: "failed" })} />, { role: "platform-support" });
    expect(await screen.findByText("Reprovada")).toBeDefined();
    expect(screen.queryByRole("link", { name: "Avaliação dos agentes" })).toBeNull();
  });
});
