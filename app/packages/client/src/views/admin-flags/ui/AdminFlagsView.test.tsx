import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderAdmin } from "#/app-shell/testing/render-admin.tsx";
import { buildOrganizationSummary } from "#/shared/testing/admin-fixtures.ts";
import { buildExpiredFlag, buildFeatureFlag } from "#/shared/testing/admin-governance-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, FAKE_REQUEST_ID, type FakeRoutes, ok, page } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { AdminFlagsView } from "./AdminFlagsView.tsx";

const KILL = buildFeatureFlag();
const VOICE = buildExpiredFlag();

const routes = (extra: FakeRoutes = {}): FakeRoutes => ({
  "GET /v1/admin/flags": (request) =>
    ok(
      request.query.get("organizationId") === null
        ? [KILL, VOICE]
        : [KILL, buildExpiredFlag({ value: false, tenantOverride: false })],
    ),
  "GET /v1/admin/organizations": page([buildOrganizationSummary()]),
  ...extra,
});

const render = (options: Parameters<typeof renderAdmin>[1] = {}) =>
  renderAdmin(<AdminFlagsView />, { path: "/admin/flags", routes: routes(), ...options });

const setOnline = (online: boolean): void => {
  Object.defineProperty(globalThis.navigator, "onLine", { configurable: true, get: () => online });
  act(() => void globalThis.dispatchEvent(new Event(online ? "online" : "offline")));
};

