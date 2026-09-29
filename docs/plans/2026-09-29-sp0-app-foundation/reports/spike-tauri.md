# SP0 spike: Tauri 2 desktop shell

Date: 2026-09-29 · Branch: `feat/agentic-app-core-sp0` · Host: Windows 11 Home 10.0.26200 (x64), WebView2 preinstalled,
"Ferramentas de Build do Visual Studio 2022" + VS Community 2022 present (MSVC linker OK).

## Versions (measured 2026-09-29)

| Item | Measured with | Latest stable | Pinned |
|---|---|---|---|
| `@tauri-apps/cli`, `@tauri-apps/api` | `npm view` | 2.12.0 | 2.12.0 (`catalog:`) |
| crate `tauri` | crates.io API (`cargo search` shows only `3.0.0-alpha.3`) | 2.12.0 (MSRV 1.90) | `=2.12.0` |
| crate `tauri-build` | crates.io API | 2.7.0 (MSRV 1.90) | `=2.7.0` |
| vite | `npm view` | 8.3.1 | 8.3.1 |
| `@vitejs/plugin-react` | `npm view` | 6.1.1 (peer `vite ^8`) | 6.1.1 |
| `@tanstack/react-router` | `npm view` | 1.170.40 (peer React ≥18) | 1.170.40 |
| `@tanstack/router-plugin` | `npm view` | 1.168.41 (peer `@tanstack/react-router ^1.170.40`, vite ≥5) | 1.168.41 |
| react / react-dom | `npm view` | 19.3.0 | 19.3.0 (existing catalog) |
| Rust | `rust-toolchain.toml` | 1.98.1 | `channel = "1.98.1"` |

Tauri 3 is in alpha on crates.io (`3.0.0-alpha.0..3`, MSRV 1.95); `cargo search tauri` lists the alpha first, so versions
must be read from the crates.io versions API, not `cargo search`. Resolved transitive crates of note (Cargo.lock):
`tauri-runtime-wry 2.12.0`, `tao 0.37.1`, `webview2-com 0.39.1`.

## Rust toolchain behavior

- The global default is `stable` = 1.95.0. `src-tauri/rust-toolchain.toml` (`1.98.1`, profile minimal + clippy/rustfmt)
  makes `cargo`/`tauri` inside `src-tauri` use 1.98.1: `rustc 1.98.1 (48a229cea 2026-09-01)`, `cargo 1.98.1`.
- 1.98.1 was already installed on this machine (`rustup toolchain list`), so no download happened in this run. On a fresh
  machine rustup installs it on the first cargo call in that directory (user-level, `~/.rustup`); CI must do the same
  (`dtolnay/rust-toolchain` or plain `rustup show` in `src-tauri`).
- The only compiler warning is `linker_messages`: MSVC `link.exe` prints (localized) "Criando biblioteca ...dll.lib e
  objeto ...dll.exp" when linking the `cdylib`. Harmless; it comes from `crate-type = ["staticlib","cdylib","rlib"]`,
  which mobile needs.

## Build times and sizes (this machine, cold registry cache for tauri crates)

| Step | Time | Output |
|---|---|---|
| `pnpm -F desktop build` (vite 8, 211 modules) | 1.2 s (4.4 s wall) | `dist/` 366 KB; JS 367.8 KB (116.8 KB gzip) + lazy route chunk 0.76 KB, CSS 0.24 KB |
| `cargo check` (first, 346 crates) | 3 min 58 s | |
| `pnpm tauri:build --debug --no-bundle` | 5 min 15 s | `target/debug/core-desktop.exe` 12.4 MB |
| `pnpm tauri:dev` incremental rebuild (after the debug build) | 1 min 31 s | window opens |
| `pnpm tauri:build --no-bundle` (release, default profile) | 10 min 21 s | `target/release/core-desktop.exe` 8.4 MB |
| disk | | `src-tauri/target` 5.2 GB (debug + release); `~/.cargo/registry` 592 MB |

Installers (MSI/NSIS, `bundle.active: true`, `targets: "all"`) were not built: the bundler downloads WiX/NSIS on first
use and that belongs to the release pipeline (Task 11/SP-deploy). Not tuned: `[profile.release]` `lto`, `codegen-units = 1`,
`opt-level = "s"`, `strip`, `panic = "abort"` would shrink the exe further; measure before adopting.

## Security: CSP and capabilities

- `tauri.conf.json` `app.security.csp` (object form, Tauri appends its own nonces/hashes to bundled assets at compile time):
  `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self';
  connect-src 'self' ipc: http://ipc.localhost; object-src 'none'; base-uri 'self';
  form-action 'self'; frame-ancestors 'none'`. No `'unsafe-inline'`/`'unsafe-eval'` in builds; the UI uses no inline styles.
