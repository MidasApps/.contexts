import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { useAdminAgentSettings } from "#/entities/agent-settings/index.ts";
import { buildAgentSettings } from "#/shared/testing/admin-agents-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, FAKE_REQUEST_ID, type FakeRoutes, ok } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { holdResponse, setOnline } from "#/shared/testing/network.ts";
import { AgentEnablementPanel } from "./AgentEnablementPanel.tsx";

const SETTINGS = "/v1/admin/organizations/:organizationId/agent-settings";

/** Reads the settings like the admin page does, so the panel's optimistic writes show. */
function Harness() {
  const settings = useAdminAgentSettings(IDS.organization);
  if (settings.data === undefined) return <p>carregando</p>;
  return (
    <AgentEnablementPanel organizationId={IDS.organization} organizationName="Northwind" settings={settings.data} />
  );
}

const render = (routes: FakeRoutes = {}) =>
  renderAdmin(<Harness />, { routes: { [`GET ${SETTINGS}`]: ok(buildAgentSettings()), ...routes } });
const agentSwitch = (name: string): HTMLElement => screen.getByRole("switch", { name });

afterEach(() => setOnline(true));

describe("AgentEnablementPanel", () => {
  it("turns a subagent off at once, sends only that setting and confirms it", async () => {
    const held = holdResponse();
    const { user, api, container } = render({ [`PUT ${SETTINGS}`]: held.handler });
    await screen.findByRole("switch", { name: "Dados" });
    await expectNoAxeViolations(container);
    await user.click(agentSwitch("Dados"));
    expect(agentSwitch("Dados").getAttribute("aria-checked")).toBe("false");
    // While the save is on its way, the panel is busy and the other controls wait.
    await waitFor(() =>
      expect(container.querySelector('[data-slot="agent-enablement"]')?.getAttribute("aria-busy")).toBe("true"),
    );
    expect(agentSwitch("Conhecimento").hasAttribute("disabled")).toBe(true);
    held.release(ok(buildAgentSettings({ enabledAgents: ["knowledge", "action"] })));
    expect(await screen.findByText("Dados desabilitado em Northwind.")).toBeDefined();
    expect(api.calls.find((call) => call.method === "PUT")?.body).toEqual({ enabledAgents: ["knowledge", "action"] });
  });

  it("puts the previous value back and says why when the save fails", async () => {
    const { user } = render({ [`PUT ${SETTINGS}`]: apiError(409, "CONFLICT") });
    await user.click(await screen.findByRole("switch", { name: "Dados" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Não foi possível salvar a alteração");
    expect(alert.textContent).toContain(FAKE_REQUEST_ID);
    await waitFor(() => expect(agentSwitch("Dados").getAttribute("aria-checked")).toBe("true"));
  });

  it("asks before a web tool reaches the public web, and saves only after the confirmation", async () => {
    const { user, api } = render({
      [`PUT ${SETTINGS}`]: ok(buildAgentSettings({ webTools: { firecrawl: true, browser: false } })),
    });
    await user.click(await screen.findByRole("switch", { name: "Busca e leitura de páginas" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Ligar busca e leitura de páginas em Northwind?" });
    expect(api.calls.some((call) => call.method === "PUT")).toBe(false);
    await user.click(within(dialog).getByRole("button", { name: "Ligar" }));
    expect(await screen.findByText("Configurações de agentes de Northwind salvas.")).toBeDefined();
    expect(api.calls.find((call) => call.method === "PUT")?.body).toEqual({
      webTools: { firecrawl: true, browser: false },
    });
  });

  it("holds every control while offline and says why", async () => {
    render();
    await screen.findByRole("switch", { name: "Dados" });
    setOnline(false);
    await waitFor(() => expect(agentSwitch("Dados").hasAttribute("disabled")).toBe(true));
    expect(agentSwitch("Navegador automatizado").hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Sem conexão: as alterações ficam indisponíveis até a conexão voltar.")).toBeDefined();
  });
});
