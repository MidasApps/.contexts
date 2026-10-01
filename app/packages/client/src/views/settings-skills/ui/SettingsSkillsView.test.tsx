import type { Permission } from "@core/contracts";
import { configure, screen, within } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { buildCatalogAgent } from "#/entities/agent-catalog/agent-catalog.fixture.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, ok, type FakeRoutes } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { SettingsSkillsView } from "./SettingsSkillsView.tsx";

const READ: Permission[] = ["core.organization.read", "core.agent-settings.read"];
const SAFE = { name: "safe-actions", description: "Confirm before changing data.", source: "core" as const };

const CATALOG = [
  buildCatalogAgent({ key: "action", name: "Action", enabled: true, skills: [SAFE] }),
  buildCatalogAgent({ key: "data", name: "Data", enabled: false, skills: [SAFE] }),
  buildCatalogAgent({ key: "example-notes", name: "Notes", source: "module", moduleId: "example", enabled: false, skills: [{ name: "example-notes", description: "Take notes.", source: "module" }] }),
];

const renderView = (permissions: readonly Permission[] = READ, routes: FakeRoutes = {}) =>
  renderApp(
    <main>
      <SettingsSkillsView />
    </main>,
    { path: `/o/${IDS.organization}/settings/skills`, routes: shellRoutes(permissions, { "GET /v1/agents": ok(CATALOG), ...routes }) },
  );

// The whole app shell renders per test; under a loaded machine the defaults (1 s, 5 s) are too short.
beforeAll(() => {
  configure({ asyncUtilTimeout: 10_000 });
});
afterAll(() => {
  configure({ asyncUtilTimeout: 1000 });
});

describe("SettingsSkillsView", { timeout: 30_000 }, () => {
  it("lists each skill once with its source, agents and whether it is in use", async () => {
    const { container, api } = renderView();
    const table = await screen.findByRole("table", { name: "Habilidades disponíveis para Northwind" });
    const safe = within(table).getByRole("row", { name: /safe-actions/u });
    expect(within(safe).getByText("Confirm before changing data.")).toBeDefined();
    expect(within(safe).getByText("Plataforma")).toBeDefined();
    expect(within(safe).getByText("Em uso")).toBeDefined();
    expect(safe.textContent).toContain("Data (desativado)");
    const notes = within(table).getByRole("row", { name: /example-notes/u });
    expect(within(notes).getByText("Módulo")).toBeDefined();
    expect(within(notes).getByText("Sem agente ativado")).toBeDefined();
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(api.calls.find((call) => call.path === "/v1/agents")?.query).toContain(`organizationId=${IDS.organization}`);
    await expectNoAxeViolations(container);
  });

  it("says skills cannot be created here and links to the agents", async () => {
    renderView();
    expect(await screen.findByText(/A organização não pode criar nem editar uma habilidade aqui\./u)).toBeDefined();
    expect(screen.getByRole("link", { name: "Abrir agentes" }).getAttribute("href")).toBe(`/o/${IDS.organization}/settings/agents`);
    expect(screen.queryByRole("button", { name: /criar|nova/iu })).toBeNull();
  });

  it("shows an empty state, the error with a retry, and no access without the permission", async () => {
    const empty = renderView(READ, { "GET /v1/agents": ok([buildCatalogAgent({ skills: [] })]) });
    expect(await screen.findByRole("heading", { name: "Nenhuma habilidade disponível" })).toBeDefined();
    empty.unmount();
    const failed = renderView(READ, { "GET /v1/agents": apiError(409, "CONFLICT") });
    expect(await screen.findByRole("button", { name: "Tentar novamente" })).toBeDefined();
    failed.unmount();
    renderView(["core.organization.read"]);
    expect(await screen.findByRole("heading", { name: "Você não tem acesso a esta página" })).toBeDefined();
  });
});
