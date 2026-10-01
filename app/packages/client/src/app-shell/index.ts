// Public API of the app shell (`@core/client/app-shell`, FSD "app" layer): the apps compose the
// client with `createClientApp` and declare modules with `defineClientModule` (decision 0015).
export {
  createClientApp,
  type ClientAdapters,
  type ClientAppProps,
  type CreateClientAppArgs,
  type CreatedClientApp,
} from "./create-client-app.tsx";
export { ClientModuleError, defineClientModule } from "./modules/define-client-module.ts";
export { createModuleRegistry, ModuleRegistryError } from "./modules/module-registry.ts";
export { AppLayout, type AppLayoutProps } from "./app-layout.tsx";
export { AdminLayout, type AdminLayoutProps } from "./admin-layout.tsx";
export { CORE_NAVIGATION } from "./navigation/core-navigation.ts";
export { createNavigationRegistry, NavigationRegistryError } from "./navigation/navigation-registry.ts";
export { OfflineBanner, useOnlineStatus } from "./offline-banner.tsx";
export { RouteAnnouncer } from "./route-announcer.tsx";
export type { ReportError } from "./session/session-effects.ts";
export { INITIAL_SESSION_STATE, sessionReducer, type SessionEvent } from "./session/session-machine.ts";
export { useCurrentNode } from "#/shared/lib/session/use-current-node.ts";
export { createShellUiStore, MAX_RECENTS, SHELL_UI_STORAGE_KEY, type PersistedShellUiStore } from "./shell-ui-store.ts";
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
