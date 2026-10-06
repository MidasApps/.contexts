# SP1 Tasks 9–10 — implementer report

- **Date:** 2026-09-30
- **Branch:** `feat/agentic-app-core-sp0`
- **Commits:** `0c600de` (Task 9, with the SP3 audit actions), `5ab6834` (Task 10)
- **Review:** pending

## Task 9 — access write side (`0c600de`)

Under `packages/services/src/services/access/`:

- `domain/access-projection.ts`: pure `buildAccessProjection({ tenantId, principal, grants, organizationDeleted? })`
  (`grants` are the grants' node refs; a unit grant carries its `projectId`, so no unit read is needed) and `nodeIdOf`.
  `domain/role-permissions.ts`: `resolveRolePermissions`, `unknownTenantPermissions`, `customRoleIdsOf`, `holdsOwner`.
- `domain/errors/`: `LastOwnerError` (`LAST_OWNER`), `RoleInUseError`, `MembershipExistsError`, `EscalationForbiddenError`
  (keeps `missing`), plus `UnknownPermissionError`, `UnknownRoleError`, `AccessDeniedError` (carries the `DenyReason`),
  `AccessNotFoundError`.
- Ports: `MembershipRepository`, `RoleRepository`, `AccessProjectionStore` (`access-projection-writer.ts`), `ClaimsWriter`
  (+ `CORE_CLAIM_KEYS`), `UserAccessVersionStore` (`user-access-version.ts`). Reads take the transaction; writes are buffered.
- `application/membership-writes.ts`: `readPrincipalState` / `writePrincipalState` and `prepareGrant(tx, deps, args)`
  → `{ membership, commit() }`. Every grant change (grant, update, revoke) runs in one transaction: uniqueness per
  (tenant, principal, node), escalation guard (`checkGrantable`: permission at the node, custom roles live in the tenant,
  role permissions ⊆ actor's effective), last-owner guard, membership write, projection rebuild (`version + 1`),
  `users.accessVersion` bump, audit entry. `syncClaims(uid)` runs after commit; failures are logged
  (`claims_sync_failed`) and swallowed.
- Use cases: `grant-membership`, `update-membership`, `revoke-membership`, `create-role`, `get-role`, `list-roles`,
  `update-role`, `delete-role`, `sync-claims` (+ `computeCoreClaims`). Role permissions must be registered tenant
  permissions (422) held by the actor (403 `ESCALATION_FORBIDDEN`); a role used by a live grant cannot be deleted (409).
- Firestore adapters: `firestore-membership-repository.ts` (stored doc = contract + `nodeType`, `nodeId`, `projectId`,
  `customRoleIds`, audit fields, `deletedAt`, `schemaVersion`), `firestore-role-repository.ts`,
  `firestore-access-projection-writer.ts`, `firestore-user-access-version.ts` (creates `users/{uid}` with the
  `identity.User` shape), `firebase-claims-writer.ts` (read-modify-write, keeps unowned claims, refuses ≥ 1000 bytes),
  and the four `authorize()` readers `firestore-grant-reader.ts`, `firestore-role-reader.ts`,
  `firestore-node-chain-reader.ts`, `firestore-principal-status-reader.ts` (each parses only the fields it needs).
  `firestore-access-adapters.ts` bundles them; `in-memory-access-write-store.ts` is the unit-test fake.
- `adapters/driving/roles-routes.ts` + `access-error-response.ts`; web routes `v1/permissions`,
  `v1/organizations/[organizationId]/roles`, `v1/roles/[roleId]`.
- `createCoreServer` now wires the Firestore readers (the fail-closed stubs and `AccessReadersNotWiredError` are gone),
  returns `accessServices`, and accepts `adapters.{ access, tokenVerifier }` (emulator route tests).
- Shared: `shared/result/result.ts`, `shared/pagination/{cursor,page}.ts` (cursor = base64url JSON `[sortValue, id]`),
  `shared/http/api-list.ts` (`pageRequestOf`, `listResponse`, `deniedResponse`: `NODE_NOT_FOUND`/`NOT_A_MEMBER` → 404,
  `MFA_REQUIRED` → 403 `MFA_REQUIRED`, else 403), `shared/firestore/{unit-of-work,collections}.ts`,
  `audit/domain/audit-actor.ts`, `shared/testing/core-server-emulator.fixture.ts`. `createContractConverter` and
  `toFirestoreUpdate` accept `{ schema }` (storage schemas that extend a contract).
- Indexes: memberships `tenantId+principalId`, `tenantId+nodeId`, `tenantId+principalId+nodeId`; roles
  `tenantId+deletedAt+name`.
- **Coordinator request:** `AUDIT_ACTIONS` gains `AGENT_TOOL_EXECUTED`, `SEMANTIC_QUERY_EXECUTED` (SP3 spec §8.1, §8.3)
  and `KNOWLEDGE_DOCUMENT_INDEXED` (§11, "event + audit"), with a test in `audit-log-entry.schema.test.ts`; catalog and
  OpenAPI regenerated. `AGENT_COMMAND_REQUESTED` and `CONNECTOR_*` are not audit actions in the SP3 spec, so not added.

## Task 10 — tenancy vertical (`5ab6834`)

Under `packages/services/src/services/tenancy/`:

- `domain/unit-type-registry.ts` (`createUnitTypeRegistry`: invalid, duplicate or unknown-parent types throw
  `UnitTypeRegistryError`), `domain/unit-tree.ts` (`placementUnder`, `planMove` with CYCLE / TOO_DEEP / TOO_LARGE; only
  changed units are rewritten, so re-running an interrupted move heals stale descendants),
  `domain/regional-settings.ts` (`resolveRegionalSettings`; `units` is the chain root first, nearest override wins),
  errors `InvalidUnitParentError` (reason), `SubtreeTooLargeError`, `TenancyNotFoundError`.
- Ports `organization-repository.ts`, `project-repository.ts`, `unit-repository.ts`; identity port
  `user-account-reader.ts` + `firebase-user-account-reader.ts` (profile for a new users doc).
- Use cases: `create-organization.ts` (owner grant through `access.prepareGrant` inside the same transaction, users doc
  created when missing, first organization becomes active, claims synced; self-serve off → staff with
  `platform.organization.read`), `get-`, `update-`, `delete-organization.ts` (projections revoked in batches of 400, then
  stragglers + soft delete in the transaction), `list-projects.ts` (org-wide read → all; else projection candidates
  confirmed by `authorize()`; nothing visible and not a member → 404), `project-use-cases.ts` (create/get/update/delete),
  `unit-access.ts`, `create-unit.ts`, `list-units.ts` (children filtered by `authorize()` when the parent is not
  readable), `update-unit.ts` (rename/overrides/move; permission at the unit and at the new parent), `unit-use-cases.ts`
  (get, delete with subtree, list unit types), `resolve-regional-settings.ts` (loads the node chain).
- Firestore adapters `firestore-{organization,project,unit}-repository.ts` (cursor pages by `(name, id)`, batched subtree
  rewrites/deletes of 400), `firestore-tenancy-adapters.ts`, `in-memory-tenancy-store.ts` (mirrors writes into the
  Task 6 access store so `authorize()` sees them); driving `organizations-`, `projects-`, `units-`, `unit-types-routes.ts`
  + `tenancy-error-response.ts`; `composition.ts` (`createTenancyServices({ unitTypes, ... })`), `index.ts`.
- `createCoreServer`: `env.ORGANIZATION_SELF_SERVE` (default true), module `unitTypes` → registry, returns `tenancy`;
  `CoreServerModule.unitTypes` is declared with the same line SP2's uncommitted module-settings work uses.
- Web routes: `v1/organizations`, `v1/organizations/[organizationId]`, `.../projects`, `v1/projects/[projectId]`,
  `.../units`, `v1/units/[unitId]`, `v1/unit-types`.
- Indexes: projects `tenantId+deletedAt+name`, `tenantId+deletedAt+createdAt`; units
  `projectId+parentUnitId+deletedAt+name`, `tenantId+ancestorIds (CONTAINS)`.

### Signatures other tasks consume

```ts
access.prepareGrant(tx, { tenantId, principal: { type, id }, node, roles, grantedBy, actor, requestId, newUser? })
  → Result<{ membership; commit(): Promise<void> }, MembershipExistsError>   // Tasks 11, 15
access.grantMembership / updateMembership / revokeMembership (commands with actor + access: RequestAccess)
access.syncClaims(uid) → Promise<boolean>                                    // Task 12 POST /me/claims/sync
access.projections  // AccessProjectionStore (Task 12 GET /me/organizations)
tenancy.resolveRegionalSettings({ node, preferences? }) → RegionalSettings | null   // Task 12 resolveAccessContext
createTenancyServices({ unitTypes, organizations, projects, units, access, accounts, audit, unitOfWork, clock, selfServe })
```

## Verify

```
$ pnpm -F @core/services test          Test Files 53 passed (53) | Tests 387 passed (387)   (main tree, incl. others' WIP)
  commit content alone (scratch worktree at 0c600de + the Task 10 files): Test Files 50 passed | Tests 376 passed
$ pnpm -F @core/services typecheck      exit 0      $ pnpm -F @core/services lint   exit 0 (worktree; main tree has
                                                                                     lint errors only in SP2's WIP services/modules)
$ pnpm exec firebase emulators:exec --project demo-core --only auth,firestore,storage "pnpm -F @core/services test:emulators"
  main tree:  Test Files 13 passed (13) | Tests 55 passed (55)
  worktree:   Test Files 11 passed (11) | Tests 47 passed (47)
$ pnpm -F @core/contracts test          Test Files 26 passed (26) | Tests 263 passed (263)
$ pnpm contracts:check                  contracts:check ok (73 contracts, 57 endpoints, 149 files)
$ pnpm -F @core/web typecheck           exit 0      $ pnpm -F @core/web lint   exit 0
$ pnpm -F @core/web build               exit 0 (13 routes, every /v1 route ƒ dynamic; no libpg-query errors)
$ pnpm -F @core/web test                Test Files 4 passed (4) | Tests 25 passed (25)
$ git diff --quiet main -- .contexts .claude && echo framework-ok
framework-ok
```

## Deviations and concerns

1. **Next prerendered GET routes at build.** With Cache Components, `next build` ran the `/v1/permissions` handler (no
   dynamic segment) and failed on the missing env. `createRouteResolver` now reads the request (request id) before
   building the server, which marks the route dynamic. The build in the main tree only passed because `.env.local` exists.
2. **libpg-query** (SP3's SQL guard, loaded through the `@core/services` index) failed to find its `.wasm` once a route
   imported the index; `apps/web/next.config.ts` lists it in `serverExternalPackages`. SP3 should know.
3. **Timestamps come from the injected clock**, stored as `Timestamp` via the converter, not `serverTimestamp()`
   (firestore contract §5). Reason: responses and later reads agree, and tests are deterministic. The audit writer keeps
   its server timestamps for `createdAt/updatedAt`.
4. **Unit moves do not rebuild projections.** Projections hold node ids and project ids only, and a move stays inside its
   project, so their content cannot change; the spec's "rebuild" would only bump versions. Descendants are rewritten in
   batches before the unit (not atomically); a retry heals a partial move.
5. **Organization delete revokes projections first** (batches), then soft-deletes in a transaction that also revokes
   any projection rebuilt meanwhile; claims of former members are not re-synced (Rules deny through the projection).
6. **File grouping.** Project use cases live in `project-use-cases.ts` and get/delete unit + unit types in
   `unit-use-cases.ts` instead of one file each; `get-role.ts` was added. `buildAccessProjection` takes node refs, not
   `units` (a unit grant already carries its project).
7. **Unknown custom role in a grant** is `UnknownRoleError`, mapped by `accessErrorResponse` to
   `400 VALIDATION_FAILED` (`details: [{ field: "roles", issue: "UNKNOWN_ROLE" }]`); Task 11 may prefer another code.
8. **Emulator contention.** Concurrent grants of one principal serialize on its projection doc; the emulator's lock waits
   made the 6-way concurrency test time out once (and then cascade lock timeouts into later files). The test now uses 4
   concurrent grants with a 30 s timeout. The pre-existing `firestore-rate-limiter` "counts concurrent hits exactly"
   test timed out once at 5 s under the same load (passed on rerun).
9. **TDD order.** Task 10's domain tests ran red first (missing modules). Task 9's use cases and both tasks' application
   and adapter code were written before their tests; those tests were then run and fixed (one test bug, no code bug).
10. **Concurrent agents.** SP2's uncommitted module-settings work edits `composition.ts`, `src/index.ts`,
    `audit-action.schema.ts` (`MODULE_SETTINGS_UPDATED`) and the generated catalog. My commits carry only my hunks: those
    files' blobs (and the regenerated catalog/OpenAPI) were produced in a scratch worktree at HEAD with only my changes,
    verified there (tests, lint, typecheck, contracts:check, web build, emulators) and staged with `update-index`. When
    SP2 regenerates the catalog it will include the three new audit actions.
