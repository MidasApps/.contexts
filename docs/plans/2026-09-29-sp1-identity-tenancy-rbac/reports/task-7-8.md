# SP1 Tasks 7–8 — implementer report (plus review fixes of Tasks 4–6)

- **Dates:** 2026-09-29 / 2026-09-30
- **Branch:** `feat/agentic-app-core-sp0`
- **Commits:** `8f996ff`, `554a9de` (review fixes), `2e22fc5` (coverage provider), `b86f3e8` (Task 7), `91f2129` (Task 8)
- **Review:** pending

## Review fixes of Tasks 4–6 (coordinator request)

| # | Fix | Commit |
|---|---|---|
| 1 | `isAtOrBefore` failed open on an unparsable instant (NaN): now `!(Date.parse(iso) > now)`. Tests: `clock.test.ts`, API key with `expiresAt: "not-a-date"` → `KEY_EXPIRED`, impersonation session with a bad expiry → `IMPERSONATION_EXPIRED`. | `8f996ff` |
| 2 | Impersonated requests also require, on every request, an active `platform-staff` doc for `staffUid`, a role granting `platform.user.impersonate`, and an active user doc for the staff member (else `IMPERSONATION_EXPIRED`). Tests: inactive staff, disabled staff user, non-staff. | `8f996ff` |
| 3 | `resolveService` denies `OUTSIDE_KEY_SCOPE` unless `node.tenantId === principal.tenantId` and `key.node.tenantId === key.tenantId`. Test: key stored with a node of another tenant. | `8f996ff` |
| 4 | Permission registry: module id must match `^[a-z][a-z0-9-]*$` (`INVALID_MODULE_ID`); `core`/`platform` only for the `CORE_PERMISSION_SOURCE` object (`RESERVED_MODULE_ID`). `PermissionRegistryError.permissionId` is now optional and the error carries `moduleId`. | `554a9de` |

## Coverage provider (`2e22fc5`)

