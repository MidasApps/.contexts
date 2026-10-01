import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { buildAdminUser } from "#/shared/testing/admin-accounts-fixtures.ts";
import { buildOrganizationSummary } from "#/shared/testing/admin-fixtures.ts";
import { buildAdminRun, buildAdminSchedule, buildPlatformSchedule, OPS_IDS } from "#/shared/testing/admin-operations-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, FAKE_REQUEST_ID, noContent, ok, page, type FakeRoutes } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { AdminWorkflowsView } from "./AdminWorkflowsView.tsx";

const SUSPENDED = buildAdminRun();
const PLATFORM_DONE = buildAdminRun({ runId: OPS_IDS.otherRun, workflowId: "usage-report", tenantId: null, status: "success", startedBy: null, scheduleId: OPS_IDS.platformSchedule, approvalRequestId: null });

const routes = (overrides: FakeRoutes = {}): FakeRoutes => ({
  "GET /v1/admin/organizations": page([buildOrganizationSummary()]),
  "GET /v1/admin/workflow-runs": page([SUSPENDED, PLATFORM_DONE]),
  "GET /v1/admin/schedules": ok([buildPlatformSchedule(), buildAdminSchedule()]),
  ...overrides,
});

const render = (options: Parameters<typeof renderAdmin>[1] = {}) => renderAdmin(<AdminWorkflowsView />, { path: "/admin/workflows", routes: routes(), ...options });

const setOnline = (online: boolean): void => {
  Object.defineProperty(globalThis.navigator, "onLine", { configurable: true, get: () => online });
  act(() => void globalThis.dispatchEvent(new Event(online ? "online" : "offline")));
};

