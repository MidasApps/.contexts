import { screen, waitFor } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { plansQuery } from "#/entities/plan/index.ts";
import { buildOrganizationSummary, buildPlan } from "#/shared/testing/admin-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, FAKE_REQUEST_ID, ok, page } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { AdminOrganizationFilter, AdminPageFrame, AdminQuerySection, numberedPagination, useAdminSearch } from "./index.ts";

function Plans() {
  const callEndpoint = useCallEndpoint();
  const plans = useQuery(plansQuery(callEndpoint));
  return (
    <AdminPageFrame permission="platform.plan.manage" title="Planos" description="Catálogo." actions={<button type="button">Novo</button>}>
      <AdminQuerySection query={plans} loadingLabel="Carregando planos…">
        {(data) => <p>{data.map((plan) => plan.name).join(", ")}</p>}
      </AdminQuerySection>
    </AdminPageFrame>
  );
}

function Filters() {
  const search = useAdminSearch(["status", "organizationId"]);
  const pagination = numberedPagination(search, { hasMore: true, pending: false });
  return (
    <>
      <p data-testid="state">{JSON.stringify({ ...search.values, page: search.page })}</p>
      <button type="button" onClick={() => search.set({ status: "error" })}>
        só erros
      </button>
      <button type="button" onClick={() => search.set({ status: undefined })}>
        limpar
      </button>
      <button type="button" onClick={pagination?.onNext}>
        próxima
      </button>
      <AdminOrganizationFilter value={search.values.organizationId} onValueChange={(organizationId) => search.set({ organizationId })} />
    </>
  );
}

describe("AdminPageFrame and AdminQuerySection", () => {
  it("shows the page with its data and actions to a role that holds the permission", async () => {
    const { container } = renderAdmin(<Plans />, { path: "/admin/plans", routes: { "GET /v1/admin/plans": ok([buildPlan()]) } });
    expect(screen.getByRole("heading", { level: 1, name: "Planos" })).toBeDefined();
    expect(await screen.findByText("Standard")).toBeDefined();
    expect(screen.getByRole("button", { name: "Novo" })).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("shows no-access when the staff role lacks the permission", async () => {
    const { container } = renderAdmin(<Plans />, { role: "platform-support", path: "/admin/plans" });
    expect(await screen.findByRole("heading", { level: 2, name: "Você não tem acesso a esta página" })).toBeDefined();
    expect(screen.getByText(/Seu papel na equipe da plataforma não dá acesso/u)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Novo" })).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("asks for the second factor when the API answers MFA_REQUIRED", async () => {
    const { container } = renderAdmin(<Plans />, { routes: { "GET /v1/admin/plans": apiError(403, "MFA_REQUIRED") } });
    expect(await screen.findByRole("heading", { level: 2, name: "Confirme a verificação em duas etapas" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Abrir segurança da conta" }).getAttribute("href")).toBe("/profile/security");
    await expectNoAxeViolations(container);
  });

  it("shows an error with the request reference and retries", async () => {
    const { user, api, container } = renderAdmin(<Plans />, { routes: { "GET /v1/admin/plans": apiError(409, "CONFLICT") } });
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(screen.getByText(new RegExp(FAKE_REQUEST_ID, "u"))).toBeDefined();
    await expectNoAxeViolations(container);
    api.route("GET /v1/admin/plans", ok([buildPlan({ name: "Pro" })]));
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Pro")).toBeDefined();
  });
});

describe("useAdminSearch and AdminOrganizationFilter", () => {
  const routes = { "GET /v1/admin/organizations": page([buildOrganizationSummary(), buildOrganizationSummary({ id: IDS.otherOrganization, name: "Contoso" })]) };
  const state = (): unknown => JSON.parse(screen.getByTestId("state").textContent ?? "{}");

  it("reads filters and the page from the URL", async () => {
    renderAdmin(<Filters />, { path: "/admin/traces?status=error&page=3", routes });
    expect(await screen.findByTestId("state")).toBeDefined();
    expect(state()).toEqual({ status: "error", page: 3 });
  });

  it("writes filters to the URL, keeps the others and returns to the first page", async () => {
    const { user, router } = renderAdmin(<Filters />, { path: "/admin/traces?organizationId=o1&page=2", routes });
    await user.click(await screen.findByRole("button", { name: "só erros" }));
    expect(router.current()).toBe("/admin/traces?organizationId=o1&status=error");
    await user.click(screen.getByRole("button", { name: "próxima" }));
    expect(router.current()).toBe("/admin/traces?organizationId=o1&status=error&page=2");
    await user.click(screen.getByRole("button", { name: "limpar" }));
    expect(router.current()).toBe("/admin/traces?organizationId=o1");
    expect(router.history()).toHaveLength(1);
  });

  it("picks an organization by name and clears it with the all option", async () => {
    const { user, router, container } = renderAdmin(<Filters />, { path: "/admin/traces", routes });
    const trigger = await screen.findByRole("combobox", { name: "Organização" });
    await waitFor(() => expect(trigger.textContent).toContain("Todas as organizações"));
    await user.click(trigger);
    await user.click(await screen.findByRole("option", { name: "Contoso" }));
    expect(router.current()).toBe(`/admin/traces?organizationId=${IDS.otherOrganization}`);
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Organização" }).textContent).toContain("Contoso"));
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("combobox", { name: "Organização" }));
    await user.click(await screen.findByRole("option", { name: "Todas as organizações" }));
    expect(router.current()).toBe("/admin/traces");
  });
});
