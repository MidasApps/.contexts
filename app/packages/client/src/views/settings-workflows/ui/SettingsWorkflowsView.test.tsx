import type { Permission } from "@core/contracts";
import { configure, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { buildSchedule } from "#/entities/schedule/schedule.fixture.ts";
import { buildWorkflowCatalogEntry, buildWorkflowRun } from "#/entities/workflow-run/workflow-run.fixture.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, noContent, ok, page, type FakeRequest, type FakeRoutes } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { buildMember } from "#/shared/testing/settings-fixtures.ts";
import { SettingsWorkflowsView } from "./SettingsWorkflowsView.tsx";

// The machine runs several suites at once; user-event flows through dialogs need room.
vi.setConfig({ testTimeout: 60_000 });
configure({ asyncUtilTimeout: 8000 });

const BASE: Permission[] = ["core.organization.read", "core.project.read", "core.unit.read"];
const MEMBER: Permission[] = [...BASE, "core.workflow-run.read", "core.workflow-run.start"];
const ADMIN: Permission[] = [...MEMBER, "core.workflow-run.cancel", "core.schedule.read", "core.schedule.write", "core.approval.read"];

const CATALOG = [
  buildWorkflowCatalogEntry(),
  buildWorkflowCatalogEntry({ id: "usage-report", description: "Aggregates usage.", startable: false, schedulable: true, inputSchema: null }),
];

const SETTINGS_PATH = `/o/${IDS.organization}/settings/workflows`;

const renderView = (routes: FakeRoutes = {}, permissions: readonly Permission[] = ADMIN, path = SETTINGS_PATH) =>
  renderApp(
    <main>
      <SettingsWorkflowsView />
    </main>,
    {
      path,
      routes: shellRoutes(permissions, {
        "GET /v1/workflows/runs": page([buildWorkflowRun(), buildWorkflowRun({ runId: "run-2", workflowId: "usage-report", status: "success", startedBy: null, scheduleId: "schedule_3fa9c0e1b2d4a6f8-daily-usage" })]),
        "GET /v1/workflows": ok(CATALOG),
        "GET /v1/schedules": ok([buildSchedule()]),
        ...routes,
      }),
    },
  );

const lastCall = (api: { calls: { method: string; path: string; query: string; body: unknown }[] }, method: string, path: string) =>
  api.calls.findLast((call) => call.method === method && call.path === path);

describe("SettingsWorkflowsView: runs", () => {
  it("lists the organization's runs with status and a link to each run page", async () => {
    const { container, api } = renderView();
    const table = await screen.findByRole("table", { name: "Execuções de fluxos de Northwind" });
    expect(within(table).getByText("run-1")).toBeDefined();
    expect(within(table).getByText("Em execução")).toBeDefined();
    expect(within(table).getByText("Concluída")).toBeDefined();
    expect(within(table).getByRole("link", { name: "Abrir a execução run-1 de Demonstração de aprovação" }).getAttribute("href")).toBe(`${SETTINGS_PATH}/runs/run-1`);
    // Workflows and schedules read as names, never as their ids.
    expect(within(table).getByText("Relatório de uso")).toBeDefined();
    expect(await within(table).findByText("Por um agendamento: Todos os dias às 09:00 (America/Sao_Paulo)")).toBeDefined();
    expect(within(table).queryByText(/schedule_3fa9c0e1b2d4a6f8/u)).toBeNull();
    expect(new URLSearchParams(lastCall(api, "GET", "/v1/workflows/runs")?.query).get("organizationId")).toBe(IDS.organization);
    await expectNoAxeViolations(container);
  });

  it("names the member who started a run instead of the user id", async () => {
    renderView({ [`GET /v1/organizations/${IDS.organization}/members`]: page([buildMember({ uid: IDS.user, displayName: "Ana Souza" })]) }, [...ADMIN, "core.member.read"]);
    const table = await screen.findByRole("table", { name: "Execuções de fluxos de Northwind" });
    expect(await within(table).findByText("Pelo usuário Ana Souza")).toBeDefined();
    expect(within(table).queryByText(`Pelo usuário ${IDS.user}`)).toBeNull();
  });

  it("filters by status on the server, for this organization", async () => {
    const { user, api } = renderView();
    await screen.findByRole("table", { name: "Execuções de fluxos de Northwind" });
    await user.click(screen.getByRole("combobox", { name: "Estado" }));
    await user.click(await screen.findByRole("option", { name: "Suspensa" }));
    await waitFor(() => {
      const query = new URLSearchParams(lastCall(api, "GET", "/v1/workflows/runs")?.query);
      expect(query.get("status")).toBe("suspended");
      expect(query.get("organizationId")).toBe(IDS.organization);
    });
  });

  it("starts a startable workflow from fields of its input schema and opens the run page", async () => {
    const requests: FakeRequest[] = [];
    const { user, router } = renderView({
      "POST /v1/workflows/:workflowId/runs": (request) => {
        requests.push(request);
        return ok({ runId: "run-new" }, 202);
      },
      "GET /v1/workflows/runs/:runId": ok(buildWorkflowRun({ runId: "run-new" })),
    });
    await user.click(await screen.findByRole("button", { name: "Iniciar fluxo" }));
    const dialog = await screen.findByRole("dialog", { name: "Iniciar fluxo" });
    await user.click(within(dialog).getByRole("button", { name: "Iniciar" }));
    expect(within(dialog).getByText("Escolha um fluxo.")).toBeDefined();
    await user.click(within(dialog).getByRole("combobox", { name: /Fluxo/u }));
    // Only startable workflows are offered.
    expect(screen.queryByRole("option", { name: /Relatório de uso/u })).toBeNull();
    await user.click(await screen.findByRole("option", { name: /Demonstração de aprovação/u }));
    // A labelled field, not JSON text, and never the schema itself.
    const title = within(dialog).getByRole("textbox", { name: /Título/u });
    expect(within(dialog).queryByText(/"type"/u)).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Iniciar" }));
    expect(within(dialog).getByText("Preencha este campo.")).toBeDefined();
    expect(requests).toHaveLength(0);
    await expectNoAxeViolations(dialog);
    await user.type(title, "Follow-up");
    await user.click(within(dialog).getByRole("button", { name: "Iniciar" }));
    await waitFor(() => expect(router.current()).toBe(`${SETTINGS_PATH}/runs/run-new`));
    expect(requests[0]?.params["workflowId"]).toBe("approval-demo");
    expect(requests[0]?.query.get("organizationId")).toBe(IDS.organization);
    expect(requests[0]?.body).toEqual({ inputData: { title: "Follow-up" } });
  });

  it("edits the input as JSON when asked, and back as fields", async () => {
    const requests: FakeRequest[] = [];
    const { user } = renderView({
      "POST /v1/workflows/:workflowId/runs": (request) => {
        requests.push(request);
        return ok({ runId: "run-new" }, 202);
      },
      "GET /v1/workflows/runs/:runId": ok(buildWorkflowRun({ runId: "run-new" })),
    });
    await user.click(await screen.findByRole("button", { name: "Iniciar fluxo" }));
    const dialog = await screen.findByRole("dialog", { name: "Iniciar fluxo" });
    await user.click(within(dialog).getByRole("combobox", { name: /Fluxo/u }));
    await user.click(await screen.findByRole("option", { name: /Demonstração de aprovação/u }));
    await user.type(within(dialog).getByRole("textbox", { name: /Título/u }), "Draft");
    await user.click(within(dialog).getByRole("button", { name: "Editar como JSON" }));
    const input = within(dialog).getByRole("textbox", { name: /Dados de entrada \(JSON\)/u });
    expect(JSON.parse((input as HTMLTextAreaElement).value)).toEqual({ title: "Draft" });
    await user.clear(input);
    await user.click(input);
    await user.paste("[1]");
    await user.click(within(dialog).getByRole("button", { name: "Iniciar" }));
    expect(within(dialog).getByText("Escreva um objeto JSON válido.")).toBeDefined();
    expect(requests).toHaveLength(0);
    await user.clear(input);
    await user.click(input);
    await user.paste('{"title":"Follow-up"}');
    await user.click(within(dialog).getByRole("button", { name: "Editar como formulário" }));
    expect(within(dialog).getByRole<HTMLInputElement>("textbox", { name: /Título/u }).value).toBe("Follow-up");
  });

  it("puts the server's field refusals next to the field", async () => {
    const { user } = renderView({
      "POST /v1/workflows/:workflowId/runs": apiError(400, "VALIDATION_FAILED", [{ field: "inputData.title", issue: "INVALID" }]),
    });
    await user.click(await screen.findByRole("button", { name: "Iniciar fluxo" }));
    const dialog = await screen.findByRole("dialog", { name: "Iniciar fluxo" });
    await user.click(within(dialog).getByRole("combobox", { name: /Fluxo/u }));
    await user.click(await screen.findByRole("option", { name: /Demonstração de aprovação/u }));
    const title = within(dialog).getByRole("textbox", { name: /Título/u });
    await user.type(title, "x");
    await user.click(within(dialog).getByRole("button", { name: "Iniciar" }));
    expect(await within(dialog).findByText("Revise este campo.")).toBeDefined();
    expect(title.getAttribute("aria-invalid")).toBe("true");
  });

  it("shows the server's refusal when the workflow cannot be started", async () => {
    const { user } = renderView({ "POST /v1/workflows/:workflowId/runs": apiError(422, "WORKFLOW_NOT_STARTABLE") });
    await user.click(await screen.findByRole("button", { name: "Iniciar fluxo" }));
    const dialog = await screen.findByRole("dialog", { name: "Iniciar fluxo" });
    await user.click(within(dialog).getByRole("combobox", { name: /Fluxo/u }));
    await user.click(await screen.findByRole("option", { name: /Demonstração de aprovação/u }));
    await user.type(within(dialog).getByRole("textbox", { name: /Título/u }), "Follow-up");
    await user.click(within(dialog).getByRole("button", { name: "Iniciar" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Este fluxo não pode ser iniciado manualmente.");
  });

  it("cancels a live run after confirmation", async () => {
    const requests: FakeRequest[] = [];
    const { user } = renderView({
      "POST /v1/workflows/runs/:runId/cancel": (request) => {
        requests.push(request);
        return noContent();
      },
    });
    await user.click(await screen.findByRole("button", { name: "Cancelar a execução run-1 de Demonstração de aprovação" }));
    expect(screen.queryByRole("button", { name: "Cancelar a execução run-2 de Relatório de uso" })).toBeNull();
    const confirm = await screen.findByRole("alertdialog", { name: "Cancelar a execução de Demonstração de aprovação?" });
    await user.click(within(confirm).getByRole("button", { name: "Cancelar execução" }));
    expect(await screen.findByText("Execução de Demonstração de aprovação cancelada.")).toBeDefined();
    expect(requests[0]?.params["runId"]).toBe("run-1");
    expect(requests[0]?.query.get("organizationId")).toBe(IDS.organization);
  });

  it("hides what a member may not do: no cancel, no schedules", async () => {
    renderView({}, MEMBER);
    await screen.findByRole("table", { name: "Execuções de fluxos de Northwind" });
    expect(screen.getByRole("button", { name: "Iniciar fluxo" })).toBeDefined();
    expect(screen.queryByRole("button", { name: /Cancelar a execução/u })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Agendamentos" })).toBeNull();
  });

  it("shows the error of a failed list with its reference and a retry, and no-access without the read permission", async () => {
    const first = renderView({ "GET /v1/workflows/runs": apiError(429, "RATE_LIMITED") });
    expect((await screen.findByRole("alert")).textContent).toContain("Referência");
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeDefined();
    first.unmount();
    renderView({}, BASE);
    expect(await screen.findByRole("heading", { name: "Você não tem acesso a esta página" })).toBeDefined();
  });
});

describe("SettingsWorkflowsView: schedules", () => {
  const openSchedules = async (routes: FakeRoutes = {}, permissions: readonly Permission[] = ADMIN) => {
    const view = renderView(routes, permissions);
    await view.user.click(await screen.findByRole("tab", { name: "Agendamentos" }));
    await screen.findByRole("table", { name: "Agendamentos de Northwind" });
    return view;
  };

  it("lists schedules with cron, zone and next fire in both zones", async () => {
    const { container } = await openSchedules();
    const table = screen.getByRole("table", { name: "Agendamentos de Northwind" });
    expect(within(table).getByText("0 9 * * *")).toBeDefined();
    expect(within(table).getAllByText(/America\/Sao_Paulo/u).length).toBeGreaterThan(0);
    expect(within(table).getByText("Ativo")).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("creates a schedule from a preset in the organization's time zone", async () => {
    const requests: FakeRequest[] = [];
    const { user } = await openSchedules({
      "POST /v1/schedules": (request) => {
        requests.push(request);
        return ok(buildSchedule({ id: "schedule_3fa9c0e1b2d4a6f8-weekdays" }), 201);
      },
    });
    await user.click(screen.getByRole("button", { name: "Novo agendamento" }));
    const dialog = await screen.findByRole("dialog", { name: "Novo agendamento" });
    await user.click(within(dialog).getByRole("button", { name: "Criar agendamento" }));
    expect(within(dialog).getByText("Escolha um fluxo.")).toBeDefined();
    expect(requests).toHaveLength(0);
    await user.click(within(dialog).getByRole("combobox", { name: /^Fluxo/u }));
    // Only schedulable workflows are offered.
    expect(screen.queryByRole("option", { name: /Demonstração de aprovação/u })).toBeNull();
    await user.click(await screen.findByRole("option", { name: /Relatório de uso/u }));
    await user.type(within(dialog).getByRole("textbox", { name: /Nome curto/u }), "weekdays");
    await user.click(within(dialog).getByRole("combobox", { name: /Frequência/u }));
    await user.click(await screen.findByRole("option", { name: "De segunda a sexta" }));
    expect(within(dialog).getByText("Expressão: 0 9 * * 1-5")).toBeDefined();
    await user.click(within(dialog).getByRole("button", { name: "Criar agendamento" }));
    expect(await screen.findByText("Agendamento de Relatório de uso criado.")).toBeDefined();
    expect(requests[0]?.query.get("organizationId")).toBe(IDS.organization);
    expect(requests[0]?.body).toEqual({ workflowId: "usage-report", slug: "weekdays", cron: "0 9 * * 1-5", timezone: "America/Sao_Paulo", inputData: {} });
    // A workflow that declares no input asks for none.
    expect(within(dialog).queryByRole("group", { name: /Dados de entrada/u })).toBeNull();
  });

  it("edits a schedule's input in the fields of its workflow, prefilled with what it sends", async () => {
    const requests: FakeRequest[] = [];
    const { user } = await openSchedules({
      "GET /v1/workflows": ok([buildWorkflowCatalogEntry({ schedulable: true })]),
      "GET /v1/schedules": ok([buildSchedule({ workflowId: "approval-demo", inputData: { title: "Daily" } })]),
      "PATCH /v1/schedules/:scheduleId": (request) => {
        requests.push(request);
        return ok(buildSchedule({ workflowId: "approval-demo" }));
      },
    });
    await user.click(screen.getByRole("button", { name: "Editar o agendamento daily-usage de Demonstração de aprovação" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar agendamento de Demonstração de aprovação" });
    const title = within(dialog).getByRole("textbox", { name: /Título/u });
    expect((title as HTMLInputElement).value).toBe("Daily");
    await user.clear(title);
    await user.click(within(dialog).getByRole("button", { name: "Salvar agendamento" }));
    expect(within(dialog).getByText("Preencha este campo.")).toBeDefined();
    await user.type(title, "Weekly");
    await user.click(within(dialog).getByRole("button", { name: "Salvar agendamento" }));
    await waitFor(() => expect(requests[0]?.body).toEqual({ cron: "0 9 * * *", timezone: "America/Sao_Paulo", inputData: { title: "Weekly" } }));
  });

  it("explains the server's refusals: interval too short and slug taken", async () => {
    const { user, api } = await openSchedules({ "POST /v1/schedules": apiError(422, "SCHEDULE_INTERVAL_TOO_SHORT") });
    await user.click(screen.getByRole("button", { name: "Novo agendamento" }));
    const dialog = await screen.findByRole("dialog", { name: "Novo agendamento" });
    await user.click(within(dialog).getByRole("combobox", { name: /^Fluxo/u }));
    await user.click(await screen.findByRole("option", { name: /Relatório de uso/u }));
    await user.type(within(dialog).getByRole("textbox", { name: /Nome curto/u }), "fast");
    await user.click(within(dialog).getByRole("combobox", { name: /Frequência/u }));
    await user.click(await screen.findByRole("option", { name: "Expressão cron" }));
    const cron = within(dialog).getByRole("textbox", { name: /Expressão cron/u });
    await user.click(cron);
    await user.paste("bad");
    await user.click(within(dialog).getByRole("button", { name: "Criar agendamento" }));
    expect(within(dialog).getByText("Revise a frequência: horário, dia ou expressão inválidos.")).toBeDefined();
    await user.clear(cron);
    await user.click(cron);
    await user.paste("* * * * *");
    await user.click(within(dialog).getByRole("button", { name: "Criar agendamento" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("O intervalo entre disparos é curto demais. Use pelo menos 15 minutos.");
    api.route("POST /v1/schedules", apiError(409, "CONFLICT"));
    await user.click(within(dialog).getByRole("button", { name: "Criar agendamento" }));
    await waitFor(() => expect(within(dialog).getByRole("alert").textContent).toContain("Já existe um agendamento com este nome curto. Escolha outro."));
  });

  it("edits the cron and zone of a schedule; workflow and slug stay fixed", async () => {
    const requests: FakeRequest[] = [];
    const { user } = await openSchedules({
      "PATCH /v1/schedules/:scheduleId": (request) => {
        requests.push(request);
        return ok(buildSchedule({ cron: "30 * * * *" }));
      },
    });
    await user.click(screen.getByRole("button", { name: "Mais ações do agendamento daily-usage de Relatório de uso" }));
    await user.click(await screen.findByRole("menuitem", { name: "Editar o agendamento daily-usage de Relatório de uso" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar agendamento de Relatório de uso" });
    expect(within(dialog).queryByRole("textbox", { name: /Nome curto/u })).toBeNull();
    expect(within(dialog).getByText("Expressão: 0 9 * * *")).toBeDefined();
    await user.click(within(dialog).getByRole("combobox", { name: /Frequência/u }));
    await user.click(await screen.findByRole("option", { name: "A cada hora" }));
    const minute = within(dialog).getByRole("spinbutton", { name: /Minuto da hora/u });
    await user.clear(minute);
    await user.type(minute, "30");
    await user.click(within(dialog).getByRole("button", { name: "Salvar agendamento" }));
    expect(await screen.findByText("Agendamento de Relatório de uso atualizado.")).toBeDefined();
    expect(requests[0]?.params["scheduleId"]).toBe("schedule_3fa9c0e1b2d4a6f8-daily-usage");
    expect(requests[0]?.query.get("organizationId")).toBe(IDS.organization);
    expect(requests[0]?.body).toEqual({ cron: "30 * * * *", timezone: "America/Sao_Paulo", inputData: {} });
  });

  it("pauses only after confirmation, runs now and deletes", async () => {
    const calls: string[] = [];
    const record = (name: string, response: ReturnType<typeof ok>) => (request: FakeRequest) => {
      calls.push(`${name} ${request.params["scheduleId"] ?? ""} ${request.query.get("organizationId") ?? ""}`);
      return response;
    };
    const { user } = await openSchedules({
      "POST /v1/schedules/:scheduleId/pause": record("pause", ok(buildSchedule({ status: "paused", nextFireAt: null }))),
      "POST /v1/schedules/:scheduleId/run": record("run", ok({ scheduleId: "schedule_3fa9c0e1b2d4a6f8-daily-usage" }, 202)),
      "DELETE /v1/schedules/:scheduleId": record("delete", noContent()),
    });
    const id = "schedule_3fa9c0e1b2d4a6f8-daily-usage";
    await user.click(screen.getByRole("button", { name: `Pausar o agendamento daily-usage de Relatório de uso` }));
    expect(calls).toEqual([]);
    const pause = await screen.findByRole("alertdialog", { name: "Pausar o agendamento de Relatório de uso?" });
    await user.click(within(pause).getByRole("button", { name: "Pausar agendamento" }));
    expect(await screen.findByText("Agendamento de Relatório de uso pausado.")).toBeDefined();

    await user.click(screen.getByRole("button", { name: `Executar agora o agendamento daily-usage de Relatório de uso` }));
    const run = await screen.findByRole("alertdialog", { name: "Executar Relatório de uso agora?" });
    await user.click(within(run).getByRole("button", { name: "Executar agora" }));
    expect(await screen.findByText("Execução de Relatório de uso iniciada.")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Mais ações do agendamento daily-usage de Relatório de uso" }));
    await user.click(await screen.findByRole("menuitem", { name: `Excluir o agendamento daily-usage de Relatório de uso` }));
    const remove = await screen.findByRole("alertdialog", { name: "Excluir o agendamento de Relatório de uso?" });
    await user.click(within(remove).getByRole("button", { name: "Excluir agendamento" }));
    expect(await screen.findByText("Agendamento de Relatório de uso excluído.")).toBeDefined();
    expect(calls).toEqual([`pause ${id} ${IDS.organization}`, `run ${id} ${IDS.organization}`, `delete ${id} ${IDS.organization}`]);
  });

  it("is read-only without core.schedule.write", async () => {
    await openSchedules({}, [...MEMBER, "core.schedule.read"]);
    expect(screen.queryByRole("button", { name: "Novo agendamento" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Pausar o agendamento/u })).toBeNull();
    expect(screen.queryByRole("button", { name: /Mais ações do agendamento/u })).toBeNull();
  });
});

describe("SettingsWorkflowsView: run page", () => {
  const runPath = (runId: string) => `${SETTINGS_PATH}/runs/${runId}`;

  it("shows a suspended run with its timeline and a link to the approvals inbox", async () => {
    const { container, api } = renderView(
      { "GET /v1/workflows/runs/:runId": ok(buildWorkflowRun({ status: "suspended", approvalRequestId: "Ap3rQ9vLr3TnB7pWc1aZ" })) },
      ADMIN,
      runPath("run-1"),
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Execução de Demonstração de aprovação" })).toBeDefined();
    const timeline = screen.getByRole("list", { name: "Linha do tempo da execução run-1" });
    expect(within(timeline).getByText("Suspensa")).toBeDefined();
    expect(within(timeline).getByRole("link", { name: "Abrir aprovações" }).getAttribute("href")).toBe(`/o/${IDS.organization}/settings/approvals/Ap3rQ9vLr3TnB7pWc1aZ`);
    expect(screen.getByText("Esta página se atualiza sozinha enquanto a execução está em andamento.")).toBeDefined();
    expect(new URLSearchParams(lastCall(api, "GET", "/v1/workflows/runs/run-1")?.query).get("organizationId")).toBe(IDS.organization);
    await expectNoAxeViolations(container);
  });

  it("offers no cancel for a finished run and says it settled", async () => {
    renderView({ "GET /v1/workflows/runs/:runId": ok(buildWorkflowRun({ status: "success" })) }, ADMIN, runPath("run-1"));
    expect(await screen.findByText("A execução terminou. O estado não muda mais.")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Cancelar execução" })).toBeNull();
  });

  it("says why a run failed and at which step, and offers to run the workflow again", async () => {
    const requests: FakeRequest[] = [];
    const { user, router, container } = renderView(
      {
        "GET /v1/workflows/runs/:runId": (request) =>
          ok(request.params["runId"] === "run-new" ? buildWorkflowRun({ runId: "run-new" }) : buildWorkflowRun({ status: "failed", failure: { code: "STEP_FAILED", stepId: "apply-note" } })),
        "POST /v1/workflows/:workflowId/runs": (request) => {
          requests.push(request);
          return ok({ runId: "run-new" }, 202);
        },
      },
      ADMIN,
      runPath("run-1"),
    );
    const timeline = await screen.findByRole("list", { name: "Linha do tempo da execução run-1" });
    expect(within(timeline).getByText("Uma etapa falhou")).toBeDefined();
    expect(within(timeline).getByText("apply-note")).toBeDefined();
    expect(screen.getByText(/Revise os dados de entrada e execute o fluxo de novo/u)).toBeDefined();
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("button", { name: "Executar de novo" }));
    const dialog = await screen.findByRole("dialog", { name: "Iniciar fluxo" });
    // The workflow comes preselected; its input is asked again.
    await user.type(within(dialog).getByRole("textbox", { name: /Título/u }), "Retry");
    await user.click(within(dialog).getByRole("button", { name: "Iniciar" }));
    await waitFor(() => expect(router.current()).toBe(runPath("run-new")));
    expect(requests[0]?.params["workflowId"]).toBe("approval-demo");
  });

  it("names a guardrail stop, and offers no rerun without the start permission", async () => {
    renderView(
      { "GET /v1/workflows/runs/:runId": ok(buildWorkflowRun({ status: "tripwire", failure: { code: "TRIPWIRE", stepId: null } })) },
      [...BASE, "core.workflow-run.read"],
      runPath("run-1"),
    );
    const timeline = await screen.findByRole("list", { name: "Linha do tempo da execução run-1" });
    expect(within(timeline).getByText("Uma proteção interrompeu a execução")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Executar de novo" })).toBeNull();
  });

  it("answers not-found for a run of another organization and for an unknown address", async () => {
    const first = renderView({ "GET /v1/workflows/runs/:runId": apiError(404, "NOT_FOUND") }, ADMIN, runPath("other"));
    expect(await screen.findByRole("heading", { level: 2, name: "Execução não encontrada" })).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancelar execução" })).toBeNull();
    expect(screen.getAllByRole("link", { name: "Voltar às execuções" }).at(-1)?.getAttribute("href")).toBe(SETTINGS_PATH);
    await expectNoAxeViolations(first.container);
    first.unmount();
    renderView({}, ADMIN, `${SETTINGS_PATH}/nope`);
    expect(await screen.findByRole("heading", { name: "Página não encontrada" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Voltar às execuções" }).getAttribute("href")).toBe(SETTINGS_PATH);
  });
});
