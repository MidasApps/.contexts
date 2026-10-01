import { defineModule } from "@core/contracts";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { defineClientModule } from "#/app-shell/modules/define-client-module.ts";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { MEMBER_PERMISSIONS, shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import type { ModulePageProps } from "#/shared/lib/shell/shell-types.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { ModulePageView } from "./ModulePageView.tsx";

function ItemPage({ moduleId, params }: ModulePageProps) {
  return (
    <h1>
      {moduleId} item {params["itemId"]}
    </h1>
  );
}

const sampleModule = defineClientModule({
  manifest: defineModule({
    id: "sample",
    labelKey: "sample.module.name",
    permissions: [{ id: "sample.item.read", descriptionKey: "sample.permissions.read", kind: "read", scope: "tenant", defaultRoles: ["member"] }],
    navigation: [{ id: "items", slot: "project", labelKey: "sample.nav.items", icon: "list", path: "", permission: "sample.item.read" }],
    messages: { "pt-BR": { module: { name: "Amostras" }, nav: { items: "Itens" }, permissions: { read: "Ler itens" } } },
  }),
  pages: {
    "": () => Promise.resolve({ default: () => <h1>Lista de amostras</h1> }),
    "items/:itemId": () => Promise.resolve({ default: ItemPage }),
  },
});

const BASE = `/o/${IDS.organization}/p/${IDS.project}/m`;
const renderPage = (path: string, permissions: readonly string[] = [...MEMBER_PERMISSIONS, "sample.item.read"]) =>
  renderApp(
    <main>
      <ModulePageView />
    </main>,
    { path, modules: [sampleModule], routes: shellRoutes(permissions) },
  );

describe("ModulePageView", () => {
  it("renders the module page for the path, with its params", async () => {
    const { container } = renderPage(`${BASE}/sample/items/42`);
    expect(await screen.findByRole("heading", { level: 1, name: "sample item 42" })).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("renders the module root when the navigation permission is held", async () => {
    renderPage(`${BASE}/sample`);
    expect(await screen.findByRole("heading", { level: 1, name: "Lista de amostras" })).toBeDefined();
  });

  it("renders forbidden without the page's navigation permission and not-found for unknown modules or paths", async () => {
    const forbidden = renderPage(`${BASE}/sample`, MEMBER_PERMISSIONS);
    expect(await screen.findByRole("heading", { level: 1, name: "Você não tem acesso a esta página" })).toBeDefined();
    await expectNoAxeViolations(forbidden.container);
    forbidden.unmount();
    const unknownModule = renderPage(`${BASE}/nope`);
    expect(await screen.findByRole("heading", { level: 1, name: "Página não encontrada" })).toBeDefined();
    unknownModule.unmount();
    renderPage(`${BASE}/sample/does/not/exist`);
    expect(await screen.findByRole("heading", { level: 1, name: "Página não encontrada" })).toBeDefined();
  });
});
