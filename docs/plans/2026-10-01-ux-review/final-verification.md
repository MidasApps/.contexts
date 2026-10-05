# Final verification

## Round of 2026-10-04

Branch `feat/agentic-app-core-sp0` at `0cc2e911`. Same machine and setup as the round below. Logs are in `%TEMP%\fv\v3\*.log`, `%TEMP%\fv\e2e-final*.log` and `%TEMP%\fv\e2e-console.log`.

### Work merged in this round

| Item | Commits | Decision |
|---|---|---|
| Group 1 follow-ups: #39, #29, #56/#57, #20/#46/#100, #76/#43 | `d3575152`..`55f2f0e1` | 0064–0067 |
| Biome formats the code; ESLint caps file size (500), function size (100), complexity (15) and nesting (3), and forbids `../../../` | `ac5bd65a`..`9855c7a6` | 0068 |
| A switch per installed module on the agents settings page | `9a3e4c9d`..`cccf5d33` | 0064 |
| One web session per session cookie (fixes the revoke journey) | `a99df3ff`, `2ed87e70` | 0069 |
| UX review batch B5, chat continuity and approvals (it had stayed on its worktree) | `ff1293cc`..`0cc2e911` | 0070 |

The framework (`.contexts/`, `.claude/`) was not changed by any of these commits.

### Results

| Check | Command | Result |
|---|---|---|
| Formatting | `pnpm format:check` | ok |
| Typecheck | `turbo run typecheck` | ok (13 packages) |
| Lint | `turbo run lint` | ok, 0 errors |
| Unit and component tests | `pnpm test --continue` | 4,037 passed, 1 skipped: client 1504, services 990, agents 644 (1 skipped), contracts 445, desktop 95, scripts 86, web 85, mastra 68, i18n 52, module-example 35, functions 27, config 6 |
| Contracts | `pnpm contracts:check` | ok (154 contracts, 175 endpoints) |
| i18n | `pnpm i18n:check` | ok |
| Evals (fake mode) | `AI_MODE=fake pnpm evals` | 7 of 7 |
| Emulator tests | `pnpm test:emulators` | 274 passed (services 211, mastra 42, functions 9, agents 6, module-example 4, scripts 2) |
| Postgres tests | `pnpm test:postgres` | 76 passed (services 49, agents 27) |
| Builds | web, Mastra, desktop (built by the e2e runs at `0cc2e911`); Functions with `turbo run build --force` | all ok |
| e2e web, before B5 (`2ed87e70`) | `pnpm test:e2e` | 502 passed, 0 failed, 2 skipped |
| e2e web, with B5 (`0cc2e911`) | `pnpm test:e2e` | 501 passed, 1 failed, 2 skipped |
| e2e console project alone (`0cc2e911`) | `--project=console` | 53 of 53 |
| e2e desktop (`0cc2e911`) | desktop Playwright | 6 of 6 |

The two skipped journeys are the invite-link copy on Firefox and WebKit (no clipboard there). The one failure with B5 was `admin-observability` › traces, the load-sensitive journey of the round below; it passed in the console project run.

### The revoke journey

"revokes another session, which then has to sign in again" failed in every fast full run and passed in slow ones. A bisect showed no commit caused it; the speed did. Two sign-ins of one user in the same second get identical ID tokens and identical session cookies (checked against the Auth Emulator; the same is expected in production, not reproduced there), and each created its own record, so revoking one left its twin open. `createWebSession` now reuses the open record that holds the cookie hash (decision 0069), and the journey signs the second browser in during a later second.

### Code-size and import metrics (decision 0068)

| Metric | Before | After |
|---|---|---|
| TypeScript lines over 160 characters | 2,270 | 57 (strings and literals the formatter cannot break) |
| Files importing through `../../../` | 385 | 5 (lint fixtures and the generated catalog data, each exempted) |
| Size, complexity and nesting violations | 61 | 0 |

### Open

- Follow-ups #104 and #105 (from B5) were fixed afterwards: `984b05cd` and `539b441d`.
- The items under "Open" in the round below still stand.

## Round of 2026-10-03


Branch `feat/agentic-app-core-sp0`. The full checks ran on `e519a391` to `4a12a748`: the unit-test step ran again at `4a12a748` after a script error. The final e2e ran at `81e65b37`.

Machine: Windows 11, Node 26.10.0, pnpm 12.6.0, Docker Desktop (Postgres 18). The user's own apps were open throughout: Chrome, the ChatGPT desktop app, Warp, Paseo. Logs of every step are in `%TEMP%\fv\*.log` on that machine.

### Work merged in this round

