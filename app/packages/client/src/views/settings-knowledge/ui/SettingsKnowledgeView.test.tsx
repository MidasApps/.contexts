import type { Permission } from "@core/contracts";
import { configure, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { buildKnowledgeDocument, KNOWLEDGE_IDS } from "#/entities/knowledge/knowledge.fixture.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, noContent, ok, page, type FakeRequest, type FakeRoutes } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { SettingsKnowledgeView } from "./SettingsKnowledgeView.tsx";

// Sibling test runs load the machine: the shell boot alone can take seconds, so waits and tests get room.
configure({ asyncUtilTimeout: 15_000 });
vi.setConfig({ testTimeout: 60_000 });

const READER: Permission[] = ["core.organization.read", "core.project.read", "core.knowledge.read"];
const ADMIN: Permission[] = [...READER, "core.knowledge.write", "core.knowledge.delete", "core.file.upload"];
const DOCUMENTS = "GET /v1/organizations/:organizationId/knowledge/documents";

const LIST = [
  buildKnowledgeDocument(),
  buildKnowledgeDocument({ id: KNOWLEDGE_IDS.otherDocument, title: null, source: "url", sourceRef: "https://docs.example.com/faq", sourceUrl: "https://docs.example.com/faq", namespace: `project:${IDS.project}`, status: "pending" }),
  buildKnowledgeDocument({ id: "01928f6e-7b2a-7c3d-9e4f-5a6b7c8d9e11", title: "Contract reference", source: "catalog", sourceRef: "tenancy.Project", namespace: "catalog", tenantId: "_platform", createdBy: null }),
];

const renderView = (routes: FakeRoutes = {}, permissions: readonly Permission[] = ADMIN) =>
  renderApp(
    <main>
      <SettingsKnowledgeView />
    </main>,
    { path: `/o/${IDS.organization}/settings/knowledge`, routes: shellRoutes(permissions, { [DOCUMENTS]: page(LIST), ...routes }) },
  );

describe("SettingsKnowledgeView", () => {
  it("lists documents with their collection and indexing status, and says how collections work", async () => {
    const { container } = renderView();
    // The table exists while loading (skeleton rows), so wait for a document first.
    await screen.findByText("Onboarding guide");
    const table = screen.getByRole("table", { name: "Documentos da base de conhecimento de Northwind" });
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1] as HTMLElement).getByText("Onboarding guide")).toBeDefined();
    expect(within(rows[1] as HTMLElement).getByText("Organização inteira")).toBeDefined();
    expect(within(rows[1] as HTMLElement).getByText("Pronto")).toBeDefined();
    expect(within(rows[2] as HTMLElement).getByText("https://docs.example.com/faq")).toBeDefined();
    expect(within(rows[2] as HTMLElement).getByText("Projeto Launch")).toBeDefined();
    expect(within(rows[2] as HTMLElement).getByText("Indexando")).toBeDefined();
    expect(within(rows[3] as HTMLElement).getByText("Conteúdo da plataforma")).toBeDefined();
    expect(screen.getByText(/Não é possível criar coleções com nome próprio/u)).toBeDefined();
    // Platform content is not the organization's to delete.
    expect(within(rows[3] as HTMLElement).queryByRole("button")).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("filters by collection through the namespace of the request", async () => {
    const namespaces: (string | null)[] = [];
    const { user } = renderView({
      [DOCUMENTS]: (request: FakeRequest) => {
        namespaces.push(request.query.get("namespace"));
        expect(request.params["organizationId"]).toBe(IDS.organization);
        return page(request.query.get("namespace") === null ? LIST : [LIST[1]]);
      },
    });
    await screen.findByText("Onboarding guide");
    await user.click(screen.getByRole("combobox", { name: "Coleção" }));
    await user.click(await screen.findByRole("option", { name: "Projeto Launch" }));
    await waitFor(() => expect(screen.queryByText("Onboarding guide")).toBeNull());
    expect(namespaces).toContain(`project:${IDS.project}`);
    expect(namespaces[0]).toBeNull();
  });

  it("deletes a document after confirmation", async () => {
    const deleted: FakeRequest[] = [];
    let list = LIST;
    const { user } = renderView({
      [DOCUMENTS]: () => page(list),
      "DELETE /v1/organizations/:organizationId/knowledge/documents/:documentId": (request: FakeRequest) => {
        deleted.push(request);
        list = LIST.slice(1);
        return noContent();
      },
    });
    await user.click(await screen.findByRole("button", { name: "Excluir Onboarding guide" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Excluir Onboarding guide?" });
    await user.click(within(dialog).getByRole("button", { name: "Excluir documento" }));
    await waitFor(() => expect(screen.queryByText("Onboarding guide")).toBeNull());
    expect(deleted[0]?.params).toEqual({ organizationId: IDS.organization, documentId: KNOWLEDGE_IDS.document });
  });

  it("adds a web page and shows it as indexing until the document is listed", async () => {
    const sources: FakeRequest[] = [];
    const { user } = renderView({
      [DOCUMENTS]: page([]),
      "POST /v1/organizations/:organizationId/knowledge/sources": (request: FakeRequest) => {
        sources.push(request);
        return ok({ runId: "run-1" }, 202);
      },
    });
    expect(await screen.findByRole("heading", { name: "Nenhum documento nesta coleção" })).toBeDefined();
    await user.click(screen.getAllByRole("button", { name: "Adicionar documento" })[0] as HTMLElement);
    const dialog = await screen.findByRole("dialog", { name: "Adicionar documento" });
    await user.click(within(dialog).getByRole("tab", { name: "Página da web" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Endereço da página" }), "https://docs.example.com/new");
    await user.click(within(dialog).getByRole("button", { name: "Adicionar" }));
    const notices = await screen.findByRole("list", { name: "Indexações em andamento" });
    expect(within(notices).getByText(/Indexando https:\/\/docs\.example\.com\/new/u)).toBeDefined();
    expect(sources[0]?.params["organizationId"]).toBe(IDS.organization);
    expect(sources[0]?.body).toEqual({ kind: "url", url: "https://docs.example.com/new" });
    await user.click(within(notices).getByRole("button", { name: "Dispensar o aviso de https://docs.example.com/new" }));
    expect(screen.queryByRole("list", { name: "Indexações em andamento" })).toBeNull();
  });

  it("offers no add or delete action to a viewer who can only read", async () => {
    renderView({}, READER);
    await screen.findByText("Onboarding guide");
    expect(screen.queryByRole("button", { name: "Adicionar documento" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Excluir/u })).toBeNull();
  });

  it("shows no-access without the read permission and never asks for documents", async () => {
    const { api } = renderView({}, ["core.organization.read"]);
    expect(await screen.findByText("Peça a um administrador da organização para liberar esta seção.")).toBeDefined();
    expect(screen.queryByRole("table")).toBeNull();
    expect(api.callLines().some((line) => line.includes("/knowledge/"))).toBe(false);
  });

  it("shows the error with its reference and a retry when the list fails", async () => {
    renderView({ [DOCUMENTS]: apiError(503, "UPSTREAM_UNAVAILABLE") });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Referência:");
    expect(within(alert).getByRole("button", { name: "Tentar novamente" })).toBeDefined();
  });
});
