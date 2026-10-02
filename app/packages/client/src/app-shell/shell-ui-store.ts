import { z } from "zod";
import { createStore, type Mutate, type StoreApi } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { ShellUiState } from "#/shared/lib/shell/shell-ui-context.tsx";

/** The shell UI store with its `persist` API (`rehydrate` after mount). */
export type PersistedShellUiStore = Mutate<StoreApi<ShellUiState>, [["zustand/persist", unknown]]>;

export const SHELL_UI_STORAGE_KEY = "core.shell-ui";
export const MAX_RECENTS = 5;
const STORAGE_VERSION = 1;

// Storage is outside the trust boundary: a persisted value is parsed before it replaces state.
const PersistedShellUiSchema = z.object({ recents: z.array(z.string().min(1).max(200)).max(MAX_RECENTS) });

const browserStorage = (): StateStorage => globalThis.localStorage;

const rememberedPanel = (
  current: Readonly<Record<string, string>>,
  key: string,
  value: string | undefined,
): Readonly<Record<string, string>> => {
  const { [key]: _forgotten, ...rest } = current;
  return value === undefined ? rest : { ...rest, [key]: value };
};

/**
 * The shell UI store (decision 0011 §5; rules/state-management.md §14–§15): command palette
 * recents, persisted with `partialize` and a version, and the right panel's memory (in memory
 * only, decision 0048), hydrated manually after mount
 * (`skipHydration`, so server renders never read storage), with `reset` for sign-out.
 * @param storage defaults to `localStorage`; tests pass an in-memory one.
 */
export const createShellUiStore = (storage: StateStorage = browserStorage()): PersistedShellUiStore =>
  createStore<ShellUiState>()(
    persist(
      (set) => ({
        recents: [],
        addRecent: (commandId) =>
          set((state) => ({
            recents: [commandId, ...state.recents.filter((id) => id !== commandId)].slice(0, MAX_RECENTS),
          })),
        rightPanel: {},
        rememberRightPanel: (key, value) =>
          set((state) => ({ rightPanel: rememberedPanel(state.rightPanel, key, value) })),
        reset: () => set({ recents: [], rightPanel: {} }),
      }),
      {
        name: SHELL_UI_STORAGE_KEY,
        version: STORAGE_VERSION,
        storage: createJSONStorage(() => storage),
        partialize: (state) => ({ recents: state.recents }),
        // No older shape exists yet; anything from another version starts empty.
        migrate: () => ({ recents: [] }),
        merge: (persisted, current) => {
          const parsed = PersistedShellUiSchema.safeParse(persisted);
          return parsed.success ? { ...current, recents: parsed.data.recents } : current;
        },
        skipHydration: true,
      },
    ),
  );
