# SP2 Task 24: native desktop smoke, `desktop-check` CI (#6), README, plus e2e UI fixes (implementer report)

- **Date:** 2026-09-30
- **Branch:** `feat/agentic-app-core-sp0`
- **Commits:** none. `git commit` for SP2 needs the user's permission. Everything is in the working tree, unstaged,
  on top of the uncommitted Tasks 4–23. See [Commit plan](#commit-plan).
- **Review:** pending
- **Gate report:** `sp2-gate.md` (the plan calls it `sp2-summary.md`; the brief asked for `sp2-gate.md`).

Contexts read: `docs/plans/execution-constraints.md`, `using-ddc`, plan header, Global Constraints and Task 24, SP2
spec (§4, §9, §11, §13), umbrella §13 SP2 row, reports `task-20.md`, `task-21.md` and `task-22-23.md`, decisions
0011–0018 and 0030 A5/A6, `.github/workflows/app-ci.yml`, SP0 follow-ups #6/#14/#21/#22, `@wdio/tauri-service` 1.4.0
docs (`configuration.md`, `edge-webdriver-windows.md`). Controller note: SP1 commit `1c359d2` (project-only member can
switch the organization; org-level context still 404).

## What was built

### UI fixes from the e2e run (`task-22-23.md` concerns 4–6) and the controller note

| Item | Change | Coverage |
|---|---|---|
| (a) Profile prefetch 404 | **Not reproducible** on the current **production** build (`next start`; Next prefetches only in production). `next dev` was not tried, because another agent's `next dev` (port 3101) runs from the same `apps/web` directory. A probe (production `next start` on 3102, e2e stack) logged every `rsc`/prefetch request and every 4xx: direct loads of all five sections on chromium, firefox, webkit and mobile-chrome in pt-BR and en-US, the account-menu path and clicking through the section nav. All prefetches (`/_tree` and `…/profile/$d$section/__PAGE__` segment requests) answered 200; sibling sections on a profile page are not re-prefetched at all (same route pattern, already in the segment cache). No route or prefetch change was made, because there was nothing to fix. The probe spec was deleted. | New regression e2e `profile.spec.ts` › "every profile section and its prefetches answer without a 404" (account menu → each section → each section loaded directly; asserts RSC requests happened and no 4xx). Passed on all 4 projects. |
| (b) Phone sheet stays open after switching | `useCloseMobileSidebarOnChange(key)` in `shared/ui/organisms/Sidebar/sidebar-context.tsx` closes the mobile sheet after the path changes (an effect, not in the click handler, so the switcher's menu finishes unmounting first). `AppSidebar` and `AdminSidebar` pass `useLocationPath()`. Search-only changes (`?unit=`) keep it open because the user stays on the same page. | Unit: `AppSidebar.test.tsx` (red first, then green) and `AdminSidebar.test.tsx`, phone `matchMedia`, open → navigate → dialog gone, axe. e2e: `shell.spec.ts` asserts the sheet is hidden after the organization switch, the project switch and a nav item; `admin.spec.ts` after moving to another area. The `closeSidebarSheet` doc comment now describes the new behavior. |
| (c) Invitation link lacks the locale | `features/invite-member/model/localize-accept-url.ts`: `<app>/invite#token=…` → `<app>/{locale}/invite#token=…` in the inviter's UI locale (`useLocale()`). It keeps the base path and the fragment, and returns links that already carry a locale (or are not accept links) unchanged, so a later server-side fix does not double it. Used in `InviteMemberDialog` for both what is shown and what is copied. The server (`services/access`, SP1-owned) is untouched, so the e-mailed link is still locale-less (follow-up #32). | Unit: `localize-accept-url.test.ts` (4 tests, red first), `SettingsInvitationsView.test.tsx` expects the localized link. e2e `settings.spec.ts`: the copied link matches `/pt-BR/invite#token=` and the invitee opens it directly. |
| (d) Project-only member (decision 0030 A5) | `OrganizationHomeView`: when the organization-level `GET /v1/me/context` answers 404, `EntryProjectRedirect` reads the member's visible projects (`GET …/projects` narrows to the grants) and `navigate(..., { replace: true })` to the first one. With no visible project it renders not-found; a non-404 list error renders the error state. The e2e seed world gains `member@demo.local` (same account as `pnpm seed:local`) with `member` on "Alpha Growth" only, joined through a project-level invitation. | Unit: two new `OrganizationHomeView` tests (redirect with `replace`; not-found without projects), and the hidden-organization case now also hides the list. e2e `shell.spec.ts` › "a project-only member lands on their project instead of the organization's not-found" (all 4 projects). |

### Native smoke (SP2 gate item 8)

- `apps/desktop/test-native/{wdio.conf.ts, user-area.e2e.ts, tsconfig.json}`. The config lives under `test-native/`
  (the plan says `apps/desktop/wdio.conf.ts`) so it has its own tsconfig with the wdio and mocha globals, which the
  app's program should not see. `@wdio/tauri-service` uses `driverProvider: "external"` (tauri-driver + Edge
  WebDriver managed by the service), so no test plugin is compiled into the app, and `appBinaryPath` points at the
  debug binary (`TAURI_APP_PATH` overrides it). `TAURI_DRIVER_PATH` points at an installed tauri-driver; without it,
  `autoInstallTauriDriver`. The spec signs in as `owner@demo.local` and asserts the organization switcher
  ("Alpha Org, trocar de organização"), `main` and the h1. On Windows it then checks that the keychain entry
  `desktop-session.dev.core.desktop` appears (`cmdkey /list`), signs out, and checks that the entry is gone. An
  `after` hook removes a leftover entry of a failed run. Screenshots go to `NATIVE_SCREENSHOT_DIR`.
- `scripts/native-smoke.ts` runs inside `pnpm test:e2e -- node scripts/native-smoke.ts`. It seeds (web `setup`
  project), starts `next start` on the e2e port and waits for `/v1/health`, runs `wdio`, then stops the web tree it
  spawned and the tauri-driver/msedgedriver processes that appeared during the run. Service 1.4.0 leaves those
  processes running on Windows. The cleanup never touches pre-existing PIDs.
- `scripts/src/e2e/e2e-env.ts`: e2e `CORS_ALLOWED_ORIGINS` now also allows `http://tauri.localhost` and
  `tauri://localhost` (test updated), so the native webview can call the e2e `/v1`.
- Desktop `test:native` script (not part of `pnpm test` / turbo `test:e2e`). `typecheck` also checks `test-native`.
- **Catalog** (measured with `npm view` 2026-09-30, all latest): `webdriverio`, `@wdio/cli`, `@wdio/local-runner`,
  `@wdio/mocha-framework` and `@wdio/spec-reporter` at 9.32.0, `@wdio/globals` 9.31.3 (its latest; there is no
  9.32.0 globals), and `@wdio/tauri-service` 1.4.0. All are older than the release-age window. `allowBuilds`:
  `edgedriver: false` and `geckodriver: false`, with a reason (their postinstall only pre-downloads a driver; the
  service fetches the matching one). tauri-driver 2.1.0 (crates.io latest) was installed into the session
  scratchpad (`cargo install --locked --root <scratchpad>/tauri-driver`), not globally.
- Build used: `tauri build --debug --no-bundle --config src-tauri/tauri.api.conf.json` with the e2e public env
  (API `http://localhost:3102`, Auth Emulator 9391, `demo-core-e2e`). The steps are in `apps/desktop/README.md`.

### `desktop-check` CI job (follow-up #6)

`.github/workflows/app-ci.yml` job `desktop-check` (ubuntu-24.04, 30 min):
1. checkout and setup-node, pinned like the other jobs;
2. the apt Tauri deps (`libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev libssl-dev`);
3. `rustup toolchain install` in `src-tauri`, which reads `rust-toolchain.toml` (no third-party toolchain action);
4. `actions/cache` v6.1.0 pinned to `55cc8345863c7cc4c66a329aec7e433d2d1c52a9` (SHA from `git ls-remote`) on
   `~/.cargo/registry/{index,cache}`, `~/.cargo/git/db` and `src-tauri/target`, keyed on the toolchain file and
   `Cargo.lock`;
5. pnpm install;
6. `pnpm -F @core/desktop build` with `VITE_API_URL=https://api.example.invalid`, `VITE_APP_ENV=staging`, a
   placeholder Firebase trio and `VITE_MFA_FACTORS=totp` (the full public env of task-20 concern 5; no emulator
   outside local);
7. `cargo check --locked`, with `working-directory: app/apps/desktop/src-tauri`. rustup resolves the toolchain
   file from the current directory, not from `--manifest-path`.

### Docs

- `app/README.md`: the layout lists every package (client, i18n, e2e, agents, modules/example) and the boundaries.
  New sections: "Client, UI and modules (SP2)", "i18n workflow", "Creating a module" (7 steps over
  `modules/example`, naming every composition file), e2e and native smoke under Tests, and the e2e ports. Step 4 of
  "Starting a new app" is fixed, and the SP2 plan is linked.
- `apps/desktop/README.md`: "Native smoke test (local only)".
- `docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md`: #6 done, #14 closed (decision 0018), new #32–#35. The
  plan's "module contracts in the generated catalog → SP3" follow-up is **not** added, because it is already done
  (`app/catalog.modules.ts` + `packages/contracts/scripts/catalog/module-contracts.ts`; `pnpm contracts:check` is
  green).

## TDD

- Red first: `AppSidebar` sheet test, `localize-accept-url.test.ts`, the updated `SettingsInvitationsView` link
  assertion. The `OrganizationHomeView` redirect tests were written before the view change but first run after it.
  The e2e specs were the failing tests for the integrated flows.
- The profile 404 (a) was investigated before any fix. The probe found no 404, so the new e2e is a regression guard
  and not a red test.

## Verification (fresh, 2026-09-30; machine shared with other agents' runs)

```
$ pnpm -F @core/client exec vitest run src/widgets/app-sidebar src/widgets/admin-sidebar src/shared/ui/organisms/Sidebar  12 passed
$ pnpm -F @core/client exec vitest run src/features/invite-member src/views/settings-invitations  8 passed
$ pnpm -F @core/client exec vitest run src/views/organization-home                           5 passed
$ pnpm -F @core/client test          531/533 (2 ProfilePreferencesView tests timed out at 5 s under load; 4/4 when run alone)
$ pnpm -F @core/scripts exec vitest run src/e2e                                              8 passed
$ pnpm lint / pnpm typecheck         13/13 tasks successful each
$ pnpm test:e2e (E2E_WEB_PORT=3102 E2E_DESKTOP_PORT=1421), final run: web 362 passed / 1 failed (webkit time-zone
  load timeout; 23/23 with --repeat-each 3 on webkit) / 2 skipped; desktop-web 4 passed. Details in sp2-gate.md
$ pnpm test:emulators                 5/5 tasks (services 168, functions 6, agents 6, mastra 7, scripts 2)
$ pnpm contracts:catalog / contracts:check / i18n:check   exit 0 / exit 0 / ok (9 namespaces, 27 catalogs)
$ actionlint 1.7.12 (release binary in the scratchpad) .github/workflows/app-ci.yml   exit 0 (no shellcheck on PATH)
$ desktop-check steps locally: VITE_* (staging placeholders) pnpm -F @core/desktop build → exit 0;
  cargo check --locked --manifest-path apps/desktop/src-tauri/Cargo.toml → Finished (exit 0)
$ native smoke: pnpm test:e2e -- node scripts/native-smoke.ts   runs 2, 3, 5 and 6 → "1 passing" (~3 min each);
  run 1 timed out at 180 s (probe overhead, see concern 3), run 4 hit a stale element on a click (fixed with
  clickWhenStable). After the final runs: 0 driver processes left, 0 keychain entries.
$ git diff --quiet main -- .contexts .claude && echo framework-ok   framework-ok
```

Native screenshots (run 6): `C:\Users\gsoar\AppData\Local\Temp\claude\C--Projetos--contexts\854228ec-4946-42fe-aa16-4591f19d5035\scratchpad\native\native-{1-sign-in,2-user-area,3-signed-out}.png`.
The user-area shot shows the real Tauri window: sidebar with "Alpha Org" switcher, project picker, organization
nav, account menu; topbar breadcrumbs and palette; `main` with the projects.

Processes: everything I started (e2e stacks, `next start` on 3102, the Tauri debug app, tauri-driver/msedgedriver)
was stopped. The two driver processes of runs 2–3 were stopped by PID after I checked they were my children. Ports
3000, 3101 and 1420 and other agents' processes were not touched.

## Commit plan

Apply **after** the plans of `task-4-6.md` … `task-22-23.md` (most files below are untracked from those tasks:
commit those first, then these hunks). Paths are relative to `app/` unless noted. Every message ends with a blank line
and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Before committing, re-run `pnpm contracts:catalog` (done
here: no diff) and `pnpm install --offline` if the lockfile hunks are hard to split.

1. `fix(client): close the phone sidebar sheet after navigation`
   - `packages/client/src/shared/ui/organisms/Sidebar/sidebar-context.tsx` (`useCloseMobileSidebarOnChange`)
   - `packages/client/src/widgets/app-sidebar/ui/{AppSidebar.tsx,AppSidebar.test.tsx}` and
     `packages/client/src/widgets/admin-sidebar/ui/{AdminSidebar.tsx,AdminSidebar.test.tsx}` (Task 24 hunks)
2. `fix(client): localize the invitation link to the inviter's locale`
   - `packages/client/src/features/invite-member/model/{localize-accept-url.ts,localize-accept-url.test.ts}`,
     `features/invite-member/ui/InviteMemberDialog.tsx`, `views/settings-invitations/ui/SettingsInvitationsView.test.tsx`
3. `fix(client): land project-only members on their first project`
   - `packages/client/src/views/organization-home/ui/{OrganizationHomeView.tsx,OrganizationHomeView.test.tsx}`
4. `test(web): cover sheet closing, localized invites and member landing`
   - `apps/web/e2e/{shell.spec.ts,admin.spec.ts,settings.spec.ts,profile.spec.ts}` (Task 24 hunks)
   - `packages/e2e/src/{seed-users.ts,sign-in.ts}` (member account + project-level join; comment)
5. `ci(desktop): add desktop check job and native smoke test`
   - (repo root) `.github/workflows/app-ci.yml`: the `desktop-check` job. The file also carries Task 22's `e2e` job
     hunk, which goes in Task 22's commit first.
   - `apps/desktop/test-native/{wdio.conf.ts,user-area.e2e.ts,tsconfig.json}`, `apps/desktop/package.json`
     (`test:native`, `typecheck`, the seven wdio devDependencies), `apps/desktop/tsconfig.json` (`exclude`
     `test-native`), `apps/desktop/README.md` (native smoke section)
   - `scripts/native-smoke.ts`, `scripts/src/e2e/{e2e-env.ts,e2e-env.test.ts}` (Tauri origins in CORS)
   - `pnpm-workspace.yaml`: 7 catalog lines (`@wdio/*`, `webdriverio`), `allowBuilds` `edgedriver`/`geckodriver` +
     comment. `pnpm-lock.yaml`: the catalog entries, importer `apps/desktop` wdio devDependencies, and the wdio
     package/snapshot entries (about 346 new top-level keys; pre-install copy:
     `<scratchpad>/pnpm-lock.before-t24.yaml`). The install also re-keyed the peer suffix of existing snapshots
     (`supports-color@7.2.0` → `@8.1.1` in the `@mastra/*`, `@tanstack/router-*` and `eslint` entries, because
     webdriverio brings supports-color 8). Those lines belong to this commit as well. No other importer changed. If
     the hunks are hard to split, regenerate with `pnpm install --offline` from the staged manifests.
6. `docs(client): record sp2 gate`
   - `README.md` (SP2 sections)
   - (repo root) `docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md` (#6, #14, #32–#35)
   - (repo root) `docs/plans/2026-09-29-sp2-app-shell-ui/progress.md` (two Task 24 lines; add SHAs),
     `reports/task-24.md`, `reports/sp2-gate.md`

Not to stage: `apps/desktop/dist`, `src-tauri/target`, `src-tauri/gen`, `src-tauri/tauri.api.conf.json`,
`apps/*/test-results`, `playwright-report`, `e2e/.auth`, the scratchpad.

## Concerns

1. **No commits** (permission).
2. **(a) was not reproduced.** No route or prefetch change was made. The regression e2e guards all five sections on
   four browsers. If the 404 appears again, capture the exact request URL (the test prints it).
3. **Native smoke is slow** (~3 min): without `tauri-plugin-wdio` in the app, the service probes window states
   before every element command. It also leaves driver processes on Windows; the wrapper stops them (follow-up #35).
   The mocha timeout is 600 s. It passes reliably with `clickWhenStable`, but it remains local evidence and not a CI
   gate (decision 0017).
4. **The e-mailed invitation link stays locale-less** (server side, SP1-owned; follow-up #32). **Unit-only members**
   still see not-found at `/o/:id` (no endpoint lists grant nodes; follow-up #33).
5. **Load on the shared machine:** the first full e2e run had 24 timeouts/crashes (a11y on webkit/firefox/phone,
   25 min instead of 6). All 24 passed on `--last-failed`. Whole-workspace `pnpm test` hit 5 s timeouts and
   worker-start timeouts in client/web/mastra/module-example/contracts. Each package passes on its own, apart from
   the 2 client tests in item 1 of Verification, which pass alone.
6. Firefox logs a CSP `unsafe-eval` report from a bundle chunk (a feature probe; no functional impact). It was seen
   while probing (a) and needs a separate look.
7. `pnpm peers check`: `@wdio/globals@9.29.1` (a transitive copy; the catalog pins 9.31.3) wants
   `expect-webdriverio ^5.6.5` while 6.1.0 is installed. The smoke passes; recheck when `@wdio/tauri-service`
   moves to the current wdio train.
8. `desktop-check` runs `cargo check --locked` from `src-tauri`, so rustup picks the pinned toolchain from
   `rust-toolchain.toml` (verified locally: rustc 1.98.1, Finished; actionlint exit 0 after the change). The job runs on Linux
   only at the first push; the same steps were verified on Windows.