`@vitest/coverage-v8` 5.0.2 (`npm view` = 5.0.2, peer `vitest: 5.0.2`) pinned in `catalog:` and added to
`@core/services` devDependencies. Only my hunks were committed: the lockfile blob was generated in a scratch
worktree at HEAD with just this change (SP2's uncommitted catalog/lockfile hunks stay in the working tree).
Note: the preset's global thresholds (80/75 %) fail when coverage runs on a subset of folders; pass
`--coverage.thresholds.*=0` or read the per-file rows for such runs.

## Task 7 — audit writer, rate limiter, idempotency store (`b86f3e8`)

- `audit/`: port `AuditLogWriter.append(record, tx?)` (`AuditTransaction` = Firestore `Transaction`), use case
  `makeRecordAudit({ writer, clock })` → `AuditWriter.record(input, tx?) → AuditLogEntryId`. Input is
  `{ log: "tenant", tenantId, ... }` or `{ log: "platform", targetTenantId?, ... }`; `occurredAt` defaults to the clock.
  It **rejects** keys naming personal data or credentials at any depth (`/e-?mail|password|passwd|secret|token|cookie|credential|phone/i`, plus `code`, `apiKey`) with `AuditEntryRejectedError` `AUDIT_ENTRY_REJECTED` (paths only), validates with
  `AuditLogEntrySchema`/`PlatformAuditLogEntrySchema` (`AUDIT_ENTRY_INVALID`), and strips other unknown keys.
  Firestore adapter: `audit-logs` / `platform-audit-logs`, `create` (never overwrite), converter (ISO → Timestamp),
  `schemaVersion: 1`, audit fields; inside a transaction the entry commits or rolls back with it. In-memory adapter
  for unit tests. `createAuditServices({ firestore, clock })`.
- `shared/rate-limit/`: `RATE_LIMIT_POLICIES` (decision 0009 plus `claims-sync` 10/min per principal), each with
  `subject: "ip" | "principal"` and `counts: "requests" | "failures"`; `getRateLimitPolicy` (throws
  `UnknownRateLimitPolicyError`); pure `applyFixedWindow`; port `RateLimiter { consume, peek }`; Firestore adapter
  (transaction on `rate-limit-buckets/{sha256(policy:subject)}`, `expiresAt`, 10 attempts); in-memory adapter;
  `rateLimitHeaders` / `rateLimitedResponse` (`X-RateLimit-Limit|Remaining|Reset`, `Retry-After` ≥ 1).
  A test checks every `rateLimit` of `CORE_ENDPOINTS` resolves and public endpoints limit per IP.
- `shared/idempotency/`: pure `decideBegin` (new / replay / conflict / in-flight; 24 h TTL; 60 s in-flight lease so a
  crashed request frees its key), port `IdempotencyStore { begin, complete, release }`, `idempotencyScopeKey`
  (`sha256(principalKey:endpointId:key)`), `hashRequest` (sha256 of canonical JSON), Firestore and in-memory adapters.
- `firestore.indexes.json`: TTL overrides on `rate-limit-buckets.expiresAt` and `idempotency-records.expiresAt`;
  composite indexes `audit-logs` `tenantId+occurredAt desc`, `tenantId+action+occurredAt desc`,
  `tenantId+actor.id+occurredAt desc`.

## Task 8 — `/v1` pipeline (`91f2129`)

- `identity/`: ports `TokenVerifier.verifyIdToken(token, { checkRevoked }) → VerifiedToken | null` (null = 401;
  infrastructure errors reject) and `ApiKeyAuthenticator.authenticate(credential) → ServicePrincipal | null`
  (`refuseAllApiKeys` until Task 14); adapters `createFirebaseTokenVerifier({ auth })` (`auth/*` errors → null) and
  `createFakeTokenVerifier` (honours `checkRevoked`, records calls). Use case `resolve-principal.ts`: `parseBearer`,
  `requiresRevocationCheck` (false only for GET/HEAD), `isApiKeyCredential` (`<prefix>_`), `mapTokenToPrincipal`
  (`principalType: "device"` + `tenantId` → device; `imp` + `impBy` → impersonated user with `mfa: false`; half of
  them → rejected; other `principalType` → rejected; `mfa` from `sign_in_second_factor` `totp|phone`, or `smfa === true`
  only with provider `custom`; result parsed by `PrincipalSchema`), `makeVerifyBearer`, `makeResolvePrincipal`.
- `shared/http/`: `withApiRoute(endpoint, deps, handler)` (`api-route.ts`) with helpers `request-input.ts` (params from
  the path template, query with repeated keys as arrays, JSON body, `Idempotency-Key`; all issues in one 400),
  `authenticate-request.ts` (API key failures counted per IP, 429 before the key is checked), `api-rate-limit.ts`,
  `api-idempotency.ts` (replay adds `Idempotent-Replayed: true`; `complete` for status < 500, `release` for 5xx or a
  throw), `client-ip.ts`, `path-params.ts`, `api-errors.ts` (`apiError`, `mapDomainError`, `dataResponse`,
  `noContentResponse`), `api-handler-context.ts` (`ApiHandler<E>`, `ApiHandlerContext<E>`).
- `services/composition.ts` (export `@core/services/composition`): `createCoreServer({ env: { API_KEY_PREFIX },
  firebase, logger, clock?, modules?, adapters? })` → `{ routes, verifyBearer, access, audit, pipeline }`;
  `core-routes.ts`: `buildCoreRoutes(deps)` (empty) and `createRouteResolver`.
- Web: `apps/web/src/server/core.ts` (`getCoreServer()` memoized promise, env imported lazily; `route(endpointId)`),
  `src/server/modules.ts` (`serverModules = []`), `src/env.ts` exports `processEnvForFirebaseGuard` (the only
  `process.env` reader stays `env.ts`). Follow-up #12 part (e) marked done.

### Final signatures (for SP3 `runtime-ports.ts`)

```ts
type VerifyBearer = (input: { token: string; checkRevoked: boolean }) => Promise<Principal | null>; // = AccessPort.verifyBearer
makeVerifyBearer(deps: { tokenVerifier: TokenVerifier; apiKeyAuthenticator: ApiKeyAuthenticator; apiKeyPrefix: string }): VerifyBearer;
createCoreServer(...).verifyBearer  // bound to firebase-admin Auth + the API key authenticator
requiresRevocationCheck(method: string): boolean; parseBearer(authorization: string | null): string | null;
type AuditWriter = { record(input: AuditRecordInput, tx?: AuditTransaction): Promise<AuditLogEntryId> };
// AuditRecordInput = Omit<AuditLogEntry, "id" | "occurredAt"> & { log: "tenant"; occurredAt?: string }
//                  | Omit<PlatformAuditLogEntry, "id" | "occurredAt"> & { log: "platform"; occurredAt?: string }
type ApiHandlerContext<E> = { principal; input: InferEndpointInput<E>; requestId; authorize; scope: RequestAccess;
  audit: AuditWriter; clientIp: string; logger: Logger; request: Request };
```

`verifyBearer` only maps claims; whether a device is active or an impersonation session is open is decided by
`authorize()` from the source documents. SP3's `AuditPort` (actor as a `Principal`, free `metadata`) differs from
`AuditWriter` (actor `{ type, id }`, no metadata): the adapter in `create-runtime-ports.ts` must map it and must not
put user input into the entry.

## Verify

```
$ pnpm -F @core/services test            Test Files 36 passed (36) | Tests 253 passed (253)
  (after the review fixes: access + clock 83 tests; Task 7 +37; Task 8 +37)
$ pnpm -F @core/services typecheck        exit 0      $ pnpm -F @core/services lint   exit 0
$ pnpm exec firebase emulators:exec --project demo-core --only auth,firestore,storage "pnpm -F @core/services test:emulators"
  Test Files 6 passed (6) | Tests 28 passed (28)   (new: firestore-rate-limiter, firestore-idempotency-store,
                                                    firestore-audit-log-writer emulator files)
$ pnpm -F @core/web typecheck             exit 0 (next typegen + tsc)     $ pnpm -F @core/web lint   exit 0
$ pnpm -F @core/web build                 exit 0 (routes: /, /_not-found, /v1/health)
$ pnpm -F @core/web test                  Test Files 4 passed (4) | Tests 25 passed (25)
$ vitest --project unit --coverage (v8) on shared/http, identity, audit:  record-audit.ts 100 % lines, request-input.ts 100 % lines
$ git diff --quiet main -- .contexts .claude && echo framework-ok
framework-ok
```

## Deviations and concerns

1. **Rate limit order.** Spec §7.2 puts the rate limit before authentication. IP policies run there; principal
   policies (`active-organization-switch`, `claims-sync`, `invitation-*`) need the principal, so they run right after
   authentication. Failure-counted policies (`device-redeem`, `api-key-failure`) peek before and count after a 4xx.
2. **Client IP** is the rightmost `X-Forwarded-For` entry, assuming the Google front end appends the address it saw.
   Not verified on App Hosting (follow-up #13 blocks a real deploy); check in the first remote environment.
3. **Idempotency stores response bodies for 24 h**, including one-time secrets (API key / device activation / desktop
   session create responses) when the client sends an `Idempotency-Key`. Tasks 13–15 should decide whether those
   endpoints drop `idempotency` or store a redacted replay.
4. **Access readers are fail-closed stubs** in `createCoreServer` until Task 9 passes Firestore readers
   (`adapters.accessReaders`); `authorize()` rejects with `AccessReadersNotWiredError` (500), never allows.
   `sessions` and `guards` of the plan's `createCoreServer` return value are left to Task 13.
5. **Handler context naming.** The plan lists `{ principal, input, requestId, authorize, audit, scope }`; `scope` is
   the per-request `RequestAccess` (`authorize` + `getEffectivePermissions`), plus `clientIp`, `logger`, `request`.
6. **`TokenVerifier` returns `null`** for rejected tokens instead of throwing (the plan says `→ VerifiedToken`), so
   401 vs 500 is decided in the adapter.
7. **TDD order.** Red first observed for the review fixes, `record-audit.test.ts` and the three Task 8 test files;
   the Task 7 shared unit tests and the three emulator files were written first but first run after their code
   (they passed on first run).
8. **Concurrent agents.** SP2 files (packages/client, packages/i18n, decisions 0013–0015, catalog/lockfile hunks) were
   never staged; every commit used explicit paths.
