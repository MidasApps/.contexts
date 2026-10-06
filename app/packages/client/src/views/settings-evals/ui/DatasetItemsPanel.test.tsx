import type { Permission } from "@core/contracts";
import { configure, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { buildDataset, numberedPage } from "#/shared/testing/admin-observability-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import {
  apiError,
  FAKE_REQUEST_ID,
  type FakeRequest,
  type FakeRoutes,
  noContent,
  ok,
} from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { SettingsEvalsView } from "./SettingsEvalsView.tsx";

const READER: Permission[] = ["core.organization.read", "core.project.read", "core.eval.read"];
const WRITER: Permission[] = [...READER, "core.eval.write"];

const REFUNDS = buildDataset({
  id: "ds_refunds",
  name: "refunds",
  tenantId: IDS.organization,
  targetIds: ["assistant"],
});
const ITEM = {
  id: "item_1",
  datasetId: "ds_refunds",
  input: "Qual é a política de reembolso?",
  expectedOutput: "30 dias.",
  createdAt: "2026-10-01T12:00:00.000Z",
};
const NO_ANSWER = { ...ITEM, id: "item_2", input: "Oi", expectedOutput: null };

const renderView = (routes: FakeRoutes = {}, permissions: readonly Permission[] = WRITER, search = "?tab=datasets") =>
  renderApp(
    <main>
      <SettingsEvalsView />
    </main>,
    {
      path: `/o/${IDS.organization}/settings/evals${search}`,
      routes: shellRoutes(permissions, {
        "GET /v1/evals/experiments": numberedPage([]),
        "GET /v1/evals/datasets": ok([REFUNDS]),
        "GET /v1/evals/datasets/:datasetId/items": numberedPage([ITEM, NO_ANSWER]),
        ...routes,
      }),
    },
  );

const organizationOf = (request: FakeRequest): string | null => request.query.get("organizationId");

vi.setConfig({ testTimeout: 20_000 });
configure({ asyncUtilTimeout: 5000 });

