import { describe, expect, it } from "vitest";
import type { StateStorage } from "zustand/middleware";
import { createShellUiStore, MAX_RECENTS, SHELL_UI_STORAGE_KEY } from "./shell-ui-store.ts";

const memoryStorage = (): StateStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value), removeItem: (key) => void data.delete(key) };
};

describe("shell UI store", () => {
  it("keeps recents most recent first, without duplicates, capped", () => {
    const store = createShellUiStore(memoryStorage());
    for (const id of ["a", "b", "a", "c", "d", "e", "f"]) store.getState().addRecent(id);
    expect(store.getState().recents).toEqual(["f", "e", "d", "c", "a"]);
    expect(store.getState().recents).toHaveLength(MAX_RECENTS);
  });

  it("persists only the recents, versioned, and rehydrates them", async () => {
    const storage = memoryStorage();
    createShellUiStore(storage).getState().addRecent("open-profile");
    expect(JSON.parse(storage.data.get(SHELL_UI_STORAGE_KEY) ?? "{}")).toEqual({ state: { recents: ["open-profile"] }, version: 1 });
    const next = createShellUiStore(storage);
    expect(next.getState().recents).toEqual([]);
    await next.persist.rehydrate();
    expect(next.getState().recents).toEqual(["open-profile"]);
  });

  it("drops persisted data of an unknown shape instead of trusting it", async () => {
    const storage = memoryStorage();
    storage.setItem(SHELL_UI_STORAGE_KEY, JSON.stringify({ state: { recents: [1, { x: 1 }] }, version: 1 }));
    const store = createShellUiStore(storage);
    await store.persist.rehydrate();
    expect(store.getState().recents).toEqual([]);
  });

  it("resets to the initial state", () => {
    const store = createShellUiStore(memoryStorage());
    store.getState().addRecent("a");
    store.getState().reset();
    expect(store.getState().recents).toEqual([]);
  });
});
