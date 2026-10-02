import { OrganizationAdminSummarySchema, PlanSchema } from "@core/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { ADMIN_IDS, buildOrganizationSummary, buildPlan } from "#/shared/testing/admin-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, FAKE_REQUEST_ID, ok } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { holdResponse, setOnline } from "#/shared/testing/network.ts";
import { BudgetOverrideForm } from "./BudgetOverrideForm.tsx";
import { OrganizationPlanForm } from "./OrganizationPlanForm.tsx";
import { OrganizationStatusAction } from "./OrganizationStatusAction.tsx";

const NORTHWIND = OrganizationAdminSummarySchema.parse(buildOrganizationSummary());
const PLANS = [PlanSchema.parse(buildPlan()), PlanSchema.parse(buildPlan({ id: ADMIN_IDS.otherPlan, name: "Pro" }))];
const OVERRIDE = { monthlyMicroUsd: 80_000_000, monthlyTokens: 30_000_000 };
const OVERRIDDEN = OrganizationAdminSummarySchema.parse(buildOrganizationSummary({ budget: { caps: OVERRIDE, source: "override", override: OVERRIDE } }));
const PATCH = "PATCH /v1/admin/organizations/:organizationId";
const BUDGET = "PUT /v1/admin/organizations/:organizationId/budget";

afterEach(() => setOnline(true));

