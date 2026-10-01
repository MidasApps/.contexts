# SP2 gate: app shell and UI (evidence)

- **Date:** 2026-09-30 · **Branch:** `feat/agentic-app-core-sp0` · **Commits:** none. SP2 Tasks 4–24 sit uncommitted
  in the working tree because `git commit` needs the user's permission. The commit order is: the plans in
  `task-4-6.md` … `task-22-23.md`, then `task-24.md`.
- The plan names this report `sp2-summary.md`; it is written as `sp2-gate.md` as the Task 24 brief asked.
- **Gate definition:** umbrella spec `docs/superpowers/specs/2026-09-29-agentic-app-core-design.md` §13, SP2 row:
  "e2e: login → troca org/projeto → perfil; axe limpo; Tauri abre a área do usuário", detailed in SP2 spec §13
  items 1–8 plus the command gate.
- **Machine:** Windows 11, shared with other agents' runs (SP1/SP3). The e2e runs used `E2E_WEB_PORT=3102` and
  `E2E_DESKTOP_PORT=1421`, because 3000, 3101 and 1420 belong to others. Logs are in the session scratchpad
  `C:\Users\gsoar\AppData\Local\Temp\claude\C--Projetos--contexts\854228ec-4946-42fe-aa16-4591f19d5035\scratchpad\t24-*.log`.

## Umbrella §13 SP2 → evidence

| Gate clause | SP2 spec §13 item | Evidence | Status |
|---|---|---|---|
| e2e: login | 1 `auth.spec.ts` | Final full run: every `auth.spec.ts` test ok on chromium, firefox, webkit and mobile-chrome (`t24-e2e-full-2.log`). Covers the seeded owner landing on the last context, `?next=`, sign-out redirect, field errors and session exchange on reload. | ✅ |
| → switch organization/project | 2 `shell.spec.ts` | Full run ok on 4 projects: sidebar and palette switching, breadcrumbs, `?unit=`, module page, a viewer versus a restricted member, loading/error/empty states. **New in Task 24:** the phone sheet closes after a switch, and a project-only member lands on their project (decision 0030 A5). | ✅ |
| → profile | 3 `profile.spec.ts` | Full run: display name, language (URL + copy), time zone + currency (example page shows `Asia/Tokyo`), theme after reload, session revoke. **New:** a profile-sections prefetch guard (no 4xx). One webkit time-zone failure under load was re-run: 3 × `--repeat-each` on webkit, 23/23 ok (`t24-e2e-webkit-profile.log`). | ✅ (flaky under load) |
| (settings, admin) | 4, 5 | `settings.spec.ts`: the invite link is now `/pt-BR/invite#token=…`, the invitee accepts, then role change, API key shown once, device code, module settings. `admin.spec.ts`: non-staff get the not-found UI; staff with the SMS code from the emulator reach `/admin`. All ok. | ✅ |
| axe clean | 6 `a11y.spec.ts` | Full run 2: all a11y cases ok on 4 projects, light and dark, plus en-US. Run 1 had 24 load timeouts and browser crashes (no axe violation among them); all 24 passed on `--last-failed` (`t24-e2e-rerun-1.log`). Component tests run `expectNoAxeViolations` in every `*.test.tsx`. | ✅ |
| desktop frontend | 7 `desktop-web` | `apps/desktop` Playwright: 4 passed (setup + journeys 1–3) in run 1 and again after run 2 (`t24-e2e-desktop.log`). | ✅ |
| **Tauri opens the user area** | 8 native | `pnpm test:e2e -- node scripts/native-smoke.ts` (WebdriverIO 9.32 + `@wdio/tauri-service` 1.4.0, external tauri-driver 2.1.0, WebView2 154): "1 passing" in runs 2, 3, 5 and 6. The Tauri window signs in as `owner@demo.local`, shows the "Alpha Org" switcher, `main` and the h1, the Windows keychain entry appears, then sign-out removes it. Screenshots: `scratchpad\native\native-1-sign-in.png`, `native-2-user-area.png`, `native-3-signed-out.png`. | ✅ (local evidence, decision 0017) |

Final full run (`t24-e2e-full-2.log`, all Task 24 changes built in): web **362 passed, 1 failed** (webkit time-zone
test, a load timeout, then green 3/3 as above), 2 skipped (invite clipboard journey on firefox/webkit, Chromium-only
by design). Turbo skipped desktop-web after the web failure, so it ran separately: 4 passed.

## Command gate

| Command | Result |
|---|---|
| `pnpm lint` | 13/13 tasks successful |
| `pnpm typecheck` | 13/13 tasks successful (desktop now also typechecks `test-native`) |
| `pnpm test` | The whole-workspace run hit 5 s test timeouts and worker-start timeouts under load (contracts, client, web, mastra, module-example). Per package: i18n 51, contracts 297, config 6, services 678, functions 26, web 72, scripts 70, agents 404 (+1 skipped), mastra 52, desktop 78, module-example 17, all passing. client 531/533: 2 `ProfilePreferencesView` tests timed out in the full suite and pass 4/4 alone. |
| `pnpm test:emulators` | 5/5 tasks: scripts 2, functions 6, agents 6, mastra 7, services 168 |
| `pnpm contracts:catalog` then `pnpm contracts:check` | exit 0 / exit 0 (no catalog drift from Task 24) |
| `pnpm i18n:check` | `i18n:check ok (9 namespaces, 27 catalogs)` (SP1's `common.unitTypes.unit` kept) |
| `pnpm test:e2e` | see above |
| `desktop-check` (CI) | actionlint 1.7.12: exit 0. Local replica of the job's steps: frontend build with the staging placeholders exits 0, `cargo check --locked` finishes. The first Linux run happens on push (no push here). |
| framework | `git diff --quiet main -- .contexts .claude && echo framework-ok` → `framework-ok` |

## Follow-ups touched

`docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md`: #6 done (desktop-check); #14 closed (decision 0018). New:
#32 e-mailed invitation link locale (SP1), #33 unit-only member landing (needs an API), #34 keychain-unavailable UI
hint (Task 21 concern 6), #35 native smoke speed and driver leftovers. "Module contracts in the generated catalog" is
already implemented (`app/catalog.modules.ts`), so no row was added.

## Open items for the user

1. **Commit everything** following the per-task commit plans (Task 24: `reports/task-24.md#commit-plan`).
2. First push: watch the new `desktop-check` and the `e2e` jobs on Linux.
3. The SP2 task reviews are all `pending` in `progress.md`.
