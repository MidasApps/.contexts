import { createMemorySecureStore } from "@core/client/shared/lib/secure-store";
import { describe, expect, it } from "vitest";
import { isTauriShell, selectSecureStore } from "./desktop-secure-store.ts";

describe("isTauriShell", () => {
  it("detects the Tauri webview by its injected internals", () => {
    expect(isTauriShell({ __TAURI_INTERNALS__: {} })).toBe(true);
    expect(isTauriShell({})).toBe(false);
  });
});

describe("selectSecureStore", () => {
  it("keeps the secret in memory in browser mode (Vite without Tauri, Playwright)", async () => {
    const store = selectSecureStore({ scope: {}, native: () => createMemorySecureStore("native") });

    await expect(store.get()).resolves.toBeNull();
  });

  it("uses the native OS keychain store inside Tauri", async () => {
    const store = selectSecureStore({ scope: { __TAURI_INTERNALS__: {} }, native: () => createMemorySecureStore("native") });

    await expect(store.get()).resolves.toBe("native");
  });
});
