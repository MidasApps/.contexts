# SP1 follow-ups #21 and #22: implementer report

- **Date:** 2026-09-30
- **Branch:** `feat/agentic-app-core-sp0`. Built in the scratch worktree `wt-sp1-fu`, which holds no SP2 WIP, and
  replayed onto the branch tip. SP2's uncommitted files were never staged.
- **Decisions:** 0030 amendments A5 (#22) and A6 (#21).
- **Follow-ups:** #21 and #22 are marked done in `docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md`.

## #22: a member below the organization can set its active organization

- **Before:** `PUT /v1/me/active-organization` authorized `core.organization.read` at the organization. Grants
  inherit downwards only, so a user whose only grant sat on a project or unit got `ACCESS_DENIED`, no `tenantId`
  claim, and no direct Rules reads.
- **Check now** (`access/application/organization-membership.ts`, `requireOrganizationMember`):
  - reads the caller's live grants in the organization from `memberships` (`listOfPrincipals`), never from the
    access projection;
  - walks the distinct grant nodes, organization first, at most 50;
  - accepts the first node where `getEffectivePermissions` succeeds. That call runs the same chain, organization
    status and principal checks as `authorize()`, without requiring any specific permission, so any role
    qualifies, custom roles included;
  - fails closed. Without a live grant it answers `NOT_A_MEMBER` (404). Otherwise the first node's reason:
    deleted node 404, suspended organization or disabled user 403. A reader error rejects (500). Impersonation is
    still refused before the check.
- **Wiring:** `AccessServices.requireOrganizationMember`; `MeDeps.membership`; `createCoreServer` passes
  `access.services`; `me.fixture.ts`.
- **Contract:** the endpoint summary says "any live grant in the organization"; `docs/openapi/v1.yaml`
  regenerated.
- **Already true, now pinned by tests:**
  - `GET /v1/me/organizations` lists the organization, because it pages the live access projections.
  - `computeCoreClaims` sets `tenantId`, because the projection of a project-only grant is live.
  - Rules: the SP1 gate's 58 Rules tests already cover project and unit members holding an active-tenant claim.
    No Rules change was needed.
- **Switching grants nothing.** `GET /v1/me/context?organizationId=…` at the organization level still answers 404
  for a project-only member. The UI must ask for the context at the member's project or unit. The emulator test
  asserts both.
- **Seed:** `seed-members.ts` sets the active organization for every grant. `member@demo.local` now starts in the
  demo organization.

## #21: the core registers a neutral unit type

- `tenancy/domain/core-unit-types.ts`: `CORE_UNIT_TYPES`, which holds only `core.unit`.
  - Label key `common.unitTypes.unit`.
  - Allowed under `project` and under `core.unit`.
- `createTenancyServices` registers it before the modules' types, so every app (web, desktop, scripts) has it.
  `core` is a reserved module id, so no module can collide with it.
- Exported from `@core/services` as `CORE_UNIT_TYPE_ID` and `CORE_UNIT_TYPES`.
- The contract description of `tenancy.UnitTypeDefinition` changed, and the catalog and OpenAPI were regenerated.
- **Seed:**
  - `SEED_UNIT_TYPE` is now `CORE_UNIT_TYPE_ID`.
  - `SEED_MODULE` is gone.
  - `seed-local.ts` builds the server without modules.
- **README:** the seed section now names `core.unit` and the member's active organization.

## TDD

- **Red first:**
  - `set-active-organization.test.ts`: 5 of 8 cases failed. The other 3 were denial cases, which already held.
  - The #21 tests (`project-and-unit-use-cases.test.ts` with 2 cases, `composition.test.ts`): 3 failed with the
    registry change reverted.
  - `seed-core-adapter.test.ts` and the flipped `seed-sp1-steps.test.ts` assertion: both failed.
- **Then green.** The first try of the new emulator case returned 500, because a hand-written users doc lacked
  `preferences`. The test now creates the users doc through `GET /v1/me`, as a real client does.

## Verification (worktree `wt-sp1-fu`, scratch emulator ports 41xxx)

| Command | Result |
|---|---|
| `pnpm turbo run lint typecheck` (services, scripts, contracts, web) | 8/8 tasks successful |
| `pnpm -F @core/services test` | 87 files, 642 tests passed (632 at the SP1 gate) |
| `pnpm -F @core/scripts test` | 12 files, 62 tests passed |
| `pnpm -F @core/contracts test` | 27 files, 275 tests passed |
| `pnpm -F @core/contracts contracts:check` | `ok (78 contracts, 70 endpoints, 159 files)` |
| `firebase emulators:exec … "pnpm turbo run test:emulators --concurrency=1 --filter=@core/services --filter=@core/scripts"` | services 25 files, 158 tests passed; scripts 2 passed |
| `pnpm seed:local` twice on fresh scratch emulators | both exit 0; the first run reported `member active organization`, the second `unchanged grants` and `tenancy: unchanged` |
| Scratch probe after a seed (Admin SDK, never committed) | `member@demo.local` claims `{ accessVersion: 1, tenantId: <demo org> }`, `lastContext` set, units `Unit A`/`Unit A.1` of type `core.unit` |
| `git diff --quiet main -- .contexts .claude && echo framework-ok` | `framework-ok` |

## Uncommitted i18n hunks for SP2's commit plan

The label `common.unitTypes.unit` lives in `packages/i18n/src/messages/*/common.json`. SP2 has uncommitted changes
to those files, so the key was added only in the main working tree. Add these hunks to SP2's i18n commit:

- `pt-BR/common.json`: `"unitTypes": { "unit": "Unidade" }`
- `en-US/common.json`: `"unitTypes": { "unit": "Unit" }`
- `es-419/common.json`: `"unitTypes": { "unit": "Unidad" }`

Until then, `UnitTreeEditor` falls back to the type id, so it shows `core.unit`.

## Concerns

1. `docs/openapi/v1.yaml` and `docs/catalog/catalog*.json` are generated and SP2-dirty. The commits carry the
   regenerated versions built from the committed sources. The working-tree copies were 3-way merged on replay, and
   SP2 must re-run `pnpm contracts:catalog` before it commits.
2. `GET /v1/me/organizations` still lists an organization whose only live grant sits on a deleted project, because
   the projection stays live. Switching to it answers 404. This is harmless but inconsistent. Revoking grants on
   project delete would fix it (out of scope).
3. A users doc without `preferences` makes `GET /v1/me/context` answer 500. Only hand-seeded test docs lack the
   field; `GET /v1/me` always writes it.
