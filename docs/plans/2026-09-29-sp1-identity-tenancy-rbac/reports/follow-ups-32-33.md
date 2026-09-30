# SP1 follow-ups #32 and #33, plus two `/v1/me` fixes: implementer report

- **Date:** 2026-09-30
- **Branch:** `feat/agentic-app-core-sp0`. Built in the scratch worktree `wt-sp1-fu2`, which holds no SP2 WIP, and
  replayed onto the branch tip. SP2's uncommitted files were never staged.
- **Decisions:** 0030 amendments A7 (#33, `/me/organizations`, `/me/context`) and A8 (#32).
- **Follow-ups:** #32 and #33 are marked done in `docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md`.
- **Also closes:** concerns 2 and 3 of `follow-ups-21-22.md`.

Contexts read: `docs/plans/execution-constraints.md`, `using-ddc`, follow-ups #32/#33, SP2 `reports/task-24.md`,
SP1 `reports/follow-ups-21-22.md` and `sp1-gate.md`, decision 0030 (A5, A6), the client's `localizeAcceptUrl`,
`OrganizationHomeView` and `route-paths.ts` (read only).

## Fix 1: `GET /v1/me/context` with a users doc that lacks `preferences`

- **Before:** `resolveAccessContext` read the whole users doc through the strict `identity.User` converter. A doc
  without `preferences` threw `CorruptDocumentError`, and the route answered 500.
- **Now:** `UserRepository.getRegionalPreferences(uid)` reads only `preferences.{locale,timeZone,currency}`,
  leniently (`.optional().catch(undefined)`). When they are missing or unreadable, the context resolves with the
  node's settings (organization defaults), which is fail-safe. `GET /v1/me` still heals the doc through `ensure`.
- **Test:** emulator case "resolves the access context with default preferences when the users doc lacks them". It
  was red (500) before the fix.

## Fix 2: `GET /v1/me/organizations` and grants on deleted nodes

- **Before:** the list paged the caller's live access projections. A projection stays live for a grant whose
  project was deleted since, so an organization the caller could no longer switch to was still listed.
- **Now:** each organization on the page must also pass `requireOrganizationMember` (A5), using the request's
  access scope. An organization is dropped when its reason is `NOT_A_MEMBER` or `NODE_NOT_FOUND`.
  - A **suspended** organization stays listed. Its members still see it, and switching answers 403.
  - An organization whose first reason is `PRINCIPAL_INACTIVE` (a disabled user) is dropped too.
  - A reader error rejects the request (fail-closed, 500).
  - A page may hold fewer items than its limit. The cursor still comes from the projections.
- **Call sites:**
  - `ListMyOrganizations` now takes `access`. `me-routes.ts` passes `scope`.
  - The seed (`scripts/src/seed/seed-core-adapter.ts`) passes `server.access.forRequest()`.
- **Tests:**
  - `list-my-organizations.test.ts` (4 cases). "drops … deleted project" and "fails closed" were red first.
  - The emulator project-member case now deletes the project, then expects `[]`.

## #33: `GET /v1/me/grants`

- **Endpoint:** `identity.listMyGrants`, `GET /v1/me/grants?organizationId=…&cursor&limit`, `auth: user`.
  - Response: `listEnvelope(access.MyGrant)`, where `MyGrant` is `{ node: TenantNodeRef, roles: RoleRef[] }`.
  - Errors: `403`, `404`.
  - `MyGrantsQuerySchema` is `PageQuerySchema.extend({ organizationId })`.
  - The descriptor and contract live in `@core/contracts`: `contracts/access/my-grant.schema.ts` and
    `contracts/identity/endpoints.ts`.
  - The shape reuses the discriminated `TenantNodeRef`, the same one `Membership.node` uses: `level`, `tenantId`,
    and `projectId`/`unitId` when present. The brief's example had a flat `nodeType`/`nodeId`.
- **Semantics:** `listLiveGrantNodes` in `access/application/organization-membership.ts`.
  - It reads the caller's grants from `memberships`, the source of truth.
  - It merges the roles of the grants on each node.
  - It keeps a node only when `getEffectivePermissions` accepts it there. That is the same liveness check as the
    A5 switch, so a grant on a deleted project or unit is skipped.
  - It orders nodes widest first (organization, project, unit) and caps them at 50, like A5.
  - The use case (`identity/application/use-cases/list-my-grants.ts`) pages the nodes in memory
    (`paginateInMemory`, position `[levelOrder, nodeId]`).
- **Authorization:** self only. The use case reads the caller's own grants and needs no permission. With no live
  node, it answers the same denial as the switch: 404 `NOT_A_MEMBER`/`NODE_NOT_FOUND`, or 403 for a suspended
  organization or a disabled user.
- **Refactor:** `requireOrganizationMember` now shares `readGrantNodes` with it. Its behavior is unchanged.
- **Tests:**
  - `list-my-grants.test.ts` (8 cases): unit-only member, widest-first order, deleted project skipped, cursor, 404
    and first reason, suspended organization, owner, fail-closed. They were red first: 8/8 failed with
    `listMyGrants is not a function`.
  - Emulator case "lists the grant nodes of a unit-only member":
    - the unit-only member gets `200` with `[{ node: unit, roles }]` and `meta.page`;
    - the founder gets only its organization node;
    - an outsider gets `404`;
    - a request without `organizationId` gets `400`.
  - `my-grant.schema.test.ts` (3 cases).
  - `endpoints-coverage.test.ts` lists the new route; it is not a row of the spec table.
- **Catalog and OpenAPI:** regenerated. `contracts:check ok (79 contracts, 72 endpoints, 161 files)`.

### Exact client change for SP2 (not made here: the client is uncommitted SP2 work)

In `packages/client/src/views/organization-home/ui/OrganizationHomeView.tsx`, replace the body of
`EntryProjectRedirect` (today it uses `useProjects` and the first project) with a lookup of the caller's grant
nodes:

1. Add a query hook, for example in `entities/organization/api/` (or next to `project-queries.ts`):

   ```ts
   export const useMyEntryNode = (organizationId: string) => {
     const callEndpoint = useCallEndpoint();
     const signedIn = useIsSignedIn();
     return useQuery({
       queryKey: ["organizations", organizationId, "me", "grants"],
       queryFn: ({ signal }) =>
         nullOnNotFound(async () => (await callEndpoint(listMyGrantsEndpoint, { query: { organizationId, limit: 1 }, signal })).data[0] ?? null),
       enabled: signedIn && organizationId !== "",
     });
   };
   ```

   Items come widest first, so `limit: 1` is the landing node.
2. In `EntryProjectRedirect`, once `data` is a node:
   - `level === "project"`: `router.navigate({ id: "project", organizationId, projectId: node.projectId }, { replace: true })`.
   - `level === "unit"`: `router.navigate({ id: "project", organizationId, projectId: node.projectId, unit: node.unitId }, { replace: true })`.
     This is the case that fixes unit-only members.
   - `level === "organization"` does not happen here, because the organization-level context was 404. Render not-found.
3. When `data === null` (404: no live grant), render `PageNotFound` as today. Any other error renders `PageError`
   with retry.
4. A unit-only member has no project-level grant. The project page it lands on must therefore resolve
   `GET /v1/me/context` with `unitId` when `?unit=` is set, and must not treat the 404 of `GET /v1/projects/{id}` or of
   the project-level context as the page's not-found. Check that path in the project view.
5. Tests:
   - Update the two `OrganizationHomeView` redirect tests: mock `identity.listMyGrants` instead of the projects
     list, and add a unit case that expects `/o/:org/p/:project?unit=:unit` with `replace`.
   - Add an e2e case to `shell.spec.ts` with a unit-only seed member.
   - Import `listMyGrantsEndpoint` from `@core/contracts`, which is already exported.

## #32: localized invitation links

- `buildAcceptUrl({ appUrl, token, locale })` returns `<app>/{locale}/invite#token=…`.
- `createInvitation` picks the locale with `linkLocaleOf`:
  1. the inviter's `preferences.locale` (new `UserDirectory.getPreferredLocale`);
  2. else the organization's `defaults.locale` (new `OrganizationDirectory.getDefaultLocale`);
  3. each is matched with `negotiateLocale` from `@core/i18n` (RFC 4647 best fit, for example `es-MX` → `es-419`);
  4. otherwise the source locale `pt-BR`.

  The same link goes in the `201` body and to the notifier (e-mail).
- Both Firestore reads are lenient. A users doc without `preferences`, or an organizations doc without `defaults`,
  falls back and never fails the invitation.
- **New dependency:** `@core/services` → `@core/i18n` (`workspace:*`). It is the single source of the supported
  locales (decision 0013). The lockfile gains 3 lines under importer `packages/services`.
  - Imports go through the new subpath exports `@core/i18n/locales` and `@core/i18n/negotiate-locale`
    (`packages/i18n/package.json`). The root would also load every message catalog into the Functions and Mastra
    bundles.
  - The import boundaries (`packages/config/eslint/boundaries.js`, spec §3) now allow `services → i18n`. i18n is a
    leaf and imports nothing of the workspace. The first lint run failed on exactly this rule.
  - `@core/functions` and `@core/mastra` build with it.
- **Contract:** the `acceptUrl` description and example of `access.CreateInvitationResponse` changed. The catalog
  and OpenAPI were regenerated.
- The SP2 client's `localizeAcceptUrl` returns a link that already carries a supported locale unchanged, so the
  copied link is not doubled. It is now redundant and can go when SP2 lands.
- **Tests:**
  - `invitation-token.test.ts`.
  - `invitation-use-cases.test.ts`: the existing case now expects `/pt-BR/`. The new case covers the preference
    `es-MX` → `es-419`, an unsupported preference with the org default `en-US`, and neither supported → `pt-BR`.
    It was red before the change.
  - Invitations emulator: the existing case expects `/pt-BR/` for an organization doc without defaults. The new
    case expects `/en-US/` from the org default, then `/es-419/` from the inviter's `es-MX`.

## Commits

1. `fix(identity): default missing preferences in the access context`
2. `fix(identity): hide organizations whose grants sit on deleted nodes`
3. `feat(access): list the caller's live grant nodes`
4. `fix(access): localize invitation accept links`
5. `docs(access): report sp1 follow-ups 32 and 33`

## Verification (worktree `wt-sp1-fu2`, scratch emulator ports 43xxx, `firebase.scratch.json`, never committed)

| Command | Result |
|---|---|
| `pnpm turbo run lint typecheck build` (services, contracts, i18n, config, functions, mastra, scripts) | 16/16 tasks successful |
| `pnpm -F @core/services test` | 93 files, 680 tests passed (642 after #21/#22) |
| `pnpm -F @core/contracts test` | 28 files, 278 tests passed |
| `pnpm -F @core/scripts test` / `pnpm -F @core/config test` | 62 passed / 2 passed |
| `pnpm contracts:check` | `ok (79 contracts, 72 endpoints, 161 files)` before the rebase; after rebasing onto `458b786`: `ok (117 contracts, 84 endpoints, 237 files)`, and the regenerated catalog and OpenAPI equal the committed ones |
| After the rebase: `lint typecheck` (services, contracts, scripts, config), services and contracts unit tests | 8/8 tasks; 680 and 389 tests passed |
| `firebase emulators:exec --config firebase.scratch.json --only auth,firestore,storage "pnpm turbo run test:emulators --concurrency=1 --filter=@core/services --filter=@core/scripts"` | services 26 files, 163 tests passed; scripts 2 passed. An earlier run without `storage` failed only the 3 Storage files, which need that emulator. |
| `git diff --quiet main -- .contexts .claude && echo framework-ok` | `framework-ok` |

## Replay into the main working tree

- `docs/openapi/v1.yaml`, `docs/catalog/catalog*.json`, `packages/contracts/src/index.ts`, `pnpm-lock.yaml` and
  `follow-ups.md` are SP2-dirty. The commits carry versions regenerated from the committed sources. The
  working-tree copies were 3-way merged (`git merge-file`).
- In `follow-ups.md`, SP2's rows #32/#33 were replaced by the done rows. SP2 must re-run `pnpm contracts:catalog`
  before it commits.

## Concerns

1. `GET /v1/me/grants` and the A5 check both stop at 50 distinct grant nodes per organization. A member with more
   grant nodes gets only the widest 50.
2. `GET /v1/me/organizations` now runs one membership check per listed organization. Reads are memoized per
   request, and a page holds at most 100 organizations.
3. The e-mailed link uses the inviter's locale, because the invitee's locale is unknown at creation.
4. The seed adapter change (commit 2) keeps `pnpm seed:local` compiling; the seed itself was not re-run.
5. The client landing change above is SP2's to make. Until then, unit-only members still see not-found at `/o/:id`.
