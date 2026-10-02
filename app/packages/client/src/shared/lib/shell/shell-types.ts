import type { ContractDefinition, ModuleManifest, NavSlot, Permission } from "@core/contracts";
import type { ExtraNamespaces } from "@core/i18n";
import type { ComponentType, LazyExoticComponent } from "react";
import type { ProfileSection, SettingsSection } from "#/shared/lib/router/route-paths.ts";
import type { IconName } from "#/shared/ui/atoms/Icon/icon-registry.ts";

// Shapes of the app shell's registries (decision 0015). They live in `shared` so widgets, views and
// features can read the registries the app layer builds (FSD: lower layers never import `app-shell`).

/** Where a navigation item leads; resolved to a route in the current context by `navItemRoute`. */
export type NavTarget =
  | { readonly kind: "organization-home" }
  | { readonly kind: "project-home" }
  | { readonly kind: "chat" }
  | { readonly kind: "settings"; readonly section: SettingsSection }
  | { readonly kind: "profile"; readonly section: ProfileSection }
  | { readonly kind: "admin"; readonly rest: string }
  | { readonly kind: "module"; readonly moduleId: string; readonly path: string }
  | { readonly kind: "settings-module"; readonly moduleId: string };

/**
 * One entry of the shell navigation (decision 0015 §2): core items, module items and later SP4/SP5
 * contributions share this shape, so every slot is filtered by `can(permission)` the same way.
 */
export type ShellNavItem = {
  /** Globally unique: `core.<area>.<name>` or `<moduleId>.<itemId>`. */
  readonly id: string;
  readonly slot: NavSlot;
  readonly labelKey: string;
  readonly icon: IconName;
  /** Shown only when `can(permission)` at the current node; absent = always shown in its slot. */
  readonly permission?: Permission | undefined;
  readonly order: number;
  readonly target: NavTarget;
  /**
   * Heading the item sits under in the settings nav and the admin sidebar: a key of
   * `shell.nav.groups` (decision 0054). Items without one (module contributions) go under
   * "other", after the grouped ones.
   */
  readonly group?: NavGroup | undefined;
};

/** Headings of the settings and admin navigation, in the order they appear (decision 0054). */
export const NAV_GROUPS = ["organization", "access", "customers", "ai", "operations", "other"] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

export type NavigationRegistry = {
  /** Items of a slot the viewer may see, by `order` then `id`. */
  readonly visibleItems: (slot: NavSlot, can: (permission: Permission) => boolean) => readonly ShellNavItem[];
};

/** What a module page receives: its module id and the `:params` of its page key. */
export type ModulePageProps = { readonly moduleId: string; readonly params: Readonly<Record<string, string>> };

/** Loads a page on first visit (code-split per page, SP2 spec §4). */
export type ModulePageLoader = () => Promise<{ default: ComponentType<ModulePageProps> }>;

/** A module as the client knows it: the data-only manifest plus lazy pages keyed by rest path. */
export type ClientModule = {
  readonly manifest: ModuleManifest;
  /** Page key → loader, e.g. `""` (module root) or `items/:itemId`. */
  readonly pages: Readonly<Record<string, ModulePageLoader>>;
  /**
   * Command and entity contracts the client renders forms for (chat `renderForm`, decision 0032);
   * ids start with the module id.
   */
  readonly contracts?: readonly ContractDefinition[] | undefined;
  /** One `React.lazy` per page key, created once so renders never re-create them. */
  readonly lazyPages: Readonly<Record<string, LazyExoticComponent<ComponentType<ModulePageProps>>>>;
};

/** A matched module page: its key, the lazy component and the `:params`. */
export type ResolvedModulePage = {
  readonly key: string;
  readonly Page: LazyExoticComponent<ComponentType<ModulePageProps>>;
  readonly params: Readonly<Record<string, string>>;
};

export type ModuleRegistry = {
  readonly list: () => readonly ClientModule[];
  readonly get: (moduleId: string) => ClientModule | undefined;
  /** Module catalogs keyed by module id, for `loadMessages(locale, extra)`. */
  readonly messages: () => ExtraNamespaces;
  /** The page for `/m/:moduleId/<rest>` (`rest` decoded, `""` for the root), or `null` (not found). */
  readonly resolvePage: (moduleId: string, rest: string) => ResolvedModulePage | null;
  /** Contracts of every module, for forms rendered from a contract id. */
  readonly contracts: () => readonly ContractDefinition[];
  /** Module navigation plus one settings entry per module with settings, as shell items. */
  readonly navItems: () => readonly ShellNavItem[];
};

/** Content the app contributes to fixed places of the shell (SP4 mounts chat in `rightPanel`). */
export type ShellSlots = {
  readonly rightPanel?: ComponentType | undefined;
  /**
   * A hook that says whether the right panel applies to the current page and viewer (the chat:
   * inside a project, with the permission, not on the chat page). Absent = always.
   */
  readonly useRightPanelAvailable?: (() => boolean) | undefined;
};