- `devCsp` differs only by `style-src 'self' 'unsafe-inline'` (Vite injects `<style>` for CSS HMR) and
  `ws://localhost:1420` (HMR socket) in `connect-src`. **Not verified** whether Tauri 2.12 enforces `devCsp` when the
  webview loads `devUrl` directly on desktop; the docs page on CSP does not say.
- `freezePrototype: true`; TanStack Router and React ran fine with it.
- **Configurable API origin (fail closed, after review):** the base release `csp` allows no API origin at all; only
  `devCsp` keeps `http://localhost:3000` so bare `pnpm tauri dev` works locally. `vite.config.ts` validates `VITE_API_URL`
  for the mode (same loader), so `vite build`/`tauri build` fail without a valid value.
  `scripts/write-tauri-api-config.ts [mode]` resolves `VITE_API_URL` exactly as Vite does for that mode (`loadEnv`: shell
  env > `.env.[mode].local` > `.env.[mode]`), validates it with the same Zod schema as the app, and writes
  `src-tauri/tauri.api.conf.json` (gitignored), an RFC 7396 merge patch that replaces only `connect-src` in `csp` and
  `devCsp`. `pnpm tauri:dev` / `pnpm tauri:build` pass it with `--config`. Verified: a build with
  `VITE_API_URL=https://api.example.com` bakes `connect-src 'self' ipc: http://ipc.localhost https://api.example.com`
  into the exe and no `localhost:3000`; a missing or non-https remote URL fails before compiling
  (`InvalidDesktopEnvError: invalid environment: VITE_API_URL`).
- Capabilities: `capabilities/default.json` grants `core:default` to window `main` only. That set is the core defaults
  (app/event/image/menu/path/resources/tray/webview/window read-mostly defaults); no shell, fs, http, dialog or opener
  plugin is installed or granted. No custom commands (`lib.rs` has no `invoke_handler`).
- Identifier `dev.core.desktop` (neutral; a derived app must change it before signing, it keys the OS data dir).

## API / CORS

The webview origin is `http://localhost:1420` in dev and `tauri://localhost` (macOS/Linux) or `http://tauri.localhost`
(Windows) in builds, so `/v1` calls are cross-origin. Web now applies `CORS_ALLOWED_ORIGINS` on `/v1` (see task-10
report). Proven: the Tauri dev window and the Vite page in Playwright both show `ok` against `next start` on 3100.

## Mobile (Android/iOS) later

- Already prepared: `[lib] crate-type = ["staticlib","cdylib","rlib"]`, `#[cfg_attr(mobile, tauri::mobile_entry_point)]`
  on `run()`, `src-tauri/gen/schemas/` ignored while `gen/android`/`gen/apple` stay versionable.
- Android needs: Android Studio SDK Platform, Platform-Tools, NDK (side by side), Build-Tools, Command-line Tools;
  `JAVA_HOME` + `ANDROID_HOME` (+ `NDK_HOME`); rustup targets `aarch64-linux-android armv7-linux-androideabi
  i686-linux-android x86_64-linux-android`; then `pnpm tauri android init`. This machine has Java 21 and
  `ANDROID_HOME` set, but only the `x86_64-pc-windows-msvc` target installed; not attempted.
- iOS needs macOS + full Xcode + CocoaPods, targets `aarch64-apple-ios x86_64-apple-ios aarch64-apple-ios-sim`
  (`pnpm tauri ios init`); impossible on this host.
- Vite for devices: the Tauri template binds `server.host` to `TAURI_DEV_HOST` and uses HMR port 1421 on mobile; add
  that when Android dev starts. `tauri icon` also generates Android/iOS icons; only desktop icons were committed.
- On Android the webview origin differs (`http://tauri.localhost`); the CORS allowlist and CSP must be rechecked there.

## FCM / App Check notes (input for Task 12)

- The official `notification` plugin (v2.tauri.app/plugin/notification) documents **local** notifications only
  (Windows installed apps, Linux, macOS, Android, iOS); nothing about FCM/APNs remote push. Remote push needs a
  community plugin or a custom mobile plugin (Kotlin `FirebaseMessagingService` / Swift APNs) exposed as a command.
- App Check: the Firebase JS SDK in the webview can only use reCAPTCHA providers, which expect a web origin; for native
  attestation (Play Integrity / App Attest) a native plugin would mint the token and pass it to JS or to `/v1`.
  Not investigated further; spec §14 item 5 stays open for Task 12.
- Desktop token storage (spec §16.2 secure-store port) is untouched, as planned.
