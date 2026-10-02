// Public API of shared/lib/shell: what lower layers read from the app shell (registries, slots,
// UI store). The app shell (`@core/client/app-shell`) builds and provides them.
export { navItemRoute, type NavContext } from "./nav-item-route.ts";
export { ShellRegistryProvider, useModuleRegistry, useNavigationRegistry, useOptionalModuleRegistry, useShellSlots } from "./shell-registry-context.tsx";
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
} from "./shell-types.ts";
export { ShellUiStoreProvider, useShellUi, type ShellUiState, type ShellUiStore } from "./shell-ui-context.tsx";