describe("AdminWorkflowsView: runs", () => {
  it("lists runs of organizations and of the platform, with what a suspended run waits for", async () => {
    const { container } = render();
    const table = await screen.findByRole("table", { name: "Execuções de workflows" });
    const suspended = within(table).getByRole("row", { name: /approval-demo/u });
    await waitFor(() => expect(within(suspended).getByText("Northwind")).toBeDefined());
    expect(within(suspended).getByText("Suspensa")).toBeDefined();
    expect(within(suspended).getByText(`Aguarda a aprovação ${OPS_IDS.approval}`)).toBeDefined();
    expect(within(suspended).getByRole("button", { name: /^Cancelar a execução/u })).toBeDefined();
    const done = within(table).getByRole("row", { name: /usage-report/u });
    expect(within(done).getByText("Plataforma")).toBeDefined();
    expect(within(done).getByText("Concluída")).toBeDefined();
    expect(within(done).queryByRole("button", { name: /^Cancelar a execução/u })).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("shows only the runs waiting for approval with one press, kept in the URL and sent to the API", async () => {
    const { user, router, api } = render();
    await screen.findByRole("table", { name: "Execuções de workflows" });
    const toggle = screen.getByRole("button", { name: "Aguardando aprovação" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    await user.click(toggle);
    expect(router.current()).toBe("/admin/workflows?status=suspended");
    await waitFor(() => expect(api.calls.some((call) => call.path === "/v1/admin/workflow-runs" && call.query.includes("status=suspended"))).toBe(true));
    expect(screen.getByRole("button", { name: "Aguardando aprovação" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("applies the workflow filter on submit and refuses an id that cannot match", async () => {
    const { user, router } = render();
    await screen.findByRole("table", { name: "Execuções de workflows" });
    const field = screen.getByRole("textbox", { name: "Workflow" });
    await user.type(field, "Usage Report");
    expect(screen.getByText("Use o id do workflow: minúsculas, números e hifens.")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(router.current()).toBe("/admin/workflows");
    await user.clear(field);
    await user.type(field, "usage-report{Enter}");
    expect(router.current()).toBe("/admin/workflows?workflowId=usage-report");
  });

  it("cancels a suspended run after a destructive confirmation and reloads the list", async () => {
    const { user, api, container } = render({ routes: routes({ "POST /v1/admin/workflow-runs/:runId/cancel": noContent() }) });
    const table = await screen.findByRole("table", { name: "Execuções de workflows" });
    await user.click(within(table).getByRole("button", { name: /^Cancelar a execução/u }));
    const dialog = await screen.findByRole("alertdialog", { name: "Cancelar a execução de approval-demo?" });
    expect(within(dialog).getByText(/solicitação de aprovação que ela aguardava continua aberta/u)).toBeDefined();
    await expectNoAxeViolations(container.ownerDocument.body);
    api.route("GET /v1/admin/workflow-runs", page([{ ...SUSPENDED, status: "canceled" }, PLATFORM_DONE]));
    await user.click(within(dialog).getByRole("button", { name: "Cancelar execução" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(api.callLines()).toContain(`POST /v1/admin/workflow-runs/${OPS_IDS.run}/cancel`);
    expect(await screen.findByText("Execução de approval-demo cancelada.")).toBeDefined();
    expect(await screen.findByText("Cancelada")).toBeDefined();
  });

  it("keeps the confirmation open with the error and its reference when the runtime is down", async () => {
    const { user } = render({ routes: routes({ "POST /v1/admin/workflow-runs/:runId/cancel": apiError(502, "UPSTREAM_UNAVAILABLE") }) });
    const table = await screen.findByRole("table", { name: "Execuções de workflows" });
    await user.click(within(table).getByRole("button", { name: /^Cancelar a execução/u }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancelar execução" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("Um serviço necessário está indisponível no momento.");
    expect(alert.textContent).toContain(FAKE_REQUEST_ID);
  });

  it("opens the timeline of a run", async () => {
    const { user, container } = render();
    const table = await screen.findByRole("table", { name: "Execuções de workflows" });
    await user.click(within(table).getByRole("button", { name: /^Detalhes da execução .* de approval-demo/u }));
    const dialog = await screen.findByRole("dialog", { name: "Execução de approval-demo" });
    const steps = within(within(dialog).getByRole("list", { name: "Linha do tempo da execução" })).getAllByRole("listitem");
    expect(steps.map((step) => step.querySelector("span.font-medium")?.textContent)).toEqual(["Iniciada", "Aguarda aprovação", "Estado atual"]);
    expect(steps[0]?.textContent).toContain(`Pelo usuário ${IDS.user}`);
    expect(steps[1]?.textContent).toContain(OPS_IDS.approval);
    await expectNoAxeViolations(container.ownerDocument.body);
  });

  it("pages by cursor, passing the cursor back as given", async () => {
    const first = Array.from({ length: 20 }, (_, index) => buildAdminRun({ runId: `run-${String(index)}`, status: "success", approvalRequestId: null }));
    const { user, api } = render({
      routes: routes({ "GET /v1/admin/workflow-runs": (request) => (request.query.get("cursor") === "20" ? page([PLATFORM_DONE]) : page(first, { cursor: "20", limit: 20 })) }),
    });
    const table = await screen.findByRole("table", { name: "Execuções de workflows" });
    expect(within(table).getAllByRole("row")).toHaveLength(21);
    await user.click(within(screen.getByRole("navigation", { name: "Páginas de execuções" })).getByRole("button", { name: "Próxima" }));
    expect(await screen.findByRole("row", { name: /usage-report/u })).toBeDefined();
    expect(api.calls.filter((call) => call.path === "/v1/admin/workflow-runs").map((call) => call.query)).toEqual(["?limit=20", "?limit=20&cursor=20"]);
  });

  it("tells an empty platform from filters that match nothing", async () => {
    const empty = render({ routes: routes({ "GET /v1/admin/workflow-runs": page([]) }) });
    expect(await screen.findByRole("heading", { level: 2, name: "Nenhuma execução ainda" })).toBeDefined();
    await empty.user.click(screen.getByRole("button", { name: "Ver agendamentos" }));
    expect(empty.router.current()).toBe("/admin/workflows?tab=schedules");
    empty.unmount();

    const filtered = render({ path: "/admin/workflows?status=failed", routes: routes({ "GET /v1/admin/workflow-runs": page([]) }) });
    expect(await screen.findByRole("heading", { level: 2, name: "Nenhuma execução com esses filtros" })).toBeDefined();
    await expectNoAxeViolations(filtered.container);
    await filtered.user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(filtered.router.current()).toBe("/admin/workflows");
  });

  it("shows an error with the request reference and retries", async () => {
    const { user, api, container } = render({ routes: routes({ "GET /v1/admin/workflow-runs": apiError(409, "CONFLICT") }) });
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(screen.getByText(new RegExp(FAKE_REQUEST_ID, "u"))).toBeDefined();
    await expectNoAxeViolations(container);
    api.route("GET /v1/admin/workflow-runs", page([PLATFORM_DONE]));
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("row", { name: /usage-report/u })).toBeDefined();
  });

  it("is closed to the support role without calling the API", async () => {
    const { api } = render({ role: "platform-support" });
    expect(await screen.findByRole("heading", { level: 2, name: "Você não tem acesso a esta página" })).toBeDefined();
    expect(api.callLines()).not.toContain("GET /v1/admin/workflow-runs");
  });

  it("holds cancel while offline", async () => {
    render();
    const table = await screen.findByRole("table", { name: "Execuções de workflows" });
    try {
      setOnline(false);
      await waitFor(() => expect(within(table).getByRole("button", { name: /^Cancelar a execução/u }).hasAttribute("disabled")).toBe(true));
    } finally {
      setOnline(true);
    }
  });

  it("shows cards on a phone", async () => {
    const matchMedia = globalThis.matchMedia;
    globalThis.matchMedia = (query: string) => ({ ...matchMedia(query), matches: query.includes("max-width") });
    try {
      const { container } = render();
      const list = await screen.findByRole("list", { name: "Execuções de workflows" });
      expect(within(list).getAllByRole("listitem")).toHaveLength(2);
      await expectNoAxeViolations(container);
    } finally {
      globalThis.matchMedia = matchMedia;
    }
  });
});

describe("AdminWorkflowsView: schedules", () => {
  const renderSchedules = (overrides: FakeRoutes = {}, options: Parameters<typeof renderAdmin>[1] = {}) => render({ path: "/admin/workflows?tab=schedules", routes: routes(overrides), ...options });

  it("lists platform and organization schedules with the next fire in the schedule's zone", async () => {
    const { container, api } = renderSchedules();
    const table = await screen.findByRole("table", { name: "Agendamentos da plataforma e das organizações" });
    const platform = within(table).getByRole("row", { name: new RegExp(OPS_IDS.platformSchedule, "u") });
    expect(within(platform).getAllByText("Plataforma").length).toBeGreaterThan(0);
    expect(within(platform).getByText("15 * * * *")).toBeDefined();
    expect(within(platform).getByText(/12:15.*\(UTC\)/u)).toBeDefined();
    const tenant = within(table).getByRole("row", { name: new RegExp(OPS_IDS.tenantSchedule, "u") });
    await waitFor(() => expect(within(tenant).getByText("Northwind")).toBeDefined());
    expect(within(tenant).getByText(/09:00.*\(Asia\/Tokyo\)/u)).toBeDefined();
    expect(within(tenant).getByText("Ativo")).toBeDefined();
    expect(api.callLines()).not.toContain("GET /v1/admin/workflow-runs");
    await expectNoAxeViolations(container);
  });

  it("pauses a schedule, then offers to resume it", async () => {
    const { user, api } = renderSchedules({ "POST /v1/admin/schedules/:scheduleId/pause": ok(buildAdminSchedule({ status: "paused", nextFireAt: null })) });
    const table = await screen.findByRole("table", { name: "Agendamentos da plataforma e das organizações" });
    const tenant = within(table).getByRole("row", { name: new RegExp(OPS_IDS.tenantSchedule, "u") });
    api.route("GET /v1/admin/schedules", ok([buildPlatformSchedule(), buildAdminSchedule({ status: "paused", nextFireAt: null })]));
    await user.click(within(tenant).getByRole("button", { name: /^Pausar o agendamento/u }));
    const dialog = await screen.findByRole("alertdialog", { name: "Pausar o agendamento de usage-report?" });
    expect(dialog.textContent).toContain("deixa de disparar para a organização");
    expect(dialog.textContent).not.toContain("todas as organizações");
    expect(api.callLines()).not.toContain(`POST /v1/admin/schedules/${OPS_IDS.tenantSchedule}/pause`);
    await user.click(within(dialog).getByRole("button", { name: "Pausar agendamento" }));
    expect(await screen.findByText("Agendamento de usage-report pausado.")).toBeDefined();
    expect(api.callLines()).toContain(`POST /v1/admin/schedules/${OPS_IDS.tenantSchedule}/pause`);
    const paused = await screen.findByRole("row", { name: new RegExp(`${OPS_IDS.tenantSchedule}.*Pausado`, "u") });
    expect(within(paused).getByRole("button", { name: /^Retomar o agendamento/u })).toBeDefined();
  });

  it("says so when a pause fails, with the request reference", async () => {
    const { user } = renderSchedules({ "POST /v1/admin/schedules/:scheduleId/pause": apiError(502, "UPSTREAM_UNAVAILABLE") });
    const table = await screen.findByRole("table", { name: "Agendamentos da plataforma e das organizações" });
    await user.click(within(within(table).getByRole("row", { name: new RegExp(OPS_IDS.tenantSchedule, "u") })).getByRole("button", { name: /^Pausar o agendamento/u }));
    const dialog = await screen.findByRole("alertdialog", { name: "Pausar o agendamento de usage-report?" });
    await user.click(within(dialog).getByRole("button", { name: "Pausar agendamento" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain(FAKE_REQUEST_ID);
  });

  it("warns that pausing a platform schedule stops the job for every organization, and does nothing on cancel", async () => {
    const { user, api, container } = renderSchedules({ "POST /v1/admin/schedules/:scheduleId/pause": ok(buildPlatformSchedule({ status: "paused", nextFireAt: null })) });
    const table = await screen.findByRole("table", { name: "Agendamentos da plataforma e das organizações" });
    const platform = within(table).getByRole("row", { name: new RegExp(OPS_IDS.platformSchedule, "u") });
    await user.click(within(platform).getByRole("button", { name: /^Pausar o agendamento/u }));
    const dialog = await screen.findByRole("alertdialog", { name: "Pausar o agendamento de usage-report?" });
    expect(dialog.textContent).toContain("job da plataforma");
    expect(dialog.textContent).toContain("todas as organizações");
    await expectNoAxeViolations(container.ownerDocument.body);
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(api.callLines()).not.toContain(`POST /v1/admin/schedules/${OPS_IDS.platformSchedule}/pause`);
    await user.click(within(platform).getByRole("button", { name: /^Pausar o agendamento/u }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Pausar job da plataforma" }));
    await waitFor(() => expect(api.callLines()).toContain(`POST /v1/admin/schedules/${OPS_IDS.platformSchedule}/pause`));
  });

  it("confirms before resuming a paused schedule", async () => {
    const { user, api } = renderSchedules({
      "GET /v1/admin/schedules": ok([buildAdminSchedule({ status: "paused", nextFireAt: null })]),
      "POST /v1/admin/schedules/:scheduleId/resume": ok(buildAdminSchedule()),
    });
    const table = await screen.findByRole("table", { name: "Agendamentos da plataforma e das organizações" });
    await user.click(within(table).getByRole("button", { name: /^Retomar o agendamento/u }));
    const dialog = await screen.findByRole("alertdialog", { name: "Retomar o agendamento de usage-report?" });
    expect(api.callLines()).not.toContain(`POST /v1/admin/schedules/${OPS_IDS.tenantSchedule}/resume`);
    await user.click(within(dialog).getByRole("button", { name: "Retomar agendamento" }));
    expect(await screen.findByText("Agendamento de usage-report retomado.")).toBeDefined();
    expect(api.callLines()).toContain(`POST /v1/admin/schedules/${OPS_IDS.tenantSchedule}/resume`);
  });

  it("runs a schedule now after a confirmation", async () => {
    const { user, api, container } = renderSchedules({ "POST /v1/admin/schedules/:scheduleId/run": ok({ scheduleId: OPS_IDS.platformSchedule }, 202) });
    const table = await screen.findByRole("table", { name: "Agendamentos da plataforma e das organizações" });
    await user.click(within(within(table).getByRole("row", { name: new RegExp(OPS_IDS.platformSchedule, "u") })).getByRole("button", { name: /^Executar agora o agendamento/u }));
    const dialog = await screen.findByRole("alertdialog", { name: "Executar usage-report agora?" });
    expect(within(dialog).getByText(/para todas as organizações/u)).toBeDefined();
    await expectNoAxeViolations(container.ownerDocument.body);
    await user.click(within(dialog).getByRole("button", { name: "Executar agora" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(api.callLines()).toContain(`POST /v1/admin/schedules/${OPS_IDS.platformSchedule}/run`);
    expect(await screen.findByText("Execução de usage-report solicitada.")).toBeDefined();
  });

  it("filters by organization in the URL and explains an organization without schedules", async () => {
    const { user, router, api } = renderSchedules({ "GET /v1/admin/schedules": (request) => ok(request.query.get("organizationId") === null ? [buildPlatformSchedule()] : []) }, { path: `/admin/workflows?tab=schedules&organizationId=${IDS.organization}` });
    expect(await screen.findByRole("heading", { level: 2, name: "Esta organização não tem agendamentos" })).toBeDefined();
    expect(api.calls.find((call) => call.path === "/v1/admin/schedules")?.query).toBe(`?organizationId=${IDS.organization}`);
    await user.click(screen.getByRole("button", { name: "Ver todos" }));
    expect(router.current()).toBe("/admin/workflows?tab=schedules");
    expect(await screen.findByRole("row", { name: new RegExp(OPS_IDS.platformSchedule, "u") })).toBeDefined();
  });

  it("holds schedule actions while offline", async () => {
    renderSchedules();
    const table = await screen.findByRole("table", { name: "Agendamentos da plataforma e das organizações" });
    try {
      setOnline(false);
      await waitFor(() => expect(within(table).getAllByRole("button", { name: /^Executar agora/u })[0]?.hasAttribute("disabled")).toBe(true));
    } finally {
      setOnline(true);
    }
  });

  it("reads in English and Spanish", async () => {
    const english = renderSchedules({}, { locale: "en-US" });
    expect(await screen.findByRole("table", { name: "Platform and organization schedules" })).toBeDefined();
    expect(screen.getAllByRole("button", { name: /^Run the schedule .* now$/u }).length).toBe(2);
    english.unmount();
    render({ locale: "es-419" });
    expect(await screen.findByRole("table", { name: "Ejecuciones de workflows" })).toBeDefined();
    expect(screen.getByText("Suspendida")).toBeDefined();
  });
});

describe("AdminWorkflowsView: who started a run", () => {
  it("names the starters of the page with one lookup, and keeps the id when the lookup fails", async () => {
    const other = buildAdminRun({ runId: "run_other_0001", workflowId: "onboarding", startedBy: "uOther", approvalRequestId: null, status: "running" });
    const again = buildAdminRun({ runId: "run_again_0001", workflowId: "cleanup", approvalRequestId: null, status: "success" });
    const { api, user } = render({
      routes: routes({
        "GET /v1/admin/workflow-runs": page([SUSPENDED, PLATFORM_DONE, other, again]),
        "GET /v1/admin/users": page([buildAdminUser({ id: IDS.user, displayName: "Ana Souza" }), buildAdminUser({ id: "uOther", displayName: "", email: "bo@example.com" })]),
      }),
    });
    const table = await screen.findByRole("table", { name: "Execuções de workflows" });
    expect(await within(within(table).getByRole("row", { name: /approval-demo/u })).findByText("Usuário Ana Souza")).toBeDefined();
    expect(within(within(table).getByRole("row", { name: /onboarding/u })).getByText("Usuário bo@example.com")).toBeDefined();
    const lookups = api.calls.filter((call) => call.path === "/v1/admin/users");
    expect(lookups.map((call) => new URLSearchParams(call.query).get("ids"))).toEqual([[IDS.user, "uOther"].sort().join(",")]);
    await user.click(within(within(table).getByRole("row", { name: /approval-demo/u })).getByRole("button", { name: /^Detalhes/u }));
    expect(await within(await screen.findByRole("dialog")).findByText("Pelo usuário Ana Souza")).toBeDefined();
  });

  it("shows the user id while the names are unknown", async () => {
    render({ routes: routes({ "GET /v1/admin/users": apiError(403, "FORBIDDEN") }) });
    const table = await screen.findByRole("table", { name: "Execuções de workflows" });
    expect(await within(table).findByText(`Usuário ${IDS.user}`)).toBeDefined();
  });
});
