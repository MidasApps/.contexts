import { createClientApp, type ReportError } from "@core/client/app-shell";
import type { FetchLike } from "@core/client/shared/api";
import { createFirebaseAuthClient, type AuthPort } from "@core/client/shared/lib/auth";
import type { SessionBridgePort } from "@core/client/shared/lib/session-bridge";
import type { RouterHistory } from "@tanstack/react-router";
import { toClientConfig } from "@/adapters/desktop-client-config.ts";
import { createLocaleStore, resolveDesktopLocale } from "@/adapters/desktop-locale.ts";
import { createDesktopErrorReporter, type DesktopLogEntry } from "@/adapters/desktop-report-error.ts";
import { createDesktopRouterAdapter } from "@/adapters/desktop-router-adapter.tsx";
import { selectSecureStore } from "@/adapters/desktop-secure-store.ts";
import { createDesktopSessionBridge } from "@/adapters/desktop-session-bridge.ts";
import { readSidebarOpen, writeSidebarOpen } from "@/adapters/sidebar-state.ts";
import { createTauriSecureStore } from "@/adapters/tauri-secure-store.ts";
import type { DesktopEnv } from "@/config/desktop-env.schema.ts";
import { DESKTOP_MODULES } from "@/modules.ts";
import { createAppRouter, type AppRouter } from "@/router.ts";

export type DesktopRuntimeArgs = {
  readonly env: DesktopEnv;
  /** `navigator.languages`: the UI language before the profile answers. */
  readonly languages: readonly string[];
  /** Local storage for per-device UI preferences (sidebar); absent when blocked. */
  readonly storage?: Storage | undefined;
  /** Tests: memory history and fake ports; the app uses browser history, Firebase and `fetch`. */
  readonly history?: RouterHistory | undefined;
  readonly auth?: AuthPort | undefined;
  readonly sessionBridge?: SessionBridgePort | undefined;
  readonly fetch?: FetchLike | undefined;
  readonly reportError?: ReportError | undefined;
  /** Where `__TAURI_INTERNALS__` is looked up (default `globalThis`): OS keychain inside Tauri, memory otherwise. */
  readonly scope?: object | undefined;
};

export type DesktopRuntime = { readonly router: AppRouter };

// The webview console is the only log sink of the desktop client until a log transport exists;
// entries are structured JSON without messages or PII (see desktop-report-error.ts).
// eslint-disable-next-line no-console -- see above
const writeToConsole = (entry: DesktopLogEntry): void => console.error(JSON.stringify(entry));

/**
 * Composition root of the desktop app (SP2 Task 20): the shared client (`createClientApp`) with the
 * desktop adapters — TanStack router port, Firebase Auth, the desktop session bridge over the
 * secure store (OS keychain in Tauri, Task 21), platform `desktop` with the API origin — and the TanStack
 * router whose context carries the composed app. Called once from `main.tsx`.
 */
export const createDesktopRuntime = (args: DesktopRuntimeArgs): DesktopRuntime => {
  const config = toClientConfig(args.env);
  const reportError = args.reportError ?? createDesktopErrorReporter({ appEnv: config.appEnv, sink: writeToConsole });
  const locale = createLocaleStore(resolveDesktopLocale({ profileLocale: undefined, languages: args.languages }));
  // The port navigates through the router created below; views only navigate after the first render.
  const routerRef: { current?: AppRouter } = {};
  const routerPort = createDesktopRouterAdapter({
    navigate: (target) => (routerRef.current === undefined ? Promise.reject(new Error("desktop router is not ready")) : routerRef.current.navigate(target)),
    switchLocale: locale.set,
    reportError,
  });
  const auth = args.auth ?? createFirebaseAuthClient(config);
  const fetch: FetchLike = args.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const sessionBridge =
    args.sessionBridge ??
    createDesktopSessionBridge({
      apiBaseUrl: config.apiBaseUrl,
      fetch,
      secureStore: selectSecureStore({ scope: args.scope ?? globalThis, native: () => createTauriSecureStore() }),
      getIdToken: auth.getIdToken,
      reportError,
    });
  const client = createClientApp({
    config,
    modules: DESKTOP_MODULES,
    adapters: {
      auth,
      router: routerPort,
      sessionBridge,
      platform: { kind: "desktop", apiBaseUrl: config.apiBaseUrl },
      fetch,
      reportError,
    },
  });
  const sidebar = { defaultOpen: readSidebarOpen(args.storage), persist: (open: boolean) => writeSidebarOpen(args.storage, open) };
  const router = createAppRouter({ app: { ClientApp: client.ClientApp, locale, sidebar }, history: args.history });
  routerRef.current = router;
  return { router };
};
