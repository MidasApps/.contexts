# SP1 Tasks 4–6 — implementer report (plus review fixes of Tasks 1–3)

- **Date:** 2026-09-29
- **Branch:** `feat/agentic-app-core-sp0`
- **Commits:** `e42285c`, `057f8c5`, `40ae162` (review fixes), `1931a86` (Task 4), `5d35ef5` + `ee022d5` (Task 5),
  `2559088` (Task 6)
- **Review:** pending

## Review fixes of Tasks 1–3

| # | Fix | Commit |
|---|---|---|
| 1 | `toFirestoreUpdate(contract, patch)` in `shared/firestore/contract-converter.ts`: `update()` never runs `toFirestore`, so ISO date-times at the contract's date-time paths (top-level keys or dotted paths) become `Timestamp`; sentinels pass through; limits (FieldPath keys, `arrayUnion` elements, no validation) in the JSDoc. Two emulator tests. | `e42285c` |
| 2 | `PageMetaSchema`, `PageQuerySchema`, `listEnvelope` fields carry `pii` (the list's `data` inherits its item's max pii). | `057f8c5` |
| 3 | OpenAPI: 400 `VALIDATION_FAILED` also when an endpoint takes an `Idempotency-Key`; `Location` header on 201; `Retry-After` + `X-RateLimit-Limit/Remaining/Reset` on 429 (`api.md` §11.2). | `057f8c5` |
| 4 | Decisions amended (`## Amendments`, the accepted text is untouched): 0007 `expiresIn` in ms (days × 86 400 000); 0009 in-flight replay = `409 IDEMPOTENCY_REQUEST_IN_PROGRESS`; 0010 `packages/services > firebase-admin` path for `uuid` and an accept row for GHSA-67mh-4wv8-2f99 (`esbuild@0.18.20` via `drizzle-kit`, dev-only CLI, never serves). | `40ae162` |
| 5 | (optional) `createFirebaseAdmin` refuses a reused `core-services` app whose `projectId` differs from the env (`FirebaseProjectMismatchError`). | `e42285c` |

## Task 4 — tenancy and identity contracts (`1931a86`)

- `tenancy/`: ids, `RegionalDefaults`/`NodeRegionalOverrides` shapes, `Organization`, `Project`, `Unit` (tree
  refinement: `ancestorIds.length === depth`, parent = last ancestor, no self/duplicate ancestor), `UnitTypeDefinition`,
  `NodeRef` + `TenantNodeRef` (discriminated by `level`), create/update commands for organizations, projects and units,
  `RegionalSettings`, 15 endpoint descriptors.
- `identity/`: ids, `Principal` (spec §3.1, strict variants), `UserPreferences` (+ `DEFAULT_USER_PREFERENCES`,
  `securityAlerts` literal `true`), `User`, `Me`, `UpdateMeInput`, `SetActiveOrganizationInput`, `SessionSummary`,
  desktop session create/exchange, `Device`, `ApiKey` (+ create input/response, `apiKeyExpiryIssue({ expiresAt, now })`
  checks the 365-day bound against an injected clock), `PlatformStaff` (+ `PLATFORM_ROLES`), impersonation session +
  start input/response, 15 endpoint descriptors.
- Helpers: `field-docs.ts` (`none`/`personal`/`sensitive`), `primitives/refinements.ts` (`hasAnyField`,
  `hasUniqueItems`), `example-values.ts`; per-context `contracts.ts` lists registered by `composition.ts`.
- `composition.test.ts` now also parses every catalog example of every core contract.
- `catalog.ai.json`: 0 fields with `x-pii: sensitive` (only contract-level summaries, decision 0005); contracts whose
  fields are all sensitive are dropped (`ExchangeDesktopSessionInput`, later `RedeemDeviceActivationInput`,
  `InvitationTokenInput`).

## Task 5 — access, audit, approvals, permissions (`5d35ef5`, `ee022d5`)

- `access/`: `PermissionDefinition` (scope rules: `platform.*` ↔ platform scope ↔ staff roles), `SYSTEM_ROLE_KEYS`,
  `CORE_PERMISSIONS`, `RoleRef` (+ `RoleRefListSchema` 1–10 distinct, `roleRefsField`), `Role` + create/update inputs,
  `Membership` + grant/update inputs, `Member`, `AccessProjection` (+ `accessProjectionId`), `AccessContext` (+ query),
  invitations (entity, create input/response with `acceptUrl` sensitive, token input, preview, accept response),
  approval requests (entity, create input, decide input), 21 descriptors.
