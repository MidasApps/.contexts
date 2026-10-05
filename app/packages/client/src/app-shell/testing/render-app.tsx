// Test harness (not exported from the package): renders widgets and views inside the real app
// composition (`createClientApp`) with fake ports — a fake `/v1`, fake Firebase auth, an in-memory
// router, session bridge and shell UI storage. Tests run what the apps run (integration first).
import type { SupportedLocale } from "@core/i18n";
import { type RenderResult, render } from "@testing-library/react";
import { type UserEvent, userEvent } from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach } from "vitest";
import type { StateStorage } from "zustand/middleware";
import type { ClientConfig } from "#/shared/config/client-config.schema.ts";
import { createFakeAuth, type FakeAuth } from "#/shared/lib/auth/fake-auth.ts";
import { createMemoryRouter, type MemoryRouter } from "#/shared/lib/router/memory-router.tsx";
import type { SessionBridgePort } from "#/shared/lib/session-bridge/session-bridge-port.ts";
import type { ClientModule, ShellNavItem, ShellSlots } from "#/shared/lib/shell/shell-types.ts";
import { createFakeApi, type FakeApi, type FakeRoutes, noContent, ok } from "#/shared/testing/fake-api.ts";
import { buildMe } from "#/shared/testing/fixtures.ts";
import { TEST_USER } from "#/shared/testing/render-client.tsx";
import { type CreatedClientApp, createClientApp } from "../create-client-app.tsx";

export const TEST_CONFIG: ClientConfig = {
  appEnv: "local",
  apiBaseUrl: "",
  firebase: { apiKey: "test-key", authDomain: "demo-core.firebaseapp.com", projectId: "demo-core" },
  authEmulatorUrl: "http://127.0.0.1:9099",
  mfaFactors: ["phone", "totp"],
};

const reported: unknown[] = [];

// A render error or a missing message caught by the shell must fail the test that caused it.
afterEach(() => {
  const errors = reported.splice(0);
  if (errors.length > 0)
    throw new Error(`the shell reported ${String(errors.length)} error(s): ${errors.map(String).join("; ")}`);
});

const memoryStorage = (): StateStorage => {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
};

/** What the fake session bridge was asked: sign-ins, sign-outs, impersonations entered and left. */
export type BridgeLog = { established: string[]; ended: number; entered: string[]; left: number };

export type RenderAppOptions = {
  /** Extra or overriding `/v1` routes; `GET /v1/me` and claims sync have defaults. */
  routes?: FakeRoutes;
  /** Initial href (default `/`). */
  path?: string;
  locale?: SupportedLocale;
  /** Resume a stored session on boot (default `true`); `false` starts signed out. */
  signedIn?: boolean;
  modules?: readonly ClientModule[];
  navigation?: readonly ShellNavItem[];
  slots?: ShellSlots;
  auth?: FakeAuth;
  /** Overrides parts of `TEST_CONFIG` (e.g. `mfaFactors`). */
  config?: Partial<ClientConfig>;
  /** Overrides `sessionBridge.establish` (e.g. to fail the web session). */
  establish?: SessionBridgePort["establish"];
  /** Overrides `sessionBridge.leaveImpersonation` (e.g. to fail the return to staff). */
  leaveImpersonation?: SessionBridgePort["leaveImpersonation"];
  /** Host the app runs in (default `web`). */
  platform?: "web" | "desktop";
};

export type RenderAppResult = RenderResult & {
  user: UserEvent;
  api: FakeApi;
  router: MemoryRouter;
  auth: FakeAuth;
  app: CreatedClientApp;
  bridge: BridgeLog;
};

/** Renders `ui` inside `ClientApp`; wait for signed-in content with `findBy*`. */
export const renderApp = (ui: ReactElement, options: RenderAppOptions = {}): RenderAppResult => {
  const api = createFakeApi({ "GET /v1/me": ok(buildMe()), "POST /v1/me/claims/sync": noContent(), ...options.routes });
  const auth = options.auth ?? createFakeAuth(TEST_USER);
  auth.setClaims({ accessVersion: 3 });
  const bridge: BridgeLog = { established: [], ended: 0, entered: [], left: 0 };
  const sessionBridge: SessionBridgePort = {
    establish: options.establish ?? (({ idToken }) => Promise.resolve(void bridge.established.push(idToken))),
    restore: () => Promise.resolve(options.signedIn === false ? null : { customToken: "custom-token" }),
    end: () => Promise.resolve(void (bridge.ended += 1)),
    enterImpersonation: ({ impersonationSessionId }) => {
      bridge.entered.push(impersonationSessionId);
      return Promise.resolve({ customToken: "impersonated-token" });
    },
    leaveImpersonation:
      options.leaveImpersonation ??
      (() => {
        bridge.left += 1;
        return Promise.resolve({ customToken: "staff-token" });
      }),
  };
  const router = createMemoryRouter(options.path ?? "/");
  const app = createClientApp({
    config: { ...TEST_CONFIG, ...options.config },
    modules: options.modules ?? [],
    navigation: options.navigation,
    slots: options.slots,
    adapters: {
      auth,
      router,
      sessionBridge,
      platform: { kind: options.platform ?? "web", apiBaseUrl: "" },
      fetch: api.fetch,
      shellUiStorage: memoryStorage(),
      reportError: (error) => void reported.push(error),
      onIntlError: (error) => {
        throw error;
      },
    },
  });
  const user = userEvent.setup();
  const result = render(<app.ClientApp locale={options.locale ?? "pt-BR"}>{ui}</app.ClientApp>);
  return { ...result, user, api, router, auth, app, bridge };
};
