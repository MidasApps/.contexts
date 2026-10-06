import { defineModule } from "@core/contracts";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { defineClientModule } from "#/app-shell/modules/define-client-module.ts";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { MEMBER_PERMISSIONS, shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, type FakeRequest, noContent, ok, page } from "#/shared/testing/fake-api.ts";
import { buildProject, IDS } from "#/shared/testing/fixtures.ts";
import { ProjectHomeView } from "./ProjectHomeView.tsx";

const sampleModule = defineClientModule({
  manifest: defineModule({
    id: "sample",
    labelKey: "sample.module.name",
    permissions: [
      {
        id: "sample.item.read",
        descriptionKey: "sample.permissions.read",
        kind: "read",
        scope: "tenant",
        defaultRoles: ["member"],
      },
    ],
    navigation: [
      {
        id: "items",
        slot: "project",
        labelKey: "sample.nav.items",
        icon: "list",
        path: "",
        permission: "sample.item.read",
      },
    ],
    messages: {
      "pt-BR": { module: { name: "Amostras" }, nav: { items: "Itens de amostra" }, permissions: { read: "Ler itens" } },
    },
  }),
  pages: { "": () => Promise.resolve({ default: () => <p>página</p> }) },
});

const PATH = `/o/${IDS.organization}/p/${IDS.project}`;
const renderView = (
  options: { path?: string; permissions?: readonly string[]; routes?: Parameters<typeof shellRoutes>[1] } = {},
) =>
  renderApp(
    <main>
      <ProjectHomeView />
    </main>,
    {
      path: options.path ?? PATH,
      modules: [sampleModule],
      routes: shellRoutes(options.permissions ?? [...MEMBER_PERMISSIONS, "sample.item.read"], options.routes),
    },
  );

describe("ProjectHomeView", () => {
  it("shows the project, its top-level units and the module entry points the viewer may open", async () => {
    const { container } = renderView();
    expect(await screen.findByRole("heading", { level: 1, name: "Launch" })).toBeDefined();
    expect(screen.getByText("Northwind")).toBeDefined();
    const units = await screen.findByRole("list", { name: "Unidades" });
    expect(
      within(units)
        .getByRole("link", { name: /Site A/u })
        .getAttribute("href"),
    ).toBe(`${PATH}?unit=site-1`);
    const modules = screen.getByRole("list", { name: "Módulos" });
    expect(within(modules).getByRole("link", { name: "Itens de amostra" }).getAttribute("href")).toBe(
      `${PATH}/m/sample`,
    );
    await expectNoAxeViolations(container);
  });

  it("shows the current unit, its subunits, and hides modules without their permission", async () => {
    const { container } = renderView({ path: `${PATH}?unit=site-1`, permissions: MEMBER_PERMISSIONS });
    expect(await screen.findByRole("heading", { level: 2, name: "Subunidades" })).toBeDefined();
    expect(await screen.findByRole("link", { name: /Floor 2/u })).toBeDefined();
    expect(await screen.findByRole("heading", { name: "Nenhum módulo disponível" })).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("renders the empty units state, and not-found for a hidden project", async () => {
    const empty = renderView({ routes: { "GET /v1/projects/:projectId/units": page([]) } });
    expect(await screen.findByRole("heading", { name: "Nenhuma unidade aqui" })).toBeDefined();
    await expectNoAxeViolations(empty.container);
    empty.unmount();
    renderView({ routes: { "GET /v1/me/context": apiError(404, "NOT_FOUND") } });
    expect(await screen.findByRole("heading", { level: 1, name: "Página não encontrada" })).toBeDefined();
  });
  describe("project settings", () => {
    const MANAGER = [...MEMBER_PERMISSIONS, "core.project.update", "core.project.delete"];

    it("renames the project, sending only what changed", async () => {
      const bodies: unknown[] = [];
      const { user } = renderView({
        permissions: MANAGER,
        routes: {
          "PATCH /v1/projects/:projectId": (request: FakeRequest) => {
            bodies.push(request.body);
            return ok(buildProject({ name: "Launch 2" }));
          },
        },
      });
      await user.click(await screen.findByRole("button", { name: "Configurar projeto" }));
      await user.click(await screen.findByRole("menuitem", { name: "Editar nome e descrição" }));
      const dialog = await screen.findByRole("dialog", { name: "Editar projeto" });
      const name = within(dialog).getByRole("textbox", { name: "Nome do projeto (obrigatório)" });
      await user.clear(name);
      await user.type(name, "Launch 2");
      await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
      expect(await screen.findByText("Projeto Launch 2 atualizado.")).toBeDefined();
      expect(bodies).toEqual([{ name: "Launch 2" }]);
    });

    it("archives after confirming", async () => {
      const bodies: unknown[] = [];
      const { user } = renderView({
        permissions: MANAGER,
        routes: {
          "PATCH /v1/projects/:projectId": (request: FakeRequest) => {
            bodies.push(request.body);
            return ok(buildProject({ status: "archived" }));
          },
        },
      });
      await user.click(await screen.findByRole("button", { name: "Configurar projeto" }));
      await user.click(await screen.findByRole("menuitem", { name: "Arquivar projeto" }));
      const confirm = await screen.findByRole("alertdialog", { name: "Arquivar Launch?" });
      await expectNoAxeViolations(confirm);
      await user.click(within(confirm).getByRole("button", { name: "Arquivar" }));
      expect(await screen.findByText("Projeto Launch arquivado.")).toBeDefined();
      expect(bodies).toEqual([{ status: "archived" }]);
    });

    it("deletes after confirming and goes back to the organization", async () => {
      const { user, router, api } = renderView({
        permissions: MANAGER,
        routes: { "DELETE /v1/projects/:projectId": noContent() },
      });
      await user.click(await screen.findByRole("button", { name: "Configurar projeto" }));
      await user.click(await screen.findByRole("menuitem", { name: "Excluir projeto" }));
      const confirm = await screen.findByRole("alertdialog", { name: "Excluir Launch?" });
      await user.click(within(confirm).getByRole("button", { name: "Excluir projeto" }));
      expect(await screen.findByText("Projeto Launch excluído.")).toBeDefined();
      expect(api.callLines()).toContain(`DELETE /v1/projects/${IDS.project}`);
      expect(router.current()).toBe(`/o/${IDS.organization}`);
    });

    it("is hidden without core.project.update and core.project.delete", async () => {
      renderView();
      await screen.findByRole("heading", { level: 1, name: "Launch" });
      expect(screen.queryByRole("button", { name: "Configurar projeto" })).toBeNull();
    });
  });
});
