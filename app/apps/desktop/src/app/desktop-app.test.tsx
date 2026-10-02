import { createFakeAuth, type AuthUser } from "@core/client/shared/lib/auth";
import type { SessionBridgePort } from "@core/client/shared/lib/session-bridge";
import { buildMe, createFakeApi, expectNoAxeViolations, IDS, MEMBER_PERMISSIONS, noContent, ok, shellRoutes } from "@core/client/testing";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDesktopEnv } from "@/config/desktop-env.schema.ts";
import { createDesktopRuntime } from "./create-desktop-runtime.ts";

const ENV = loadDesktopEnv({
  VITE_API_URL: "http://localhost:3100",
  VITE_APP_ENV: "local",
  VITE_FIREBASE_API_KEY: "demo-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-core.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "demo-core",
  VITE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
  VITE_MFA_FACTORS: "phone",
});

const USER: AuthUser = { uid: "uA1b2C3d4E5f6G7h8I9j", email: "ana@example.com", displayName: "Ana Souza", emailVerified: true, mfaFactors: [] };

type RenderArgs = {
  path: string;
  signedIn: boolean;
  languages?: readonly string[];
  profileLocale?: string;
  /** Runs the real desktop session bridge over a fake Tauri keychain instead of a stub bridge. */
  keychain?: Map<string, string>;
  /** The session restore never settles: the user area stays in its loading state. */
  restoring?: boolean;
};

const EXPIRES_AT = "2026-10-30T00:00:00.000Z";
const secretNo = (n: number): string => `S${String(n).padStart(42, "0")}`;

/** Tauri's IPC entry point as the webview sees it, answering the secure store commands from `keychain`. */
const installFakeTauri = (keychain: Map<string, string>): void => {
  const invoke = (cmd: string, args?: { secret?: string }): Promise<unknown> => {
    if (cmd === "secure_store_get") return Promise.resolve(keychain.get("desktop-session") ?? null);
    if (cmd === "secure_store_set" && args?.secret !== undefined) keychain.set("desktop-session", args.secret);
    if (cmd === "secure_store_delete") keychain.delete("desktop-session");
    return Promise.resolve(null);
  };
  Object.assign(window, { __TAURI_INTERNALS__: { invoke } });
};

const renderDesktop = (args: RenderArgs) => {
  const auth = createFakeAuth(USER);
  auth.setClaims({ accessVersion: 3 });
  const preferences = { locale: args.profileLocale ?? "pt-BR", theme: "system", notifications: { productUpdates: false, securityAlerts: true } };
  const api = createFakeApi({
    ...shellRoutes(MEMBER_PERMISSIONS),
    "GET /v1/me": ok(buildMe({ lastContext: { organizationId: IDS.organization }, preferences })),
    "POST /v1/me/claims/sync": noContent(),
  });
  const stubBridge: SessionBridgePort = {
    establish: () => Promise.resolve(),
    restore: () => (args.restoring === true ? new Promise(() => undefined) : Promise.resolve(args.signedIn ? { customToken: "custom-token" } : null)),
    end: () => Promise.resolve(),
  };
  const reportError = vi.fn();
  const history = createMemoryHistory({ initialEntries: [args.path] });
  if (args.keychain !== undefined) installFakeTauri(args.keychain);
  const sessionBridge = args.keychain === undefined ? stubBridge : undefined;
  const { router } = createDesktopRuntime({ env: ENV, languages: args.languages ?? ["pt-BR"], history, auth, sessionBridge, fetch: api.fetch, reportError, scope: window });
  const view = render(<RouterProvider router={router} />);
  return { ...view, router, api, reportError };
};

afterEach(() => {
  document.documentElement.lang = "";
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
});

describe("desktop app", () => {
  it("sends a signed-out visitor of the user area to sign-in, keeping where they were going", async () => {
    const { router, container } = renderDesktop({ path: `/o/${IDS.organization}`, signedIn: false });

    expect(await screen.findByRole("heading", { level: 1, name: "Entrar" })).toBeDefined();
    expect(router.state.location.href).toBe(`/sign-in?next=${encodeURIComponent(`/o/${IDS.organization}`)}`);
    await expectNoAxeViolations(container);
  });

  it("draws the shell's frame, not a lone spinner, while the session is restored", async () => {
    const { container } = renderDesktop({ path: `/o/${IDS.organization}`, signedIn: true, restoring: true });

    const status = (await screen.findByText("Verificando sua sessão…")).closest('[role="status"]');
    expect(status?.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("main").id).toBe("main");
    expect(container.querySelector('[data-slot="app-shell-skeleton-sidebar"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="app-topbar-skeleton"]')).not.toBeNull();
    await expectNoAxeViolations(container);
  });

  it("renders the shared user area inside the app layout for a resumed session", async () => {
    const { container, reportError } = renderDesktop({ path: `/o/${IDS.organization}`, signedIn: true });

    expect(await screen.findByRole("heading", { level: 1, name: "Northwind" })).toBeDefined();
    expect(screen.getByRole("navigation", { name: "Navegação" })).toBeDefined();
    expect(document.documentElement.lang).toBe("pt-BR");
    await expectNoAxeViolations(container);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("resumes the session kept in the OS keychain after a restart and stores the rotated secret", async () => {
    const keychain = new Map([["desktop-session", JSON.stringify({ v: 1, sessionId: "session-1", secret: secretNo(1) })]]);
    const view = renderDesktop({ path: `/o/${IDS.organization}`, signedIn: false, keychain });
    view.api.route("POST /v1/desktop-sessions/exchange", ok({ customToken: "custom-token", secret: secretNo(2), expiresAt: EXPIRES_AT }));

    expect(await screen.findByRole("heading", { level: 1, name: "Northwind" })).toBeDefined();
    const exchange = view.api.calls.find((call) => call.path === "/v1/desktop-sessions/exchange");
    expect(exchange?.body).toEqual({ secret: secretNo(1) });
    expect(exchange?.headers.get("authorization")).toBeNull();
    expect(JSON.parse(keychain.get("desktop-session") ?? "null")).toEqual({ v: 1, sessionId: "session-1", secret: secretNo(2) });
    expect(view.reportError).not.toHaveBeenCalled();
  });

  it("starts signed out when the keychain holds no session", async () => {
    const view = renderDesktop({ path: `/o/${IDS.organization}`, signedIn: false, keychain: new Map() });

    expect(await screen.findByRole("heading", { level: 1, name: "Entrar" })).toBeDefined();
    expect(view.api.callLines()).not.toContain("POST /v1/desktop-sessions/exchange");
  });

  it("has no /admin surface: signed-in staff paths render not found", async () => {
    renderDesktop({ path: "/admin", signedIn: true });

    expect(await screen.findByRole("heading", { level: 1, name: "Página não encontrada" })).toBeDefined();
  });

  it("starts in the OS language and switches to the profile language once /v1/me answers", async () => {
    renderDesktop({ path: "/organizations", signedIn: true, languages: ["es-MX"], profileLocale: "en-US" });

    expect(await screen.findByRole("navigation", { name: "Navigation" })).toBeDefined();
    expect(document.documentElement.lang).toBe("en-US");
  });
});
