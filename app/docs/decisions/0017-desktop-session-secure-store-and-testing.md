# 0017. Desktop: keychain secure store, desktop session, native smoke test, `desktop-check` CI

- **Status:** accepted
- **Date:** 2026-09-29
- **Scope:** `app/apps/desktop` (TypeScript adapters and `src-tauri`), `app/packages/client/src/shared/lib/{secure-store,session-bridge}`, `.github/workflows/app-ci.yml` (local decision; the framework is unchanged)
- **Refines:** SP2 spec §11; SP1 spec §3.5 (desktop session); umbrella spec §16.2; follow-up #6

## Context

The desktop app signs in with the Firebase JS SDK in memory (SP1 decision 0007) and must survive restarts without keeping a Firebase refresh token in web storage (`rules/security.md` §2). SP1 provides a desktop session: `POST /v1/me/desktop-sessions` returns a 256-bit secret; `POST /v1/desktop-sessions/exchange` rotates it and returns a custom token. The secret needs an OS-protected store. The SP0 spike (`docs/plans/2026-09-29-sp0-app-foundation/reports/spike-tauri.md`) fixed the CSP and capabilities: no plugins, `core:default` only, no custom commands yet. Playwright cannot drive the Tauri shell, and CI never checked the Rust side (follow-up #6).

## Decision

1. **Secure store port** (`shared/lib/secure-store`): `get()`, `set(secret)`, `delete()`. Desktop adapter: three Tauri commands `secure_store_get|set|delete` in `src-tauri/src/secure_store.rs` backed by the `keyring` crate (4.2.0 measured 2026-09-29; re-measure, platform-native features: Windows Credential Manager, macOS Keychain, Secret Service on Linux), service = bundle identifier, account = `desktop-session`. Errors map to stable codes; the secret never appears in errors or logs. Granted by a dedicated capability (`permissions/secure-store.toml`, `allow-secure-store-*`) added to window `main` only. Browser mode (Vite without Tauri, detected by the absence of `window.__TAURI_INTERNALS__`) uses the in-memory store so the same UI runs in Playwright.
2. **Session bridge port** (`shared/lib/session-bridge`), desktop adapter: after the first sign-in create a desktop session and store the secret; on boot exchange it (`signInWithCustomToken`) and store the rotated secret; on sign-out revoke server-side and delete the keychain entry. The Firebase ID token stays in memory only.
3. **CSP (desktop):** `connect-src` adds the API origin (SP0 script), `https://identitytoolkit.googleapis.com`, `https://securetoken.googleapis.com` and, in development, the Auth Emulator origin. Whether sonner/Radix need `style-src 'unsafe-inline'` in builds is verified in SP2 Task 20 and recorded here as an amendment.
4. **Native smoke test:** WebdriverIO with `@wdio/tauri-service` (Tauri's documented path) launches the debug build, signs in as the seeded owner and asserts the user area renders. Local only (`pnpm -F @core/desktop test:native`); not part of `pnpm test` or turbo `test:e2e`. The desktop frontend is covered in CI by a Playwright `desktop-web` project against Vite.
5. **`desktop-check` CI job** (follow-up #6): ubuntu-24.04 with the Tauri apt dependencies, the toolchain from `rust-toolchain.toml`, cached `~/.cargo` and `src-tauri/target`, `vite build` with an `https` `VITE_API_URL`, then `cargo check --locked`. Actions pinned by SHA like the existing jobs.

## Consequences

- A stolen keychain secret is single-use: the exchange rotates it and reuse revokes the session (SP1).
- Linux desktop users need a Secret Service provider (GNOME Keyring, KWallet); without it sign-in works but the session does not persist, and the UI says so.
- The native smoke test is evidence gathered locally per release, not a CI gate; CI catches Rust compile regressions only.

## Alternatives rejected

- **Tauri `store`/`stronghold` plugins.** `store` is a plain file; `stronghold` needs its own password management and is heavier than the OS keychain.
- **Firebase refresh token in `localStorage`/IndexedDB persistence.** Forbidden by `rules/security.md` §2 and readable by any script in the webview.
- **Playwright against the native window.** Not supported for Tauri's WebView2/WKWebView shells.
