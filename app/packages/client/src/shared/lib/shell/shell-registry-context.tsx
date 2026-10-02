"use client";

import { createContext, use, type ReactNode } from "react";
import type { ModuleRegistry, NavigationRegistry, ShellSlots } from "./shell-types.ts";

type ShellRegistries = { readonly modules: ModuleRegistry; readonly navigation: NavigationRegistry; readonly slots: ShellSlots };

const ShellRegistryContext = createContext<ShellRegistries | null>(null);

/** Mounted by the app shell with the registries it built once (never per render). */
export function ShellRegistryProvider({ registries, children }: { registries: ShellRegistries; children: ReactNode }) {
  return <ShellRegistryContext value={registries}>{children}</ShellRegistryContext>;
}

const useRegistries = (): ShellRegistries => {
  const registries = use(ShellRegistryContext);
  if (registries === null) throw new Error("shell registries are only available inside the app shell (ClientApp)");
  return registries;
};

/**
 * The installed client modules (pages, messages, manifests).
 * @throws {Error} outside the app shell (a composition bug).
 */
export const useModuleRegistry = (): ModuleRegistry => useRegistries().modules;

/** The installed client modules, or `null` outside the app shell (labels then use the core catalogs only). */
export const useOptionalModuleRegistry = (): ModuleRegistry | null => use(ShellRegistryContext)?.modules ?? null;

/**
 * Core and module navigation items per slot, filtered with `visibleItems(slot, can)`.
 * @throws {Error} outside the app shell (a composition bug).
 */
export const useNavigationRegistry = (): NavigationRegistry => useRegistries().navigation;

/**
 * Content contributed to fixed shell places (the right panel).
 * @throws {Error} outside the app shell (a composition bug).
 */
export const useShellSlots = (): ShellSlots => useRegistries().slots;
