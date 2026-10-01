# @core/desktop

Tauri 2 desktop shell with Vite, React 19 and TanStack Router. It renders the
same user area as the web app from the shared FSD client (`@core/client`): the
routes in `src/routes/` mirror the shared route map without a locale segment and
without `/admin` (web only), and every route file renders a shared view. It
calls the web `/v1` API on its own origin.

## When to use

- **Routes:** one thin file per route id of `@core/client/shared/lib/router`
  (decision 0012). Module pages need no route file: the catch-all
  `o/$organizationId/p/$projectId/m/$moduleId/$.tsx` resolves them from the
  module registry. Installed modules are listed in `src/modules.ts` only.
- **Composition:** `src/app/create-desktop-runtime.ts` builds the shared client
  (`createClientApp`) with the desktop adapters in `src/adapters/` (TanStack
  router port, locale, client config, error reporter, secure store selection)
  and the TanStack router. The root route guards the user area from the session
  state and wraps it in the shared `AppLayout`.
- **Language:** profile preference, else `navigator.languages`, else pt-BR;
  switching re-renders the intl provider (no URL change).
- **Env:** `src/config/desktop-env.schema.ts` validates `VITE_*` at build and at
  start (fail closed): `VITE_API_URL`, `VITE_APP_ENV`, `VITE_FIREBASE_API_KEY`,
  `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
  `VITE_AUTH_EMULATOR_URL` (local only) and `VITE_MFA_FACTORS` (`totp,phone`).
  The Tauri CSP `connect-src` (API, Firebase Auth, emulator in local) is derived
  from the same values by `scripts/write-tauri-api-config.ts`.
- **Session (decision 0017):** the Firebase ID token lives in memory only. After an
  interactive sign-in `src/adapters/desktop-session-bridge.ts` creates an SP1
  desktop session (`POST /v1/me/desktop-sessions`) and keeps `{ sessionId, secret }`
  in the secure store; on start it exchanges the secret
  (`POST /v1/desktop-sessions/exchange`, no Bearer), stores the rotated secret and
  signs in with the custom token; a 401 forgets the record, a network failure keeps
  it for the next start. Sign-out revokes the session
  (`DELETE /v1/me/sessions/{id}`) and always deletes the entry.
- **Secure store:** inside Tauri, `src/adapters/tauri-secure-store.ts` calls the app
  commands `secure_store_get|set|delete` (`src-tauri/src/secure_store.rs`, crate
  `keyring`): one OS keychain entry, service = the bundle `identifier`
  (`dev.core.desktop`), account `desktop-session` (Windows Credential Manager:
  generic credential `desktop-session.dev.core.desktop`). The commands are granted to
  window `main` only by `src-tauri/permissions/secure-store.toml` (set
  `allow-secure-store`) in `capabilities/default.json`; declaring app permissions turns
  on Tauri's ACL for app commands, so a new command must be granted there too. Errors
  are stable codes (`SECURE_STORE_UNAVAILABLE|FAILED|INVALID_ARGUMENT`), never the
  value. Without a keychain (Linux without Secret Service) sign-in still works but
  does not survive a restart.
- **Browser mode:** without `window.__TAURI_INTERNALS__` (plain Vite, Playwright)
  the secure store is in memory, so the same bridge runs but the session ends with
  the window.
- Change `identifier` in `src-tauri/tauri.conf.json` before shipping a derived app.

## How to run

Needs Rust through rustup (`src-tauri/rust-toolchain.toml` pins 1.98.1) and the
web app with the Emulator Suite (`WEB_PORT=3100 pnpm dev` from `app/`). The first
Rust build takes minutes.

```bash
pnpm dev:desktop             # from app/; same as pnpm -F desktop tauri:dev (window + Vite on 1420)
pnpm -F desktop dev          # Vite only, in the browser at http://localhost:1420/sign-in
VITE_API_URL=https://api.example.com VITE_APP_ENV=prod VITE_FIREBASE_API_KEY=... \
  VITE_FIREBASE_AUTH_DOMAIN=... VITE_FIREBASE_PROJECT_ID=... VITE_MFA_FACTORS=totp \
  pnpm -F desktop tauri:build   # release build
```

`.env.development` targets local development (`http://localhost:3100`, project
`demo-core`, Auth Emulator on `127.0.0.1:9099`); override in
`.env.development.local` (gitignored) or the shell.

## How to test

```bash
pnpm -F desktop test         # adapters, env, CSP patch, route tree, app composition (jsdom)
pnpm -F desktop lint
pnpm -F desktop typecheck
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml   # from app/
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml    # secure store validation, error codes, capability
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- --ignored   # real OS keychain round trip (test service name)
```

### Native smoke test (local only)

`pnpm -F @core/desktop test:native` (`test-native/wdio.conf.ts`, `test-native/user-area.e2e.ts`) drives the
real window with WebdriverIO and `@wdio/tauri-service` (`driverProvider: "external"`: the service
installs `tauri-driver` with cargo and manages the Edge WebDriver that matches WebView2 on
Windows; Linux needs `webkit2gtk-driver`). It signs in as `owner@demo.local`, checks the sidebar
(organization switcher) and `main`, checks the keychain entry on Windows (`cmdkey /list`) and
signs out (the entry is gone). It is not part of `pnpm test` nor `test:e2e`. Steps, from `app/`:

```bash
# 1. debug build with the e2e config embedded (web on 3100, e2e Auth Emulator on 9391)
VITE_API_URL=http://localhost:3100 VITE_APP_ENV=local VITE_FIREBASE_API_KEY=demo-api-key   VITE_FIREBASE_AUTH_DOMAIN=demo-core-e2e.firebaseapp.com VITE_FIREBASE_PROJECT_ID=demo-core-e2e   VITE_AUTH_EMULATOR_URL=http://127.0.0.1:9391 VITE_MFA_FACTORS=phone   sh -c 'pnpm -F @core/desktop tauri:config development && pnpm -F @core/desktop tauri build --debug --no-bundle --config src-tauri/tauri.api.conf.json'
# 2. the web build with the e2e public config (next start serves it in step 3)
pnpm test:e2e -- pnpm exec turbo run build --filter=@core/web --env-mode=loose
# 3. inside the e2e stack: seed (web setup project), serve the web, run the smoke
TAURI_DRIVER_PATH=<path to tauri-driver> pnpm test:e2e -- node scripts/native-smoke.ts
```

`TAURI_DRIVER_PATH` points at a tauri-driver you installed (`cargo install --locked --root <dir> tauri-driver`);
without it the service runs `cargo install tauri-driver` itself. `TAURI_APP_PATH` overrides the binary;
`NATIVE_SCREENSHOT_DIR` saves screenshots. The smoke writes, then removes, the real OS keychain entry of the app
(Windows: generic credential `desktop-session.dev.core.desktop`); a failed run's leftover entry is removed by the
spec's `after` hook. `scripts/native-smoke.ts` also stops the tauri-driver/msedgedriver processes the service
leaves running on Windows.

## References

- `../../docs/decisions/0012-routing-and-router-port.md`, `0017-desktop-session-secure-store-and-testing.md`
- `../../../docs/plans/2026-09-29-sp0-app-foundation/reports/spike-tauri.md`
