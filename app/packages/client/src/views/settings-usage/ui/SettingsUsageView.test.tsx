import type { Permission } from "@core/contracts";
import { configure, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { buildTenantAgentSettings, buildUsageSummary, buildUsageTotals } from "#/entities/usage/usage.fixture.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, ok, type FakeRequest, type FakeRoutes } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { SettingsUsageView } from "./SettingsUsageView.tsx";

// Sibling test runs load the machine: the shell boot alone can take seconds, so waits and tests get room.
configure({ asyncUtilTimeout: 15_000 });
vi.setConfig({ testTimeout: 60_000 });

const READER: Permission[] = ["core.organization.read", "core.usage.read"];
const ADMIN: Permission[] = [...READER, "core.agent-settings.read", "core.agent-settings.update"];
const NOW = () => new Date("2026-10-01T12:00:00.000Z");

const renderView = (routes: FakeRoutes = {}, permissions: readonly Permission[] = ADMIN) =>
  renderApp(
    <main>
      <SettingsUsageView now={NOW} />
    </main>,
    {
      path: `/o/${IDS.organization}/settings/usage`,
      routes: shellRoutes(permissions, { "GET /v1/usage": ok(buildUsageSummary()), "GET /v1/agent-settings": ok(buildTenantAgentSettings()), ...routes }),
    },
  );

describe("SettingsUsageView", () => {
  it("shows the month totals, both caps within the limit and the per-model breakdown", async () => {
    const requests: FakeRequest[] = [];
    const { container } = renderView({
      "GET /v1/usage": (request: FakeRequest) => {
        requests.push(request);
        return ok(buildUsageSummary());
      },
    });
    const totals = await screen.findByRole("region", { name: "Totais do mês" });
    expect(within(totals).getByText("US$ 12,34")).toBeDefined();
    expect(within(totals).getByText("62.000")).toBeDefined();
    const budget = screen.getByRole("region", { name: "Orçamento" });
    expect(within(budget).getAllByText("Dentro do limite")).toHaveLength(2);
    expect(within(budget).getByRole("meter", { name: "Gasto no mês" }).getAttribute("aria-valuenow")).toBe("25");
    expect(within(budget).queryByRole("alert")).toBeNull();
    const models = screen.getByRole("table", { name: "Uso por modelo no mês" });
    expect(within(models).getByText("gemini-3.5-flash")).toBeDefined();
    expect(requests[0]?.query.get("organizationId")).toBe(IDS.organization);
    expect(requests[0]?.query.get("month")).toBe("2026-10");
    await expectNoAxeViolations(container);
  });

  it("says in words when usage is near the cap and when the cap is reached", async () => {
    renderView({
      "GET /v1/usage": ok(buildUsageSummary({ totals: buildUsageTotals({ costMicroUsd: 45_000_000, inputTokens: 15_000_000, outputTokens: 5_000_000 }) })),
    });
    const budget = await screen.findByRole("region", { name: "Orçamento" });
    expect(within(budget).getByText("Perto do limite")).toBeDefined();
    expect(within(budget).getByText("Limite atingido")).toBeDefined();
    expect(within(budget).getByRole("alert").textContent).toContain("O limite mensal foi atingido");
  });

  it("reads an earlier month when it is picked", async () => {
    const months: (string | null)[] = [];
    const { user } = renderView({
      "GET /v1/usage": (request: FakeRequest) => {
        months.push(request.query.get("month"));
        return ok(buildUsageSummary({ month: request.query.get("month"), totals: buildUsageTotals({ calls: 0, inputTokens: 0, outputTokens: 0, costMicroUsd: 0 }), byModel: [] }));
      },
    });
    await screen.findByRole("region", { name: "Totais do mês" });
    await user.click(screen.getByRole("combobox", { name: "Mês" }));
    await user.click(await screen.findByRole("option", { name: "setembro de 2026" }));
    await waitFor(() => expect(months).toContain("2026-09"));
    expect(await screen.findByRole("heading", { name: "Nenhum uso neste mês" })).toBeDefined();
  });

  it("saves a lower own cap for the organization and removes it", async () => {
    const patches: FakeRequest[] = [];
    const { user } = renderView({
      "PATCH /v1/agent-settings": (request: FakeRequest) => {
        patches.push(request);
        return ok(buildTenantAgentSettings());
      },
    });
    const card = await screen.findByRole("region", { name: "Limite próprio da organização" });
    const spend = await within(card).findByRole("textbox", { name: /Limite de gasto mensal/u });
    await user.clear(spend);
    await user.type(spend, "20,00");
    const tokens = within(card).getByRole("textbox", { name: /Limite mensal de tokens/u });
    await user.clear(tokens);
    await user.type(tokens, "10000000");
    await user.tab();
    // The token cap reads grouped once typed.
    expect((tokens as HTMLInputElement).value).toBe("10.000.000");
    await user.click(within(card).getByRole("button", { name: "Salvar limite" }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]?.query.get("organizationId")).toBe(IDS.organization);
    expect(patches[0]?.body).toEqual({ budget: { monthlyMicroUsd: 20_000_000, monthlyTokens: 10_000_000 } });

    // Removing lifts a cost guard: it asks first, and Cancel sends nothing.
    await user.click(await within(card).findByRole("button", { name: "Remover limite próprio" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Remover o limite próprio da organização?" });
    await user.click(within(confirm).getByRole("button", { name: "Cancelar" }));
    expect(patches).toHaveLength(1);
    await user.click(within(card).getByRole("button", { name: "Remover limite próprio" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remover limite" }));
    await waitFor(() => expect(patches).toHaveLength(2));
    expect(patches[1]?.body).toEqual({ budget: null });
  });

  it("explains a cap above the plan instead of a generic validation error", async () => {
    const { user } = renderView({
      "PATCH /v1/agent-settings": apiError(400, "VALIDATION_FAILED", [{ field: "budget.monthlyMicroUsd", issue: "ABOVE_PLAN" }]),
    });
    const card = await screen.findByRole("region", { name: "Limite próprio da organização" });
    await user.click(await within(card).findByRole("button", { name: "Salvar limite" }));
    expect((await within(card).findByRole("alert")).textContent).toContain("O limite informado é maior que o do plano.");
  });

  it("closes the remove confirmation on a failure and shows why next to the form", async () => {
    const { user } = renderView({ "PATCH /v1/agent-settings": apiError(403, "FORBIDDEN") });
    const card = await screen.findByRole("region", { name: "Limite próprio da organização" });
    await user.click(await within(card).findByRole("button", { name: "Remover limite próprio" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remover limite" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect((await within(card).findByRole("alert")).textContent).toContain("Você não tem permissão");
  });

  it("shows no cap form to a viewer who can only read usage", async () => {
    const { api } = renderView({}, READER);
    await screen.findByRole("region", { name: "Totais do mês" });
    expect(screen.queryByRole("region", { name: "Limite próprio da organização" })).toBeNull();
    expect(api.callLines().some((line) => line.includes("/v1/agent-settings"))).toBe(false);
  });

  it("shows no-access without the read permission and never asks for usage", async () => {
    const { api } = renderView({}, ["core.organization.read"]);
    expect(await screen.findByText("Peça a um administrador da organização para liberar esta seção.")).toBeDefined();
    expect(api.callLines().some((line) => line.includes("/v1/usage"))).toBe(false);
  });

  it("shows the error with its reference and a retry when usage fails", async () => {
    renderView({ "GET /v1/usage": apiError(503, "UPSTREAM_UNAVAILABLE") });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Referência:");
    expect(within(alert).getByRole("button", { name: "Tentar novamente" })).toBeDefined();
  });
});
