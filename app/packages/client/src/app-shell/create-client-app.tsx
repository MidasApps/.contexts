"use client";

import { loadMessages, type SupportedLocale } from "@core/i18n";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useCallback, useEffect, useMemo } from "react";
import type { IntlError } from "use-intl";
import type { StateStorage } from "zustand/middleware";
import { ProfileThemeSync } from "#/features/update-preferences/index.ts";
import { ApiProvider } from "#/shared/api/api-context.tsx";
import { type CallEndpoint, createEndpointCaller } from "#/shared/api/call-endpoint.ts";
import { createHttpClient, type FetchLike } from "#/shared/api/http-client.ts";
import { createQueryClient } from "#/shared/api/query-client.ts";
import type { ClientConfig } from "#/shared/config/client-config.schema.ts";
import { ClientConfigProvider } from "#/shared/config/config-context.tsx";
import { AuthProvider } from "#/shared/lib/auth/auth-context.tsx";
import type { AuthPort } from "#/shared/lib/auth/auth-port.ts";
import { ErrorReporterProvider } from "#/shared/lib/errors/error-reporter.tsx";
import { PlatformProvider } from "#/shared/lib/platform/platform-context.tsx";
import type { PlatformPort } from "#/shared/lib/platform/platform-port.ts";
import { RouterProvider } from "#/shared/lib/router/router-context.tsx";
import type { RouterPort } from "#/shared/lib/router/router-port.ts";
import type { SessionBridgePort } from "#/shared/lib/session-bridge/session-bridge-port.ts";
import { ShellRegistryProvider } from "#/shared/lib/shell/shell-registry-context.tsx";
import type {
  ClientModule,
  ModuleRegistry,
  NavigationRegistry,
  ShellNavItem,
  ShellSlots,
} from "#/shared/lib/shell/shell-types.ts";
import { ShellUiStoreProvider } from "#/shared/lib/shell/shell-ui-context.tsx";
import { ThemeProvider } from "#/shared/lib/theme/theme-provider.tsx";
import { TooltipProvider } from "#/shared/ui/atoms/Tooltip/Tooltip.tsx";
import { Toaster } from "#/shared/ui/molecules/Toaster/Toaster.tsx";
import { createModuleRegistry } from "./modules/module-registry.ts";
import { CORE_NAVIGATION } from "./navigation/core-navigation.ts";
import { createNavigationRegistry } from "./navigation/navigation-registry.ts";
import { RouteAnnouncer } from "./route-announcer.tsx";
import type { ReportError } from "./session/session-effects.ts";
import { SessionProvider } from "./session/session-provider.tsx";
import { ShellErrorBoundary } from "./shell-error-boundary.tsx";
import { ShellIntlProvider } from "./shell-intl-provider.tsx";
import { createShellUiStore, type PersistedShellUiStore } from "./shell-ui-store.ts";

/** Host-specific implementations of the client ports (SP2 spec §2.2). */
export type ClientAdapters = {
  readonly auth: AuthPort;
  readonly router: RouterPort;
  readonly sessionBridge: SessionBridgePort;
  readonly platform: PlatformPort;
  /** Defaults to the global `fetch`. */
  readonly fetch?: FetchLike | undefined;
  /** Where the shell reports failures it handles (the apps pass their logger); defaults to ignoring them. */
  readonly reportError?: ReportError | undefined;
  /** Missing-message handler; the runtime fallback is silent by design (decision 0013, `i18n:check` is the gate). */
  readonly onIntlError?: ((error: IntlError) => void) | undefined;
  /** Storage of the shell UI store; defaults to `localStorage`. */
  readonly shellUiStorage?: StateStorage | undefined;
  /** CSP nonce for the theme script on web (decision 0016). */
  readonly themeNonce?: string | undefined;
};

export type CreateClientAppArgs = {
  readonly config: ClientConfig;
  /** Installed modules, listed only in the apps (`apps/<app>/src/modules.ts`, decision 0015 §5). */
  readonly modules: readonly ClientModule[];
  readonly adapters: ClientAdapters;
  /** Extra navigation from core subprojects (SP4 chat, SP5 admin pages), same shape as core items. */
  readonly navigation?: readonly ShellNavItem[] | undefined;
  readonly slots?: ShellSlots | undefined;
};

