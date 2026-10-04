// Public API of the app shell (`@core/client/app-shell`, FSD "app" layer): the apps compose the
// client with `createClientApp` and declare modules with `defineClientModule` (decision 0015).

export { useCurrentNode } from "#/shared/lib/session/use-current-node.ts";
export type {
  ClientModule,
  ModulePageLoader,
  ModulePageProps,
  ModuleRegistry,
  NavigationRegistry,
  NavTarget,
  ResolvedModulePage,
  ShellNavItem,
  ShellSlots,
} from "#/shared/lib/shell/shell-types.ts";
export { AdminLayout, type AdminLayoutProps } from "./admin-layout.tsx";
export { AppLayout, type AppLayoutProps } from "./app-layout.tsx";
export {
  type ClientAdapters,
  type ClientAppProps,
  type CreateClientAppArgs,
  type CreatedClientApp,
  createClientApp,
} from "./create-client-app.tsx";
export { ClientModuleError, defineClientModule } from "./modules/define-client-module.ts";
export { createModuleRegistry, ModuleRegistryError } from "./modules/module-registry.ts";
export { CORE_NAVIGATION } from "./navigation/core-navigation.ts";
export { createNavigationRegistry, NavigationRegistryError } from "./navigation/navigation-registry.ts";
export { OfflineBanner, useOnlineStatus } from "./offline-banner.tsx";
export { RouteAnnouncer } from "./route-announcer.tsx";
export type { ReportError } from "./session/session-effects.ts";
export { INITIAL_SESSION_STATE, type SessionEvent, sessionReducer } from "./session/session-machine.ts";
export { createShellUiStore, MAX_RECENTS, type PersistedShellUiStore, SHELL_UI_STORAGE_KEY } from "./shell-ui-store.ts";
