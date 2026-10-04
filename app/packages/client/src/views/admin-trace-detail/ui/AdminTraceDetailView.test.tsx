import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { buildOrganizationSummary } from "#/shared/testing/admin-fixtures.ts";
import { buildTraceDetail, OBS_IDS } from "#/shared/testing/admin-observability-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, FAKE_REQUEST_ID, ok, page } from "#/shared/testing/fake-api.ts";
import { AdminTraceDetailView } from "./AdminTraceDetailView.tsx";

const plain = (text: string | null): string => (text ?? "").replace(/\s/gu, " ");

const routes = {
  "GET /v1/admin/traces/:traceId": ok(buildTraceDetail()),
  "GET /v1/admin/organizations": page([buildOrganizationSummary()]),
};
const render = (options: Parameters<typeof renderAdmin>[1] = {}) =>
  renderAdmin(<AdminTraceDetailView />, { path: `/admin/traces/${OBS_IDS.trace}`, routes, ...options });

describe("AdminTraceDetailView", () => {
  it("shows the trace's numbers, its span tree and the way to its logs and back", async () => {
    const { container, api } = render();
    expect(await screen.findByRole("heading", { level: 1, name: "agent run: assistant" })).toBeDefined();
    const summary = screen.getByRole("region", { name: "Resumo do trace" });
    expect(await within(summary).findByText("Northwind")).toBeDefined();
    expect(within(summary).getByText("Agente assistant")).toBeDefined();
    expect(plain(summary.textContent)).toContain("2,4 s");
    expect(plain(summary.textContent)).toContain("1.800 / 350");
    expect(plain(summary.textContent)).toContain("US$ 0,0009");
    expect(within(summary).getByText(OBS_IDS.trace)).toBeDefined();
    expect(screen.getByRole("heading", { level: 2, name: "3 spans" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Ver logs deste trace" }).getAttribute("href")).toBe(
      `/admin/logs?traceId=${OBS_IDS.trace}`,
    );
    expect(screen.getByRole("link", { name: "Traces" }).getAttribute("href")).toBe("/admin/traces");
    expect(api.callLines()).toContain(`GET /v1/admin/traces/${OBS_IDS.trace}`);
    await expectNoAxeViolations(container);
  });

  it("is not found for an unknown trace or a path that is not a trace id", async () => {
    const unknown = render({ routes: { ...routes, "GET /v1/admin/traces/:traceId": apiError(404, "NOT_FOUND") } });
    expect(await screen.findByRole("heading", { level: 1, name: "Página não encontrada" })).toBeDefined();
    unknown.unmount();
    const { api } = render({ path: "/admin/traces/not-a-trace" });
    expect(await screen.findByRole("heading", { level: 1, name: "Página não encontrada" })).toBeDefined();
    expect(api.calls.some((call) => call.path.startsWith("/v1/admin/traces"))).toBe(false);
  });

  it("shows an error with the request reference and a retry", async () => {
    const { user, api, container } = render({
      routes: { ...routes, "GET /v1/admin/traces/:traceId": apiError(409, "CONFLICT") },
    });
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(screen.getByText(new RegExp(FAKE_REQUEST_ID, "u"))).toBeDefined();
    expect(screen.getByRole("heading", { level: 1, name: "Trace" })).toBeDefined();
    await expectNoAxeViolations(container);
    api.route("GET /v1/admin/traces/:traceId", ok(buildTraceDetail()));
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("heading", { level: 2, name: "3 spans" })).toBeDefined();
  });

  it("asks for the second factor when the session has none", async () => {
    render({ routes: { ...routes, "GET /v1/admin/traces/:traceId": apiError(403, "MFA_REQUIRED") } });
    expect(
      await screen.findByRole("heading", { level: 2, name: "Confirme a verificação em duas etapas" }),
    ).toBeDefined();
  });
});