describe("dataset items in the evals page (decision 0062)", () => {
  it("opens a dataset's items from its row and lists input and expected answer for the organization", async () => {
    const { user, api, container } = renderView();
    await user.click(await screen.findByRole("button", { name: "Ver os itens de refunds" }));
    const table = await screen.findByRole("table", { name: "Itens de refunds" });
    expect(within(within(table).getByRole("row", { name: /reembolso/u })).getByText("30 dias.")).toBeDefined();
    expect(within(within(table).getByRole("row", { name: /Oi/u })).getByText("Sem resposta esperada")).toBeDefined();
    const call = api.calls.find((entry) => entry.path === "/v1/evals/datasets/ds_refunds/items");
    expect(new URLSearchParams(call?.query).get("organizationId")).toBe(IDS.organization);
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("button", { name: "Conjuntos de dados" }));
    expect(await screen.findByRole("table", { name: "Conjuntos de dados de Northwind" })).toBeDefined();
  });

  it("adds a manual item with trimmed texts and refreshes the list", async () => {
    const sent: FakeRequest[] = [];
    const { user } = renderView(
      {
        "POST /v1/evals/datasets/:datasetId/items": (request: FakeRequest) => {
          sent.push(request);
          return ok({ ...ITEM, id: "item_new" }, 201);
        },
      },
      WRITER,
      "?tab=datasets&dataset=ds_refunds",
    );
    await screen.findByRole("table", { name: "Itens de refunds" });
    await user.click(screen.getAllByRole("button", { name: "Adicionar item" })[0] as HTMLElement);
    const dialog = await screen.findByRole("dialog", { name: "Adicionar item" });
    await user.click(within(dialog).getByRole("button", { name: "Adicionar" }));
    expect(await within(dialog).findByText("Informe a entrada.")).toBeDefined();
    await user.type(within(dialog).getByRole("textbox", { name: "Entrada" }), "  Prazo de troca?  ");
    await user.type(within(dialog).getByRole("textbox", { name: "Resposta esperada (opcional)" }), "7 dias");
    await expectNoAxeViolations(dialog);
    await user.click(within(dialog).getByRole("button", { name: "Adicionar" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.body).toEqual({ input: "Prazo de troca?", expectedOutput: "7 dias" });
    expect(sent[0] === undefined ? null : organizationOf(sent[0])).toBe(IDS.organization);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Item adicionado.")).toBeDefined();
  });

  it("deletes an item after confirming", async () => {
    const deleted: FakeRequest[] = [];
    const { user } = renderView(
      {
        "DELETE /v1/evals/datasets/:datasetId/items/:itemId": (request: FakeRequest) => {
          deleted.push(request);
          return noContent();
        },
      },
      WRITER,
      "?tab=datasets&dataset=ds_refunds",
    );
    await user.click(await screen.findByRole("button", { name: "Excluir o item Oi" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Excluir este item?" });
    await user.click(within(dialog).getByRole("button", { name: "Excluir item" }));
    await waitFor(() => expect(deleted).toHaveLength(1));
    expect(deleted[0]?.params).toEqual({ datasetId: "ds_refunds", itemId: "item_2" });
    expect(await screen.findByText("Item excluído.")).toBeDefined();
  });

  it("creates a dataset, tells a name already in use on its field, and opens the new dataset", async () => {
    const { user, api } = renderView({
      "POST /v1/evals/datasets": apiError(409, "CONFLICT"),
      "GET /v1/evals/datasets/:datasetId/items": numberedPage([]),
    });
    await user.click(await screen.findByRole("button", { name: "Novo conjunto de dados" }));
    const dialog = await screen.findByRole("dialog", { name: "Novo conjunto de dados" });
    await user.type(within(dialog).getByRole("textbox", { name: "Nome" }), "refunds");
    await user.click(within(dialog).getByRole("button", { name: "Criar" }));
    expect(await within(dialog).findByText("Esta organização já tem um conjunto com esse nome.")).toBeDefined();
    api.route(
      "POST /v1/evals/datasets",
      ok(buildDataset({ id: "ds_new", name: "trocas", tenantId: IDS.organization }), 201),
    );
    await user.clear(within(dialog).getByRole("textbox", { name: "Nome" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Nome" }), "trocas");
    await user.click(within(dialog).getByRole("button", { name: "Criar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByRole("heading", { name: "Nenhum item ainda" })).toBeDefined();
    expect(api.calls.some((call) => call.path === "/v1/evals/datasets/ds_new/items")).toBe(true);
  });

  it("renames a dataset and keeps the feedback dataset unchangeable", async () => {
    const feedback = buildDataset({ id: "ds_feedback", name: "feedback", tenantId: IDS.organization });
    const bodies: unknown[] = [];
    const { user } = renderView({
      "GET /v1/evals/datasets": ok([REFUNDS, feedback]),
      "PATCH /v1/evals/datasets/:datasetId": (request: FakeRequest) => {
        bodies.push([request.params["datasetId"], request.body, organizationOf(request)]);
        return ok({ ...REFUNDS, name: "returns" });
      },
    });
    await screen.findByRole("button", { name: "Renomear o conjunto refunds" });
    expect(screen.queryByRole("button", { name: "Renomear o conjunto feedback" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Excluir o conjunto feedback" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Renomear o conjunto refunds" }));
    const dialog = await screen.findByRole("dialog", { name: "Renomear refunds" });
    const name = within(dialog).getByRole("textbox", { name: "Nome" });
    await user.clear(name);
    await user.type(name, "returns");
    await user.click(within(dialog).getByRole("button", { name: "Salvar nome" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(bodies).toEqual([["ds_refunds", { name: "returns" }, IDS.organization]]);
  });

  it("deletes a dataset after confirming, and explains DATASET_IN_USE", async () => {
    const { user, api } = renderView({
      "DELETE /v1/evals/datasets/:datasetId": apiError(409, "DATASET_IN_USE"),
    });
    await user.click(await screen.findByRole("button", { name: "Excluir o conjunto refunds" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Excluir o conjunto refunds?" });
    await user.click(within(confirm).getByRole("button", { name: "Excluir conjunto" }));
    expect((await within(confirm).findByRole("alert")).textContent).toContain("Já rodaram avaliações");
    api.route("DELETE /v1/evals/datasets/:datasetId", noContent());
    api.route("GET /v1/evals/datasets", ok([]));
    await user.click(within(confirm).getByRole("button", { name: "Excluir conjunto" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("offers no create, add or delete without core.eval.write", async () => {
    renderView({}, READER, "?tab=datasets&dataset=ds_refunds");
    await screen.findByRole("table", { name: "Itens de refunds" });
    expect(screen.queryByRole("button", { name: "Adicionar item" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Excluir o item/u })).toBeNull();
  });

  it("offers no rename or delete of a dataset without core.eval.write", async () => {
    renderView({}, READER);
    await screen.findByRole("button", { name: "Ver os itens de refunds" });
    expect(screen.queryByRole("button", { name: /Renomear o conjunto/u })).toBeNull();
    expect(screen.queryByRole("button", { name: /Excluir o conjunto/u })).toBeNull();
  });

  it("shows the items error with its reference", async () => {
    renderView(
      { "GET /v1/evals/datasets/:datasetId/items": apiError(404, "NOT_FOUND") },
      WRITER,
      "?tab=datasets&dataset=ds_gone",
    );
    expect(await screen.findByText(`Referência: ${FAKE_REQUEST_ID}`)).toBeDefined();
  });
});
