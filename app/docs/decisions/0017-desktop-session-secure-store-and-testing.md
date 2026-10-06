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

## Outcome of SP2 Task 20 (2026-09-30)

- **`style-src 'unsafe-inline'` is needed in builds; `script-src` stays `'self'`.** Evidence: the release bundle
  served with the base `csp` of `tauri.conf.json` (`style-src 'self'`) logged four CSP violations on `/sign-in`:
  sonner injects its stylesheet as a `<style>` element at import time and next-themes injects one
  (`disableTransitionOnChange`) when it applies the theme; Radix's scroll lock (`react-remove-scroll`) injects
  `<style>` elements with computed values when a dialog or sheet opens, so hashes cannot cover it. With
  `style-src 'self' 'unsafe-inline'` the same page logs no violation, and no script violation appeared under the
  strict `script-src`. Tauri adds nonces/hashes to the directives it rewrites, and a nonce makes browsers ignore
  `'unsafe-inline'`, so `dangerousDisableAssetCspModification: ["style-src"]` turns that off for styles only;
  scripts keep Tauri's protection. Risk accepted: an injection can restyle the page (CSS-based exfiltration needs
  an injection point first, and `connect-src`/`img-src` stay closed to foreign origins). A regression test in
  `scripts/tauri-api-config.test.ts` pins both directives. Fonts: the tokens use the system stack, so
  `font-src 'self'` suffices.
- **`connect-src`** (generated patch): API origin + `https://identitytoolkit.googleapis.com` +
  `https://securetoken.googleapis.com`, plus the Auth Emulator origin whenever the env declares one — the desktop
  env schema allows `VITE_AUTH_EMULATOR_URL` only with `VITE_APP_ENV=local` (loopback http origin), so remote
  builds never carry it.
- **Client-rendered theme script:** the shared `ThemeProvider` takes `prePaintScript`; the app shell passes
  `false` on desktop so next-themes' pre-paint script (useful only in server-rendered HTML) is a data block
  instead of a script React warns about.
- **Session until Task 21:** the desktop passes a process-only session bridge (nothing persisted; every start is
  signed out) and `selectSecureStore` (memory in browser mode, native factory in Tauri once Task 21 provides it).

## Outcome of SP2 Task 21 (2026-09-30)

- **Crate:** `keyring = "=4.2.0"` (crates.io, latest stable on 2026-09-30) with its default feature `v1`, which
  is exactly the platform-native set (Windows Credential Manager, macOS Keychain, Secret Service over zbus). The
  4.x line recommends `keyring-core` + chosen stores for apps that need more; one entry on the native store is all
  we need, so the all-in-one crate stays. `serde` is pinned to the version tauri already resolves.
- **Commands and ACL:** `secure_store_get|set|delete` (`#[tauri::command(async)]`, off the main thread because
  Secret Service and Keychain prompts can block). Permissions are hand-written in
  `src-tauri/permissions/secure-store.toml` (`allow-secure-store-get|set|delete` + set `allow-secure-store`)
  instead of `AppManifest::commands` (which would generate identically named files under
  `permissions/autogenerated`). Having any app permission makes Tauri enforce the ACL on app commands
  (`has_app_acl_manifest`), so the capability grant is real, not decorative. A Rust test pins the capability.
- **Stored value:** the port still holds one string; the desktop stores the JSON record
  `{ v: 1, sessionId, secret }` (schema `desktop-session-record.schema.ts`), because sign-out needs the session
  id for `DELETE /v1/me/sessions/{id}` and the exchange does not return it. The Rust side accepts 1–1024 bytes of
  printable ASCII only (`SECURE_STORE_INVALID_ARGUMENT` otherwise).
- **Error codes:** native `SECURE_STORE_UNAVAILABLE` (no store, no access, platform failure),
  `SECURE_STORE_FAILED`, `SECURE_STORE_INVALID_ARGUMENT`; the TS adapter keeps the port's two codes
  (`UNAVAILABLE`, everything else `FAILED`). Neither side copies a keychain payload or the command arguments into
  an error.
- **Bridge behavior:** the rotated secret is written before the custom token is used; a 401 on exchange deletes the
  record; transient failures keep it (a response lost after the server rotated makes the next exchange a reuse, which
  revokes the session: the user signs in again). A record left from an earlier session is revoked after a new
  sign-in. With `SECURE_STORE_UNAVAILABLE` the sign-in succeeds without persistence, the unstored session is
  revoked and the failure is reported (`desktop_session_store`); a visible hint in the UI is not part of Task 21.
