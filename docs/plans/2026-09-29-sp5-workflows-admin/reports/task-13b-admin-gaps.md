# SP5 Task 13b report: the API gaps of the `/admin` console

Plan: `docs/plans/2026-09-29-sp5-workflows-admin.md`. Branch `feat/agentic-app-core-sp0`. Date 2026-10-01.
Source of the gaps: `reports/task-12-13.md` ("API gaps"). Decision: `app/docs/decisions/0044-admin-console-gaps.md`.

All ten items of the brief are closed. Each one has a contract, an endpoint, a handler behind
`requireStaff`, tests, and the admin page wired to it.

## Commits (on top of `1538c32`)

| Commit | Message | Gap |
|---|---|---|
| `23ed970` | `feat(identity): store a searchable name on user profiles` | 1 |
| `7452f01` | `feat(admin): add staff user search and batched user lookup` | 1, 8 |
| `7f04f35` | `feat(admin): find users by name, email or id on the users page` | 1 |
| `2faee5e` | `feat(admin): show user names in prompt and workflow lists` | 8 |
| `7a87851` | `feat(admin): add organization detail and server-side search` | 2 |
| `3f29395` | `feat(admin): search and read organizations on the server` | 2 |
| `843cbff` | `docs(admin): record organization detail and search in decision 0044` | 2 |
| `f653379` | `feat(admin): confirm before pausing or resuming a schedule` | 9 |
| `94729bc` | `feat(admin): remove an organization's flag override` | 6 |
| `7a34e3d` | `feat(admin): list and end impersonation sessions of every staff member` | 5 |
| `e665917` | `feat(admin): filter traces by time range and show their ledger cost` | 7 |
| `d086e15` | `feat(admin): add the catalog of registered agents` | 3 |
| `07d6f41` | `feat(admin): add usage by day and by model to the costs page` | 4 |
| `f6d7e8e` | `docs(admin): record the remaining console gaps in decision 0044` | 3–7, 9 |
| (this commit) | `docs(admin): report sp5 task 13b and its follow-ups` | 10 |

How the work ran: gaps 1 and 8, then gap 2, were done by two forks in a scratch worktree, one after
the other. The second fork ended on an API error after its three commits and before its report, so
what is said here about gap 2 comes from its commits and from decision 0044 §2. Gaps 3 to 7, 9 and
10 were done by the coordinator in a second worktree while the second fork ran, then rebased onto
its commits and onto the branch head (no conflict).

## What was built

| # | Gap | API | Page |
|---|---|---|---|
| 1 | Staff user search | `GET /v1/admin/users?query=&by=` (`platform.user.read`, cursor paged): email prefix, name prefix (case and accents ignored, storage-only `users.searchName`), exact id | `/admin/users`: search box with "search by", results table, pick a user for support access (no more typed id) |
| 2 | Organization by id, server search | `GET /v1/admin/organizations/{id}` with `memberCount`; `GET /v1/admin/organizations?query=&status=` (server scan, exact id always first) | detail page reads the endpoint and shows the member count; list page searches on the server and pages by cursor |
| 3 | Agents catalog | `GET /v1/admin/agents` (`platform.agent.manage`) over the runtime's new `GET /console/agents` | `/admin/agents`: every registered agent with role, subagents, tools, skills, permission ceiling; an organization can switch on any registered subagent |
| 4 | Usage | `GET /v1/admin/usage?from=&to=&organizationId=` (`platform.usage.read`): by UTC day and by model from the ledger, at most 92 days | `/admin/costs`: cost by day chart, cost by model chart, model table, organization and day filters in the URL |
| 5 | Impersonation sessions | `GET /v1/admin/impersonation-sessions` (`platform.user.read`), `POST …/{id}/end` (`platform.user.impersonate`, audited on both logs) | `/admin/users`: sessions of the whole team (open now, or all), end one after a confirmation |
| 6 | Clear a flag override | `DELETE /v1/admin/flags/{flagKey}/overrides/{organizationId}` (idempotent, audited) | `/admin/flags`: "remove override" on rows that have one, behind a confirmation |
| 7 | Traces | `startedAfter` / `startedBefore` on both trace lists; `costMicroUsd` from the usage ledger | `/admin/traces`: from/to day filters in the URL; the cost column is populated |
| 8 | Names for user ids | `GET /v1/admin/users?ids=` (up to 100, one `getAll`) | one lookup per list for prompt authors, activators, run starters, and the staff and user of a session |
| 9 | Schedule confirmation | none | pause and resume go through a dialog; pausing a platform schedule is destructive and says it stops the job for every organization |
| 10 | Follow-ups | none | rows 45–57 of `docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md` |

Rules checked on every new handler: `requireStaff` first (staff with MFA, fail closed, denial
audited), validation by the endpoint contract, cursor pages with `meta.page` where the list is
cursor paged, the error envelope, and an audit entry for each staff mutation (override removal,
ending a session). The user search text is never logged and never echoed in `details`; a test
asserts both.

## Verification (final tree, commit `f6d7e8e`, run in the worktree)

