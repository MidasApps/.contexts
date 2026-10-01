import type { Permission } from "@core/contracts";
import { act, configure, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { shellRoutes } from "#/app-shell/testing/shell-routes.ts";
import { buildFeatureFlag } from "#/shared/testing/admin-governance-fixtures.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, ok, type FakeRequest, type FakeRoutes } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { SettingsFlagsView } from "./SettingsFlagsView.tsx";

const READER: Permission[] = ["core.organization.read", "core.flag.read"];
const WRITER: Permission[] = [...READER, "core.flag.write"];
const rollout = (overrides: Record<string, unknown>) => buildFeatureFlag({ kind: "rollout", owner: "chat-team", ...overrides });
const VOICE = rollout({ key: "chat.voice", reason: "Voice input and output in chat.", value: true });
const REALTIME = rollout({ key: "chat.voice.realtime", reason: "Realtime voice sessions.", value: false, tenantOverride: false });
const PLATFORM_OFF = rollout({ key: "chat.preview", reason: "Preview feature.", value: false });

const renderView = (routes: FakeRoutes = {}, permissions: readonly Permission[] = WRITER) =>
  renderApp(
    <main>
      <SettingsFlagsView />
    </main>,
    { path: `/o/${IDS.organization}/settings/flags`, routes: shellRoutes(permissions, { "GET /v1/flags": ok([VOICE, REALTIME, PLATFORM_OFF]), ...routes }) },
  );

// The whole app shell boots per test and sibling suites load the machine: the default 1 s of
// `findBy*` and 5 s per test are too tight here, so both are widened for this file only.
beforeAll(() => {
  configure({ asyncUtilTimeout: 10_000 });
});
afterAll(() => {
  configure({ asyncUtilTimeout: 1000 });
});

const setOnline = (online: boolean): void => {
  Object.defineProperty(globalThis.navigator, "onLine", { configurable: true, get: () => online });
  act(() => void globalThis.dispatchEvent(new Event(online ? "online" : "offline")));
};

describe("SettingsFlagsView", { timeout: 30_000 }, () => {
  it("lists the overridable flags of the organization with platform value, override and value in use", async () => {
    const { container, api } = renderView();
    const table = await screen.findByRole("table", { name: "Recursos que Northwind pode desligar" });
    const voice = within(table).getByRole("row", { name: /Voice input and output/u });
    expect(within(voice).getByText("Voice input and output in chat.")).toBeDefined();
    expect(within(voice).getAllByText("Ligado")).toHaveLength(2);
    expect(within(voice).getByText("Sem alteração")).toBeDefined();
    const realtime = within(table).getByRole("row", { name: /chat\.voice\.realtime/u });
    expect(within(realtime).getByText("Desligado pela organização")).toBeDefined();
    expect(within(realtime).getByText("Não informado enquanto a organização altera o recurso")).toBeDefined();
    expect(within(realtime).getByRole("button", { name: "Voltar a usar chat.voice.realtime" })).toBeDefined();
    const off = within(table).getByRole("row", { name: /chat\.preview/u });
    expect(within(off).getByText("Desligado pela plataforma")).toBeDefined();
    expect(within(off).queryByRole("button")).toBeNull();
    expect(screen.getByText(/só pode desligar um recurso para si mesma/u)).toBeDefined();
    expect(api.calls.find((call) => call.path === "/v1/flags")?.query).toBe(`?organizationId=${IDS.organization}`);
    await expectNoAxeViolations(container);
  });

  it("switches a flag off for the organization after confirmation", async () => {
    const requests: FakeRequest[] = [];
    const { user } = renderView({
      "PUT /v1/flags/:flagKey": (request: FakeRequest) => {
        requests.push(request);
        return ok(rollout({ key: "chat.voice", value: false, tenantOverride: false }));
      },
    });
    await user.click(await screen.findByRole("button", { name: "Desligar chat.voice para a organização" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Desligar chat.voice para a organização?" });
    expect(within(dialog).getByText(/Voice input and output in chat\./u)).toBeDefined();
    await user.click(within(dialog).getByRole("button", { name: "Desligar" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.params["flagKey"]).toBe("chat.voice");
    expect(requests[0]?.query.get("organizationId")).toBe(IDS.organization);
    expect(requests[0]?.body).toEqual({ value: false });
  });

  it("goes back to using a flag, and keeps the API's refusal in the dialog", async () => {
    const requests: FakeRequest[] = [];
    const { user } = renderView({
      "PUT /v1/flags/:flagKey": (request: FakeRequest) => {
        requests.push(request);
        return apiError(400, "VALIDATION_FAILED", [{ field: "value", issue: "DISABLED_BY_ENVIRONMENT" }]);
      },
    });
    await user.click(await screen.findByRole("button", { name: "Voltar a usar chat.voice.realtime" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Voltar a usar chat.voice.realtime?" });
    await user.click(within(dialog).getByRole("button", { name: "Voltar a usar" }));
    expect(await within(dialog).findByText(/Referência/u)).toBeDefined();
    expect(requests[0]?.body).toEqual({ value: true });
  });

  it("shows no action without the write permission and refuses the page without the read one", async () => {
    const reader = renderView({}, READER);
    await screen.findByRole("table", { name: "Recursos que Northwind pode desligar" });
    expect(screen.queryByRole("button", { name: /Desligar chat\.voice/u })).toBeNull();
    reader.unmount();
    const { api } = renderView({}, ["core.organization.read"]);
    expect(await screen.findByRole("heading", { name: "Você não tem acesso a esta página" })).toBeDefined();
    expect(api.callLines().some((line) => line.includes("/v1/flags"))).toBe(false);
  });

  it("shows empty, error and offline states", async () => {
    const empty = renderView({ "GET /v1/flags": ok([]) });
    expect(await screen.findByRole("heading", { name: "Nenhum recurso ajustável" })).toBeDefined();
    empty.unmount();
    const failed = renderView({ "GET /v1/flags": apiError(409, "CONFLICT") });
    expect(await screen.findByRole("button", { name: "Tentar novamente" })).toBeDefined();
    failed.unmount();
    renderView();
    await screen.findByRole("table", { name: "Recursos que Northwind pode desligar" });
    setOnline(false);
    try {
      expect(await screen.findByText(/Você está sem conexão/u)).toBeDefined();
      expect(screen.queryByRole("button", { name: /Desligar chat\.voice/u })).toBeNull();
    } finally {
      setOnline(true);
    }
  });
});