- `audit/`: `AUDIT_ACTIONS` (spec §6.7 plus `UNIT_MOVED`, `MEMBER_REMOVED`, `DEVICE_ACTIVATION_CREATED`,
  `DESKTOP_SESSION_REUSE_DETECTED`, `IMPERSONATED_REQUEST_SERVED`, `IMPERSONATED_WRITE_DENIED`, `APPROVAL_FAILED`,
  `PLATFORM_ACCESS_DENIED`), `AuditLogEntry` / `PlatformAuditLogEntry` (no email anywhere, `changes: string[]` of field
  names), `AuditLogQuery` (window order refined), 1 descriptor.
- `identity/device-activation.schema.ts` and the descriptors `GET /me/context`, device activations and platform
  impersonation live in this commit (they need `RoleRef`/`AccessContext`).
- `http/error-codes.ts`: `CORE_ERROR_CODES` = the list of the plan plus `IDEMPOTENCY_REQUEST_IN_PROGRESS`,
  `UNKNOWN_APPROVAL_ACTION`, `APPROVAL_NOT_REQUIRED`.
- `src/endpoints-coverage.test.ts`: all 57 `METHOD path` rows of spec §7.3 have a descriptor, no SP1 descriptor
  outside the table, every declared error code is in `CORE_ERROR_CODES`, every `auth: "none"` endpoint is rate limited.
- `ee022d5` (coordinator request): `CORE_PERMISSIONS = [...SP1_PERMISSIONS, ...AGENT_PERMISSIONS]` with tests in
  contracts and in the services registry (agent permissions registered, member/admin defaults).

## Task 6 — `authorize()` core (`2559088`)

Under `packages/services/src/services/access/`:

- `domain/`: `authorization.ts` (`DenyReason`, `GrantSource`, `AuthorizeDecision`), `node-chain.ts` (`NodeChain`,
  `chainNodeIds`, `checkNodeChain`, `isNodeWithin`), `grant.ts` (`GrantRecord`, `CustomRoleRecord`),
  `permission-registry.ts`, `effective-permissions.ts`, `escalation-guard.ts`.
- `application/`: driven ports (`grant-reader`, `role-reader`, `node-chain-reader`, `principal-status-reader`,
  `access-readers`), driving port `ports/driving/authorize.ts`, `request-scope.ts`, `principal-subject.ts`,
  `tenant-access.ts`, `platform-access.ts`, use cases `authorize.ts` and `get-effective-permissions.ts`.
- `adapters/driven/in-memory-access-store.ts` (one fake for the four ports, with `callCount`), `composition.ts`,
  `index.ts`; `shared/clock/clock.ts` (`Clock`, `systemClock`, `fixedClock`, `isAtOrBefore`). All exported from
  `@core/services`.

### Final signatures (for SP3 `runtime-ports.ts`)

```ts
createAccessCore(args: { permissions?: readonly PermissionSource[]; readers: AccessReaders; clock?: Clock }): {
  registry: PermissionRegistry;
  forRequest(): { authorize: Authorize; getEffectivePermissions: GetEffectivePermissions }; // one per request
};
type Authorize = (request: { principal: Principal; permission: Permission; node: NodeRef;
  ceiling?: ReadonlySet<Permission> }) => Promise<AuthorizeDecision>;          // = SP1 spec §5.2
type AuthorizeDecision =
  | { allowed: true; requiresApproval: boolean; grantedVia: readonly GrantSource[] }
  | { allowed: false; reason: DenyReason };                                     // DenyReason = spec §5.2 list
type GrantSource =
  | { kind: "membership"; membershipId: MembershipId; nodeId: string; roles: readonly RoleRef[] }
  | { kind: "platform-role"; role: PlatformRole };
type GetEffectivePermissions = (request: { principal: Principal; node: NodeRef;
  ceiling?: ReadonlySet<Permission> }) =>
  Promise<{ ok: true; permissions: ReadonlySet<Permission> } | { ok: false; reason: DenyReason }>;
type PermissionSource = { moduleId: string; permissions: readonly PermissionDefinition[] }; // core always included
```

`Principal`, `NodeRef`, `TenantNodeRef`, `Permission`, `AccessContext` come from `@core/contracts`. `verifyBearer`
(Task 8) and `resolveAccessContext` (Task 12) are not part of this batch; `AccessContext` =
`{ tenantId, organization, project?, unit?, permissions: Permission[], regional: { locale, displayTimeZone,
nodeTimeZone, currency } }` (the principal is not part of the wire contract).

