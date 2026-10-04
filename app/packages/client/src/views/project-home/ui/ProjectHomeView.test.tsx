import { defineModule } from "@core/contracts";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { defineClientModule } from "#/app-shell/modules/define-client-module.ts";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { MEMBER_PERMISSIONS, shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, page } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
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
});
