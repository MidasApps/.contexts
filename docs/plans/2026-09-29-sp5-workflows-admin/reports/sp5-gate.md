# SP5 gate: workflows, `/admin` and `/settings` (Tasks 15–16)

Plan: `docs/plans/2026-09-29-sp5-workflows-admin.md`. Spec: `docs/superpowers/specs/2026-09-29-sp5-workflows-admin-design.md` §1.
Branch `feat/agentic-app-core-sp0`. Date 2026-10-01. Machine: Windows 11, shared with the SP4 chat e2e agent.

**Gate (spec §1, umbrella §13):** "a HITL workflow and a scheduled workflow proven end to end;
`/admin` shows traces, costs and eval results; criterion §1 complete (final task)". Criterion §1
is Task 17 and is not part of this gate run.

## Commits

| Commit | Message |
|---|---|
| `26a03562` | `fix(web): load node-only services only in the node runtime` (known item 4) |
| `db11f2eb` | `test(services): isolate the rules and impersonation emulator tests` (items 2, 3) |
| `ca4fdfae` | `test(workspace): run the emulator suites serially and reliably` (item 7) |
| `c4357c65` | `fix(knowledge): show a failed ingestion instead of indexing forever` (item 5) |
| `9273ab34` | `fix(agents): refuse unknown tool and skill ids of a custom agent` (item 6) |
| `bd133a92` | `fix(identity): keep impersonation across reloads and leave to staff` (item 1, decision 0047) |
| `eb929dc4` | `docs(contracts): regenerate the catalog for sp5 fixes` |
| `1ba20e99` | `fix(workspace): give each e2e stack its own emulator temp dir` |
| `f6c5c2af` | `fix(admin): keep earlier filter writes made before the url updates` |
| `205d1fa5` | `fix(admin): separate values from hints on the organization detail` |
| `8c49be30` | `fix(i18n): correct the flag override and eval datasets admin copy` |
| `afc706a3` | `fix(workflows): name the member who started a run` |
| `5b8f66fc` | `fix(identity): stop 404s while the tab changes account` |
| `4060c4f0` | `test(admin): add the admin and settings console e2e journeys` |
| `31170c64` | `docs(admin): report the sp5 gate` |
| `af9f4444` | `fix(admin): ask for a valid usage range instead of sending it` |
| (this commit) | `docs(admin): record the final sp5 gate runs` |

## Gate criteria → evidence