### Decisions taken inside the algorithm

- Missing `users/{uid}` doc → `PRINCIPAL_INACTIVE` (fail-closed). A device's own doc and tenant must match its claim;
  a key's stored tenant and owner must match its claims.
- Impersonation: any unusable session (missing, ended, expired, other target, other staff, other tenant) →
  `IMPERSONATION_EXPIRED`; writes → `IMPERSONATION_READ_ONLY`; impersonation never reaches platform permissions.
- Platform: non-user or impersonated → `PERMISSION_NOT_GRANTED`; no staff doc → `NOT_A_MEMBER`; inactive staff or
  disabled user → `PRINCIPAL_INACTIVE`; MFA is checked after the role grants the permission (`MFA_REQUIRED`).
- Order of limits: key scope / read-only are checked before grants are read; the ceiling after the grant check, so
  `CEILING_EXCLUDES` means "the principal has it, the agent may not use it".
- `platform-admin` holds every platform permission by rule, like `owner` for tenant permissions.

## Verify

```
$ pnpm -F @core/contracts test          Test Files 26 passed (26) | Tests 262 passed (262)
$ pnpm -F @core/services test           Test Files 21 passed (21) | Tests 166 passed (166)
  (authorize.test.ts: 43 tests, 78 decision assertions; access tests 73)
$ pnpm -F @core/contracts -F @core/services typecheck   exit 0
$ pnpm -F @core/contracts -F @core/services lint        exit 0
$ pnpm contracts:catalog   contracts:catalog wrote 149 files for 73 contracts and 57 endpoints
$ pnpm contracts:check     contracts:check ok (73 contracts, 57 endpoints, 149 files)
$ grep -c "/v1/" docs/openapi/v1.yaml   50   (keys are unquoted YAML, so the plan's '"/v1/' pattern counts 0)
$ pnpm exec firebase emulators:exec --project demo-core --only auth,firestore,storage "pnpm -F @core/services test:emulators"
  Test Files 3 passed (3) | Tests 18 passed (18)      (after fix 1; Tasks 4-6 add no emulator code)
$ vitest --project unit src/services/access --coverage (v8, see concern 1)
  authorize.ts lines 100 %, branches 100 %; access/** lines 99.72 %, branches 94.6 %
$ git diff --quiet main -- .contexts .claude && echo framework-ok
framework-ok
```

## Deviations and concerns

1. **Coverage provider missing.** `@vitest/coverage-v8` is not in the workspace, so the plan's coverage command fails.
   Coverage was measured with `@vitest/coverage-v8@5.0.2` installed in the session scratchpad and loaded as a custom
   provider. Adding it to `catalog:` touches `pnpm-workspace.yaml` and the lockfile, which SP2/SP3 were editing
   uncommitted; left as a follow-up for whoever owns the workspace files.
2. **User doc required.** `authorize()` denies a user without `users/{uid}`. Task 12 creates it on the first
   `GET /v1/me`; Task 10 (`createOrganization`) and Task 11 (`acceptInvitation`) should also make sure it exists.
3. **Rate limit policy ids declared by descriptors** (Task 7 must define them): `active-organization-switch`,
   `claims-sync` (not in spec §7.3's list; suggest 10/min per uid), `desktop-exchange`, `device-redeem`,
   `invitation-preview`, `invitation-accept`. `api-key-failure` is used inside the authenticator (Task 14), not on a
   descriptor.
4. **Unit depth** = number of ancestors, 0–6 (`MAX_UNIT_DEPTH`); a root unit has depth 0, so a tree has at most 7
   unit levels. Task 10's "depth 7 → 422" matches.
5. **Audit entries are `z.object` (strip), not strict**, so the Firestore converter can read docs with
   `schemaVersion`; Task 7's "entry with an `email` key fails validation" needs an explicit check in the writer.
6. **Nested contracts.** A registered contract schema is never nested with `.meta()` (Zod merges the parent's catalog
   meta into the clone): nesting uses `z.object(X.shape)`, `tenantNodeRefField()`, `roleRefsField()`.
7. **TDD order.** Every new test file ran red first (missing module) except `authorize.test.ts` and the
   `toFirestoreUpdate` emulator tests, which were written before the code but first run after it (they passed).
8. **Concurrent agents.** SP3 committed `contracts/agents` etc. and SP2 kept editing `packages/client`/`i18n`,
   `pnpm-workspace.yaml` and the lockfile; only my paths were committed (`git commit -- <paths>`).
