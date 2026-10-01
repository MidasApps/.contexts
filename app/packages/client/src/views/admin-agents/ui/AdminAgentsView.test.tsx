import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { buildAgentCatalog, buildAgentSettings } from "#/shared/testing/admin-agents-fixtures.ts";
import { buildOrganizationSummary } from "#/shared/testing/admin-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, FAKE_REQUEST_ID, ok, page, type FakeRoutes } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { AdminAgentsView } from "./AdminAgentsView.tsx";

const SETTINGS_PATH = "/v1/admin/organizations/:organizationId/agent-settings";
const WITH_ORGANIZATION = `/admin/agents?organizationId=${IDS.organization}`;

const routes = (overrides: FakeRoutes = {}): FakeRoutes => ({
  "GET /v1/admin/organizations": page([buildOrganizationSummary(), buildOrganizationSummary({ id: IDS.otherOrganization, name: "Contoso" })]),
  [`GET ${SETTINGS_PATH}`]: ok(buildAgentSettings()),
  "GET /v1/admin/agents": ok(buildAgentCatalog()),
  ...overrides,
});

const render = (options: Parameters<typeof renderAdmin>[1] = {}) => renderAdmin(<AdminAgentsView />, { path: "/admin/agents", routes: routes(), ...options });

const setOnline = (online: boolean): void => {
  Object.defineProperty(globalThis.navigator, "onLine", { configurable: true, get: () => online });
  act(() => void globalThis.dispatchEvent(new Event(online ? "online" : "offline")));
};

