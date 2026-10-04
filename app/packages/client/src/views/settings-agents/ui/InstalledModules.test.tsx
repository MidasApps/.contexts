import { type AgentSettings, defineModule, type Permission } from "@core/contracts";
import { configure, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineClientModule } from "#/app-shell/modules/define-client-module.ts";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { buildCatalogAgent } from "#/entities/agent-catalog/agent-catalog.fixture.ts";
import { buildCustomAgentOptions } from "#/entities/custom-agent/custom-agent.fixture.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { type FakeRequest, type FakeRoutes, ok } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { SettingsAgentsView } from "./SettingsAgentsView.tsx";

const READ: Permission[] = ["core.organization.read", "core.agent-settings.read"];
const ADMIN: Permission[] = [...READ, "core.agent-settings.update"];

const settings = (enabledAgents: string[]): AgentSettings =>
  ({
    tenantId: IDS.organization,
    enabledAgents,
    webTools: { firecrawl: false, browser: false },
    guardrails: { pii: "warn" },
    budget: { monthlyMicroUsd: 50_000_000, monthlyTokens: 20_000_000 },
    ownBudget: null,
    updatedBy: null,
    createdAt: "2026-09-29T14:30:00.000Z",
    updatedAt: "2026-09-29T14:30:00.000Z",
  }) as AgentSettings;

// A module with no agents: before the module switch, nothing on the page could enable it.
const sampleModule = defineClientModule({
  manifest: defineModule({
    id: "sample",
    labelKey: "sample.module.name",
    permissions: [],
    messages: {
      "pt-BR": { module: { name: "Amostras" } },
      "en-US": { module: { name: "Samples" } },
      "es-419": { module: { name: "Muestras" } },
    },
  }),
  pages: {},
});

const renderView = (
  options: {
    permissions?: readonly Permission[];
    enabledAgents?: string[];
    routes?: FakeRoutes;
    modules?: boolean;
  } = {},
) =>
  renderApp(
    <main>
      <SettingsAgentsView />
    </main>,
    {
      path: `/o/${IDS.organization}/settings/agents`,
      modules: options.modules === false ? [] : [sampleModule],
      routes: shellRoutes(options.permissions ?? ADMIN, {
        "GET /v1/agents": ok([buildCatalogAgent()]),
        "GET /v1/agent-settings": ok(settings(options.enabledAgents ?? ["knowledge"])),
        "GET /v1/agent-options": ok(buildCustomAgentOptions()),
        ...options.routes,
      }),
    },
  );

const modulesSection = async () =>
  (await screen.findByRole("heading", { name: "Módulos" })).closest("section") as HTMLElement;

const patchRecorder = (requests: FakeRequest[], enabledAgents: string[]): FakeRoutes => ({
  "PATCH /v1/agent-settings": (request) => {
    requests.push(request);
    return ok(settings(enabledAgents));
  },
});

// The whole app shell renders per test; under a loaded machine the defaults (1 s, 5 s) are too short.
beforeAll(() => {
  configure({ asyncUtilTimeout: 10_000 });
});
afterAll(() => {
  configure({ asyncUtilTimeout: 1000 });
});

describe("InstalledModules", { timeout: 30_000 }, () => {
  it("turns an installed module on by adding its id to the enabled agents", async () => {
    const requests: FakeRequest[] = [];
    const { user, container } = renderView({ routes: patchRecorder(requests, ["knowledge", "sample"]) });
    const toggle = await screen.findByRole("switch", { name: "Ativar o módulo Amostras" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await expectNoAxeViolations(container);
    await user.click(toggle);
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.body).toEqual({ enabledAgents: ["knowledge", "sample"] });
    expect(requests[0]?.query.get("organizationId")).toBe(IDS.organization);
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "Ativar o módulo Amostras" }).getAttribute("aria-checked")).toBe(
        "true",
      ),
    );
  });

  it("turns a module off by removing only its id", async () => {
    const requests: FakeRequest[] = [];
    const { user } = renderView({
      enabledAgents: ["knowledge", "sample", "sample-notes"],
      routes: patchRecorder(requests, ["knowledge", "sample-notes"]),
    });
    const toggle = await screen.findByRole("switch", { name: "Ativar o módulo Amostras" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await user.click(toggle);
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.body).toEqual({ enabledAgents: ["knowledge", "sample-notes"] });
    // An enabled agent of the module still enables it (decision 0064), and the page says so.
    expect(await within(await modulesSection()).findByText(/Um agente ativado deste módulo já libera/u)).toBeDefined();
  });

  it("shows the state in words without a switch to a viewer who can only read", async () => {
    renderView({ permissions: READ, enabledAgents: ["knowledge", "sample"] });
    const section = await modulesSection();
    expect(await within(section).findByText("Amostras")).toBeDefined();
    expect(within(section).getByText("Ativado")).toBeDefined();
    expect(screen.queryByRole("switch", { name: /módulo/u })).toBeNull();
  });

  it("says when no module is installed", async () => {
    renderView({ modules: false });
    expect(await screen.findByRole("heading", { name: "Nenhum módulo instalado" })).toBeDefined();
  });
});
