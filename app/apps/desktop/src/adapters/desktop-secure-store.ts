import { createMemorySecureStore, type SecureStorePort } from "@core/client/shared/lib/secure-store";

/** `true` inside the Tauri webview: Tauri 2 injects `window.__TAURI_INTERNALS__` before any script runs. */
export const isTauriShell = (scope: object): boolean => "__TAURI_INTERNALS__" in scope;

/**
 * The secure store of the desktop session secret (decision 0017 §1): the OS keychain inside Tauri,
 * memory in browser mode (Vite without Tauri, Playwright), so the same UI runs in both. The native
 * factory is `createTauriSecureStore` (the `secure_store_*` commands); without it, or outside Tauri,
 * the record lives in memory, which only means the session does not survive a restart.
 */
export const selectSecureStore = (args: { scope: object; native?: (() => SecureStorePort) | undefined }): SecureStorePort =>
  isTauriShell(args.scope) && args.native !== undefined ? args.native() : createMemorySecureStore();