| Criterion | Evidence | Status |
|---|---|---|
| HITL workflow end to end (four eyes) | `settings-approvals.spec.ts`: the owner starts two `approval-demo` runs from `/settings/workflows`; each suspends; the requester sees no decide buttons and why; a second admin (fresh account, admin role) approves one and rejects the other; both runs reach "Concluída" (applied / recorded). `settings-workflows.spec.ts`: start, run page follows `collect-input` → suspended `request-human-approval`, link to the approval, cancel. | PASS |
| Scheduled workflow end to end | `settings-workflows.spec.ts`: create (a too-frequent cron is refused, `*/15` accepted, next fire shown in the schedule's zone), edit, pause, resume, run now (the run appears), delete. `/admin/workflows`: pause a platform job after the "stops for every organization" warning, resume. An automatic fire is proven by `scheduler.postgres.test.ts` (Postgres suite, green below), not in the browser (follow-up 90). | PASS (fire outside Playwright) |
| `/admin` shows traces | `admin-observability.spec.ts`: after a chat turn of the test's organization, `/admin/traces` lists it filtered by organization and today, opens the span tree with model-span tokens; a day without runs shows the empty state. | PASS |
| `/admin` shows costs | Same file: usage by day and by model for the organization (calls, tokens), empty period, budgets; error state with reference and retry. Cost is US$ 0 in fake mode: the fake models have no price (follow-up 83). | PASS (cost value not provable offline) |
| `/admin` shows eval results | `admin-evals.spec.ts`: `AI_MODE=fake pnpm evals`, `evals:seed`, `evals:publish` to the e2e runtime; experiments with verdict and scores, a comparison chart, the datasets, the overview KPI. | PASS |
| `/admin` journeys of the brief | overview (KPIs, error + retry); organizations (server search, no-match, detail with member count, loading → error → retry, plan change, suspend, reactivate); plans (create, edit limits); users (search by e-mail, name prefix, empty; start support access, list, end from the list; validation); support access in the tab (open as the user, survives a reload, "Sair do modo suporte" returns to staff on `/admin/users`, session "Encerrada", staff after another reload); agents catalog and per-organization settings; prompt version → eval → activation (forced with a reason when the fake eval fails) and the 422 of an agent without an eval set; flags set and clear override; workflow runs list and cancel; schedules; connectors read only (no secret); logs filters; non-staff (owner, viewer) get not-found on seven areas and 403 on `/v1/admin/*`; staff without a second factor get not-found and `MFA_REQUIRED`. | PASS |
| `/settings` journeys of the brief | agents (switch a platform agent off and on; organization instructions → eval → activation); custom skill and custom agent created, edited, deleted; unknown tool/skill ids refused by `/v1` with `VALIDATION_FAILED` (item 6); knowledge: markdown upload through the Storage emulator → "Pronto" → delete, http page refused in the dialog, https page → "Pronto" → delete, an internal host refused by the runtime's SSRF guard → failure notice with reference, retry and dismiss (item 5); connectors create, edit, write-only secret (never rendered), disable, delete; workflows and schedules (above); usage month, budget and own cap saved and removed; approvals (above); traces list + detail after a chat turn, status filter to no-match; evals; flags switched off and back on; a member without permission gets the no-access state on admin-only sections and 403 from the matching `/v1` calls. | PASS |
| Clean browser console | Every journey has an automatic console guard (errors, warnings, uncaught exceptions). Allowances, each scoped to one test and commented: `Failed to load resource` where the test makes a request fail on purpose (forced 500s for error states, the 422 of an agent without an eval set, the 422 of a too-frequent cron), and the Auth Emulator's 501 for the reCAPTCHA Enterprise config during the SMS sign-in of the support-access test. The e2e web is a production build, so React development warnings are covered by the component tests, not here. | PASS |
| Loading, empty and error states | Loading/error/retry with `page.route` on overview, organizations, costs and usage; empty states on organizations (no match), users, traces, workflows, schedules, connectors, knowledge, logs, evals. | PASS |

## Verification (final tree `af9f4444`, rebased on `f17ff7a3`; local e2e ports only differ)

The e2e stack used private ports (web 3110, Mastra 4291, emulators 9591–9594/5591/4691/4791) and
database `app_e2e_sp5`, set locally in `firebase.e2e.json` and `E2E_DATABASE_NAME`, not committed.

```
e2e on the final tree af9f4444, two consecutive runs, fresh emulators each, workers=1:
  node scripts/e2e.ts -- node apps/web/node_modules/@playwright/test/cli.js test
    -c apps/web/playwright.config.ts --project=setup --project=console --project=chromium
    --workers=1 e2e/admin e2e/settings-
  run G → 58 passed (4.3m), exit 0
  run H → 58 passed (4.3m), exit 0
  (earlier, on 942258f1 before the last rebase: run B through `pnpm exec turbo run test:e2e`
   → 58 passed, then turbo hung at exit, follow-up 87; run C → 58 passed. Runs D and E on the
   rebased tree each failed the costs journey once: a 400 into the console from a transient
   usage range, fixed in af9f4444.)
  58 = setup 5 + admin.spec.ts on chromium 6 + console 47 (7 admin-* and 7 settings-* spec files)
pnpm test:emulators → services 41 files/209, functions 3/9, agents 1/6, scripts 1/2,
                      module-example 1/3, mastra 9/41; Tasks 6/6; 7m12s; exit 0
pnpm test:postgres  → services 9 files/47, agents 7/27; Tasks 2/2
unit: contracts 37/424 · services 138/957 · agents 82 (+1 skipped)/612 (+1 skipped) ·
      mastra 14/66 · web 11/77 · client (--maxWorkers=4) 229/1147 (rerun after af9f4444) — all passed
pnpm typecheck → 13/13 · pnpm lint → 13/13
pnpm contracts:check → ok (148 contracts, 165 endpoints, 299 files)
pnpm i18n:check → ok (10 namespaces, 30 catalogs)
AI_MODE=fake pnpm evals → 7 files, 7 tests passed
web next build → exit 0, no "Ecmascript file had an error" and no warning lines (dev env on
  4060c4f0 and e2e env on af9f4444)
mastra build → exit 0 (audit: no high/critical) · functions build → exit 0
git diff --quiet main -- .contexts .claude → framework-ok
```

Earlier runs on the way: run A (fresh stack) had 2 failures, both empty-state checks that depended
on file order (one organization per worker); the fixture now creates one organization per test.
A long-lived stack used while writing the specs crashed twice (the Storage Emulator's blob folder
in the shared OS temp dir was wiped by another suite → fixed in `1ba20e99`) and later stopped
dispatching Functions triggers (follow-up 88).

## Known items

| # | Item | Result |
|---|---|---|
| 1 | Impersonation lost on reload; "leave" signed out | Fixed (`bd133a92`, `5b8f66fc`, decision 0047): the staff web session records the open impersonation; the session exchange restores the read-only user while it is open and unexpired, else falls back to staff (expiry audited `IMPERSONATION_EXPIRED`); leave ends it (audited) and loads `/admin/users` as a new document. Proven by the support-access e2e. |
| 2 | `firestore-impersonation-sessions.emulator.test.ts` assumed a fresh emulator | Fixed (`db11f2eb`): removes its own rows, asserts only on its ids. |
| 3 | `firebase-rules.emulator.test.ts` failed in a full run | Fixed (`db11f2eb`). Cause: `conversations-rules.emulator.test.ts` left `access/org-1_user-1` (org-wide) behind; the deny-by-default test uses the same principal, so after it the read was rightly allowed. Reproduced by running the two files in that order (1 failed); each test now uses its own ids and cleans up. |
| 4 | `next build` "Ecmascript file had an error" | Fixed (`26a03562`). Cause: `instrumentation.ts` is compiled for the Edge runtime too and statically imported `@core/services`, pulling six `node:crypto` users into that bundle. Services are now imported only under `NEXT_RUNTIME=nodejs`. |
| 5 | Knowledge "indexing" forever when ingestion fails early | Fixed (`c4357c65`): each notice follows its run; failure alert with reference, retry, dismiss. Proven in the e2e with a host the SSRF guard refuses. |
| 6 | Unknown tool ids of a custom agent accepted | Fixed (`9273ab34`, decision 0046 A1): tools, platform skills and organization skills checked against the runtime's options; one `VALIDATION_FAILED` with every unknown item; a runtime that cannot answer fails the write. Proven by unit tests and an e2e API check. |
| 7 | `pnpm test:emulators` flaky under load | Fixed (`ca4fdfae`): files run serially per package with 30 s / 60 s timeouts, turbo concurrency 1, Functions discovery 180 s, fixed Cloud Tasks port (its fallback collided with other stacks). Green full run above (7 min on the final tree). |

## Defects found by the e2e and fixed (beyond the known items)

1. `/admin/traces` and `/admin/costs`: two filter writes before a re-render lost the first (picking "De" then "Até" dropped `from`) — `f6c5c2af`, red→green unit test.
2. Organization detail read "1pessoas com acesso" and value+source as one word to assistive tech — `205d1fa5`.
3. Flag override hint said an override cannot be removed — `8c49be30`.
4. Datasets empty-state copy said they come from publishing — `8c49be30`.
5. Workflow runs and run page showed the starter's raw user id — `afc706a3`.
6. Support access: after leaving, the still-mounted user area refetched the user's organization as staff (404s), and admin links prefetched during a session exchange answered 404 into the console and the router cache — `5b8f66fc` (leave loads a new document; `/admin` links are never prefetched).
7. e2e stack crash: the Storage Emulator's blob folder is shared through the OS temp dir by every emulator suite on the machine — `1ba20e99`.
8. `/admin/costs`: choosing a start day before the end day sent a range of more than 92 days (the
   end defaults to today) and the API answered 400 into the console — `af9f4444` (the page explains
   the limit and waits for a valid range; red→green component test).
9. (Harness) the original `admin.spec.ts` "opens an admin area" lost its slot assertion; it now checks the users page's search section.

## Open (follow-ups 82–92 in `docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md`)

82 cancelling a suspended run leaves its approval request pending · 83 fake models have no price (cost US$ 0 offline) · 84 `_ok` log messages on 4xx · 85 flag descriptions in English on pt-BR pages · 86 prompt editor empty without a seeded version · 87 `turbo run test:e2e` hangs at exit on Windows · 88 Functions emulator stops dispatching in a long-lived stack · 89 organization picker options off-viewport · 90 automatic schedule fire not shown in the browser · 91 a knowledge run that succeeds without a document drops its notice · 92 `/admin` while impersonating has no redirect. Rows 49 and 60 are marked done.

## Notes

- The plan's Task 16 asked for an axe scan on each admin page. The specs do not call axe: every
  admin and settings view has `expectNoAxeViolations` in its component tests, and `a11y.spec.ts`
  (SP2) scans the shell pages in the browser. A browser axe pass over the SP5 pages is not done.

- Work ran in a scratch worktree with forks: emulator reliability (items 2, 3, 7), tool-id validation and the knowledge notice (items 6, 5), impersonation (item 1), admin specs, settings specs (this fork stopped at the session limit; its specs were finished by the coordinator).
- Console journeys run once, on chromium, in a `console` Playwright project, like the SP4 chat journeys; the four-browser matrix keeps the SP2 specs.
