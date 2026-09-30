# SP1 gate report: identity, tenancy and RBAC

- **Date:** 2026-09-30
- **Branch:** `feat/agentic-app-core-sp0`. Code at the SP1 Task 19 and 20 commits (rebased onto SP3's `e87d1c2`),
  run in the scratch worktree `wt-sp1-t19`, which holds no SP2 WIP.
- **Gate (umbrella spec §13, SP1 spec §9):** Rules and `authorize` tests covering inheritance, multi-org,
  fail-closed, device and staff. Gate commands: `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm test:emulators`, `pnpm contracts:check`.
- **Emulator ports:** the default emulator ports belong to other agents' emulators. Every emulator command below
  therefore used a scratch `firebase.scratch.json`, which is never committed: auth 39099, firestore 38080, ws 39150,
  storage 39199, functions 35001, hub 34400, logging 34500.

## Gate items → evidence

| Gate item | Evidence |
|---|---|
| `authorize()`: inheritance org → project → unit → sub-unit | `access/application/use-cases/authorize.test.ts`, 47 tests. The "inheritance" block has 6: an owner writes at a deep unit, a project viewer reads every unit below, a unit grant covers its descendants, a grant never flows upwards. |
| `authorize()`: multi-organization isolation | Same file, "isolation" block (4): sibling units, sibling projects and the organization level, two organizations of one user, another organization's owner. |
| `authorize()`: fail-closed | "fail-closed and per-request reads" (5): each of the grants, node-chain and principals readers throwing rejects and never allows; reads are memoized per request only; a revoked grant is seen on the next request. Other blocks also deny deleted, missing or mismatched nodes, suspended organizations, unknown permissions, scope mismatches, disabled users and unparsable expiries. |
| `authorize()`: device | "device principal" (3): active device through its own grant; revoked device denied; wrong tenant or wrong claim denied. Decision 0030 A1: the `device` role reads the context (`devices.emulator.test.ts`). |
| `authorize()`: staff | "platform staff" (4): admin with MFA; MFA required; support limited to reads and impersonation; inactive or non-staff denied. "impersonation" (6): reads only, time-boxed, fail-closed expiry, no platform permissions. Route level: `impersonation.emulator.test.ts` (2). |
| `authorize()`: API key, ceiling, custom roles | "service principal (API key)" (8), "agent ceiling" (2), "roles, grants and nodes from the source" (9). |
| Rules: every collection denies client writes | `shared/firestore-access-rules.emulator.test.ts` (58 tests). For each of the 5 readable and 19 server-only collections, create, update and delete are denied for all 13 principals: anonymous, owner (3 active-tenant variants and one without a tenant), project, unit, sibling, revoked and outsider members, device, staff and impersonated. |
| Rules: reads per SP1 spec §5.5 | Same file. `users` self only. `access` only its own doc of the active tenant. `organizations` only the active tenant and non-revoked members. `projects` via `orgWide` or `visibleProjectIds`. `units` via an org-wide, project or ancestor grant, never a sibling. Soft-deleted organizations, projects and units are denied. A list query is allowed only when it filters by `tenantId` and `deletedAt`. |
| Rules: cross-tenant, revoked, non-active tenant claim | Same file. The owner of two organizations reads only the one in its token. A revoked member, an outsider with a forged `tenantId` claim and a token without a tenant are all denied. |
| Rules: device principal | Same file. A `principalType: device` token reads its tenant's organization, projects and units through its project grant, and never another tenant's. |
| Rules: staff and impersonation | Same file. A staff token has no direct tenant reads. A token with the `imp` claim reads nothing directly (decision 0030 A4). |
| Rules: server-only collections unreadable | Same file. Each of these is denied for every principal, both by id and by a `tenantId` query: `platform-staff`, `unit-tree-locks`, `roles`, `memberships`, `invitations`, `devices`, `device-activations`, `api-keys`, `impersonation-sessions`, `approval-requests`, `sessions`, `audit-logs`, `platform-audit-logs`, `rate-limit-buckets`, `idempotency-records`, `files`, `connectors`, `local-secrets` (SP3), `module-settings`. A coverage test fails when a new `CORE_COLLECTIONS` entry is not classified. |
| Rules tests catch regressions | A mutation run removed `!isImpersonated()`, the `visibleProjectIds` check, the unit id in `canSeeUnit` and `notDeleted()` on organizations. 7 tests failed, and the rules were then restored. |
| Indexes | `shared/firestore-indexes.test.ts` (5). Every composite index starts with `tenantId`, or with a tenant- or user-bound key (`access.principalId`, `units.projectId`, `sessions.uid`). Every adapter query of Tasks 7–18 that needs an index has one. There are no duplicates. TTL is set on `expiresAt` of `rate-limit-buckets`, `idempotency-records` and `device-activations` only. A mutation run (one index dropped, one wrong first field, one TTL removed) failed 3 tests. `firestore.indexes.json` needed no change. |
| SP0 deny tests kept | `shared/firebase-rules.emulator.test.ts` (8) passes. It now seeds once and no longer clears the emulators, which other packages' emulator tests share. |
| Local seed | `pnpm seed:local` ran twice on fresh scratch emulators, both times with exit 0. The second run reported `tenancy: unchanged`, `members: unchanged grants`, `platform staff: unchanged` and knowledge `0 indexed, 2 unchanged`. The owner and member accounts are reset to their passwords on every run. A probe signed in as the owner through the emulator REST API and called the `GET /v1/me/organizations` route: `200 ["Demo Organization","Second Organization"]`, with the token's `tenantId` equal to the demo organization. |

## Commands

| Command | Result |
|---|---|
| `pnpm lint` | exit 0 (11/11 tasks) |
| `pnpm typecheck` | exit 0 (11/11 tasks) |
| `pnpm contracts:check` | `contracts:check ok (78 contracts, 70 endpoints, 159 files)` (after rebasing onto SP3's `e87d1c2`) |
| `pnpm test` | services 632 (after the rebase; 623 before), contracts 275, agents 245, scripts 61, mastra 44, i18n 44, web 30, functions 26, desktop 22, config 2: all pass. **`@core/client` fails in the scratch worktree:** `tokens.test.ts` cannot find the `:root,\n[data-theme="dark"]` block which is consistent with the fresh checkout's CRLF endings (`core.autocrlf`); not re-run with LF. SP2 has uncommitted changes to both that test and `globals.css`. SP1 does not touch `@core/client`. |
| `firebase emulators:exec … "pnpm turbo run test:emulators --concurrency=1"` | services 146/146 (23 files) and agents 6/6 before the rebase; after rebasing onto `e87d1c2`, services 157/157 (25 files, including the 58 Rules tests) and scripts 2/2. In the same run, `@core/functions` failed: the Functions emulator logged "User code failed to load … Timeout after 10000" at startup, before any test ran. |
| same, `--filter=@core/functions --filter=@core/scripts --filter=@core/mastra` | functions 6/6, scripts 2/2, mastra 4/4, exit 0. |
| root `pnpm test:emulators`, which runs the packages in parallel | Not green on this machine. `@core/functions` "marks a real PNG ready" times out while the Functions emulator is loading its worker, and one run died with the Firestore JVM out of memory (313 MB free). The same test passes when run alone. Follow-up #23. |
| `git diff --quiet main -- .contexts .claude && echo framework-ok` | `framework-ok` |

## Decisions (SP1)

- 0006 tenancy and access model
- 0007 authentication sessions
- 0008 API keys and device activation
- 0009 rate limiting and idempotency store
- 0010 dependency audit advisories
- 0030 SP1 review hardening, with amendments:
  - A1: the device role reads its context
  - A2: redeem re-checks the creator
  - A3 (new): an interrupted approval stays `approved`; it is visible through `?status=approved`, and SP5 adds the
    sweep
  - A4 (new): Rules deny impersonated tokens and keep one `get()`

## Follow-ups (`docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md`)

- #10, #12c and #12e were already done: Tasks 1, 2 and 8.
- New:
  - #20: approval sweep job and its platform index (SP5).
  - #21: the seed's own unit type `seed.unit` (SP2).
  - #22: a project-level member cannot set an active organization (SP1/SP2).
  - #23: root `test:emulators` flakes under parallel load (DX/CI).