export type ClientAppProps = { readonly locale: SupportedLocale; readonly children: ReactNode };

export type CreatedClientApp = {
  /** Root component: every provider the shared views expect, in dependency order. */
  readonly ClientApp: (props: ClientAppProps) => ReactNode;
  readonly queryClient: QueryClient;
  readonly callEndpoint: CallEndpoint;
  readonly modules: ModuleRegistry;
  readonly navigation: NavigationRegistry;
  readonly shellUi: PersistedShellUiStore;
};

const ignoreReport: ReportError = () => undefined;
const ignoreIntlError = (): void => undefined;

/**
 * Composition root of the shared client (SP2 Task 10): builds the registries, the query client,
 * the typed `/v1` caller and the shell UI store once, and returns the root component that mounts
 * Config → Platform → Router → Auth → Query → API → registries → shell UI → Session → Intl → Theme →
 * Tooltip → error boundary, plus the Toaster and (desktop) the route announcer.
 * @throws {ModuleRegistryError | NavigationRegistryError} for duplicate module or navigation ids.
 */
export const createClientApp = (args: CreateClientAppArgs): CreatedClientApp => {
  const { adapters } = args;
  const modules = createModuleRegistry(args.modules);
  const navigation = createNavigationRegistry([...CORE_NAVIGATION, ...(args.navigation ?? []), ...modules.navItems()]);
  const queryClient = createQueryClient();
  const connection = {
    baseUrl: args.config.apiBaseUrl,
    getIdToken: adapters.auth.getIdToken,
    fetch: adapters.fetch ?? ((input: string, init?: RequestInit) => globalThis.fetch(input, init)),
  };
  const http = createHttpClient(connection);
  const callEndpoint = createEndpointCaller(http);
  const shellUi = createShellUiStore(adapters.shellUiStorage);
  const registries = { modules, navigation, slots: args.slots ?? {} };
  const reportError = adapters.reportError ?? ignoreReport;

  function ClientApp({ locale, children }: ClientAppProps) {
    const messages = useMemo(() => loadMessages(locale, modules.messages()), [locale]);
    const resetShellUi = useCallback(() => shellUi.getState().reset(), []);
    useEffect(() => {
      Promise.resolve(shellUi.persist.rehydrate()).catch((error: unknown) =>
        reportError(error, { operation: "shell_ui_rehydrate" }),
      );
    }, []);
    return (
      <ClientConfigProvider config={args.config}>
        <PlatformProvider platform={adapters.platform}>
          <RouterProvider router={adapters.router}>
            <AuthProvider auth={adapters.auth}>
              <QueryClientProvider client={queryClient}>
                <ApiProvider callEndpoint={callEndpoint} connection={connection}>
                  <ShellRegistryProvider registries={registries}>
                    <ShellUiStoreProvider store={shellUi}>
                      <SessionProvider
                        sessionBridge={adapters.sessionBridge}
                        reportError={reportError}
                        onSignedOut={resetShellUi}
                      >
                        <ShellIntlProvider
                          locale={locale}
                          messages={messages}
                          onError={adapters.onIntlError ?? ignoreIntlError}
                        >
                          <ThemeProvider nonce={adapters.themeNonce} prePaintScript={adapters.platform.kind === "web"}>
                            <TooltipProvider>
                              <ErrorReporterProvider reportError={reportError}>
                                <ShellErrorBoundary reportError={reportError}>{children}</ShellErrorBoundary>
                              </ErrorReporterProvider>
                              <Toaster />
                              <ProfileThemeSync />
                              {adapters.platform.kind === "desktop" ? <RouteAnnouncer /> : null}
                            </TooltipProvider>
                          </ThemeProvider>
                        </ShellIntlProvider>
                      </SessionProvider>
                    </ShellUiStoreProvider>
                  </ShellRegistryProvider>
                </ApiProvider>
              </QueryClientProvider>
            </AuthProvider>
          </RouterProvider>
        </PlatformProvider>
      </ClientConfigProvider>
    );
  }

  return { ClientApp, queryClient, callEndpoint, modules, navigation, shellUi };
};
