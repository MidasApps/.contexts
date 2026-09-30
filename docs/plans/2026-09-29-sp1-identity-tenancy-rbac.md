# SP1 — Identity, tenancy and RBAC: implementation plan

> **For agentic workers:** Use skill `using-ddc` before coding. One implementer subagent per task (template
> `.claude/skills/writing-plans-ddc/implementer-brief.md`) plus a task reviewer (`task-reviewer-brief.md`).
> **Read `docs/plans/execution-constraints.md` first: `.contexts/` and `.claude/` are read-only.** Progress goes in
> `docs/plans/2026-09-29-sp1-identity-tenancy-rbac/progress.md` (never `.claude/agent-memory/`); reports in
> `docs/plans/2026-09-29-sp1-identity-tenancy-rbac/reports/task-<N>.md`.

**Goal:** identity, tenancy and access control of the core behind `/v1`, with `authorize()` as the single
fail-closed decision function, Firestore Security Rules as defense in depth, and the SP1 gate green.

**Architecture:** new bounded contexts `identity`, `tenancy`, `access`, `audit` in `app/packages/services`
(feature-based + hexagonal), contracts and endpoint descriptors in `app/packages/contracts`, thin route files in
`app/apps/web/src/app/v1/**`. Design: `docs/superpowers/specs/2026-09-29-sp1-identity-tenancy-rbac-design.md`
(the **SP1 spec**; section numbers below refer to it). Umbrella: `docs/superpowers/specs/2026-09-29-agentic-app-core-design.md`.

**Tech Stack (already pinned in `app/pnpm-workspace.yaml`, measured 2026-09-29):** Node 26.10.0, pnpm 12.6.0,
TypeScript 7.0.2 (+ TS 6 API for lint, E2), ESLint 9.39.5 (E3), Next 16.3.7, React 19.3.0, Zod 4.6.5, Vitest 5.0.2,
firebase-admin 14.5.0, firebase 12.19.0, @firebase/rules-unit-testing 5.0.2, firebase-tools 15.32.0, ulid 3.0.2.
SP1 adds no new third-party package: `firebase-admin` and `firebase` already sit in the catalog.

## Global Constraints

- `docs/plans/execution-constraints.md` applies to every task (toolchain PATH, port 3100 for web, no killing
  foreign processes, git rules, reporting format).
- Pins from `@.contexts/engineering/MEMORY.md` + spec §16.1 of the umbrella; any new dependency is measured with
  `npm view <pkg> version` and pinned in `catalog:` (ADR 0004). No exception lines can be added to the framework;
  an app-level exception goes to `app/docs/decisions/`.
- Contracts: `@.contexts/engineering/contracts/schemas.md`, `@.contexts/engineering/contracts/api.md` (§5, §6, §7,
  §9, §11), `@.contexts/engineering/contracts/firebase-firestore.md` (§1–§7, §13, §17–§20),
  `app/docs/decisions/0005-contract-pii-semantics.md`. Every exported schema is a `defineContract` with full meta;
  every field has `description` + `pii`.
- Rules: `@.contexts/engineering/rules/security.md`, `@.contexts/engineering/rules/api-design.md`,
  `@.contexts/engineering/rules/validation.md`, `@.contexts/engineering/rules/error-handling.md`,
  `@.contexts/engineering/rules/observability.md` (no PII, tokens, secrets or emails in logs),
  `@.contexts/engineering/rules/testing.md`, `@.contexts/engineering/rules/data-modeling.md`.
- Architecture: `@.contexts/engineering/architecture/feature-based.md` and `@.contexts/engineering/architecture/hexagonal.md`
  (`services/<context>/{domain,application/{ports,use-cases},adapters/{driving,driven},composition.ts,index.ts}`).
- Handlers: authenticate → validate → authorize → act; `/v1` is Bearer-only; error envelope from
  `packages/services/src/services/shared/http/error-envelope.ts`; unexpected errors reach `withRouteBoundary`.
- Firestore: top-level kebab-case collections, automatic IDs, `tenantId` on tenant data, audit fields, reads parsed
  by contracts, composite indexes declared in `app/firestore.indexes.json`.
- Test suffixes: `*.test.ts` (unit, fakes), `*.emulator.test.ts` (inside `firebase emulators:exec`),
  `*.postgres.test.ts` (unused in SP1). Deterministic: inject clock and id/secret generators.
- Files ≤ 500 lines, functions ≤ 50 lines, named exports only (framework-mandated defaults commented).
- Multi-tenant + LGPD default (`.contexts/business/compliance.md` is a template): every user datum is PII; no TTL on
  audit logs.

## Conventions for every task

**Shell:** every command runs from `app/` after
`export PATH="/c/Users/gsoar/AppData/Local/node-v26.10.0-win-x64:$PATH"`.

**Standard steps** (each task lists only what is specific):

1. Read the task's **Contexts** (do not skip) and the SP1 spec sections named in the task.
2. Write the failing tests named in the task.
3. Run them — expect FAIL for the right reason.
4. Minimal implementation.
5. Run tests — expect PASS; then `pnpm -F <touched packages> typecheck` and `pnpm -F <touched packages> lint`.
6. Append one line to `docs/plans/2026-09-29-sp1-identity-tenancy-rbac/progress.md`:
   `- YYYY-MM-DD | Task N complete | commits: <sha> | review: <clean|pending>`.
7. Commit only your files with the task's Conventional Commit message and the trailer
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; write the report to
   `docs/plans/2026-09-29-sp1-identity-tenancy-rbac/reports/task-<N>.md`.

**Standard verify** (every task, in addition to its own): touched packages' `typecheck` and `lint` exit 0, and
`git diff --quiet main -- ../.contexts ../.claude && echo framework-ok` prints `framework-ok` (run from `app/`;
from the repo root use `.contexts .claude`).

**Emulator test command** (used below as `EMU`):
`pnpm exec firebase emulators:exec --project demo-core --only auth,firestore "pnpm -F @core/services test:emulators"`.

---

### Task 1: Decisions 0006–0010 and dependency audit (follow-up #10)

