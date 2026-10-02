import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, noContent, page, type FakeRoutes } from "#/shared/testing/fake-api.ts";
import { ProfileSessionsView } from "./ProfileSessionsView.tsx";

const session = (id: string, userAgent: string, overrides: Record<string, unknown> = {}) => ({
  id,
  kind: "web",
  mfa: false,
  current: false,
  userAgent,
  createdAt: "2026-09-20T12:00:00.000Z",
  lastSeenAt: "2026-09-29T15:00:00.000Z",
  expiresAt: "2026-10-04T12:00:00.000Z",
  ...overrides,
});

// s1 is the session of this browser (SP1 `current`); s2 another device.
const SESSIONS = [session("s1", "Firefox on Windows", { mfa: true, current: true }), session("s2", "Tauri on macOS", { kind: "desktop" })];

const renderView = (routes: FakeRoutes = {}) =>
  renderApp(
    <main>
      <ProfileSessionsView />
    </main>,
    { path: "/profile/sessions", routes: { "GET /v1/me/sessions": page(SESSIONS), ...routes } },
  );

describe("ProfileSessionsView", () => {
  it("lists the sessions in a captioned table with the display time zone", async () => {
    const { container } = renderView();
    await screen.findByText("Firefox on Windows");
    const table = screen.getByRole("table", { name: "Sessões da sua conta" });
    expect(within(table).getByText("App para desktop")).toBeDefined();
    expect(within(table).getByText("Com 2 etapas")).toBeDefined();
    expect(within(table).getByText("Este dispositivo")).toBeDefined();
    expect(within(table).getAllByRole("columnheader").map((header) => header.getAttribute("scope"))).toEqual(["col", "col", "col", "col", "col"]);
    await expectNoAxeViolations(container);
  });

  it("revokes one session after confirming: the row leaves, a toast confirms", async () => {
    const { user, api } = renderView({ "DELETE /v1/me/sessions/:sessionId": noContent() });
    await user.click(await screen.findByRole("button", { name: "Revogar sessão de Tauri on macOS" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Revogar esta sessão?" });
    api.route("GET /v1/me/sessions", page([SESSIONS[0]]));
    await user.click(within(dialog).getByRole("button", { name: "Revogar sessão" }));
    expect(await screen.findByText("Sessão de Tauri on macOS revogada.")).toBeDefined();
    await waitFor(() => expect(screen.queryByText("Tauri on macOS")).toBeNull());
    expect(api.callLines()).toContain("DELETE /v1/me/sessions/s2");
  });

  it("marks this device and offers signing out instead of revoking it", async () => {
    const { user, router, bridge } = renderView();
    await screen.findByText("Firefox on Windows");
    expect(screen.queryByRole("button", { name: "Revogar sessão de Firefox on Windows" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Sair deste dispositivo" }));
    await waitFor(() => expect(router.current()).toBe("/sign-in"));
    expect(bridge.ended).toBe(1);
  });

  it("puts the row back and keeps the dialog open with the error when revoking fails", async () => {
    const { user } = renderView({ "DELETE /v1/me/sessions/:sessionId": apiError(503, "INTERNAL_ERROR") });
    await user.click(await screen.findByRole("button", { name: "Revogar sessão de Tauri on macOS" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Revogar sessão" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Referência: 01K6FAKEREQ0000000000000000");
    // The open dialog hides the page from the accessibility tree, hence `hidden`.
    expect(screen.getByRole("table", { hidden: true }).textContent).toContain("Tauri on macOS");
  });

  it("signs out everywhere: revokes on the server, then signs this device out and lands on sign-in", async () => {
    const { user, api, router, bridge, auth } = renderView({ "POST /v1/me/sessions/revoke-all": noContent() });
    await user.click(await screen.findByRole("button", { name: "Sair de todos os dispositivos" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Sair de todos os dispositivos" });
    await user.click(within(dialog).getByRole("button", { name: "Sair de todos" }));
    await waitFor(() => expect(router.current()).toBe("/sign-in"));
    expect(api.callLines()).toContain("POST /v1/me/sessions/revoke-all");
    expect(bridge.ended).toBe(1);
    expect(auth.getState().status).toBe("signed-out");
  });

  it("shows the error with a retry when the list fails, and cards on small screens", async () => {
    const failing = renderView({ "GET /v1/me/sessions": apiError(429, "RATE_LIMITED") });
    expect(await screen.findByText("Referência: 01K6FAKEREQ0000000000000000")).toBeDefined();
    expect(screen.getByRole("alert").textContent).toContain("Muitas tentativas.");
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeDefined();
    failing.unmount();

    const forbidden = renderView({ "GET /v1/me/sessions": apiError(403, "FORBIDDEN") });
    expect(await screen.findByRole("heading", { name: "Você não tem acesso a esta página" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).toBeNull();
    forbidden.unmount();

    const matchMedia = globalThis.matchMedia;
    globalThis.matchMedia = ((query: string) => ({ ...matchMedia(query), matches: query.includes("max-width") }));
    try {
      const { container } = renderView();
      const list = await screen.findByRole("list", { name: "Sessões da sua conta" });
      expect(within(list).getAllByRole("listitem")).toHaveLength(2);
      expect(screen.queryByRole("table")).toBeNull();
      await expectNoAxeViolations(container);
    } finally {
      globalThis.matchMedia = matchMedia;
    }
  });
});
