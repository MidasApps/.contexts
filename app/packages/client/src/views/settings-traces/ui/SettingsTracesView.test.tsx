import type { Permission } from "@core/contracts";
import { configure, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { buildTraceDetail, buildTraceSummary, numberedPage, OBS_IDS } from "#/shared/testing/admin-observability-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, FAKE_REQUEST_ID, type FakeRoutes } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { SettingsTracesView } from "./SettingsTracesView.tsx";

const READER: Permission[] = ["core.organization.read", "core.project.read", "core.trace.read"];
const OK = buildTraceSummary();
const FAILED = buildTraceSummary({ traceId: OBS_IDS.otherTrace, name: "workflow run: usage-report", agentId: null, workflowId: "usage-report", status: "error", durationMs: null, costMicroUsd: null });

const plain = (text: string | null): string => (text ?? "").replace(/\s/gu, " ");

const renderView = (routes: FakeRoutes = {}, options: { permissions?: readonly Permission[]; rest?: string } = {}) =>
  renderApp(
    <main>
      <SettingsTracesView />
    </main>,
    {
      path: `/o/${IDS.organization}/settings/traces${options.rest === undefined ? "" : `/${options.rest}`}`,
      routes: shellRoutes(options.permissions ?? READER, { "GET /v1/traces": numberedPage([OK, FAILED]), ...routes }),
    },
  );

const listQueries = (api: { calls: { path: string; query: string }[] }): URLSearchParams[] =>
  api.calls.filter((call) => call.path === "/v1/traces").map((call) => new URLSearchParams(call.query));

// The suite shares the machine with other suites: typing and first renders need more than the defaults.
vi.setConfig({ testTimeout: 20_000 });
configure({ asyncUtilTimeout: 5000 });

describe("SettingsTracesView", () => {
  it("lists the organization's traces with target, status, duration, tokens and cost, asking for that organization", async () => {
    const { container, api } = renderView();
    const table = await screen.findByRole("table", { name: "Rastros de Northwind" });
    const row = within(table).getByRole("row", { name: /agent run: assistant/u });
    expect(within(row).getByText("Agente assistant")).toBeDefined();
    expect(within(row).getByText("OK")).toBeDefined();
    expect(plain(row.textContent)).toContain("1.800 / 350");
    expect(within(table).getByRole("row", { name: /workflow run: usage-report/u }).textContent).toContain("Fluxo usage-report");
    expect(within(row).getByRole("link", { name: "Abrir o rastro agent run: assistant" }).getAttribute("href")).toBe(`/o/${IDS.organization}/settings/traces/${OBS_IDS.trace}`);
    const query = listQueries(api).at(-1);
    expect(query?.get("organizationId")).toBe(IDS.organization);
    expect(query?.get("page")).toBe("0");
    await expectNoAxeViolations(container);
  });

  it("filters by status and by a valid agent key, and refuses an invalid key without a request", async () => {
    const { user, api } = renderView();
    await screen.findByRole("table", { name: "Rastros de Northwind" });
    const filters = screen.getByRole("search", { name: "Filtrar rastros" });
    await user.type(within(filters).getByRole("textbox", { name: "Agente" }), "Not Valid");
    await user.click(within(filters).getByRole("button", { name: "Filtrar" }));
    expect(within(filters).getByRole("alert").textContent).toContain("letras minúsculas");
    expect(listQueries(api).every((query) => query.get("agentId") === null)).toBe(true);

    await user.clear(within(filters).getByRole("textbox", { name: "Agente" }));
    await user.type(within(filters).getByRole("textbox", { name: "Agente" }), "knowledge");
    await user.click(within(filters).getByRole("button", { name: "Filtrar" }));
    await waitFor(() => expect(listQueries(api).at(-1)?.get("agentId")).toBe("knowledge"));
  });

  it("pages forward when the API says there is more", async () => {
    const { user, api } = renderView({ "GET /v1/traces": numberedPage([OK], true) });
    await screen.findByRole("table", { name: "Rastros de Northwind" });
    await user.click(within(screen.getByRole("navigation", { name: "Páginas de rastros" })).getByRole("button", { name: /Próxima/u }));
    await waitFor(() => expect(listQueries(api).at(-1)?.get("page")).toBe("1"));
  });

  it("shows an empty state without traces", async () => {
    renderView({ "GET /v1/traces": numberedPage([]) });
    expect(await screen.findByRole("heading", { name: "Nenhum rastro ainda" })).toBeDefined();
  });

  it("shows the API error with its reference and recovers on retry", async () => {
    // A 4xx is never retried by the query client, so the error state shows at once.
    const { user, api } = renderView({ "GET /v1/traces": apiError(409, "CONFLICT") });
    const retry = await screen.findByRole("button", { name: "Tentar novamente" });
    expect(screen.getByText(`Referência: ${FAKE_REQUEST_ID}`)).toBeDefined();
    api.route("GET /v1/traces", numberedPage([OK]));
    await user.click(retry);
    expect(await screen.findByRole("row", { name: /agent run: assistant/u })).toBeDefined();
  });

  it("shows no access and asks for no traces without core.trace.read", async () => {
    const { api } = renderView({}, { permissions: ["core.organization.read"] });
    expect(await screen.findByText("Peça a um administrador da organização para liberar esta seção.")).toBeDefined();
    expect(listQueries(api)).toEqual([]);
  });

  it("opens one trace with its numbers and span tree, scoped to the organization, with a way back", async () => {
    const { container, api } = renderView({ "GET /v1/traces/:traceId": { status: 200, body: { data: buildTraceDetail() } } }, { rest: OBS_IDS.trace });
    expect(await screen.findByRole("heading", { level: 1, name: "agent run: assistant" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Voltar aos rastros" }).getAttribute("href")).toBe(`/o/${IDS.organization}/settings/traces`);
    expect(await screen.findByText("tool: searchKnowledge")).toBeDefined();
    const call = api.calls.find((entry) => entry.path === `/v1/traces/${OBS_IDS.trace}`);
    expect(new URLSearchParams(call?.query).get("organizationId")).toBe(IDS.organization);
    await expectNoAxeViolations(container);
  });

  it("says not found inside the settings frame for a trace the viewer cannot see or a malformed id", async () => {
    const first = renderView({ "GET /v1/traces/:traceId": apiError(404, "NOT_FOUND") }, { rest: OBS_IDS.otherTrace });
    expect(await screen.findByRole("heading", { name: "Rastro não encontrado" })).toBeDefined();
    expect(screen.getByRole("navigation", { name: "Seções das configurações" })).toBeDefined();
    first.unmount();
    const { api } = renderView({}, { rest: "not-a-trace" });
    expect(await screen.findByRole("heading", { name: "Rastro não encontrado" })).toBeDefined();
    expect(api.calls.some((call) => call.path.startsWith("/v1/traces/"))).toBe(false);
  });
});
