import { AccessContextContract, defineModule, MeContract } from "@core/contracts";
import { act, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useTimeZone, useTranslations } from "use-intl";
import { describe, expect, it } from "vitest";
import type { StateStorage } from "zustand/middleware";
import { ApiError } from "#/shared/api/api-error.ts";
import type { ClientConfig } from "#/shared/config/client-config.schema.ts";
import { createFakeAuth } from "#/shared/lib/auth/fake-auth.ts";
import { createMemoryRouter } from "#/shared/lib/router/memory-router.tsx";
import { useSession } from "#/shared/lib/session/session-context.tsx";
import type { SessionBridgePort } from "#/shared/lib/session-bridge/session-bridge-port.ts";
import { useNavigationRegistry, useShellUi } from "#/shared/lib/shell/index.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { createClientApp } from "./create-client-app.tsx";
import { defineClientModule } from "./modules/define-client-module.ts";
import { ModuleRegistryError } from "./modules/module-registry.ts";

const ME = { ...(MeContract.meta.examples[0] as Record<string, unknown>), accessVersion: 3 };
const CONTEXT = AccessContextContract.meta.examples[0] as { regional: Record<string, string> };
const ACCESS_CONTEXT = { ...CONTEXT, regional: { ...CONTEXT.regional, displayTimeZone: "Asia/Tokyo" } };
const USER = { uid: "u1", email: null, displayName: "Ana", emailVerified: true, mfaFactors: [] };
const config: ClientConfig = {
  appEnv: "local",
  apiBaseUrl: "",
  firebase: { apiKey: "k", authDomain: "d", projectId: "demo-core" },
  authEmulatorUrl: "http://127.0.0.1:9099",
  mfaFactors: ["phone"],
};

const sampleModule = defineClientModule({
  manifest: defineModule({
    id: "sample",
    labelKey: "sample.module.name",
    permissions: [],
    messages: { "pt-BR": { module: { name: "Módulo de amostra" } } },
  }),
  pages: {},
});

const memoryStorage = (): StateStorage => {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
};

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "x-request-id": "req-1" },
  });

const setup = (args: { restored?: string | null; path?: string } = {}) => {
  const calls: string[] = [];
  const fetch = (input: string, init: RequestInit = {}) => {
    const url = new URL(input, "http://app.test");
    calls.push(`${init.method ?? "GET"} ${url.pathname}`);
    if (url.pathname === "/v1/me") return Promise.resolve(json(200, { data: ME }));
    if (url.pathname === "/v1/me/context") return Promise.resolve(json(200, { data: ACCESS_CONTEXT }));
    if (url.pathname === "/v1/me/claims/sync") return Promise.resolve(json(204));
    return Promise.resolve(json(404, { error: { code: "NOT_FOUND", message: "Not found.", requestId: "req-1" } }));
  };
  const auth = createFakeAuth(USER);
  auth.setClaims({ accessVersion: 2 }, { accessVersion: 3 });
  const bridge = { established: [] as string[], ended: 0 };
  const sessionBridge: SessionBridgePort = {
    establish: ({ idToken }) => Promise.resolve(void bridge.established.push(idToken)),
    restore: () =>
      Promise.resolve(args.restored === undefined || args.restored === null ? null : { customToken: args.restored }),
    end: () => Promise.resolve(void (bridge.ended += 1)),
  };
  const app = createClientApp({
    config,
    modules: [sampleModule],
    adapters: {
      auth,
      router: createMemoryRouter(args.path ?? "/"),
      sessionBridge,
      platform: { kind: "desktop", apiBaseUrl: "" },
      fetch,
      shellUiStorage: memoryStorage(),
    },
  });
  return { app, auth, bridge, calls };
};

function Probe() {
  const session = useSession();
  const t = useTranslations();
  const timeZone = useTimeZone();
  const recents = useShellUi((state) => state.recents);
  const profile = useNavigationRegistry().visibleItems("user-menu", () => true);
  return (
    <main>
      <h1>{t("sample.module.name")}</h1>
      <p data-testid="status">{session.state.status}</p>
      <p data-testid="time-zone">{timeZone}</p>
      <p data-testid="recents">{recents.join(",")}</p>
      <ul aria-label={t("shell.sidebar.title")}>
        {profile.map((item) => (
          <li key={item.id}>{t(item.labelKey)}</li>
        ))}
      </ul>
      <button type="button" onClick={() => void session.signOut()}>
        {t("shell.nav.profile.account")}
      </button>
    </main>
  );
}

describe("createClientApp", () => {
  it("renders children inside every provider with module messages, core navigation and a signed-out session", async () => {
    const { app } = setup();
    const { container } = render(
      <app.ClientApp locale="pt-BR">
        <Probe />
      </app.ClientApp>,
    );
    expect(await screen.findByRole("heading", { name: "Módulo de amostra" })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("signed-out"));
    expect(screen.getByRole("list", { name: "Navegação" }).textContent).toBe(
      "ContaPreferênciasSegurançaSessõesNotificações",
    );
    await expectNoAxeViolations(container);
  });

  it("resumes a stored session, syncs stale claims and uses the node's display time zone", async () => {
    const { app, calls } = setup({ restored: "custom-token", path: "/o/org-a" });
    render(
      <app.ClientApp locale="en-US">
        <Probe />
      </app.ClientApp>,
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("signed-in"));
    await waitFor(() => expect(screen.getByTestId("time-zone").textContent).toBe("Asia/Tokyo"));
    await waitFor(() => expect(calls).toContain("POST /v1/me/claims/sync"));
    expect(calls.indexOf("GET /v1/me")).toBeLessThan(calls.indexOf("POST /v1/me/claims/sync"));
  });

  it("signs out through the bridge and clears the query cache and the shell UI store", async () => {
    const { app, auth, bridge } = setup({ restored: "custom-token" });
    render(
      <app.ClientApp locale="pt-BR">
        <Probe />
      </app.ClientApp>,
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("signed-in"));
    act(() => app.shellUi.getState().addRecent("open-profile"));
    expect(screen.getByTestId("recents").textContent).toBe("open-profile");
    await userEvent.setup().click(screen.getByRole("button", { name: "Conta" }));
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("signed-out"));
    expect(bridge.ended).toBe(1);
    expect(auth.getState().status).toBe("signed-out");
    expect(screen.getByTestId("recents").textContent).toBe("");
    // Mounted observers re-create disabled entries after clear(); none may keep the user's data.
    expect(
      app.queryClient
        .getQueryCache()
        .getAll()
        .filter((query) => query.state.data !== undefined),
    ).toEqual([]);
  });

  it("catches render errors and shows the request reference, never the message", async () => {
    const { app } = setup();
    const Broken = () => {
      throw new ApiError({ status: 500, code: "INTERNAL_ERROR", message: "db exploded", requestId: "01K6REQ" });
    };
    const { container } = render(
      <app.ClientApp locale="pt-BR">
        <Broken />
      </app.ClientApp>,
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Esta tela parou de funcionar");
    expect(alert.textContent).toContain("01K6REQ");
    expect(container.textContent).not.toContain("db exploded");
  });

  it("rejects two modules with the same id when the app is created", () => {
    expect(() =>
      createClientApp({
        config,
        modules: [sampleModule, sampleModule],
        adapters: {
          auth: createFakeAuth(USER),
          router: createMemoryRouter(),
          sessionBridge: {
            establish: () => Promise.resolve(),
            restore: () => Promise.resolve(null),
            end: () => Promise.resolve(),
          },
          platform: { kind: "web", apiBaseUrl: "" },
        },
      }),
    ).toThrow(ModuleRegistryError);
  });
});
