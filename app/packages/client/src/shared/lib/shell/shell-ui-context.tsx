"use client";

import { createContext, use, type ReactNode } from "react";
import { useStore, type StoreApi } from "zustand";

/**
 * UI preferences without server origin (decision 0011 §5): command palette recents only.
 * Server data never goes here (rules/state-management.md §3).
 */
export type ShellUiState = {
  /** Command ids, most recent first. */
  readonly recents: readonly string[];
  readonly addRecent: (commandId: string) => void;
  /** Called on sign-out and tenant switch (rules/state-management.md §15). */
  readonly reset: () => void;
};

export type ShellUiStore = StoreApi<ShellUiState>;

const ShellUiContext = createContext<ShellUiStore | null>(null);

/** Mounted by the app shell with the store it created once per app instance. */
export function ShellUiStoreProvider({ store, children }: { store: ShellUiStore; children: ReactNode }) {
  return <ShellUiContext value={store}>{children}</ShellUiContext>;
}

/**
 * Reads the shell UI store with a selector (pass `useShallow` for objects).
 * @throws {Error} outside the app shell (a composition bug).
 * @example const recents = useShellUi((state) => state.recents);
 */
export const useShellUi = <T,>(selector: (state: ShellUiState) => T): T => {
  const store = use(ShellUiContext);
  if (store === null) throw new Error("useShellUi must be used inside the app shell (ClientApp)");
  return useStore(store, selector);
};
