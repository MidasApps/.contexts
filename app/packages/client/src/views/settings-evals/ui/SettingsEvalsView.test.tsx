import type { Permission } from "@core/contracts";
import { configure, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { buildDataset, buildExperiment, numberedPage } from "#/shared/testing/admin-observability-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, FAKE_REQUEST_ID, ok, type FakeRequest, type FakeRoutes } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { SettingsEvalsView } from "./SettingsEvalsView.tsx";

const READER: Permission[] = ["core.organization.read", "core.project.read", "core.eval.read"];
const WRITER: Permission[] = [...READER, "core.eval.write", "core.agent-settings.read"];

const BASE = buildExperiment({ experimentId: "exp_base", datasetId: "ds_feedback" });
const CANDIDATE = buildExperiment({
  experimentId: "exp_candidate",
  datasetId: "ds_feedback",
  agentId: "knowledge",
  verdict: "failed",
  scores: [
    { scorer: "tool-routing", mean: 0.8, baseline: 0.9 },
    { scorer: "tenant-leak", mean: 1, baseline: 1 },
  ],
});
const FEEDBACK = buildDataset({ id: "ds_feedback", name: "feedback", tenantId: IDS.organization, targetIds: ["assistant"] });
const SETTINGS = {
  tenantId: IDS.organization,
  enabledAgents: ["knowledge", "data"],
  webTools: { firecrawl: false, browser: false },
  guardrails: { pii: "warn" },
  budget: { monthlyMicroUsd: 50_000_000, monthlyTokens: 20_000_000 },
  updatedBy: null,
  createdAt: "2026-09-29T14:30:00.000Z",
  updatedAt: "2026-09-29T14:30:00.000Z",
};

const renderView = (routes: FakeRoutes = {}, permissions: readonly Permission[] = WRITER) =>
  renderApp(
    <main>
      <SettingsEvalsView />
    </main>,
    {
      path: `/o/${IDS.organization}/settings/evals`,
      routes: shellRoutes(permissions, {
        "GET /v1/evals/experiments": numberedPage([BASE, CANDIDATE]),
        "GET /v1/evals/datasets": ok([FEEDBACK]),
        "GET /v1/agent-settings": ok(SETTINGS),
        ...routes,
      }),
    },
  );

const organizationOf = (call: { query: string } | undefined): string | null => new URLSearchParams(call?.query).get("organizationId");

// The suite shares the machine with other suites: typing and dialogs need more than the defaults.
vi.setConfig({ testTimeout: 20_000 });
configure({ asyncUtilTimeout: 5000 });

describe("SettingsEvalsView", () => {
  it("lists the organization's experiments with status, verdict and scores, asking for that organization", async () => {
    const { container, api } = renderView();
    const table = await screen.findByRole("table", { name: "Experimentos de Northwind" });
    const row = within(table).getByRole("row", { name: /exp_base/u });
    expect(within(row).getByText("Concluído")).toBeDefined();
    expect(within(row).getByText("Aprovado")).toBeDefined();
    expect(within(row).getByText(/tool-routing: 94% \(mínimo 90%\)/u)).toBeDefined();
    expect(within(within(table).getByRole("row", { name: /exp_candidate/u })).getByText("Reprovado")).toBeDefined();
    expect(organizationOf(api.calls.find((call) => call.path === "/v1/evals/experiments"))).toBe(IDS.organization);
    expect(screen.getByText(/Ainda não é possível adicionar ou editar itens/u)).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("compares two experiments chosen on the page, shown above the list", async () => {
    const { user } = renderView();
    const table = await screen.findByRole("table", { name: "Experimentos de Northwind" });
    expect(screen.getByText("Escolha dois experimentos, de qualquer página, para comparar as notas por avaliador.")).toBeDefined();
    const comparison = screen.getByRole("region", { name: /Comparação de experimentos/u });
    expect(comparison.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Comparar o experimento exp_base" }));
    expect(screen.getByText("Escolha mais um experimento para comparar.")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Comparar o experimento exp_candidate" }));
    const verdicts = await screen.findByRole("list", { name: "Resultado por avaliador" });
    expect(within(verdicts).getByText(/tool-routing: B pior que A/u)).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Limpar comparação" }));
    expect(screen.queryByRole("list", { name: "Resultado por avaliador" })).toBeNull();
  });

  it("keeps a chosen experiment across pages and reads it by id for the organization", async () => {
    const OLDER = buildExperiment({ experimentId: "exp_older", datasetId: "ds_feedback", scores: [{ scorer: "tool-routing", mean: 0.7, baseline: 0.9 }] });
    const { user, api } = renderView({
      "GET /v1/evals/experiments": (request: FakeRequest) => (request.query.get("page") === "0" ? numberedPage([BASE, CANDIDATE], true) : numberedPage([OLDER])),
      "GET /v1/evals/experiments/:experimentId": (request: FakeRequest) => (request.params["experimentId"] === "exp_candidate" ? ok(CANDIDATE) : apiError(404, "NOT_FOUND")),
    });
    await screen.findByRole("table", { name: "Experimentos de Northwind" });
    await user.click(screen.getByRole("button", { name: "Comparar o experimento exp_candidate" }));
    await user.click(within(screen.getByRole("navigation", { name: "Páginas de experimentos" })).getByRole("button", { name: "Próxima" }));
    await user.click(await screen.findByRole("button", { name: "Comparar o experimento exp_older" }));
    const verdicts = await screen.findByRole("list", { name: "Resultado por avaliador" });
    expect(within(verdicts).getByText(/tool-routing: B pior que A/u)).toBeDefined();
    const byId = api.calls.filter((call) => call.path === "/v1/evals/experiments/exp_candidate");
    expect(byId.map(organizationOf)).toEqual([IDS.organization]);
  });

  it("lists the organization's datasets in their tab", async () => {
    const { user, api } = renderView();
    await user.click(await screen.findByRole("tab", { name: "Conjuntos de dados" }));
    const table = await screen.findByRole("table", { name: "Conjuntos de dados de Northwind" });
    const row = within(table).getByRole("row", { name: /feedback/u });
    expect(within(row).getByText("ds_feedback")).toBeDefined();
    expect(within(within(row).getByRole("list", { name: "Agentes avaliados por feedback" })).getByText("assistant")).toBeDefined();
    expect(organizationOf(api.calls.find((call) => call.path === "/v1/evals/datasets"))).toBe(IDS.organization);
  });

  it("starts an experiment on a dataset with the supervisor or an enabled agent", async () => {
    const sent: FakeRequest[] = [];
    const { user } = renderView({
      "POST /v1/evals/experiments": (request: FakeRequest) => {
        sent.push(request);
        return ok({ experimentId: "exp_new" }, 202);
      },
    });
    await user.click(await screen.findByRole("button", { name: "Iniciar experimento" }));
    const dialog = await screen.findByRole("dialog", { name: "Iniciar experimento" });
    await user.click(await within(dialog).findByRole("combobox", { name: "Agente" }));
    expect(screen.queryByRole("option", { name: "Ações" })).toBeNull();
    await user.click(await screen.findByRole("option", { name: "Conhecimento" }));
    await expectNoAxeViolations(dialog);
    await user.click(within(dialog).getByRole("button", { name: "Iniciar" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.body).toEqual({ datasetId: "ds_feedback", agentId: "knowledge" });
    expect(sent[0]?.query.get("organizationId")).toBe(IDS.organization);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Experimento exp_new iniciado.")).toBeDefined();
  });

  it("shows a refused agent on its field and another failure with its reference", async () => {
    const { user, api } = renderView({ "POST /v1/evals/experiments": apiError(400, "VALIDATION_FAILED", [{ field: "agentId", issue: "AGENT_NOT_ENABLED" }]) });
    await user.click(await screen.findByRole("button", { name: "Iniciar experimento" }));
    const dialog = await screen.findByRole("dialog", { name: "Iniciar experimento" });
    await user.click(await within(dialog).findByRole("button", { name: "Iniciar" }));
    expect(await within(dialog).findByText(/Este agente não está habilitado para a organização/u)).toBeDefined();
    api.route("POST /v1/evals/experiments", apiError(503, "UPSTREAM_UNAVAILABLE"));
    await user.click(within(dialog).getByRole("button", { name: "Iniciar" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("indisponível");
    expect(alert.textContent).toContain(FAKE_REQUEST_ID);
  });

  it("offers no start action without core.eval.write and says who starts experiments when empty", async () => {
    renderView({ "GET /v1/evals/experiments": numberedPage([]) }, READER);
    expect(await screen.findByRole("heading", { name: "Nenhum experimento ainda" })).toBeDefined();
    expect(screen.getByText("Os experimentos aparecem aqui quando alguém com permissão inicia um.")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Iniciar experimento" })).toBeNull();
  });

  it("shows no access and asks for nothing without core.eval.read", async () => {
    const { api } = renderView({}, ["core.organization.read"]);
    expect(await screen.findByText("Peça a um administrador da organização para liberar esta seção.")).toBeDefined();
    expect(api.calls.some((call) => call.path.startsWith("/v1/evals"))).toBe(false);
  });

  it("shows the list error with its reference and recovers on retry", async () => {
    const { user, api } = renderView({ "GET /v1/evals/experiments": apiError(409, "CONFLICT") });
    const retry = await screen.findByRole("button", { name: "Tentar novamente" });
    expect(screen.getByText(`Referência: ${FAKE_REQUEST_ID}`)).toBeDefined();
    api.route("GET /v1/evals/experiments", numberedPage([BASE]));
    await user.click(retry);
    expect(await screen.findByRole("row", { name: /exp_base/u })).toBeDefined();
  });
});