describe("AdminAgentsView", () => {
  it("lists the registered agents with role, subagents, tools, skills and permissions, linking the ones with a prompt", async () => {
    const { container, api } = render();
    const catalog = await screen.findByRole("list", { name: "Agentes registrados" });
    const rows = within(catalog).getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    const [assistant, ping, knowledge, data, notes] = rows as [HTMLElement, HTMLElement, HTMLElement, HTMLElement, HTMLElement];
    expect(within(assistant).getByText("Assistente")).toBeDefined();
    expect(within(assistant).getByText("Supervisor")).toBeDefined();
    expect(within(assistant).getByText("Sempre disponível")).toBeDefined();
    expect(within(assistant).getByText("example-notes")).toBeDefined();
    expect(within(assistant).getByText("Mais as ferramentas dos conectores e das opções da organização")).toBeDefined();
    expect(within(assistant).getByRole("link", { name: "Ver prompts de Assistente" }).getAttribute("href")).toBe("/admin/agents/assistant/prompts");
    expect(within(ping).getByText("Entrada")).toBeDefined();
    expect(within(ping).queryByRole("link")).toBeNull();
    expect(within(knowledge).getByText("Habilitado por organização")).toBeDefined();
    expect(within(knowledge).getByText("knowledge.searchKnowledge")).toBeDefined();
    expect(within(knowledge).getByText("knowledge-citations")).toBeDefined();
    expect(within(knowledge).getByText("core.knowledge.read")).toBeDefined();
    expect(within(data).getByText("sql.querySemanticSql")).toBeDefined();
    // A module agent has no translation: it shows what its code registered.
    expect(within(notes).getByText("Notes helper")).toBeDefined();
    expect(within(notes).getByText("Finds the notes of the example module.")).toBeDefined();
    expect(within(notes).queryByRole("link")).toBeNull();
    expect(api.callLines().filter((line) => line === "GET /v1/admin/agents")).toHaveLength(1);
    await expectNoAxeViolations(container);
  });

  it("explains an empty catalog and an unreachable runtime, each with a way to try again", async () => {
    const empty = render({ routes: routes({ "GET /v1/admin/agents": ok([]) }) });
    expect(await screen.findByRole("heading", { level: 3, name: "Nenhum agente registrado" })).toBeDefined();
    empty.api.route("GET /v1/admin/agents", ok(buildAgentCatalog()));
    await empty.user.click(screen.getByRole("button", { name: "Recarregar" }));
    expect(await screen.findByRole("list", { name: "Agentes registrados" })).toBeDefined();
    empty.unmount();
    const failing = render({ routes: routes({ "GET /v1/admin/agents": apiError(409, "CONFLICT") }) });
    const section = await screen.findByRole("region", { name: "Agentes registrados" });
    expect((await within(section).findByRole("alert")).textContent).toContain(FAKE_REQUEST_ID);
    failing.api.route("GET /v1/admin/agents", ok(buildAgentCatalog()));
    await failing.user.click(within(section).getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("list", { name: "Agentes registrados" })).toBeDefined();
  });

  it("offers every registered subagent to an organization, a module's too, before it is enabled", async () => {
    render({ path: WITH_ORGANIZATION });
    expect((await screen.findByRole("switch", { name: "example-notes" })).getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByRole("switch", { name: "ping" })).toBeNull();
    expect(screen.queryByRole("switch", { name: "Assistente" })).toBeNull();
  });

  it("asks for an organization before showing settings and keeps the choice in the URL", async () => {
    const { user, router, api, container } = render();
    expect(await screen.findByRole("heading", { level: 3, name: "Escolha uma organização" })).toBeDefined();
    expect(api.callLines().some((line) => line.includes("agent-settings"))).toBe(false);
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("button", { name: "Escolher organização" }));
    await user.click(await screen.findByRole("option", { name: "Contoso" }));
    expect(router.current()).toBe(`/admin/agents?organizationId=${IDS.otherOrganization}`);
    expect(await screen.findByRole("switch", { name: "Conhecimento" })).toBeDefined();
    expect(api.calls.some((call) => call.path === `/v1/admin/organizations/${IDS.otherOrganization}/agent-settings`)).toBe(true);
  });

  it("shows the organization's agents, web tools and PII mode", async () => {
    const { container } = render({ path: WITH_ORGANIZATION, routes: routes({ [`GET ${SETTINGS_PATH}`]: ok(buildAgentSettings({ enabledAgents: ["knowledge", "example-notes"] })) }) });
    expect((await screen.findByRole("switch", { name: "Conhecimento" })).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("switch", { name: "Dados" }).getAttribute("aria-checked")).toBe("false");
    // A module agent the organization enabled appears after the core ones, by its key.
    expect(screen.getByRole("switch", { name: "example-notes" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("switch", { name: "Navegador automatizado" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("radio", { name: "Mascarar" }).getAttribute("aria-checked")).toBe("true");
    await expectNoAxeViolations(container);
  });

  it("saves one change at a time, sending only what changed, and confirms with a toast", async () => {
    const { user, api } = render({
      path: WITH_ORGANIZATION,
      routes: routes({ [`PUT ${SETTINGS_PATH}`]: (request) => ok(buildAgentSettings({ ...(request.body as Record<string, unknown>) })) }),
    });
    await user.click(await screen.findByRole("switch", { name: "Web" }));
    expect(await screen.findByText("Web habilitado em Northwind.")).toBeDefined();
    await waitFor(() => expect(screen.getByRole("switch", { name: "Web" }).getAttribute("aria-checked")).toBe("true"));
    await user.click(screen.getByRole("switch", { name: "Busca e leitura de páginas" }));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Busca e leitura de páginas" }).getAttribute("aria-checked")).toBe("true"));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Avisar" }).hasAttribute("disabled")).toBe(false));
    await user.click(screen.getByRole("radio", { name: "Avisar" }));
    await waitFor(() => expect(api.calls.filter((call) => call.method === "PUT")).toHaveLength(3));
    expect(api.calls.filter((call) => call.method === "PUT").map((call) => call.body)).toEqual([
      { enabledAgents: ["knowledge", "data", "action", "web"] },
      { webTools: { firecrawl: true, browser: false } },
      { guardrails: { pii: "warn" } },
    ]);
  });

  it("puts the switch back and shows the error with its reference when saving fails", async () => {
    const { user, container } = render({ path: WITH_ORGANIZATION, routes: routes({ [`PUT ${SETTINGS_PATH}`]: apiError(403, "FORBIDDEN") }) });
    await user.click(await screen.findByRole("switch", { name: "Dados" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Não foi possível salvar a alteração");
    expect(alert.textContent).toContain("Você não tem permissão para fazer isso.");
    expect(alert.textContent).toContain(FAKE_REQUEST_ID);
    expect(screen.getByRole("switch", { name: "Dados" }).getAttribute("aria-checked")).toBe("true");
    await expectNoAxeViolations(container);
  });

  it("shows an error with the request reference and a retry when the settings cannot be read", async () => {
    const { user, api } = render({ path: WITH_ORGANIZATION, routes: routes({ [`GET ${SETTINGS_PATH}`]: apiError(409, "CONFLICT") }) });
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(screen.getByText(new RegExp(FAKE_REQUEST_ID, "u"))).toBeDefined();
    api.route(`GET ${SETTINGS_PATH}`, ok(buildAgentSettings()));
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("switch", { name: "Conhecimento" })).toBeDefined();
  });

  it("shows a skeleton while the settings load", async () => {
    let release: (value: unknown) => void = () => undefined;
    const gate = new Promise((resolve) => (release = resolve));
    render({ path: WITH_ORGANIZATION, routes: routes({ [`GET ${SETTINGS_PATH}`]: async () => (await gate, ok(buildAgentSettings())) }) });
    expect((await screen.findByText("Carregando as configurações de agentes…")).closest("[role=status]")?.getAttribute("aria-busy")).toBe("true");
    release(undefined);
    expect(await screen.findByRole("switch", { name: "Conhecimento" })).toBeDefined();
  });

  it("holds changes while offline", async () => {
    render({ path: WITH_ORGANIZATION });
    await screen.findByRole("switch", { name: "Conhecimento" });
    try {
      setOnline(false);
      await waitFor(() => expect(screen.getByRole("switch", { name: "Conhecimento" }).hasAttribute("disabled")).toBe(true));
      expect(screen.getByRole("radio", { name: "Avisar" }).hasAttribute("disabled")).toBe(true);
      expect(screen.getByText(/Sem conexão: as alterações ficam indisponíveis/u)).toBeDefined();
    } finally {
      setOnline(true);
    }
  });

  it("is closed to the support role", async () => {
    const { api } = render({ role: "platform-support", path: WITH_ORGANIZATION });
    expect(await screen.findByRole("heading", { level: 2, name: "Você não tem acesso a esta página" })).toBeDefined();
    expect(screen.queryByRole("list", { name: "Agentes registrados" })).toBeNull();
    expect(api.callLines()).not.toContain("GET /v1/admin/agents");
    expect(api.callLines().some((line) => line.includes("agent-settings"))).toBe(false);
  });

  it("renders in English", async () => {
    render({ locale: "en-US", path: WITH_ORGANIZATION });
    expect(await screen.findByRole("heading", { level: 1, name: "Agents and prompts" })).toBeDefined();
    expect(await screen.findByRole("switch", { name: "Knowledge" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "Redact" })).toBeDefined();
  });
});
