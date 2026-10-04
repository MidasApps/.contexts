import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { buildLogLine, OPS_IDS } from "#/shared/testing/admin-operations-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, FAKE_REQUEST_ID, type FakeRoutes, ok } from "#/shared/testing/fake-api.ts";
import { AdminLogsView, cloudLoggingHref } from "./AdminLogsView.tsx";

const ERROR_LINE = buildLogLine({
  timestamp: "2026-09-30T12:00:05.000Z",
  level: "error",
  message: "get_order_failed",
  traceId: null,
  requestId: null,
  fields: {},
});
const routes = (overrides: FakeRoutes = {}): FakeRoutes => ({
  "GET /v1/admin/logs": ok([ERROR_LINE, buildLogLine()]),
  ...overrides,
});
const render = (options: Parameters<typeof renderAdmin>[1] = {}) =>
  renderAdmin(<AdminLogsView />, { path: "/admin/logs", routes: routes(), ...options });

describe("AdminLogsView", () => {
  it("lists the lines newest first with level, message, references and collapsed fields", async () => {
    const { user, container } = render();
    const lines = within(await screen.findByRole("list", { name: "Linhas de log" })).getAllByRole("listitem");
    expect(lines).toHaveLength(2);
    expect(within(lines[0] as HTMLElement).getByText("Erro")).toBeDefined();
    expect(within(lines[0] as HTMLElement).getByText("get_order_failed")).toBeDefined();
    // To the millisecond (lines of one minute must be told apart), with the zone they are shown in.
    expect((lines[0] as HTMLElement).querySelector("time")?.textContent).toMatch(/:00:05,000 \S+$/u);
    expect(within(lines[0] as HTMLElement).queryByRole("button")).toBeNull();
    const info = lines[1] as HTMLElement;
    expect(within(info).getByText("order_placed").className).toContain("font-mono");
    expect(within(info).getByText("web · local")).toBeDefined();
    expect(within(info).getByText(OPS_IDS.request)).toBeDefined();
    expect(
      within(info)
        .getByRole("link", { name: `Abrir o trace ${OPS_IDS.trace}` })
        .getAttribute("href"),
    ).toBe(`/admin/traces/${OPS_IDS.trace}`);
    expect(info.querySelector("time")?.getAttribute("datetime")).toBe("2026-09-30T12:00:00.000Z");
    const toggle = within(info).getByRole("button", { name: "2 campos" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(within(info).queryByText(/durationMs/u)).toBeNull();
    await user.click(toggle);
    expect(within(info).getByText(/"durationMs": 42/u)).toBeDefined();
    expect(screen.getByRole("status").textContent).toBe("2 linhas (no máximo 200)");
    await expectNoAxeViolations(container);
  });

  it("reads the filters from the URL (the trace viewer links here) and sends them", async () => {
    const { api } = render({ path: `/admin/logs?traceId=${OPS_IDS.trace}&level=warn` });
    await screen.findByRole("list", { name: "Linhas de log" });
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Trace" }).value).toBe(OPS_IDS.trace);
    const query = new URLSearchParams(api.calls.find((call) => call.path === "/v1/admin/logs")?.query);
    expect(Object.fromEntries(query)).toEqual({ level: "warn", traceId: OPS_IDS.trace, limit: "200" });
  });

  it("applies the text filters together on submit and ignores an unknown level", async () => {
    const { user, router, api } = render({ path: "/admin/logs?level=loud" });
    await screen.findByRole("list", { name: "Linhas de log" });
    expect(api.calls.find((call) => call.path === "/v1/admin/logs")?.query).toBe("?limit=200");
    await user.type(screen.getByRole("textbox", { name: "Texto da mensagem" }), "order");
    await user.type(screen.getByRole("textbox", { name: "Requisição" }), `${OPS_IDS.request}{Enter}`);
    expect(router.current()).toBe(`/admin/logs?level=loud&q=order&requestId=${OPS_IDS.request}`);
  });

  it("refreshes on demand", async () => {
    const { user, api } = render();
    await screen.findByRole("list", { name: "Linhas de log" });
    api.route("GET /v1/admin/logs", ok([buildLogLine({ message: "session_started" })]));
    await user.click(screen.getByRole("button", { name: "Atualizar" }));
    expect(await screen.findByText("session_started")).toBeDefined();
  });

  it("points to Cloud Logging outside the local environment, with the trace of the filter", async () => {
    const { container } = render({
      path: `/admin/logs?traceId=${OPS_IDS.trace}`,
      routes: routes({ "GET /v1/admin/logs": apiError(404, "NOT_FOUND") }),
    });
    expect(
      await screen.findByRole("heading", { level: 2, name: "Fora do ambiente local, os logs ficam no Cloud Logging" }),
    ).toBeDefined();
    const link = screen.getByRole("link", { name: /Abrir o Cloud Logging/u });
    expect(link.getAttribute("href")).toBe(
      `https://console.cloud.google.com/logs/query;query=${encodeURIComponent(`jsonPayload.traceId="${OPS_IDS.trace}"`)}`,
    );
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(screen.getByText(/escolha o projeto deste ambiente/u)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Atualizar" })).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("builds the Cloud Logging link from the trace and the request", () => {
    expect(cloudLoggingHref({})).toBe("https://console.cloud.google.com/logs/query");
    expect(decodeURIComponent(cloudLoggingHref({ traceId: "t1", requestId: "r1" }))).toBe(
      'https://console.cloud.google.com/logs/query;query=jsonPayload.traceId="t1"\njsonPayload.requestId="r1"',
    );
  });

  it("tells an empty buffer from filters that match nothing", async () => {
    const empty = render({ routes: routes({ "GET /v1/admin/logs": ok([]) }) });
    expect(await screen.findByRole("heading", { level: 2, name: "Nenhuma linha de log ainda" })).toBeDefined();
    await expectNoAxeViolations(empty.container);
    empty.unmount();
    const filtered = render({ path: "/admin/logs?q=nothing", routes: routes({ "GET /v1/admin/logs": ok([]) }) });
    expect(await screen.findByRole("heading", { level: 2, name: "Nenhuma linha com esses filtros" })).toBeDefined();
    await filtered.user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(filtered.router.current()).toBe("/admin/logs");
  });

  it("shows an error with the request reference and retries", async () => {
    const { user, api, container } = render({ routes: routes({ "GET /v1/admin/logs": apiError(409, "CONFLICT") }) });
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(screen.getByText(new RegExp(FAKE_REQUEST_ID, "u"))).toBeDefined();
    await expectNoAxeViolations(container);
    api.route("GET /v1/admin/logs", ok([buildLogLine()]));
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("order_placed")).toBeDefined();
  });

  it("is open to the support role and reads in English and Spanish", async () => {
    const support = render({ role: "platform-support" });
    expect(await screen.findByRole("list", { name: "Linhas de log" })).toBeDefined();
    support.unmount();
    const english = render({ locale: "en-US" });
    expect(await screen.findByRole("list", { name: "Log lines" })).toBeDefined();
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("2 lines (at most 200)"));
    english.unmount();
    render({ locale: "es-419" });
    expect(await screen.findByRole("list", { name: "Líneas de log" })).toBeDefined();
  });
});
