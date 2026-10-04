// Public API of shared/lib/shell: what lower layers read from the app shell (registries, slots,
// UI store). The app shell (`@core/client/app-shell`) builds and provides them.
export { type NavContext, navItemRoute } from "./nav-item-route.ts";
export {
  ShellRegistryProvider,
  useModuleRegistry,
  useNavigationRegistry,
  useOptionalModuleRegistry,
  useShellSlots,
} from "./shell-registry-context.tsx";
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
export { type ShellUiState, type ShellUiStore, ShellUiStoreProvider, useShellUi } from "./shell-ui-context.tsx";