describe("AdminFlagsView", () => {
  it("lists every flag with owner, description in the page language, kind, expiry and value, and warns on expired flags", async () => {
    const { container } = render();
    const table = await screen.findByRole("table", { name: "Flags de funcionalidades" });
    const kill = within(table).getByRole("row", { name: /ai\.kill-switch/u });
    expect(within(kill).getByText("Interruptor de emergência da IA")).toBeDefined();
    expect(within(kill).getByText("Para todos os agentes, conversas e voz durante um incidente.")).toBeDefined();
    expect(within(kill).getByText("Responsável: platform-team")).toBeDefined();
    expect(within(kill).getByText("Kill-switch")).toBeDefined();
    expect(
      within(kill).getByRole("switch", { name: "Valor de ai.kill-switch no ambiente" }).getAttribute("aria-checked"),
    ).toBe("false");
    expect(within(kill).queryByText("Expirada")).toBeNull();
    const voice = within(table).getByRole("row", { name: /chat\.voice/u });
    expect(within(voice).getByText("Expirada")).toBeDefined();
    expect(within(voice).getByRole("switch").getAttribute("aria-checked")).toBe("true");
    expect(voice.textContent).not.toContain("2026-01-01T");
    const alert = screen.getByText("1 flag expirada").closest("[data-slot='alert']");
    expect(alert?.textContent).toContain("chat.voice");
    await expectNoAxeViolations(container);
  });

  it("lists at most five expired keys and filters the table to the expired ones through the URL", async () => {
    const expired = Array.from({ length: 7 }, (_, index) =>
      buildExpiredFlag({ key: `legacy.flag-${String(index + 1)}` }),
    );
    const { user, router, container } = render({ routes: routes({ "GET /v1/admin/flags": ok([KILL, ...expired]) }) });
    const alert = (await screen.findByText("7 flags expiradas")).closest("[data-slot='alert']") as HTMLElement;
    expect(
      within(alert)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["legacy.flag-1", "legacy.flag-2", "legacy.flag-3", "legacy.flag-4", "legacy.flag-5"]);
    expect(within(alert).getByText("e mais 2")).toBeDefined();
    const onlyExpired = within(alert).getByRole("button", { name: "Mostrar só as expiradas" });
    expect(onlyExpired.getAttribute("aria-pressed")).toBe("false");
    await user.click(onlyExpired);
    await waitFor(() => expect(router.current()).toBe("/admin/flags?expired=1"));
    const table = screen.getByRole("table", { name: "Flags de funcionalidades" });
    await waitFor(() => expect(within(table).queryByRole("row", { name: /ai\.kill-switch/u })).toBeNull());
    expect(within(table).getAllByRole("row", { name: /legacy\.flag-/u })).toHaveLength(7);
    expect(within(alert).getByRole("button", { name: "Mostrar só as expiradas" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    await expectNoAxeViolations(container);
  });

  it("searches the flags by key or name, says when none match and clears the search", async () => {
    const { user, router } = render({ path: "/admin/flags?q=kill" });
    const table = await screen.findByRole("table", { name: "Flags de funcionalidades" });
    expect(within(table).getByRole("row", { name: /ai\.kill-switch/u })).toBeDefined();
    expect(within(table).queryByRole("row", { name: /chat\.voice/u })).toBeNull();
    const field = screen.getByRole("searchbox", { name: "Buscar flag" });
    expect((field as HTMLInputElement).value).toBe("kill");
    await user.clear(field);
    await user.type(field, "nada");
    await waitFor(() => expect(router.current()).toBe("/admin/flags?q=nada"));
    expect(await screen.findByRole("heading", { level: 2, name: "Nenhuma flag corresponde à busca" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Limpar a busca" }));
    await waitFor(() => expect(router.current()).toBe("/admin/flags"));
    expect(await screen.findByRole("row", { name: /chat\.voice/u })).toBeDefined();
  });

  it("turns a kill-switch on only after a destructive confirmation that says what stops", async () => {
    const { user, api, container } = render({
      routes: routes({ "PUT /v1/admin/flags/:flagKey": ok(buildFeatureFlag({ value: true })) }),
    });
    await user.click(await screen.findByRole("switch", { name: "Valor de ai.kill-switch no ambiente" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Ligar ai.kill-switch?" });
    expect(dialog.textContent).toContain("interrompe o que ele descreve em todo o ambiente");
    expect(dialog.textContent).toContain("Para todos os agentes, conversas e voz durante um incidente.");
    expect(api.calls.some((call) => call.method === "PUT")).toBe(false);
    await expectNoAxeViolations(container.ownerDocument.body);
    api.route("GET /v1/admin/flags", ok([buildFeatureFlag({ value: true }), VOICE]));
    await user.click(within(dialog).getByRole("button", { name: "Ligar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    const put = api.calls.find((call) => call.method === "PUT");
    expect(put?.path).toBe("/v1/admin/flags/ai.kill-switch");
    expect(put?.body).toEqual({ value: true });
    expect(await screen.findByText("ai.kill-switch ligada.")).toBeDefined();
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "Valor de ai.kill-switch no ambiente" }).getAttribute("aria-checked"),
      ).toBe("true"),
    );
  });

  it("keeps the old value and shows the error with its reference when the change fails", async () => {
    const { user } = render({ routes: routes({ "PUT /v1/admin/flags/:flagKey": apiError(403, "FORBIDDEN") }) });
    await user.click(await screen.findByRole("switch", { name: "Valor de chat.voice no ambiente" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Desligar chat.voice?" });
    await user.click(within(dialog).getByRole("button", { name: "Desligar" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("Você não tem permissão para fazer isso.");
    expect(alert.textContent).toContain(FAKE_REQUEST_ID);
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("switch", { name: "Valor de chat.voice no ambiente" }).getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("shows the override of the organization in the URL and sets it for that organization only", async () => {
    const { user, api, container } = render({
      path: `/admin/flags?organizationId=${IDS.organization}`,
      routes: routes({ "PUT /v1/admin/flags/:flagKey": ok(buildExpiredFlag({ value: true, tenantOverride: true })) }),
    });
    const voice = await screen.findByRole("row", { name: /chat\.voice/u });
    expect(await within(voice).findByText("Ajuste: desligada")).toBeDefined();
    expect(within(voice).getByText("Valor efetivo: desligada")).toBeDefined();
    // The environment value still comes from the list without an organization.
    expect(within(voice).getByRole("switch").getAttribute("aria-checked")).toBe("true");
    const kill = screen.getByRole("row", { name: /ai\.kill-switch/u });
    expect(within(kill).getByText("Sem ajuste")).toBeDefined();
    await expectNoAxeViolations(container);
    await user.click(await within(voice).findByRole("button", { name: "Ligar chat.voice para Northwind" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Ligar chat.voice?" });
    expect(dialog.textContent).toContain("Vale só para Northwind");
    await user.click(within(dialog).getByRole("button", { name: "Ligar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(api.calls.find((call) => call.method === "PUT")?.body).toEqual({ value: true, tenantId: IDS.organization });
  });

  it("removes an organization's override after a confirmation, and offers it only where one exists", async () => {
    const { user, api } = render({
      path: `/admin/flags?organizationId=${IDS.organization}`,
      routes: routes({
        "DELETE /v1/admin/flags/:flagKey/overrides/:organizationId": ok(
          buildExpiredFlag({ value: true, tenantOverride: null }),
        ),
      }),
    });
    const voice = await screen.findByRole("row", { name: /chat\.voice/u });
    const kill = screen.getByRole("row", { name: /ai\.kill-switch/u });
    await within(voice).findByText("Ajuste: desligada");
    expect(within(kill).queryByRole("button", { name: /^Remover o ajuste/u })).toBeNull();
    await user.click(within(voice).getByRole("button", { name: "Remover o ajuste de chat.voice para Northwind" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Remover o ajuste de chat.voice?" });
    expect(dialog.textContent).toContain("Northwind volta a seguir o valor do ambiente");
    expect(api.calls.some((call) => call.method === "DELETE")).toBe(false);
    api.route("GET /v1/admin/flags", (request) =>
      ok(request.query.get("organizationId") === null ? [KILL, VOICE] : [KILL, VOICE]),
    );
    await user.click(within(dialog).getByRole("button", { name: "Remover ajuste" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(api.calls.find((call) => call.method === "DELETE")?.path).toBe(
      `/v1/admin/flags/chat.voice/overrides/${IDS.organization}`,
    );
    expect(await screen.findByText("Ajuste de chat.voice removido.")).toBeDefined();
    await waitFor(() =>
      expect(within(screen.getByRole("row", { name: /chat\.voice/u })).getByText("Sem ajuste")).toBeDefined(),
    );
  });

  it("keeps the override and shows the error with its reference when the removal fails", async () => {
    const { user } = render({
      path: `/admin/flags?organizationId=${IDS.organization}`,
      routes: routes({
        "DELETE /v1/admin/flags/:flagKey/overrides/:organizationId": apiError(502, "UPSTREAM_UNAVAILABLE"),
      }),
    });
    const voice = await screen.findByRole("row", { name: /chat\.voice/u });
    await user.click(
      await within(voice).findByRole("button", { name: "Remover o ajuste de chat.voice para Northwind" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Remover ajuste" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain(FAKE_REQUEST_ID);
    expect(within(voice).getByText("Ajuste: desligada")).toBeDefined();
  });

  it("puts the chosen organization in the URL", async () => {
    const { user, router } = render();
    await user.click(await screen.findByRole("combobox", { name: "Ajuste por organização" }));
    await user.click(await screen.findByRole("option", { name: "Northwind" }));
    expect(router.current()).toBe(`/admin/flags?organizationId=${IDS.organization}`);
    expect(await screen.findByRole("columnheader", { name: "Ajuste da organização" })).toBeDefined();
  });

  it("explains an empty registry and offers a reload", async () => {
    const { user, api, container } = render({ routes: routes({ "GET /v1/admin/flags": ok([]) }) });
    expect(await screen.findByRole("heading", { level: 2, name: "Nenhuma flag registrada" })).toBeDefined();
    await expectNoAxeViolations(container);
    api.route("GET /v1/admin/flags", ok([KILL]));
    await user.click(screen.getByRole("button", { name: "Recarregar" }));
    expect(await screen.findByRole("row", { name: /ai\.kill-switch/u })).toBeDefined();
  });

  it("shows an error with the request reference and a retry", async () => {
    const { user, api, container } = render({ routes: routes({ "GET /v1/admin/flags": apiError(409, "CONFLICT") }) });
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(screen.getByText(new RegExp(FAKE_REQUEST_ID, "u"))).toBeDefined();
    await expectNoAxeViolations(container);
    api.route("GET /v1/admin/flags", ok([KILL]));
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("row", { name: /ai\.kill-switch/u })).toBeDefined();
  });

  it("holds writes while offline", async () => {
    render();
    await screen.findByRole("table", { name: "Flags de funcionalidades" });
    try {
      setOnline(false);
      await waitFor(() =>
        expect(screen.getByRole("switch", { name: "Valor de chat.voice no ambiente" }).hasAttribute("disabled")).toBe(
          true,
        ),
      );
    } finally {
      setOnline(true);
    }
  });

  it("is closed to the support role", async () => {
    const { api } = render({ role: "platform-support" });
    expect(await screen.findByRole("heading", { level: 2, name: "Você não tem acesso a esta página" })).toBeDefined();
    expect(api.callLines()).not.toContain("GET /v1/admin/flags");
  });

  it("shows cards on a phone and reads in English", async () => {
    const matchMedia = globalThis.matchMedia;
    globalThis.matchMedia = (query: string) => ({ ...matchMedia(query), matches: query.includes("max-width") });
    try {
      const { container } = render({ locale: "en-US" });
      const list = await screen.findByRole("list", { name: "Feature flags" });
      expect(within(list).getAllByRole("listitem")).toHaveLength(2);
      expect(within(list).getByText("Expired")).toBeDefined();
      expect(screen.getByText("1 expired flag")).toBeDefined();
      await expectNoAxeViolations(container);
    } finally {
      globalThis.matchMedia = matchMedia;
    }
  });
});