describe("OrganizationStatusAction", () => {
  it("suspends an active organization through a destructive confirmation", async () => {
    const { user, api, container } = renderAdmin(<OrganizationStatusAction organization={NORTHWIND} />, { routes: { [PATCH]: ok(buildOrganizationSummary({ status: "suspended" })) } });
    await user.click(await screen.findByRole("button", { name: "Suspender organização" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Suspender Northwind?" });
    await expectNoAxeViolations(container.ownerDocument.body);
    await user.click(within(dialog).getByRole("button", { name: "Suspender" }));
    expect(await screen.findByText("Northwind foi suspensa.")).toBeDefined();
    expect(api.calls.find((call) => call.method === "PATCH")?.body).toEqual({ status: "suspended" });
  });

  it("reactivates a suspended organization and keeps a failure in the dialog with its reference", async () => {
    const suspended = OrganizationAdminSummarySchema.parse(buildOrganizationSummary({ status: "suspended" }));
    const { user } = renderAdmin(<OrganizationStatusAction organization={suspended} />, { routes: { [PATCH]: apiError(409, "CONFLICT") } });
    await user.click(await screen.findByRole("button", { name: "Reativar organização" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Reativar Northwind?" });
    await user.click(within(dialog).getByRole("button", { name: "Reativar" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain(FAKE_REQUEST_ID);
  });

  it("cannot be started while offline", async () => {
    renderAdmin(<OrganizationStatusAction organization={NORTHWIND} />);
    const suspend = await screen.findByRole<HTMLButtonElement>("button", { name: "Suspender organização" });
    setOnline(false);
    await waitFor(() => expect(suspend.disabled).toBe(true));
  });
});

describe("OrganizationPlanForm", () => {
  it("saves another plan, pending until the API answers", async () => {
    const held = holdResponse();
    const { user, api, container } = renderAdmin(<OrganizationPlanForm organization={NORTHWIND} plans={PLANS} />, { routes: { [PATCH]: held.handler } });
    const save = await screen.findByRole<HTMLButtonElement>("button", { name: "Salvar plano" });
    expect(save.disabled).toBe(true);
    await user.click(screen.getByRole("combobox", { name: "Plano da organização" }));
    await user.click(await screen.findByRole("option", { name: "Pro" }));
    await user.click(save);
    await waitFor(() => expect(save.getAttribute("aria-busy")).toBe("true"));
    held.release(ok(buildOrganizationSummary({ planId: ADMIN_IDS.otherPlan })));
    expect(await screen.findByText("Plano de Northwind atualizado.")).toBeDefined();
    expect(api.calls.find((call) => call.method === "PATCH")?.body).toEqual({ planId: ADMIN_IDS.otherPlan });
    await expectNoAxeViolations(container);
  });

  it("shows a failure as an alert tied to the plan field", async () => {
    const { user } = renderAdmin(<OrganizationPlanForm organization={NORTHWIND} plans={PLANS} />, { routes: { [PATCH]: apiError(503, "UPSTREAM_UNAVAILABLE") } });
    await user.click(await screen.findByRole("combobox", { name: "Plano da organização" }));
    await user.click(await screen.findByRole("option", { name: "Padrão da plataforma (sem plano)" }));
    await user.click(screen.getByRole("button", { name: "Salvar plano" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(FAKE_REQUEST_ID);
    expect(screen.getByRole("combobox", { name: "Plano da organização" }).getAttribute("aria-describedby")).toBe(alert.id);
  });

  it("holds the save while offline", async () => {
    const { user } = renderAdmin(<OrganizationPlanForm organization={NORTHWIND} plans={PLANS} />);
    await user.click(await screen.findByRole("combobox", { name: "Plano da organização" }));
    await user.click(await screen.findByRole("option", { name: "Pro" }));
    setOnline(false);
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>("button", { name: "Salvar plano" }).disabled).toBe(true));
  });
});

describe("BudgetOverrideForm", () => {
  it("saves the caps typed by staff in micro-USD, pending until the API answers", async () => {
    const held = holdResponse();
    const { user, api } = renderAdmin(<BudgetOverrideForm organization={NORTHWIND} />, { routes: { [BUDGET]: held.handler } });
    const money = await screen.findByRole("textbox", { name: "Gasto mensal com modelos" });
    await user.clear(money);
    await user.type(money, "80,00");
    const tokens = screen.getByRole("textbox", { name: "Tokens por mês" });
    await user.clear(tokens);
    await user.type(tokens, "30000000");
    const save = screen.getByRole("button", { name: "Salvar ajuste" });
    await user.click(save);
    await waitFor(() => expect(save.getAttribute("aria-busy")).toBe("true"));
    held.release(ok(buildOrganizationSummary({ budget: { caps: OVERRIDE, source: "override", override: OVERRIDE } })));
    expect(await screen.findByText("Orçamento de Northwind ajustado.")).toBeDefined();
    expect(api.calls.find((call) => call.method === "PUT")?.path).toBe(`/v1/admin/organizations/${IDS.organization}/budget`);
    expect(api.calls.find((call) => call.method === "PUT")?.body).toEqual({ override: OVERRIDE });
  });

  it("shows a failure with its reference and keeps the typed values", async () => {
    const { user } = renderAdmin(<BudgetOverrideForm organization={NORTHWIND} />, { routes: { [BUDGET]: apiError(409, "CONFLICT") } });
    const tokens = await screen.findByRole<HTMLInputElement>("textbox", { name: "Tokens por mês" });
    await user.clear(tokens);
    await user.type(tokens, "30000000");
    await user.click(screen.getByRole("button", { name: "Salvar ajuste" }));
    expect((await screen.findByRole("alert")).textContent).toContain(FAKE_REQUEST_ID);
    expect(tokens.value.replace(/\D/gu, "")).toBe("30000000");
  });

  it("returns to the plan after a confirmation, and holds both writes offline", async () => {
    const { user, api } = renderAdmin(<BudgetOverrideForm organization={OVERRIDDEN} />, { routes: { [BUDGET]: ok(buildOrganizationSummary()) } });
    await user.click(await screen.findByRole("button", { name: "Voltar ao plano" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Remover o ajuste de Northwind?" });
    await user.click(within(dialog).getByRole("button", { name: "Remover ajuste" }));
    expect(await screen.findByText("Northwind voltou aos limites do plano.")).toBeDefined();
    expect(api.calls.find((call) => call.method === "PUT")?.body).toEqual({ override: null });
    setOnline(false);
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>("button", { name: "Voltar ao plano" }).disabled).toBe(true));
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Salvar ajuste" }).disabled).toBe(true);
  });
});
