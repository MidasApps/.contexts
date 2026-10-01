# SP2 Task 20 — Desktop wiring I (routes, i18n, providers, browser mode) — implementer report

- **Date:** 2026-09-30
- **Branch:** `feat/agentic-app-core-sp0`
- **Commits:** none. `git commit` for SP2 needs the user's permission (see `task-4-6.md`). Everything is in the
  working tree, verified and unstaged, on top of the uncommitted Tasks 4–17 work. Plan: [Commit plan](#commit-plan).
- **Review:** pending

Contexts read: `docs/plans/execution-constraints.md`, `using-ddc`, plan header + Global Constraints + Tasks 18–21,
SP2 spec §4, §10, §11, reports `task-4-6` … `task-17`, SP0 `task-10.md` (fail-closed env, CSP patch, Tauri config),
decisions 0012 and 0017 (and 0011, 0013–0016 as referenced), the desktop app (every file), `@core/client`
(`createClientApp`, `AppLayout`, router port + route map + `parseRoute` + memory router, session state, auth
(Firebase + fake), session-bridge, secure-store, platform, config schema, ThemeProvider, testing harness, views
index files), `@core/i18n` (`negotiateLocale`, `loadMessages`), the eslint/vitest presets, Tauri 2.12 config schema
(`dangerousDisableAssetCspModification`), TanStack Router location types, the sonner / next-themes / React sources
relevant to the CSP and script findings.

## What was built (`app/apps/desktop`)

- **Dependencies:** `@core/client`, `@core/i18n`, `@core/module-example`, `use-intl`, `@tanstack/react-query`;
  dev `tailwindcss`, `@tailwindcss/vite` (**new catalog entry 4.3.3**, measured with `npm view` 2026-09-30, latest;
  peers `vite ^8`), Testing Library (`react`, `dom`, `user-event`), `jsdom`. No `allowBuilds` change.
- **Vite/Tailwind:** `vite.config.ts` adds `tailwindcss()`; `src/styles.css` imports `@core/client/styles.css` and
  `@source "../../../modules/*/src"`. The client's `#/` subpath imports resolve under Vite (build OK). System font
  stack only (no font files).
- **Env** (`src/config/desktop-env.schema.ts`, fail closed at build and start): `VITE_API_URL`, `VITE_APP_ENV`,
  `VITE_FIREBASE_API_KEY|AUTH_DOMAIN|PROJECT_ID`, `VITE_AUTH_EMULATOR_URL` (loopback http origin, required in
  `local` and forbidden elsewhere), `VITE_MFA_FACTORS` (comma list of `totp|phone`); errors name variables only.
  `.env.development` now targets web on **3100** + emulator `demo-core`.
- **Adapters** (`src/adapters/`): `desktop-router-adapter.tsx` (router port over TanStack: hrefs/params from the
  shared route map, raw search strings, client-side `<a>` links, navigation failures reported, `switchLocale` →
  locale store), `desktop-locale.ts` (profile → `navigator.languages` best fit → pt-BR; tiny external store),
  `desktop-client-config.ts` (env → `ClientConfig`, API on its own origin), `desktop-secure-store.ts`
  (`isTauriShell` by `__TAURI_INTERNALS__`, `selectSecureStore`: memory in browser mode, native factory for Task 21),
  `desktop-report-error.ts` (structured JSON entry with name + code, never the message), `sidebar-state.ts`,
  `process-session-bridge.ts` (nothing persisted until Task 21). `src/router-search.ts`: plain `URLSearchParams`
  parse/stringify for TanStack (its JSON search parser would turn `?unit=123` into a number).
- **Composition:** `src/app/create-desktop-runtime.ts` (`createClientApp` with desktop adapters, platform
  `desktop`, `DESKTOP_MODULES` from `src/modules.ts` = `[exampleClientModule]`, then the TanStack router whose context
  carries the app); `src/app/desktop-root.tsx` (ClientApp in the current locale, `<html lang>` sync, profile-locale
  sync from `GET /v1/me`); `src/app/desktop-shell.tsx` (entry pages alone; the rest behind the session gate —
  `userAreaAccess`: booting/exchanging wait, signed-out/mfa → `/sign-in?next=`, signed-in → `AppLayout`).
- **Routes** (`src/routes/`): `__root.tsx` (`notFoundComponent: NotFoundView`), `sign-in`, `invite`, `index`,
  `organizations`, `o/$organizationId/index`, `o/$organizationId/p/$projectId/index`,
  `o/$organizationId/p/$projectId/m/$moduleId/$`, `o/$organizationId/settings/$section`,
  `o/$organizationId/settings/m/$moduleId`, `profile/$section`; section dispatch in `src/pages/section-views.tsx`
  (exhaustive switches, unknown → not found). `routeTree.gen.ts` regenerated. **SP0 health page removed** with
  `src/api/*`, `src/health/HealthStatus.tsx` and their test (no other user).
- `ConfigErrorScreen` now localized (`shell.configError.{title,description}` added to the three `shell.json`),
  own `IntlProvider`; `index.html` `lang="pt-BR"` + favicon (`public/favicon.png` = the 32×32 app icon; removes the
  SP0 favicon 404).
- **CSP** (`scripts/tauri-api-config.ts`, `src-tauri/tauri.conf.json`): `connect-src` patch = API + Firebase Auth
  origins (+ emulator when declared, i.e. local only); base `devCsp` port 3000 → 3100. **Finding:** release CSP
  `style-src 'self'` blocks sonner's and next-themes' injected `<style>` (4 violations on `/sign-in`, served from
  `dist` with the release CSP by a scratch server); Radix scroll lock injects computed `<style>` too, so hashes are
  not viable → `style-src 'self' 'unsafe-inline'` + `dangerousDisableAssetCspModification: ["style-src"]` (Tauri's
  nonce would otherwise cancel `'unsafe-inline'`); `script-src 'self'` unchanged, no script violation. Re-run: 0
  console messages. Recorded in decision 0017 ("Outcome of SP2 Task 20"), pinned by a test.
- **Client change (adapter-level):** `ThemeProvider` gets `prePaintScript` (default `true`); `createClientApp`
  passes `platform.kind === "web"`, so on desktop next-themes' script is a data block (`type="application/json"`)
  and React 19 no longer logs "Encountered a script tag". Test added in `theme.test.tsx`.
- `README.md` rewritten for the new structure, env and commands.

## TDD

- Written first and RED: `route-tree.test.tsx` (11 failed: `createAppRouter` signature / missing routes), then green.
  Env/CSP/build-env tests were rewritten before the schema/patch changes; adapter tests were written before their
  modules, but first ran after the implementations existed (green on first run). `desktop-app.test.tsx`
  (integration, real composition with fake auth, fake `/v1`, memory history) and `section-views.test.tsx` written with
  the implementation. One test fix: not-found detection uses "leaf match is `__root__`" (TanStack sets no
  `globalNotFound` on `load()` without rendering).
- Coverage: route tree (every non-admin route id incl. module root and deep tail → its desktop route; `/admin` not
  found), router adapter (hrefs, params incl. `rest` and fragment token, raw `?unit=123`, push/replace, link click,
  locale delegation, failure reporting), app (signed-out redirect with `next` + axe; signed-in organization page in
  `AppLayout` + axe + no reported error; `/admin` → not found; OS language then profile language + `lang`), env,
  CSP patch + regression, client config, locale, secure store selection, error reporter (no PII), sidebar storage,
  config error screen (+ axe).

## Verification (fresh, 2026-09-30)

```
$ pnpm -F @core/desktop test            Test Files 13 passed (13) · Tests 61 passed (61)
$ pnpm -F @core/desktop typecheck       tsc --noEmit (exit 0)
$ pnpm -F @core/desktop lint            eslint . (exit 0; React + a11y + hooks config now)
$ VITE_API_URL=https://api.example.com VITE_APP_ENV=staging VITE_FIREBASE_*=… VITE_MFA_FACTORS=totp pnpm -F @core/desktop build
                                        ✓ built in 11.93s (index JS 212.35 kB / gzip 67.34 kB; CSS 66.93 kB)
$ (same without VITE_API_URL)           InvalidDesktopEnvError: invalid environment: VITE_API_URL   (fail closed)
$ cargo check (src-tauri)               Finished `dev` profile in 36.04s
$ node scripts/write-tauri-api-config.ts development
  connect-src 'self' ipc: http://ipc.localhost http://localhost:3100 https://identitytoolkit.googleapis.com https://securetoken.googleapis.com http://127.0.0.1:9099
$ release dist served with the tauri.conf csp (scratch server, port 4817), Playwright /sign-in
  before: 4 × "Applying inline style violates … style-src 'self'" (sonner, next-themes) · after: 0 messages
$ pnpm -F @core/desktop dev (1420) + Playwright http://localhost:1420/sign-in
  heading "Entrar", e-mail/senha fields, skip link, toaster region; console: 0 errors, 0 warnings
  (first run: favicon 404 + React script-tag warning — both fixed above)
  /o/org-1 signed out → /sign-in?next=%2Fo%2Forg-1, lang=pt-BR
  screenshot: <scratchpad>/task-20-desktop-sign-in.png
$ pnpm -F @core/client typecheck && lint   exit 0 / exit 0
$ pnpm -F @core/client exec vitest run src/shared/lib/theme src/app-shell/create-client-app.test.tsx   7 passed
$ pnpm -F @core/client test             470 passed, 4 failed — all in views/profile-sessions (see Concerns 2)
$ pnpm i18n:check                       i18n:check ok (8 namespaces, 24 catalogs)
$ git diff --quiet main -- .contexts .claude && echo framework-ok      framework-ok
```

Processes started here (Vite 1420, scratch CSP server 4817) were stopped (Vite PID confirmed as this task's
`pnpm -F desktop dev` child before stopping); web on 3100 was not needed for the sign-in page (signed-out boot calls
no `/v1`), so it was not started. Port 3000 untouched.

## Commit plan

Apply **after** the plans in `task-4-6.md` … `task-17.md`. Stage only these paths/hunks (relative to `app/` unless
noted); every message ends with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

1. `feat(desktop): render the shared user area with tanstack router`
   - `apps/desktop/` — every change listed by `git status apps/desktop` (modified: `.env.development`, `README.md`,
     `eslint.config.js`, `index.html`, `package.json`, `scripts/{load-desktop-build-env.test.ts,tauri-api-config.ts,
     tauri-api-config.test.ts,write-tauri-api-config.ts}`, `src-tauri/tauri.conf.json`, `src/{ConfigErrorScreen.tsx,
     main.tsx,routeTree.gen.ts,router-context.ts,router.ts,styles.css}`, `src/config/desktop-env.schema{,.test}.ts`,
     `src/routes/{__root,index}.tsx`, `vite.config.ts`, `vitest.config.ts`; deleted: `src/api/*`,
     `src/health/HealthStatus.tsx`; new: `public/favicon.png`, `src/ConfigErrorScreen.test.tsx`, `src/adapters/`,
     `src/app/`, `src/modules.ts`, `src/pages/`, `src/route-tree.test.tsx`, `src/router-search.ts`,
     `src/routes/{sign-in,invite,organizations}.tsx`, `src/routes/o/`, `src/routes/profile/`, `src/testing/`).
     Not `dist/`, `.tscache/`, `.turbo/`, `src-tauri/target`, `src-tauri/gen`, `src-tauri/tauri.api.conf.json`.
   - `packages/i18n/src/messages/{pt-BR,en-US,es-419}/shell.json` — only the `configError` block (the files are
     untracked from earlier SP2 tasks; commit them in their own commit first, then this hunk)
   - `packages/client/src/shared/lib/theme/{theme-provider.tsx,theme.test.tsx}` (`prePaintScript` + its test) and
     `packages/client/src/app-shell/create-client-app.tsx` (the `prePaintScript={adapters.platform.kind === "web"}`
     attribute) — both files are untracked from Tasks 8/10: commit this hunk after those commits
   - `pnpm-workspace.yaml` hunk `"@tailwindcss/vite": 4.3.3 # desktop (Vite) Tailwind plugin`
   - `pnpm-lock.yaml` hunks: catalog `'@tailwindcss/vite'`, importer `apps/desktop` (new dependencies and
     devDependencies), packages/snapshots `'@tailwindcss/vite@4.3.3'` (+ its `@tailwindcss/node`/`oxide` references if
     not already present from web Task 18's `@tailwindcss/postcss`). Web Task 18 installed concurrently; its
     `@tailwindcss/postcss`, `next-intl`, `@parcel/watcher`/`@swc/core` hunks are not mine
   - `docs/decisions/0017-desktop-session-secure-store-and-testing.md` ("Outcome of SP2 Task 20")
2. `docs(desktop): record sp2 task 20 progress and report` — (repo root)
   `docs/plans/2026-09-29-sp2-app-shell-ui/progress.md` (the Task 20 line; update with the SHA),
   `docs/plans/2026-09-29-sp2-app-shell-ui/reports/task-20.md`.

## Concerns

1. **No commits** (permission); see the plan. The lockfile and `pnpm-workspace.yaml` were also changed concurrently by
   web Task 18 (briefly left with a duplicate `allowBuilds` key by that install; fixed by its owner).
2. **`@core/client` `views/profile-sessions` tests fail (4)** independently of this task: they fail with my client
   change reverted too; `packages/contracts/src/contracts/identity/session.schema.ts` was modified at 07:39 by the
   concurrent SP1 work, and the fake sessions no longer render. Owner: SP1 / the Task 14 view.
3. **`style-src 'unsafe-inline'` in release builds** (decision 0017 amendment): needed by sonner, next-themes and
   Radix scroll lock; scripts stay strict. Revisit if those libraries gain nonce support usable in a Tauri webview.
4. **Session does not survive restarts yet** (process-only bridge): Task 21 replaces
   `adapters/process-session-bridge.ts` with the keychain-backed desktop session and passes `native` to
   `selectSecureStore`.
5. **Desktop build now needs the full public env** (`VITE_APP_ENV`, Firebase trio, `VITE_MFA_FACTORS`): the
   `desktop-check` CI job (Task 24) must set them along with the https `VITE_API_URL`.
6. The desktop client logs to the webview console (structured, no messages/PII) until a log transport exists;
   the only `no-console` exception is in `create-desktop-runtime.ts`.
7. Playwright MCP wrote its snapshots/logs to `C:\Projetos\.contexts\.playwright-mcp\` (untracked); the screenshot
   was moved to the scratchpad. That folder can be deleted.