```
pnpm -F @core/contracts test      → 36 files, 411 tests passed
pnpm -F @core/services test       → 133 files, 906 tests passed
pnpm -F @core/client test         → 200 files, 930 tests passed
pnpm -F @core/web test            → 11 files, 72 tests passed
pnpm -F @core/agents test         → 75 files passed, 1 skipped; 537 tests passed, 1 skipped
pnpm -F @core/mastra test         → 13 files, 64 tests passed
typecheck: contracts, services, client, web, agents, functions, desktop, mastra, scripts → exit 0
lint: contracts, services, client, web, agents → exit 0
pnpm contracts:check              → ok (137 contracts, 149 endpoints, 277 files)
pnpm i18n:check                   → ok (10 namespaces, 30 catalogs)
pnpm -F @core/web build           → exit 0; the six new /v1/admin route files are listed
git diff --quiet main -- .contexts .claude && echo framework-ok → framework-ok
```

Emulators, scratch ports (auth 19599, firestore 18599), final tree:
`firestore-admin-user-directory`, `firestore-console-stores` (member count),
`firestore-approval-stats`, `firestore-impersonation-sessions`, `firestore-flags` (dotted key
removal) and `me-routes` → 6 files, 18 tests passed.

Postgres (compose container, run before the last rebase, which brought client files only):
`postgres-trace-costs.postgres.test.ts` → 2 passed; `postgres-usage-repository.postgres.test.ts`
(with the new day-and-model grouping) → 10 passed.

Not run: e2e (`admin.spec.ts` asserts none of the changed copy), a browser pass of the pages, the
full emulator and Postgres suites, the desktop build, and the backfill against a real project.

The web build prints "Ecmascript file had an error" for `create-prompt-version.ts`,
`record-message-feedback.ts` and `session-secret.ts`. None of these files is touched by this task
(`git diff --name-only 1538c32..HEAD` has none of them) and the build exits 0. Not investigated.

**TDD.** Red was seen first for: the user search handler (fork 1), the flags and workflows view
tests of gaps 6 and 9. Written together with the code, never seen red: the service test of gap 6,
the handler and use-case tests of gaps 3, 4, 5 and 7, the Postgres and emulator tests, and the
client view tests of gaps 1, 3, 4, 5 and 7. For gap 2 it is unknown (the fork's report was lost).

## Decisions and limits (details in decision 0044)

1. **User search is prefix only.** "souza" does not find "Ana Souza". Name search needs
   `users.searchName`; profiles that predate it are found by email or id until
   `pnpm users:backfill-search-names` runs in that environment. Email search assumes Firebase Auth
   stores emails in lowercase (not verified against a real project).
2. **The search text is in a GET query string.** The core's request log has no URL; a proxy that
   logs URLs would record it.
3. **Organization search scans** live organizations on the server (2 000 per call, continuing by
   cursor); the member count is distinct users with a live grant, capped at 10 000 grants.
   `AdminOrganizationFilter` and `/admin/costs` still load the whole list (at most 2 000).
4. **Agent tools and skills are declared** in `AgentDefinition.catalog`, because an agent's tools
   are resolved per run. The five core agents declare them from the constants `create` uses.
5. **Usage reads the ledger once per organization** under its row level security, eight at a
   time, at most 2 000 (`truncated` beyond). Days are UTC, unlike the other admin dates.
6. **Staff may end a colleague's impersonation session.** SP1 allowed only one's own. It is
   audited with who ended it and cannot start or extend access.
7. **Trace cost** is the ledger's sum for the trace: one read per tenant on the page, bound to
   calls from 1 h before to 48 h after the trace starts. Unknown (`null`) for platform traces,
   traces without ledger rows and traces with an unpriced call. Spans have no cost.
8. **Override removal reuses `FEATURE_FLAG_UPDATED`** with `changes: ["tenantOverride"]`. Audit
   metadata is an allowlist, so no "cleared" marker was added.

## Concerns

1. **No browser pass.** Every new section is covered by component tests with a fake API only.
2. **The backfill must run once per environment** (follow-up 50).
3. **Gap 2 has no implementer report.** Its tests pass on the final tree, including the emulator
   test of the member count, but nobody reviewed its client changes beyond the test results.
4. **`firestore-impersonation-sessions.emulator.test.ts` assumes a fresh emulator.** Its rows are
   dated in 2099 to sort first; a second run against the same emulator data would see the rows of
   the first run. `emulators:exec` starts clean, so CI is not affected.
5. **Machine load during the work.** With three agents running suites, the first test of several
   client files timed out at the default 1 s `findBy` wait; the same files pass alone and in the
   final full run. Nothing was changed to hide it.
6. **`users.searchName` touches the three writers of `users/{uid}`** (identity `ensure` and
   `updateProfile`, access `create`). It is additive and reads drop it, but it is a change to SP1
   write paths made by a fork.

## Follow-ups added (rows 45–57)

Evals in `/admin` (not in the ten items), the admin run stream and approval settling on cancel,
staff connector actions, logs outside local, browser pass and e2e, the backfill run, prefix-only
search and `POST` search, organization search and picker at scale, catalog drift, usage read cost,
trace cost window and span cost, tenant removal of its own flag override, and the tripwire rate.
Already tracked elsewhere and not repeated: linting `lib` folders (row 43). Done by another agent:
the neutral i18n namespace for shared widgets (`4c4e481`).