| Item | Commits | Decision |
|---|---|---|
| Unit tests wait longer for renders under load | `e1ea8883` | — |
| Web App Check and web push deferred to a remote project | `76d7c80d` | 0059 |
| #93 editor dialogs ask before discarding typed work | `c7582825`, `95e5e60d` | 0048 (existing) |
| #38 example module lists notes over `/v1` and on its page; modules can serve `/v1` endpoints | `07cddb5a`..`e1b1af36` | 0063 |
| #66 tenants manage eval dataset items | `88cecfac`..`63c61d87` | 0062 |
| #63, #99 usage by day, agent and user; the organization's own cap is read back | `aa6b7f3d`..`ff1c9b49` | 0060 |
| #64 next five fires of a schedule; runs page in the URL | `f2ae127a`..`5873c8d2` | 0061 |
| `pnpm test` runs package suites two at a time | `e2e78048` | — |
| e2e: fresh database each run, runtime warm-up, chat and console journeys one at a time, two workers locally | `d5b72899`, `f1591ba5`, `e519a391`, `4a12a748`, `81e65b37` | follow-ups #80, #102 |

The framework (`.contexts/`, `.claude/`) was not changed by any of these commits.

### Results

| Check | Command | Result |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | ok |
| Typecheck | `pnpm typecheck` | ok (13 packages) |
| Lint | `pnpm lint` | ok |
| Unit and component tests | `pnpm test --continue` | 11 of 12 packages green. `@core/client`: 1478 passed, 1 timed out at 15 s (`ProfilePreferencesView` › "sends only the changed field…"). Run alone, that file passes 4 of 4. |
| Contracts | `pnpm contracts:check` | ok (152 contracts, 173 endpoints) |
| i18n | `pnpm i18n:check` | ok |
| Evals (fake mode) | `AI_MODE=fake pnpm evals` | 7 of 7 |
| Emulator tests | `pnpm test:emulators` | 273 passed (services 210, mastra 42, functions 9, agents 6, module-example 4, scripts 2) |
| Postgres tests | `pnpm test:postgres` | 75 passed (services 48, agents 27) |
| Builds | web, Mastra, Functions, desktop (desktop with `apps/desktop/.env.production.example` values) | all ok |
| e2e, final configuration | `pnpm test:e2e` | web: 500 passed, 2 failed, 2 skipped (25 min). Desktop: 5 passed, 1 failed. |
| e2e, chat project alone | `--project=chat --workers=1`, twice | 25 of 25, twice |
| e2e, console project alone | `--project=console --workers=1` | 53 of 53 |

Unit test counts per package: client 1478 of 1479, services 981, agents 634 (1 skipped), contracts 444, desktop 95, scripts 86, web 85, mastra 67, i18n 52, module-example 35, functions 27, config 6.

#### The three e2e failures of the final run

- `admin-observability` › traces opens a turn's span tree with token counts
- `settings-agents` › an organization instructions eval finishes within 240 s
- desktop `edits the profile` › the account menu shows the new name

Each passed in another run this session (the console project alone ran 53 of 53). All three wait on the agent runtime or on a session refresh while other journeys run. They are load-sensitive, not deterministic failures.

### What the e2e runs showed, and what changed

1. **The e2e database kept every run's data.** `app_e2e` had grown to 1.9 GB, including 1.8 GB of Mastra spans (384,000 rows). Every agent call was slow enough to fail journeys. Each run now drops and recreates that database (`scripts/src/e2e/e2e-database.ts`).
2. **The first chat turn of a fresh runtime rebuilds the memory vector index.** Journeys that were streaming during that rebuild timed out. Both setup projects now send one warm-up turn (`packages/e2e/src/warm-agents.ts`).
3. **Concurrent turns or evals on the single local runtime stall other agent requests.** With 2 or 4 workers, 3 to 12 of the 23 chat journeys timed out. Run serially, chat passes 25 of 25 and console 53 of 53, so both projects run with `workers: 1` (follow-ups #80 and #102).
4. **Four workers were too many for a loaded developer machine.** Full runs failed 33 to 43 of 504 journeys on slow session restores. With two workers locally (CI keeps four), 500 of 502 passed.
5. **`pnpm test` started every package at once.** Under that load, jsdom tests in six packages timed out. It now runs two packages at a time.

The commit before this round's features (`6e7cfef3`) failed the same chat journeys on this machine, both with the bloated database and with a fresh one. None of the e2e failures came from this round's feature code.

### Open

- **#102:** measure what holds the agent runtime during a turn or an eval before tenants share an instance.
- **#80:** chat e2e runs on chromium only, one journey at a time.
- **Not exercised locally:** realtime voice and the Tauri CSP (#81).
- **Needs a sandbox Firebase project:** App Hosting deploy (#13), web App Check and web push (decision 0059).
- **Deferred:** mobile (decision 0018).