**Contexts (Read first):**
- `docs/superpowers/specs/2026-09-29-sp1-identity-tenancy-rbac-design.md` (all)
- `@.contexts/engineering/contracts/firebase-firestore.md` (§7)
- `@.contexts/engineering/rules/security.md`
- `@.contexts/engineering/decisions/README.md` (format) and `app/docs/decisions/0005-contract-pii-semantics.md` (local style)
- `docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md` (#10)

**Files:**
- Create: `app/docs/decisions/0006-tenancy-and-access-model.md` (SP1 spec §4, §5; explicitly "stands in for
  `rules/tenancy.md` required by `contracts/firebase-firestore.md` §7"; invariants: tenant server-bound, claims are
  projection, unmapped resource denied; Timestamp ↔ ISO conversion at the adapter)
- Create: `app/docs/decisions/0007-authentication-sessions.md` (SP1 spec §3.3–§3.5; alternatives rejected: IndexedDB
  persistence, cookie on `/v1`, `POST /v1/auth/refresh`)
- Create: `app/docs/decisions/0008-api-keys-and-device-activation.md` (§6.3, §6.4)
- Create: `app/docs/decisions/0009-rate-limiting-and-idempotency-store.md` (Firestore buckets and records, TTL,
  key = `sha256(policy + subject)`, why not Postgres/memory)
- Create: `app/docs/decisions/0010-dependency-audit-advisories.md` (output of `pnpm audit --json`: each advisory,
  path, reachability in our code, decision: upgrade / override via `pnpm.overrides` / accept with re-check date)
- Modify: `app/README.md` (decisions list), `docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md` (#10 → "Done in
  SP1 Task 1", pointing at 0010)

**Interfaces:** Produces the decision numbers every later task cites.

- [ ] Step 1: Read contexts.
- [ ] Step 2: Run `pnpm audit --json > <scratchpad>/audit.json` and `pnpm why <pkg>` for each advisory.
- [ ] Step 3: If a fix is a patch/minor bump of a direct dependency, apply it in `catalog:`; if transitive, prefer
  `pnpm.overrides` only when the advisory is reachable. Re-run `pnpm install` and `pnpm test`.
- [ ] Step 4: Write the five decisions (MADR: status, date, context, decision, consequences, alternatives).
- [ ] Step 5: Progress + commit `docs(access): record sp1 decisions and audit review`.

**Verify:**
- `pnpm audit --audit-level high` → exit 0; `pnpm test` → exit 0 (unchanged count or higher).
- `ls docs/decisions/000{6,7,8,9}-*.md docs/decisions/0010-*.md` lists five files; `framework-ok`.

### Task 2: Firebase Admin factory, emulator guard (#12c) and Firestore helpers

**Contexts (Read first):**
- `@.contexts/engineering/stacks/database/firebase-firestore.md` (Admin SDK, transactions, converters)
- `@.contexts/engineering/contracts/firebase-firestore.md` (§5, §13, §17, §18)
- `@.contexts/engineering/contracts/secrets.md` (§5.4) and `@.contexts/engineering/processes/environments.md` (§9)
- SP1 spec §4 (first paragraph), §8; `docs/plans/2026-09-29-sp0-app-foundation/reports/sp0-summary.md` §1 gotcha 4

**Files:**
- Modify: `app/packages/services/package.json` (dependency `firebase-admin: catalog:`; exports added in later tasks)
- Modify: `app/packages/services/src/services/shared/env/services-env.schema.ts` (+ `SESSION_MAX_AGE_DAYS` 1–14
  default 5, `DESKTOP_SESSION_MAX_AGE_DAYS` 1–90 default 30, `API_KEY_PREFIX` `^[a-z]{2,12}$` default `core`,
  `ORGANIZATION_SELF_SERVE` boolean-string default `true`, `MFA_FACTORS` list of `totp|phone` default `totp`,
  `NEXT_PUBLIC_APP_URL` stays web-only) and its test
- Modify: `app/.env.example` (new variables; `MFA_FACTORS=phone` with a comment: the Auth Emulator has no TOTP)
- Create: `app/packages/services/src/services/shared/firebase/firebase-admin.ts` — `createFirebaseAdmin({ env,
  processEnv })` returns `{ app, auth, firestore }` via modular `firebase-admin/app|auth|firestore`; throws
  `EmulatorOutsideLocalError` when any `*_EMULATOR_HOST` is present in `processEnv` and `env.APP_ENV !== "local"`
- Create: `.../shared/firebase/firebase-admin.test.ts` (guard matrix: local+hosts ok, prod+auth host throws,
  prod+firestore host throws, prod without hosts ok — uses an injected `initializeApp` fake)
- Create: `.../shared/firestore/contract-converter.ts` — `createContractConverter(contract)` implementing
  `FirestoreDataConverter`: `Timestamp`↔ISO for fields whose schema is `IsoDateTimeSchema`, `safeParse` on read
  (throws `CorruptDocumentError` with doc path and issue paths, no values)
- Create: `.../shared/firestore/audit-fields.ts` — `withCreateAudit(data, actorId)`, `withUpdateAudit(data, actorId)`
  (`FieldValue.serverTimestamp()`), `SYSTEM_ACTOR = "system"`; `soft-delete.ts` — `notDeleted(query)`,
  `softDeleteFields(actorId)`
- Create: `.../shared/firestore/transaction-runner.ts` — `runInTransaction(firestore, fn, { maxAttempts: 5 })`
- Create: `.../shared/firestore/contract-converter.emulator.test.ts`, `audit-fields.emulator.test.ts`
- Modify: `app/packages/services/vitest.config.ts` (emulator project `fileParallelism: false`: tests share one emulator)
- Modify: `app/apps/functions/src/functions-env.schema.ts` + test (reject emulator hosts when `APP_ENV !== "local"`)
- Modify: `docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md` (#12 part c → done here)

**Interfaces:**
- Consumes: `loadServicesEnv`, `IsoDateTimeSchema`, `ContractDefinition` (`@core/contracts`).
- Produces: `createFirebaseAdmin`, `createContractConverter`, `withCreateAudit`, `withUpdateAudit`, `notDeleted`,
  `softDeleteFields`, `runInTransaction` (exported from `@core/services` index).

- [ ] Steps 1–7 (standard). Tests: guard matrix (unit); converter round-trip `Timestamp`↔ISO and corrupt doc error
  (emulator); audit fields set by server timestamp (emulator).
- [ ] Commit: `feat(services): add firebase admin factory and firestore helpers`.

**Verify:** `pnpm -F @core/services test` → PASS incl. `firebase-admin.test.ts`; `EMU` → PASS incl. the two new
emulator files; `pnpm -F @core/functions test` → PASS; `framework-ok`.

### Task 3: Endpoint descriptors and OpenAPI paths

**Contexts (Read first):**
- `@.contexts/engineering/contracts/api.md` (§1–§7, §9, §11, §15)
- `@.contexts/engineering/practices/sdd.md` and skill `sdd`
- `app/docs/decisions/0001-openapi-generation.md`
- SP1 spec §7.1

**Files:**
- Create: `app/packages/contracts/src/contracts/http/envelopes.schema.ts` — `dataEnvelope(schema)`,
  `listEnvelope(schema)` (`meta.page { cursor: string|null, hasMore, limit }`), `ErrorEnvelopeSchema`,
  `ErrorCodeSchema` (SCREAMING_SNAKE), `PageQuerySchema` (`cursor?`, `limit` 1–100 default 20)
- Create: `.../http/endpoint.ts` — `defineEndpoint()` (validates: path starts with `/v1/`, `{param}` names match
  `params` keys, `GET` has no body, a 204 response has no schema), types `EndpointDefinition`, `EndpointAuth`
  (`"user" | "principal" | "none"`), `InferEndpointInput<E>`, `InferEndpointResponse<E>`
- Create: `.../http/endpoint-registry.ts` — `createEndpointRegistry(endpoints)` (duplicate id / duplicate
  method+path errors), `CORE_ENDPOINTS` starts empty and grows in Tasks 4–5
- Create: `.../http/endpoint.test.ts`, `.../http/endpoint-registry.test.ts`, `.../http/envelopes.schema.test.ts`
- Modify: `app/packages/contracts/scripts/catalog/render-openapi.ts` (+ test) — render `paths` from the endpoint
  registry: parameters (path/query from Zod via `z.toJSONSchema`), `requestBody`, responses by status with
  `$ref` to component schemas when the schema is a registered contract, error responses to `ErrorEnvelope`
- Modify: `app/packages/contracts/scripts/build-catalog.ts`, `scripts/catalog/drift.ts` (include paths in drift check)
- Modify: `app/packages/contracts/src/composition.ts`, `src/index.ts` (export the new API)

**Interfaces:**
- Produces: `defineEndpoint`, `EndpointDefinition`, `CORE_ENDPOINTS`, `dataEnvelope`, `listEnvelope`,
  `ErrorEnvelopeSchema`, `PageQuerySchema`. Consumed by Tasks 4–5 (descriptors), Task 8 (server pipeline), SP2 (client).

- [ ] Steps 1–7. Tests: descriptor validation errors; registry duplicates; OpenAPI snapshot-free assertions (path
  exists, parameter names, `$ref` targets exist) on a two-endpoint fixture.
- [ ] Run `pnpm contracts:catalog` (no endpoints yet → `paths: {}` unchanged) and `pnpm contracts:check`.
- [ ] Commit: `feat(contracts): add endpoint descriptors and openapi paths`.

**Verify:** `pnpm -F @core/contracts test` → PASS; `pnpm contracts:check` → exit 0; `framework-ok`.

### Task 4: Contracts — tenancy and identity

**Contexts (Read first):**
- `@.contexts/engineering/contracts/schemas.md`, `@.contexts/engineering/stacks/validation/zod@4.md`
- `@.contexts/engineering/rules/data-modeling.md`, `@.contexts/engineering/contracts/firebase-firestore.md` (§4–§7, §15)
- `app/docs/decisions/0005-contract-pii-semantics.md`, `app/docs/decisions/0006-tenancy-and-access-model.md`
- SP1 spec §3, §4, §7.3 (rows for me, sessions, organizations, projects, units, unit types, devices, API keys)

**Files (all under `app/packages/contracts/src/contracts/`):**
- Create `tenancy/`: `ids.schema.ts` (`OrganizationIdSchema` = `TenantIdSchema` alias, `ProjectIdSchema`,
  `UnitIdSchema`), `regional-defaults.schema.ts` (`{ locale, timeZone, currency }`, node overrides
  `{ timeZone?, currency? }`), `organization.schema.ts`, `project.schema.ts`, `unit.schema.ts`,
  `unit-type.schema.ts` (`UnitTypeDefinition { id: "<module>.<type>", labelKey, allowedParents }`),
  `node-ref.schema.ts` (`NodeRef` discriminated by `level`), commands `create-organization-input.schema.ts`,
  `update-organization-input.schema.ts`, `create-project-input.schema.ts`, `update-project-input.schema.ts`,
  `create-unit-input.schema.ts`, `update-unit-input.schema.ts`, `regional-settings.schema.ts`
  (`{ locale, displayTimeZone, nodeTimeZone, currency }`), `endpoints.ts` (tenancy descriptors of §7.3)
- Create `identity/`: `ids.schema.ts` (`DeviceIdSchema`, `ApiKeyIdSchema`, `SessionIdSchema`,
  `ImpersonationSessionIdSchema`), `principal.schema.ts` (SP1 spec §3.1), `user-preferences.schema.ts`
  (locale?, timeZone?, currency?, theme, notifications), `user.schema.ts`, `me.schema.ts`
  (`Me`: uid, email, displayName, photoUrl?, preferences, lastContext, isPlatformStaff, platformRole?, mfaEnrolled,
  accessVersion), `update-me-input.schema.ts`, `active-organization-input.schema.ts`, `session.schema.ts`
  (`SessionSummary`), `desktop-session.schema.ts` (create response, exchange input/response), `device.schema.ts`,
  `device-activation.schema.ts` (create input, create response with `code`, redeem input/response),
  `api-key.schema.ts` (`ApiKey` without secret, create input with `expiresAt` required ≤ 365 d, create response
  with `secret`), `platform-staff.schema.ts`, `impersonation-session.schema.ts`, `endpoints.ts`
- Modify: `app/packages/contracts/src/composition.ts` (register contracts and endpoints), `src/index.ts`
- Test: `tenancy/unit.schema.test.ts` (depth ≤ 6, `ancestorIds` length = depth), `tenancy/node-ref.schema.test.ts`,
  `identity/api-key.schema.test.ts` (expiry bounds), `identity/principal.schema.test.ts`,
  `identity/user-preferences.schema.test.ts` (IANA zone, ISO currency, canonical locale)

**Interfaces:**
- Consumes: primitives (`firestoreIdSchema`, `TenantIdSchema`, `UserIdSchema`, `LocaleSchema`, `TimeZoneSchema`,
  `CurrencySchema`, `IsoDateTimeSchema`), `defineContract`, `defineEndpoint`, envelopes (Task 3).
- Produces: every tenancy/identity type used by Tasks 6–16 and by SP2. PII: emails and display names `personal`;
  `secret`, `code`, `tokenHash`, `secretHash`, `cookieHash` fields are **not** part of public contracts except the
  one-time create responses, where they are `sensitive`.

- [ ] Steps 1–7. Then `pnpm contracts:catalog`, review `docs/catalog/catalog.ai.json` (no `sensitive` field present),
  commit the regenerated artifacts together with the code.
- [ ] Commit: `feat(contracts): add tenancy and identity contracts`.

**Verify:** `pnpm -F @core/contracts test` → PASS; `pnpm contracts:check` → exit 0; `grep -c '"/v1/' docs/openapi/v1.yaml`
> 0; `framework-ok`.

### Task 5: Contracts — access, audit, approvals, core permissions and system roles

**Contexts (Read first):**
- Same as Task 4, plus `@.contexts/engineering/contracts/events.md` (§2, §3.1, §13.3) for audit action naming
- SP1 spec §5.1, §5.3, §6.2, §6.5–§6.7, §7.3 (remaining rows)

**Files (under `app/packages/contracts/src/contracts/`):**
- Create `access/`: `permission-definition.schema.ts` (`PermissionDefinition`), `core-permissions.ts`
  (`CORE_PERMISSIONS` exactly as SP1 spec §5.1), `system-roles.ts` (`SYSTEM_ROLE_KEYS`, `PLATFORM_ROLES`),
  `role-ref.schema.ts`, `role.schema.ts`, `create-role-input.schema.ts`, `update-role-input.schema.ts`,
  `membership.schema.ts`, `grant-membership-input.schema.ts`, `update-membership-input.schema.ts`,
  `member.schema.ts` (list item: uid, displayName, email, grants), `access-projection.schema.ts`,
  `access-context.schema.ts` (SP1 spec §10: tenantId, organization, project?, unit?, permissions[], regional),
  `invitation.schema.ts` (+ create input, create response with `acceptUrl` `sensitive`, preview/accept inputs and
  responses), `approval-request.schema.ts` (+ create input, decide input with `reason?`), `endpoints.ts`
- Create `audit/`: `audit-action.schema.ts` (enum of SP1 spec §6.7 actions), `audit-log-entry.schema.ts`,
  `audit-log-query.schema.ts` (`action?`, `actorId?`, `occurredAfter?`, `occurredBefore?` + page), `endpoints.ts`
- Create `http/error-codes.ts` — `CORE_ERROR_CODES` (every code in SP1 spec §7.3 and §7.2:
  `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_FAILED`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`,
  `IDEMPOTENCY_KEY_REUSED`, `LAST_OWNER`, `ROLE_IN_USE`, `ESCALATION_FORBIDDEN`, `EMAIL_MISMATCH`,
  `INVITATION_EXPIRED`, `INVITATION_ALREADY_USED`, `INVALID_UNIT_PARENT`, `SUBTREE_TOO_LARGE`, `UNKNOWN_PERMISSION`,
  `SELF_APPROVAL_FORBIDDEN`, `MFA_REQUIRED`, `MEMBERSHIP_EXISTS`); SP2 uses them as i18n keys
- Modify: `composition.ts`, `index.ts`
- Test: `access/core-permissions.test.ts` (ids unique, match `PermissionSchema`, every tenant permission has ≥ 1
  default role, owner/admin rules), `access/role-ref.schema.test.ts`, `access/approval-request.schema.test.ts`,
  `audit/audit-log-entry.schema.test.ts` (no `email` field; `changes` is `string[]`)

**Interfaces:** Produces `PermissionDefinition`, `CORE_PERMISSIONS`, `RoleRef`, `Membership`, `AccessProjection`,
`AccessContext`, `Invitation*`, `ApprovalRequest*`, `AuditLogEntry`, `CORE_ERROR_CODES`, all remaining endpoints.

- [ ] Steps 1–7, then `pnpm contracts:catalog` and commit artifacts.
- [ ] Commit: `feat(contracts): add access, audit and approval contracts`.

**Verify:** `pnpm -F @core/contracts test` → PASS; `pnpm contracts:check` → exit 0; every row of SP1 spec §7.3 has a
descriptor (`node -e` one-liner or test `endpoints-coverage.test.ts` listing the expected `method path` pairs) →
PASS; `framework-ok`.

### Task 6: `authorize()` core — permission registry and effective permissions (SP1 gate core)

**Contexts (Read first):**
- `@.contexts/engineering/architecture/hexagonal.md`, `@.contexts/engineering/rules/error-handling.md`
- `@.contexts/engineering/rules/security.md` (§3), `@.contexts/engineering/rules/testing.md`
- `app/docs/decisions/0006-tenancy-and-access-model.md`; SP1 spec §5.1–§5.3, §10

**Files (under `app/packages/services/src/services/access/`):**
- Create `domain/permission-registry.ts` — `createPermissionRegistry(definitions)`: duplicate id error, module
  prefix check (`definition.id` starts with `<moduleId>.`, core uses `core.`/`platform.`), `get(id)`,
  `permissionsForSystemRole(key)`, `permissionsForPlatformRole(role)`, `listTenantPermissions()`
- Create `domain/effective-permissions.ts` — pure `computeEffectivePermissions({ grants, chain, customRoles,
  registry, ceiling? })`
- Create `domain/node-chain.ts` — `NodeChain` type (org, project?, units root→leaf) and `chainNodeIds(chain)`
- Create `domain/escalation-guard.ts` — `assertNoEscalation({ requested, actorEffective })`
- Create `application/ports/driven/{grant-reader.ts, role-reader.ts, node-chain-reader.ts,
  principal-status-reader.ts}` (interfaces only)
- Create `application/use-cases/authorize.ts` — `makeAuthorize(deps): Authorize` (algorithm SP1 spec §5.2) and
  `application/use-cases/get-effective-permissions.ts`
- Create `application/request-scope.ts` — `createRequestScope()` memoizing reader calls for one request
- Create `adapters/driven/in-memory-access-store.ts` — one fake implementing the four ports (used by many tests)
- Create `composition.ts` (`createAccessCore({ permissions, readers })`) and `index.ts`
- Test: `domain/permission-registry.test.ts`, `domain/effective-permissions.test.ts`,
  `domain/escalation-guard.test.ts`, `application/use-cases/authorize.test.ts` with the full matrix: inheritance
  org→project→unit→sub-unit; sibling project/unit isolation; two organizations with the same user; custom role;
  deleted role, grant and node; suspended organization; unknown permission; scope mismatch; device principal (active,
  revoked, other tenant); service principal (scopes ∩ owner, owner lost grant, expired key, node outside key);
  staff platform permission with and without MFA, inactive staff; impersonation read allowed, write denied, expired;
  ceiling excludes; reader throws → promise rejects (never allowed)

**Interfaces:**
- Consumes: `Principal`, `NodeRef`, `PermissionDefinition`, `RoleRef`, `CORE_PERMISSIONS` (`@core/contracts`).
- Produces: `Authorize`, `AuthorizeRequest`, `AuthorizeDecision`, `DenyReason`, `getEffectivePermissions`,
  `createPermissionRegistry`, port interfaces implemented in Task 9 (Firestore) — exported from
  `@core/services` (`src/index.ts`) for SP3.

- [ ] Steps 1–7 (pure unit tests only; no Firestore).
- [ ] Commit: `feat(access): add permission registry and authorize decision`.

**Verify:** `pnpm -F @core/services test -- access` → PASS with ≥ 30 authorize cases; coverage of
`authorize.ts` ≥ 90 % lines (`pnpm -F @core/services exec vitest run --project unit --coverage src/services/access`);
`framework-ok`.

### Task 7: Audit writer, rate limiter and idempotency store

**Contexts (Read first):**
- `@.contexts/engineering/rules/api-design.md` (§4, §14), `@.contexts/engineering/contracts/api.md` (§7, §11)
- `@.contexts/engineering/rules/observability.md`, `@.contexts/engineering/contracts/firebase-firestore.md` (§20 TTL)
- `app/docs/decisions/0009-rate-limiting-and-idempotency-store.md`; SP1 spec §6.7, §7.2, §7.3 (rate limits)

**Files (under `app/packages/services/src/services/`):**
- Create `audit/application/ports/driven/audit-log-writer.ts`, `audit/application/use-cases/record-audit.ts`
  (`AuditWriter.record(entry, tx?)`, validates with `AuditLogEntry` contract, strips unknown keys),
  `audit/adapters/driven/firestore-audit-log-writer.ts` (tenant → `audit-logs`, platform → `platform-audit-logs`),
  `audit/adapters/driven/in-memory-audit-log-writer.ts`, `audit/composition.ts`, `audit/index.ts`
- Create `shared/rate-limit/rate-limit-policies.ts` (named policies of SP1 spec §7.3 with limit/window),
  `shared/rate-limit/rate-limiter.ts` (port `RateLimiter.consume(policyId, subject) → { allowed, remaining,
  resetAt }`), `firestore-rate-limiter.ts` (transaction on `rate-limit-buckets/{sha256}`), `in-memory-rate-limiter.ts`,
  `rate-limit-headers.ts` (`X-RateLimit-*`, `Retry-After`)
- Create `shared/idempotency/idempotency-store.ts` (port: `begin(scopeKey, requestHash) → { kind: "new" } | { kind:
  "replay", response } | { kind: "conflict" } | { kind: "in-flight" }`, `complete(scopeKey, response)`),
  `firestore-idempotency-store.ts`, `in-memory-idempotency-store.ts`, `request-hash.ts` (sha256 of canonical JSON)
- Test: unit tests for policies, headers and in-memory adapters; emulator tests `firestore-rate-limiter.emulator.test.ts`
  (window reset with injected clock, concurrent consume counts exactly), `firestore-idempotency-store.emulator.test.ts`
  (replay, conflict, in-flight), `firestore-audit-log-writer.emulator.test.ts` (inside a transaction; rejected entry
  with an `email` key fails validation)
- Modify: `app/firestore.indexes.json` (`fieldOverrides` TTL on `rate-limit-buckets.expiresAt` and
  `idempotency-records.expiresAt`; audit composite indexes `tenantId+occurredAt desc`, `tenantId+action+occurredAt desc`,
  `tenantId+actor.id+occurredAt desc`)

**Interfaces:** Produces `AuditWriter`, `RateLimiter` + policies, `IdempotencyStore` (consumed by Task 8 onwards).

- [ ] Steps 1–7. Commit: `feat(services): add audit writer, rate limiter and idempotency store`.

**Verify:** `pnpm -F @core/services test` → PASS; `EMU` → PASS incl. the three new emulator files; `framework-ok`.

### Task 8: `/v1` API pipeline — authentication, principal resolution, validation, composition root

**Contexts (Read first):**
- `@.contexts/engineering/rules/security.md` (§2, §3), `@.contexts/engineering/rules/api-design.md`,
  `@.contexts/engineering/rules/validation.md`, `@.contexts/engineering/rules/error-handling.md`
- `@.contexts/engineering/stacks/frontend/next@16.md` (route handlers, proxy), skill `next-16`
- `app/docs/decisions/0003-public-liveness-endpoint.md`, `0007-authentication-sessions.md`
- SP1 spec §3.1, §3.2, §7.2; SP0 summary §1 (gotchas 2, 3, 5)

**Files:**
- Create `app/packages/services/src/services/identity/application/ports/driven/token-verifier.ts`
  (`verifyIdToken(token, { checkRevoked }) → VerifiedToken`), `identity/adapters/driven/firebase-token-verifier.ts`,
  `identity/adapters/driven/fake-token-verifier.ts`
- Create `identity/application/ports/driven/api-key-authenticator.ts` (interface; Task 14 implements it)
- Create `identity/application/use-cases/resolve-principal.ts` — Bearer parsing (API key prefix vs JWT), claim
  mapping (`principalType`, `imp`, `impBy`, `smfa`, `firebase.sign_in_second_factor`, `firebase.sign_in_provider`),
  `checkRevoked` for non-GET/HEAD
- Create `app/packages/services/src/services/shared/http/api-route.ts` — `withApiRoute(endpoint, deps, handler)`
  (SP1 spec §7.2: boundary → rate limit → authenticate → parse path params from `endpoint.path` → validate
  query/body (all issues) → idempotency → handler), `shared/http/path-params.ts`, `shared/http/api-errors.ts`
  (`apiError(status, code, requestId, details?)`, `DomainErrorMapping`), `shared/http/api-handler-context.ts`
- Create `app/packages/services/src/services/composition.ts` — `createCoreServer({ env, firebase, logger, clock,
  modules })` returning `{ routes: Record<EndpointId, RouteHandler>, sessions, guards }` (routes filled by Tasks 10–18)
  and `packages/services/src/services/core-routes.ts` (route table keyed by endpoint id)
- Create `app/apps/web/src/server/core.ts` — memoized `getCoreServer()` (env + `createFirebaseAdmin` + modules list,
  empty in SP1) and `route(endpointId)` returning a lazy `RouteHandler`; `apps/web/src/server/modules.ts` (`[]`)
- Modify: `app/packages/services/package.json` exports (`"./composition"`), `app/apps/web/package.json`
  (`firebase-admin` is transitive through services; add nothing unless typecheck asks)
- Test: `resolve-principal.test.ts` (fake verifier: GET → `checkRevoked:false`, POST/PATCH/PUT/DELETE → `true` —
  follow-up #12e; `?apiKey=`/query tokens ignored; device claim; impersonation claim; `smfa` only honored with
  provider `custom`), `api-route.test.ts` (401 missing/invalid; 400 lists all issues; 409 idempotency reuse; 429
  headers; handler throw → 500 `INTERNAL_ERROR` without message leak; `x-request-id` echoed; path params parsed),
  `path-params.test.ts`
- Modify: `docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md` (#12 part e → done here)

**Interfaces:**
- Consumes: Tasks 3, 6, 7.
- Produces: `withApiRoute`, `ApiHandler<E>` (`{ principal, input, requestId, authorize, audit, scope }`),
  `resolvePrincipal` / `verifyBearer` (SP3 reuses for the Mastra provider), `createCoreServer`, `route()` in web.

- [ ] Steps 1–7. Commit: `feat(identity): add v1 api pipeline and principal resolution`.

**Verify:** `pnpm -F @core/services test` → PASS; `pnpm -F @core/web typecheck && pnpm -F @core/web build` → exit 0
(no route yet uses `route()`, health still builds); `framework-ok`.

### Task 9: Access write side — memberships, projection, claims, roles

**Contexts (Read first):**
- `@.contexts/engineering/contracts/firebase-firestore.md` (§5, §7, §8, §19, §20)
- `@.contexts/engineering/stacks/database/firebase-firestore.md` (transactions, `getAll`)
- `app/docs/decisions/0006-tenancy-and-access-model.md`; SP1 spec §4 (memberships, roles, access), §5.3, §5.4

**Files (under `app/packages/services/src/services/access/`):**
- Create `domain/access-projection.ts` — pure `buildAccessProjection({ tenantId, principal, grants, units })`
- Create `domain/errors/{last-owner-error.ts, role-in-use-error.ts, membership-exists-error.ts,
  escalation-forbidden-error.ts}`
- Create `application/ports/driven/{membership-repository.ts, role-repository.ts, access-projection-writer.ts,
  claims-writer.ts, user-access-version.ts}`
- Create `application/use-cases/{grant-membership.ts, update-membership.ts, revoke-membership.ts,
  create-role.ts, update-role.ts, delete-role.ts, list-roles.ts, sync-claims.ts}` — every grant change runs in one
  transaction: uniqueness check, escalation guard, last-owner guard, membership write, projection rebuild,
  `users.accessVersion` bump, audit entry; `syncClaims(uid)` after commit (errors logged, not thrown)
- Create `adapters/driven/{firestore-membership-repository.ts, firestore-role-repository.ts,
  firestore-access-projection-writer.ts, firestore-grant-reader.ts, firestore-role-reader.ts,
  firestore-node-chain-reader.ts, firestore-principal-status-reader.ts, firebase-claims-writer.ts}` (the readers
  implement Task 6's ports)
- Create `adapters/driving/roles-routes.ts` (GET/POST `/organizations/{organizationId}/roles`, GET/PATCH/DELETE
  `/roles/{roleId}`, `GET /permissions`)
- Modify: `access/composition.ts`, `access/index.ts`, `services/core-routes.ts`
- Create route files: `app/apps/web/src/app/v1/organizations/[organizationId]/roles/route.ts`,
  `app/apps/web/src/app/v1/roles/[roleId]/route.ts`, `app/apps/web/src/app/v1/permissions/route.ts`
  (one line per method: `export const GET = route("access.listRoles");`)
- Modify: `app/firestore.indexes.json` (memberships: `tenantId+principalId`, `tenantId+nodeId`,
  `tenantId+principalId+nodeId`; roles: `tenantId+deletedAt+name`)
- Test: `domain/access-projection.test.ts`; unit tests for each use case with in-memory repos (last owner,
  escalation, duplicate grant, role in use); emulator tests `firestore-membership-repository.emulator.test.ts`
  (transaction consistency: projection always matches grants after concurrent grants), `firebase-claims-writer.emulator.test.ts`
  (RMW keeps unrelated claims; payload < 1000 bytes), `roles-routes.emulator.test.ts` (200/201/204/403/409 through
  `withApiRoute` with fake verifier tokens)

**Interfaces:**
- Produces: `grantMembership`, `revokeMembership`, `updateMembership`, role use cases, `syncClaims`,
  Firestore implementations of the Task 6 readers (wired in `access/composition.ts`).

- [ ] Steps 1–7. Commit: `feat(access): add memberships, access projection, claims and roles`.

**Verify:** `pnpm -F @core/services test` → PASS; `EMU` → PASS; `pnpm -F @core/web build` → exit 0; `framework-ok`.

### Task 10: Tenancy vertical — organizations, projects, units, unit types, regional settings

**Contexts (Read first):**
- `@.contexts/engineering/contracts/firebase-firestore.md` (§3, §5, §7, §20), `@.contexts/engineering/rules/api-design.md`
- `@.contexts/engineering/contracts/api.md` (§9 pagination, §10 sort)
- SP1 spec §4 (organizations, projects, units, unit types, regional settings), §6.1, §7.3

**Files (under `app/packages/services/src/services/tenancy/`):**
- Create `domain/unit-type-registry.ts` (validates parents), `domain/unit-tree.ts` (pure: ancestor ids, depth,
  cycle check, subtree rewrite plan), `domain/regional-settings.ts` (pure resolution, SP1 spec §4)
- Create `domain/errors/{invalid-unit-parent-error.ts, subtree-too-large-error.ts}`
- Create `application/ports/driven/{organization-repository.ts, project-repository.ts, unit-repository.ts}`
- Create `application/use-cases/{create-organization.ts (owner grant via access.grantMembership inside the same
  transaction), get-organization.ts, update-organization.ts, delete-organization.ts (soft delete + projections
  revoked), list-projects.ts (visible only, cursor), create-project.ts, get-project.ts, update-project.ts,
  delete-project.ts, list-units.ts, create-unit.ts, get-unit.ts, update-unit.ts (rename/move), delete-unit.ts,
  list-unit-types.ts, resolve-regional-settings.ts}`
- Create `adapters/driven/firestore-{organization,project,unit}-repository.ts` (cursor = opaque base64url of
  `[sortValue, id]`), `adapters/driving/{organizations-routes.ts, projects-routes.ts, units-routes.ts,
  unit-types-routes.ts}`, `composition.ts` (`createTenancyServices({ unitTypes })`), `index.ts`
- Create route files under `app/apps/web/src/app/v1/`: `organizations/route.ts`,
  `organizations/[organizationId]/route.ts`, `organizations/[organizationId]/projects/route.ts`,
  `projects/[projectId]/route.ts`, `projects/[projectId]/units/route.ts`, `units/[unitId]/route.ts`,
  `unit-types/route.ts`
- Modify: `services/core-routes.ts`, `app/firestore.indexes.json` (projects `tenantId+deletedAt+name`,
  `tenantId+deletedAt+createdAt`; units `projectId+parentUnitId+deletedAt+name`, `tenantId+ancestorIds (array-contains)`)
- Test: `domain/unit-tree.test.ts`, `domain/regional-settings.test.ts` (every precedence case of SP1 spec §4),
  `domain/unit-type-registry.test.ts`, use-case unit tests with in-memory repos, emulator route tests
  `organizations-routes.emulator.test.ts` (create → 201 + `Location` + owner can read, outsider 404, self-serve off
  → 403, delete → projections revoked), `units-routes.emulator.test.ts` (move rewrites descendants, cycle → 422,
  depth 7 → 422, sibling grant cannot see)

**Interfaces:**
- Consumes: access `grantMembership`, `authorize`, `AuditWriter`, `withApiRoute`.
- Produces: tenancy use cases, `resolveRegionalSettings`, `createTenancyServices({ unitTypes })` (SP2 passes module
  unit types), the `NodeChainReader` data used by `authorize()`.

- [ ] Steps 1–7. Commit: `feat(tenancy): add organizations, projects and units`.

**Verify:** `pnpm -F @core/services test` → PASS; `EMU` → PASS; `pnpm -F @core/web build` → exit 0; `framework-ok`.

### Task 11: Members and invitations vertical

**Contexts (Read first):**
- `@.contexts/engineering/rules/security.md` (§3, §8, §12), `@.contexts/engineering/rules/internationalization.md`
  (Unicode: NFC comparison)
- SP1 spec §5.3, §6.2, §7.3 (members, memberships, invitations rows)

**Files (under `app/packages/services/src/services/access/`):**
- Create `application/ports/driven/{invitation-repository.ts, invitation-notifier.ts, user-directory.ts}`
  (`UserDirectory.getMany(uids)` → display name + email for member lists)
- Create `application/use-cases/{list-members.ts, remove-member.ts (revokes all grants + owned API keys through the
  identity port `ApiKeyRevoker`), list-memberships.ts, create-invitation.ts, list-invitations.ts,
  revoke-invitation.ts, preview-invitation.ts, accept-invitation.ts}`
- Create `domain/invitation-token.ts` (32 random bytes via injected generator, `sha256`, `acceptUrl` builder with
  `#token=`), `domain/email.ts` (`normalizeEmail`: NFC + lower-case)
- Create `adapters/driven/{firestore-invitation-repository.ts, noop-invitation-notifier.ts,
  firebase-user-directory.ts}`, `adapters/driving/{members-routes.ts, memberships-routes.ts, invitations-routes.ts}`
- Create route files: `app/apps/web/src/app/v1/organizations/[organizationId]/members/route.ts`,
  `.../members/[userId]/route.ts`, `.../memberships/route.ts`, `app/apps/web/src/app/v1/memberships/[membershipId]/route.ts`,
  `.../organizations/[organizationId]/invitations/route.ts`, `app/apps/web/src/app/v1/invitations/[invitationId]/route.ts`,
  `app/apps/web/src/app/v1/invitations/preview/route.ts`, `app/apps/web/src/app/v1/invitations/accept/route.ts`
- Modify: `services/core-routes.ts`, `app/firestore.indexes.json` (invitations `tenantId+status+createdAt desc`,
  `tokenHash` single field auto)
- Test: unit tests (token hashing, NFC email match, escalation on invite, expired/used/revoked states, remove member
  revokes keys via fake revoker); emulator route tests `invitations-routes.emulator.test.ts` (create → 201 with
  `acceptUrl`, list never returns token/hash, accept with matching verified email → grant + projection, mismatch → 403
  `EMAIL_MISMATCH`, reuse → 409, expired (injected clock) → 410), `members-routes.emulator.test.ts` (last owner → 422)

**Interfaces:** Consumes Task 9 use cases; produces invitation and member use cases and the `ApiKeyRevoker` port
(implemented in Task 14; until then composition wires a no-op that Task 14 replaces — the Task 11 test uses a fake).

- [ ] Steps 1–7. Commit: `feat(access): add members and invitations`.

**Verify:** `pnpm -F @core/services test` → PASS; `EMU` → PASS; `pnpm -F @core/web build` → exit 0; `framework-ok`.

### Task 12: Me vertical — profile, active organization, claims sync, organizations, access context

**Contexts (Read first):**
- `@.contexts/engineering/rules/security.md` (§2, §8), `@.contexts/engineering/rules/internationalization.md`
  (locale negotiation, time zone)
- SP1 spec §4 (users, regional settings), §5.4, §7.3 (me rows), §10 (SP3 hook)

**Files (under `app/packages/services/src/services/identity/`):**
- Create `application/ports/driven/user-repository.ts`, `adapters/driven/firestore-user-repository.ts` (creates
  `users/{uid}` on first `GET /v1/me` from the verified token: email, display name; idempotent)
- Create `application/use-cases/{get-me.ts (mfaEnrolled from Admin `getUser().multiFactor`, staff flags),
  update-me.ts, set-active-organization.ts (authorize `core.organization.read`, rate limit
  `active-organization-switch`, `lastContext`, `syncClaims`, audit `ACTIVE_ORGANIZATION_CHANGED`),
  list-my-organizations.ts (reads access projections where `principalId == uid && !isRevoked`, then organizations),
  resolve-access-context.ts (node from query → `authorize` + `getEffectivePermissions` + `resolveRegionalSettings`;
  also exported as `resolveAccessContext({ principal, node })` for SP3)}`
- Create `adapters/driving/me-routes.ts` (`GET|PATCH /me`, `PUT /me/active-organization`, `POST /me/claims/sync`,
  `GET /me/organizations`, `GET /me/context`)
- Create route files: `app/apps/web/src/app/v1/me/route.ts`, `me/active-organization/route.ts`,
  `me/claims/sync/route.ts`, `me/organizations/route.ts`, `me/context/route.ts`
- Modify: `services/core-routes.ts`, `identity/composition.ts`, `identity/index.ts` (export `resolveAccessContext`),
  `app/firestore.indexes.json` (access `principalId+isRevoked`)
- Test: unit (`resolve-access-context.test.ts`: permissions at unit include org grants; outsider → not found;
  regional precedence), emulator `me-routes.emulator.test.ts` (first GET creates the user doc; PATCH validates IANA
  zone; active organization switch → 204 and the next ID token carries `tenantId` after `getIdToken(true)`-equivalent
  REST refresh; 11th switch in a minute → 429 with `Retry-After`; claims sync after a direct membership change)

**Interfaces:** Produces `GET /v1/me*` endpoints for SP2 and `resolveAccessContext` for SP3.

- [ ] Steps 1–7. Commit: `feat(identity): add me, active organization and access context`.

**Verify:** `pnpm -F @core/services test` → PASS; `EMU` → PASS; `pnpm -F @core/web build` → exit 0; `framework-ok`.

### Task 13: Sessions — web session cookie, desktop sessions, session management

**Contexts (Read first):**
- `@.contexts/engineering/rules/security.md` (§2, §7), `@.contexts/engineering/stacks/frontend/next@16.md`
  (Server Actions, `cookies()`), skill `next-16`
- `app/docs/decisions/0007-authentication-sessions.md`; SP1 spec §3.3–§3.5, §7.3 (session rows)

**Files (under `app/packages/services/src/services/identity/`):**
- Create `domain/session-secret.ts` (256-bit secret, `sha256`, constant-time compare), `domain/user-agent.ts`
  (browser + OS family only)
- Create `application/ports/driven/{session-repository.ts, session-cookie-issuer.ts, custom-token-issuer.ts}` and
  Firebase adapters `adapters/driven/{firestore-session-repository.ts, firebase-session-cookie-issuer.ts,
  firebase-custom-token-issuer.ts}`
- Create `application/use-cases/{create-web-session.ts (auth_time ≤ 5 min, expiresIn from env), exchange-web-session.ts
  (custom token with `smfa`), sign-out-web-session.ts, require-web-session.ts, require-platform-staff-session.ts,
  list-sessions.ts, revoke-session.ts, revoke-all-sessions.ts (`revokeRefreshTokens` + mark records),
  create-desktop-session.ts, exchange-desktop-session.ts (rotation, reuse detection, `tokensValidAfterTime`)}`
- Create `adapters/driving/session-actions.ts` — framework-free functions taking a `CookieJar` port
  (`get/set/delete`) and the request `Origin`, returning `{ ok: true, data } | { ok: false, error }` (ADR 0003 shape);
  `adapters/driving/session-guards.ts` (`requireWebSession`, `requirePlatformStaffSession` returning principal or
  a redirect/not-found signal); `adapters/driving/sessions-routes.ts` (`GET /me/sessions`, `DELETE
  /me/sessions/{sessionId}`, `POST /me/sessions/revoke-all`, `POST /me/desktop-sessions`,
  `POST /desktop-sessions/exchange`)
- Create route files: `app/apps/web/src/app/v1/me/sessions/route.ts`, `me/sessions/[sessionId]/route.ts`,
  `me/sessions/revoke-all/route.ts`, `me/desktop-sessions/route.ts`, `desktop-sessions/exchange/route.ts`
- Create `app/apps/web/src/server/session-cookie-jar.ts` (Next `cookies()` adapter; `__session`, `HttpOnly`,
  `Secure` except `APP_ENV=local` over http, `SameSite=Lax`, `Path=/`) — the SP2 `actions.ts` wrapper uses it
- Modify: `services/core-routes.ts`, `app/firestore.indexes.json` (sessions `uid+revokedAt+createdAt desc`,
  `cookieHash`, `secretHash` single field)
- Test: unit (stale `auth_time` → error; exchange of revoked session → error; desktop rotation and reuse revokes;
  staff guard requires staff doc and MFA by `sign_in_second_factor` or `smfa`+custom), emulator
  `sessions.emulator.test.ts` (real Auth Emulator: sign up via REST → ID token → `createWebSession` → cookie verifies
  → `exchangeWebSession` returns a custom token that signs in via REST → `revokeAll` makes the cookie invalid and the
  desktop exchange fail)

**Interfaces:** Produces `createWebSession`, `exchangeWebSession`, `signOutWebSession`, `requireWebSession`,
`requirePlatformStaffSession` (consumed by SP2 `apps/web`), desktop session endpoints (SP2 desktop).

- [ ] Steps 1–7. Commit: `feat(identity): add web and desktop sessions`.

**Verify:** `pnpm -F @core/services test` → PASS; `EMU` → PASS; `pnpm -F @core/web build` → exit 0; `framework-ok`.

### Task 14: API keys vertical

**Contexts (Read first):**
- `@.contexts/engineering/rules/security.md` (§1, §8, §12, §17 `timingSafeEqual`),
  `@.contexts/engineering/contracts/secrets.md`
- `app/docs/decisions/0008-api-keys-and-device-activation.md`; SP1 spec §6.3, §7.3 (API key rows)

**Files (under `app/packages/services/src/services/identity/`):**
- Create `domain/api-key-format.ts` (`formatApiKey`, `parseApiKey` → `{ prefix, publicId, secret }`, base32 publicId,
  base64url secret), `domain/errors/api-key-errors.ts`
- Create `application/ports/driven/api-key-repository.ts`, `adapters/driven/firestore-api-key-repository.ts`
- Create `application/use-cases/{create-api-key.ts (scopes ⊆ actor effective at node, expiry ≤ 365 d),
  list-api-keys.ts, revoke-api-key.ts, revoke-api-keys-of-owner.ts (implements access `ApiKeyRevoker`),
  authenticate-api-key.ts (rate limit `api-key-failure` checked before hashing; `timingSafeEqual`; `lastUsedAt`
  throttled to 1/min)}`
- Create `adapters/driving/api-keys-routes.ts`; route files `app/apps/web/src/app/v1/organizations/[organizationId]/api-keys/route.ts`,
  `app/apps/web/src/app/v1/api-keys/[apiKeyId]/route.ts`
- Modify: `identity/composition.ts` (wire `authenticateApiKey` into Task 8's `ApiKeyAuthenticator`),
  `access/composition.ts` (replace the no-op `ApiKeyRevoker`), `services/core-routes.ts`,
  `app/firestore.indexes.json` (`tenantId+ownerUid+status`, `tenantId+createdAt desc`)
- Test: unit (format round trip, wrong prefix, secret compare, failure limiter returns 429 before hash call —
  asserted by a hash spy counting 0 calls once limited), emulator `api-keys.emulator.test.ts` (create → 201 with
  secret once; list without secret/hash; call `GET /v1/organizations/{id}` with the key → 200; key scope lacks
  permission → 403; owner removed from tenant → key revoked → 401; expired (clock) → 401)

**Interfaces:** Produces API key endpoints and the `service` principal path of `authorize()`.

- [ ] Steps 1–7. Commit: `feat(identity): add scoped api keys`.

**Verify:** `pnpm -F @core/services test` → PASS; `EMU` → PASS; `pnpm -F @core/web build` → exit 0; `framework-ok`.

### Task 15: Devices vertical — activation codes, redeem, revoke

**Contexts (Read first):**
- `@.contexts/engineering/rules/security.md` (§8, §12), `app/docs/decisions/0008-api-keys-and-device-activation.md`
- SP1 spec §6.4, §7.3 (device rows)

**Files (under `app/packages/services/src/services/identity/`):**
- Create `domain/activation-code.ts` (8 Crockford base32 chars from 5 random bytes, normalization of user input:
  upper-case, strip `-`/spaces, `O→0`, `I/L→1`)
- Create `application/ports/driven/{device-repository.ts, device-activation-repository.ts}` + Firestore adapters
- Create `application/use-cases/{create-device-activation.ts, redeem-device-activation.ts (rate limit
  `device-redeem` 5 failures/15 min per IP; creates device, membership `principalType: device`, projection,
  custom token `{ principalType: "device", tenantId }`), list-devices.ts, revoke-device.ts (revokes grants,
  `revokeRefreshTokens`, disables the Auth user)}`
- Create `adapters/driving/devices-routes.ts`; route files `app/apps/web/src/app/v1/organizations/[organizationId]/devices/route.ts`,
  `app/apps/web/src/app/v1/devices/[deviceId]/route.ts`,
  `app/apps/web/src/app/v1/organizations/[organizationId]/device-activations/route.ts`,
  `app/apps/web/src/app/v1/device-activations/redeem/route.ts`
- Modify: `services/core-routes.ts`, `app/firestore.indexes.json` (devices `tenantId+status+createdAt desc`;
  `device-activations.expiresAt` TTL)
- Test: unit (code entropy/format, normalization, single use, TTL, lockout), emulator `devices.emulator.test.ts`
  (redeem → custom token → REST sign-in → ID token → `GET /v1/me/context?organizationId=` as device → 200 with the
  device grant's permissions; revoked device token → 401; 6th wrong code from the same IP → 429)

**Interfaces:** Produces device endpoints and the `device` principal path.

- [ ] Steps 1–7. Commit: `feat(identity): add device activation and revocation`.

**Verify:** `pnpm -F @core/services test` → PASS; `EMU` → PASS; `pnpm -F @core/web build` → exit 0; `framework-ok`.

### Task 16: Platform staff, impersonation and platform audit

**Contexts (Read first):**
- `@.contexts/engineering/rules/security.md` (§2, §3), `@.contexts/engineering/rules/governance.md` (audit, exceptions)
- SP1 spec §3.4, §6.6, §6.7; umbrella §16.2 (staff MFA, impersonation ≤ 60 min)

**Files:**
- Create `app/packages/services/src/services/identity/application/ports/driven/{platform-staff-repository.ts,
  impersonation-session-repository.ts}` + Firestore adapters
- Create `.../identity/application/use-cases/{start-impersonation.ts, end-impersonation.ts,
  grant-platform-staff.ts}`; `adapters/driving/platform-routes.ts` (`POST /platform/impersonation-sessions`,
  `POST /platform/impersonation-sessions/{id}/end`)
- Create route files: `app/apps/web/src/app/v1/platform/impersonation-sessions/route.ts`,
  `app/apps/web/src/app/v1/platform/impersonation-sessions/[sessionId]/end/route.ts`
- Create `app/scripts/grant-platform-staff.ts` (+ `app/scripts/src/staff/grant-staff-args.ts` and test): requires
  `--project <id> --email <email> --role <platform-admin|platform-support> --confirm <id>` (`--confirm` must equal
  `--project`), uses ADC outside `local`, writes `platform-staff/{uid}` and a `PLATFORM_STAFF_GRANTED` platform audit
  entry; `app/package.json` script `platform:grant-staff`
- Modify: `services/core-routes.ts`
- Test: unit (args validation; start requires MFA and staff role; expiry ≤ 60 min; end is idempotent),
  emulator `impersonation.emulator.test.ts` (staff with SMS MFA enrolled via Admin SDK and signed in through the
  emulator's MFA REST flow → start → custom token → impersonated `GET /v1/organizations/{id}` → 200; `PATCH` → 403
  `FORBIDDEN` (reason `IMPERSONATION_READ_ONLY` in logs only); after expiry (clock) → 403; both audit collections
  receive entries with `actor.onBehalfOf`)

**Interfaces:** Produces staff and impersonation backend for SP2 guards and SP5 `/admin`.

- [ ] Steps 1–7. Commit: `feat(identity): add platform staff and read-only impersonation`.

**Verify:** `pnpm -F @core/services test && pnpm -F @core/scripts test` → PASS; `EMU` → PASS; `framework-ok`.

### Task 17: Approval requests (four-eyes)

**Contexts (Read first):**
- `@.contexts/engineering/rules/governance.md` (approvals), `@.contexts/engineering/rules/security.md` (§14)
- SP1 spec §6.5, §7.3 (approval rows), §10 (SP3/SP5 hooks)

**Files (under `app/packages/services/src/services/access/`):**
- Create `domain/approval-state.ts` (pure transitions: pending → approved|rejected|cancelled|expired;
  approved → executed|failed), `domain/errors/self-approval-forbidden-error.ts`
- Create `application/ports/driven/{approval-request-repository.ts, approval-action-handler.ts}`
  (`ApprovalActionHandler { kind, inputSchema, execute(input, ctx) }`), `application/approval-handler-registry.ts`
- Create `application/use-cases/{request-approval.ts, list-approval-requests.ts, approve-request.ts (four-eyes +
  `core.approval.decide` + action permission; then at-most-once execution), reject-request.ts}`
- Create `adapters/driven/firestore-approval-request-repository.ts`, `adapters/driving/approvals-routes.ts`
- Create route files: `app/apps/web/src/app/v1/organizations/[organizationId]/approval-requests/route.ts`,
  `app/apps/web/src/app/v1/approval-requests/[approvalRequestId]/approve/route.ts`,
  `.../approval-requests/[approvalRequestId]/reject/route.ts`
- Modify: `access/composition.ts` (`createAccessServices({ permissions, approvalHandlers })`), `services/core-routes.ts`,
  `app/firestore.indexes.json` (`tenantId+status+createdAt desc`)
- Test: unit (transitions, self-approval, impersonator cannot approve, approver lacking action permission, handler
  input validated, double approve executes once), emulator `approvals.emulator.test.ts` with a test handler
  registered only in the test composition

**Interfaces:** Produces `requestApproval`, `ApprovalActionHandler` registry (SP3 tool approvals, SP5 workflow HITL
and inbox).

- [ ] Steps 1–7. Commit: `feat(access): add four-eyes approval requests`.

**Verify:** `pnpm -F @core/services test` → PASS; `EMU` → PASS; `pnpm -F @core/web build` → exit 0; `framework-ok`.

### Task 18: Audit log read API

**Contexts (Read first):**
- `@.contexts/engineering/contracts/api.md` (§9, §10), `@.contexts/engineering/rules/observability.md`
- SP1 spec §6.7, §7.3 (audit row)

**Files:**
- Create `app/packages/services/src/services/audit/application/ports/driven/audit-log-reader.ts`,
  `audit/adapters/driven/firestore-audit-log-reader.ts`, `audit/application/use-cases/list-audit-logs.ts`
  (filters `action`, `actorId`, `occurredAfter`, `occurredBefore`; sort `-occurredAt` only; cursor),
  `audit/adapters/driving/audit-logs-routes.ts`
- Create route file: `app/apps/web/src/app/v1/organizations/[organizationId]/audit-logs/route.ts`
- Modify: `services/core-routes.ts`
- Test: unit (filter validation: `occurredAfter > occurredBefore` → 400), emulator `audit-logs.emulator.test.ts`
  (entries produced by earlier flows are listed newest first; other tenant's entries never appear; member without
  `core.audit-log.read` → 403)

**Interfaces:** Produces the tenant audit viewer data for SP5.

- [ ] Steps 1–7. Commit: `feat(audit): add audit log listing`.

**Verify:** `pnpm -F @core/services test` → PASS; `EMU` → PASS; `pnpm -F @core/web build` → exit 0; `framework-ok`.

### Task 19: Firestore Security Rules, indexes and Rules tests (SP1 gate)

**Contexts (Read first):**
- `@.contexts/engineering/contracts/firebase-firestore.md` (§7, §19, §20), `@.contexts/engineering/rules/security.md` (§10)
- `@.contexts/engineering/stacks/database/firebase-firestore.md` (Rules), `app/docs/decisions/0006-tenancy-and-access-model.md`
- SP1 spec §5.5

**Files:**
- Modify: `app/firestore.rules` — helpers `isSignedIn()`, `activeTenant()`, `accessDoc()`, `isMember(t)`,
  `canSeeProject()`, `canSeeUnit()`, `notDeleted()`; read rules of SP1 spec §5.5; `allow write: if false` everywhere;
  final deny-all catch-all kept
- Modify: `app/firestore.indexes.json` (final review: every query in Tasks 7–18 has its index; TTL overrides)
- Create: `app/packages/services/src/services/shared/firestore-access-rules.emulator.test.ts` (keep SP0's
  `firebase-rules.emulator.test.ts` deny tests passing): per collection, anonymous denied; own `users/{uid}` readable,
  other user's not; own access doc of the active tenant readable, other tenant's not; organization readable only when
  `token.tenantId` matches and access is not revoked; project visible by `orgWide` or `visibleProjectIds`; unit visible
  by ancestor unit grant, not by sibling grant; soft-deleted docs denied; device principal token (`principalType:
  device`, `tenantId`) reads its tenant's organization; every write (create/update/delete) denied for every role;
  `memberships`, `roles`, `invitations`, `api-keys`, `devices`, `sessions`, `audit-logs`, `approval-requests`,
  `rate-limit-buckets`, `idempotency-records` unreadable
- Create: `app/packages/services/src/services/shared/firestore-indexes.test.ts` (parses `firestore.indexes.json`:
  every composite index has `tenantId` first or is on a user-scope collection; TTL overrides present)

**Interfaces:** Produces the Rules helpers SP3–SP5 reuse for realtime reads.

- [ ] Steps 1–7. Commit: `feat(access): add tenant-aware firestore security rules`.

**Verify:** `pnpm test:emulators` (root) → PASS, including Rules tests and all `*.emulator.test.ts`;
`pnpm -F @core/services test` → PASS; `framework-ok`.

### Task 20: Local seed, docs and SP1 gate report

**Contexts (Read first):**
- `@.contexts/engineering/processes/environments.md` (§9), `@.contexts/engineering/rules/documentation.md`
- `app/scripts/src/seed/seed-steps.ts` (extension point), SP1 spec §12, umbrella §13 (SP1 gate)

**Files:**
- Modify: `app/scripts/src/seed/seed-steps.ts` and create `app/scripts/src/seed/seed-tenancy.ts`,
  `seed-members.ts`, `seed-staff.ts` (+ tests) — idempotent (keyed by fixed emails and names looked up before
  create): users `owner@demo.local` (exists), `member@demo.local`, `viewer@demo.local`, `invitee@demo.local` (verified, no memberships: SP2 e2e accepts an
  invitation with it), `staff@demo.local` (staff
  `platform-admin`, SMS MFA factor `+15555550100` enrolled via Admin SDK), organizations "Demo Organization" and
  "Second Organization" (owner in both), two projects in the first and one in the second, a unit tree (two levels,
  generic names "Unit A", "Unit A.1"), `member` with `member` role on project 1, `viewer` with `viewer` on the
  organization; emails verified; passwords `SEED_*_PASSWORD` or local defaults. Seed writes through the services use
  cases (`createCoreServer` with the local env), not raw documents, so projections and claims stay consistent.
- Modify: `app/README.md` (SP1: contexts, endpoints list pointer to `docs/openapi/v1.yaml`, seed users, staff
  script, MFA locally = SMS, rate limits), `app/.env.example` (seed passwords)
- Modify: `docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md` (#10, #12c, #12e done; new SP1 follow-ups if any)
- Create: `docs/plans/2026-09-29-sp1-identity-tenancy-rbac/reports/sp1-summary.md` (gate evidence table: each
  command and output summary; `authorize` matrix count; Rules test count; decisions list; follow-ups)

- [ ] Steps 1–7 (tests: seed steps idempotency with fakes; `pnpm dev` + `pnpm seed:local` twice → second run
  reports "unchanged" for every step).
- [ ] Run the full gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:emulators && pnpm contracts:check`.
- [ ] Commit: `docs(access): record sp1 gate and seed tenancy data`.

**Verify:** all gate commands exit 0; `pnpm seed:local` twice → exit 0 both times; `curl -s -H "Authorization:
Bearer <owner ID token from the emulator REST sign-in>" http://localhost:3100/v1/me/organizations` (web on
`WEB_PORT=3100`) lists two organizations; `framework-ok`.

---

## Traceability

| Requirement (source) | Tasks |
|---|---|
| Prompt item 3 — users, profiles and permissions (RBAC) | 5, 6, 9, 11, 12 |
| Prompt item 10 — multi-tenant (organization → project → units) | 4, 9, 10, 19 |
| Prompt item 11 — `/admin` for platform staff (backend) | 13 (staff guard), 16 |
| Prompt decision 4 — tenancy tree, roles per node inherited, user in many organizations | 6, 9, 10, 12, 19 |
| Prompt decision 5 — `/v1` in Route Handlers for web and desktop | 8, 10–18 |
| Prompt decision 6 — modules register permissions (server side) | 6 (registry), 10 (unit types), SP2 Task 12 |
| Prompt "Contratos de dados" — single-source contracts with meta, OpenAPI | 3, 4, 5 |
| Umbrella §4 principals user/device/service/staff | 8, 13, 14, 15, 16 |
| Umbrella §4 collections (`organizations` … `access/{tenantId}_{uid}`) | 4, 5, 9, 10, 11, 14, 15, 7 (`audit-logs`) |
| Umbrella §4 claims as projection, switch via `/v1` + refresh | 9, 12 |
| Umbrella §4 `authorize()` single, fail-closed; `requiresApproval`; agent ceiling | 6, 17 |
| Umbrella §4 `rules/tenancy.md` (framework read-only → decision) | 1 (0006) |
| Umbrella §16.2 Bearer-only `/v1`; session cookie for RSC/Actions; no `/v1/auth/refresh` | 8, 13 |
| Umbrella §16.2 `checkRevoked` on mutations | 8 |
| Umbrella §16.2 API key hash, `timingSafeEqual`, `expiresAt`, scope ∩ creator, revoke on removal | 11, 14 |
| Umbrella §16.2 device code ≥ 40 bits, single use, 10 min, lockout, IP rate limit | 15 |
| Umbrella §16.2 rate limits (device, API key failures, org switch) | 7, 12, 14, 15 |
| Umbrella §16.2 staff MFA; impersonation read-only ≤ 60 min audited; four-eyes approvals | 13, 16, 17 |
| Umbrella §16.2 desktop refresh credential in OS vault (server side) | 13 (SP2 does the client) |
| Umbrella §16.2 audit `audit-logs` + `platform-audit-logs`, append-only, no TTL | 7, 16, 18 |
| Umbrella §13 SP1 gate: Rules + `authorize` tests (inheritance, multi-org, fail-closed, device, staff) | 6, 19, 20 |
| Follow-up #10 audit advisories | 1 |
| Follow-up #12c emulator host guard (defense in depth) | 2 |
| Follow-up #12e `checkRevoked` split tested with a fake verifier | 8 |
| SP3 hooks (`resolveAccessContext`, `verifyBearer`, ceiling, approvals registry, audit writer) | 6, 8, 12, 17, 7 |

## Self-review

- Every row of SP1 spec §7.3 maps to a task (endpoint coverage test in Task 5; route files in Tasks 9–18).
- Global Constraints match `MEMORY.md` pins and umbrella §16.1 (Next 16.3.7 is the adopted security release).
- Every task lists Contexts that exist in the repo (checked 2026-09-29) and ends with `framework-ok`.
- No placeholders: descriptor shapes, algorithms and error codes live in the SP1 spec sections each task cites.
- Tasks are one coherent area each; Tasks 6 and 19 carry the SP1 gate.
- Handoff: subagent-driven, one implementer + one reviewer per task, strictly in order (each task consumes the
  previous tasks' ports). Tasks 14–18 depend only on Tasks 1–13 and may run in any order among themselves.
