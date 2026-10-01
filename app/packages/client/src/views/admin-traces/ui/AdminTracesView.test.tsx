import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { buildOrganizationSummary } from "#/shared/testing/admin-fixtures.ts";
import { buildTraceSummary, numberedPage, OBS_IDS } from "#/shared/testing/admin-observability-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, FAKE_REQUEST_ID, page } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { AdminTracesView } from "./AdminTracesView.tsx";

const plain = (text: string | null): string => (text ?? "").replace(/\s/gu, " ");

const OK = buildTraceSummary();
const FAILED = buildTraceSummary({ traceId: OBS_IDS.otherTrace, tenantId: null, name: "workflow run: usage-report", agentId: null, workflowId: "usage-report", status: "error", durationMs: null, costMicroUsd: null });

const routes = (traces: readonly unknown[] = [OK, FAILED], hasMore = false) => ({
  "GET /v1/admin/traces": numberedPage(traces, hasMore),
  "GET /v1/admin/organizations": page([buildOrganizationSummary()]),
});

const render = (options: Parameters<typeof renderAdmin>[1] = {}) => renderAdmin(<AdminTracesView />, { path: "/admin/traces", routes: routes(), ...options });
const traceCalls = (api: { calls: { path: string; query: string }[] }): string[] => api.calls.filter((call) => call.path === "/v1/admin/traces").map((call) => call.query);

// Forms typed key by key: the default 5 s is too tight when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 20_000 });

describe("AdminTracesView", () => {
  it("lists traces with organization, target, status, duration, tokens and cost", async () => {
    const { container } = render();
    const table = await screen.findByRole("table", { name: "Traces de execução" });
    const ok = within(table).getByRole("row", { name: /agent run: assistant/u });
    await waitFor(() => expect(within(ok).getByText("Northwind")).toBeDefined());
    expect(within(ok).getByText("Agente assistant")).toBeDefined();
    expect(within(ok).getByText("OK")).toBeDefined();
    expect(plain(ok.textContent)).toContain("2,4 s");
    expect(plain(ok.textContent)).toContain("1.800 / 350");
    expect(plain(ok.textContent)).toContain("US$ 0,0009");
    expect(within(ok).getByRole("link", { name: "Abrir o trace agent run: assistant" }).getAttribute("href")).toBe(`/admin/traces/${OBS_IDS.trace}`);
    const failed = within(table).getByRole("row", { name: /usage-report/u });
    expect(within(failed).getByText("Plataforma")).toBeDefined();
    expect(within(failed).getByText("Workflow usage-report")).toBeDefined();
    expect(within(failed).getByText("Erro")).toBeDefined();
    expect(within(failed).getByText("Em execução")).toBeDefined();
    expect(within(failed).getByText("Preço desconhecido")).toBeDefined();
    await expectNoAxeViolations(container);
  });

  it("sends the filters and the page of the URL to the API (page from 0)", async () => {
    const { api } = render({ path: `/admin/traces?status=error&agentId=assistant&organizationId=${IDS.organization}&page=3` });
    await screen.findByRole("table", { name: "Traces de execução" });
    expect(traceCalls(api)).toEqual([`?page=2&perPage=20&organizationId=${IDS.organization}&agentId=assistant&status=error`]);
  });

  it("applies a typed agent on submit, refuses an invalid key and writes the status to the URL", async () => {
    const { user, router, api } = render();
    await screen.findByRole("table", { name: "Traces de execução" });
    const agent = screen.getByRole("textbox", { name: "Agente" });
    await user.type(agent, "Not Valid");
    await user.click(screen.getByRole("button", { name: "Filtrar" }));
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(agent.getAttribute("aria-invalid")).toBe("true");
    expect(router.current()).toBe("/admin/traces");
    await user.clear(agent);
    await user.type(agent, "knowledge{Enter}");
    expect(router.current()).toBe("/admin/traces?agentId=knowledge");
    await waitFor(() => expect(traceCalls(api).at(-1)).toBe("?page=0&perPage=20&agentId=knowledge"));
    await user.click(screen.getByRole("combobox", { name: "Status" }));
    await user.click(await screen.findByRole("option", { name: "Erro" }));
    expect(router.current()).toBe("/admin/traces?agentId=knowledge&status=error");
  });

  it("ignores an invalid agent key in a hand-edited URL", async () => {
    const { api } = render({ path: "/admin/traces?agentId=Bad%20Key&status=nope" });
    await screen.findByRole("table", { name: "Traces de execução" });
    expect(traceCalls(api)).toEqual(["?page=0&perPage=20"]);
  });

  it("pages by number and keeps the page in the URL", async () => {
    const { user, router, api } = render({ routes: routes([OK], true) });
    const pages = await screen.findByRole("navigation", { name: "Páginas de traces" });
    expect(within(pages).getByRole("button", { name: "Anterior" }).hasAttribute("disabled")).toBe(true);
    await user.click(within(pages).getByRole("button", { name: "Próxima" }));
    expect(router.current()).toBe("/admin/traces?page=2");
    await waitFor(() => expect(traceCalls(api).at(-1)).toBe("?page=1&perPage=20"));
  });

  it("tells an empty platform from filters that match nothing", async () => {
    const empty = render({ routes: routes([]) });
    expect(await screen.findByRole("heading", { level: 2, name: "Nenhum trace ainda" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Voltar à visão geral" }).getAttribute("href")).toBe("/admin");
    await expectNoAxeViolations(empty.container);
    empty.unmount();
    const { user, router } = render({ path: "/admin/traces?status=error", routes: routes([]) });
    expect(await screen.findByRole("heading", { level: 2, name: "Nenhum trace com esses filtros" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(router.current()).toBe("/admin/traces");
  });

  it("shows an error with the request reference and a retry", async () => {
    const { user, api, container } = render({ routes: { ...routes(), "GET /v1/admin/traces": apiError(409, "CONFLICT") } });
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(screen.getByText(new RegExp(FAKE_REQUEST_ID, "u"))).toBeDefined();
    await expectNoAxeViolations(container);
    api.route("GET /v1/admin/traces", numberedPage([OK]));
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("row", { name: /agent run: assistant/u })).toBeDefined();
  });

  it("asks for the second factor and shows a skeleton while loading", async () => {
    const mfa = render({ routes: { ...routes(), "GET /v1/admin/traces": apiError(403, "MFA_REQUIRED") } });
    expect(await screen.findByRole("heading", { level: 2, name: "Confirme a verificação em duas etapas" })).toBeDefined();
    mfa.unmount();
    let release: (value: unknown) => void = () => undefined;
    const gate = new Promise((resolve) => (release = resolve));
    render({ routes: { ...routes(), "GET /v1/admin/traces": async () => (await gate, numberedPage([OK])) } });
    expect((await screen.findByText("Carregando traces…")).closest("[role=status]")?.getAttribute("aria-busy")).toBe("true");
    release(undefined);
    expect(await screen.findByRole("table", { name: "Traces de execução" })).toBeDefined();
  });

  it("is open to the support role and shows cards on a phone", async () => {
    const matchMedia = globalThis.matchMedia;
    globalThis.matchMedia = (query: string) => ({ ...matchMedia(query), matches: query.includes("max-width") });
    try {
      const { container } = render({ role: "platform-support" });
      const list = await screen.findByRole("list", { name: "Traces de execução" });
      expect(within(list).getAllByRole("listitem")).toHaveLength(2);
      expect(screen.queryByRole("table")).toBeNull();
      await expectNoAxeViolations(container);
    } finally {
      globalThis.matchMedia = matchMedia;
    }
  });
});
