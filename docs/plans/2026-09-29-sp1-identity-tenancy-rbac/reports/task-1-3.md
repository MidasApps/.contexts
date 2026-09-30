# SP1 Tasks 1–3 — implementer report

- **Date:** 2026-09-29
- **Branch:** `feat/agentic-app-core-sp0`
- **Commits:** `c41c68c` (Task 1), `11a2f54` (Task 2), `2a3b2d8` (Task 3)
- **Review:** pending

## Task 1 — decisions 0006–0010 and dependency audit (follow-up #10)

Files: `app/docs/decisions/0006-tenancy-and-access-model.md` (stands in for `rules/tenancy.md` required by
`contracts/firebase-firestore.md` §7; server-bound tenant, claims as projection, unmapped resource denied,
Timestamp ↔ ISO at the adapter), `0007-authentication-sessions.md` (rejects IndexedDB persistence, cookie on `/v1`,
`POST /v1/auth/refresh`), `0008-api-keys-and-device-activation.md`, `0009-rate-limiting-and-idempotency-store.md`,
`0010-dependency-audit-advisories.md`; `app/README.md` decisions list; follow-up #10 marked done.

Audit (`pnpm audit --json`, 1359 deps): 0 critical, 0 high, 2 moderate.

| Advisory | Package | Reachable | Decision |
|---|---|---|---|
| GHSA-w5hq-g745-h8pq | `uuid@9.0.1` via `gaxios@6.7.1` (firebase-tools; firebase-admin → @google-cloud/storage) | no: gaxios calls only `v4()` without `buf` | accept, re-check 2026-12-29 |
| GHSA-8988-4f7v-96qf | `@opentelemetry/core@1.30.1` via firebase-tools → @google-cloud/pubsub | no: dev CLI/emulator only | accept, re-check 2026-12-29 |

No catalog bump or override was applied (both fixes are majors under unmodified callers).

Verify:

```
$ pnpm audit --audit-level high >/dev/null; echo $?
0
$ pnpm test
 Tasks:    8 successful, 8 total        (exit 0; Task 1 changed no code)
$ ls docs/decisions/000{6,7,8,9}-*.md docs/decisions/0010-*.md
0006-tenancy-and-access-model.md  0007-authentication-sessions.md  0008-api-keys-and-device-activation.md
0009-rate-limiting-and-idempotency-store.md  0010-dependency-audit-advisories.md
framework-ok
```

## Task 2 — Firebase Admin factory, emulator guard (#12c), Firestore helpers

- `packages/services/package.json`: `firebase-admin: catalog:` (lockfile: only the 3-line importer hunk committed).
- Env (`services-env.schema.ts` + test): `SESSION_MAX_AGE_DAYS` 1–14 (5), `DESKTOP_SESSION_MAX_AGE_DAYS` 1–90 (30),
  `API_KEY_PREFIX` `^[a-z]{2,12}$` (`core`), `ORGANIZATION_SELF_SERVE` `"true"|"false"` → boolean (true),
  `MFA_FACTORS` comma list of `totp|phone`, deduplicated (`["totp"]`). `.env.example` sets `MFA_FACTORS=phone`.
- `shared/firebase/firebase-admin.ts`: `createFirebaseAdmin({ env, processEnv, sdk? })`, named app
  `core-services` reused across reloads; `EmulatorOutsideLocalError` (`EMULATOR_OUTSIDE_LOCAL`, key names only) for
  any non-empty `*_EMULATOR_HOST` when `APP_ENV !== "local"`.
- `shared/firestore/`: `contract-converter.ts` (+ `date-time-paths.ts`: finds `IsoDateTimeSchema` fields through
  wrappers, nested objects and arrays; drops/fills `id` from the document id), `corrupt-document-error.ts` (doc
  path + issue paths, no values, no ZodError cause), `audit-fields.ts`, `soft-delete.ts` (+
  `initialSoftDeleteFields()`, because `where("deletedAt", "==", null)` needs the field present),
  `transaction-runner.ts`. All exported from `@core/services`.
- `vitest.config.ts`: emulator project `fileParallelism: false`.
- `apps/functions/src/functions-env.schema.ts` + test: emulator hosts rejected outside local; output stays
  `{ APP_ENV }`. Follow-up #12 part (c) marked done.

Verify:

```
$ pnpm -F @core/services test        Test Files 13 passed (13) | Tests 77 passed (77)
$ pnpm -F @core/services typecheck   exit 0     $ pnpm -F @core/services lint   exit 0
$ pnpm exec firebase emulators:exec --project demo-core --only auth,firestore,storage "pnpm -F @core/services test:emulators"
 Test Files  3 passed (3)
      Tests  16 passed (16)
$ pnpm -F @core/functions test       Test Files 4 passed (4) | Tests 25 passed (25)
$ pnpm -F @core/functions typecheck  exit 0     $ pnpm -F @core/functions lint  exit 0
framework-ok
```

## Task 3 — endpoint descriptors and OpenAPI paths

- `src/contracts/http/envelopes.schema.ts`: `dataEnvelope`, `listEnvelope` (`meta.page { cursor|null, hasMore,
  limit }`), `ErrorEnvelopeSchema` + `ErrorEnvelopeContract` (`http.ErrorEnvelope`, registered in `CORE_CONTRACTS`
  so error responses can `$ref` it), `ErrorCodeSchema`, `ErrorDetailSchema`, `PageMetaSchema`, `PageQuerySchema`.
- `endpoint.ts`: `defineEndpoint` (validates `/v1/` prefix, kebab/`{param}` segments, params ↔ path, GET without
  body/idempotency, 204 without schema, ≥ 1 success status, id/error-code/policy formats), `EndpointDefinition`,
  `EndpointAuth`, `InferEndpointInput`, `InferEndpointResponse` (type tests with `expectTypeOf`).
- `endpoint-registry.ts`: duplicate id / duplicate method + route (param names ignored). `CORE_ENDPOINTS` (empty)
  and `composeCoreEndpoints` live in `composition.ts`, next to `CORE_CONTRACTS`.
- `scripts/catalog/openapi-paths.ts` + `render-openapi.ts` (+ test on a fixture): operations with path/query
  parameters from Zod, `Idempotency-Key` header, request body, success responses, error responses (declared plus
  the ones the pipeline adds: 400/401/409/429/500) referencing `http.ErrorEnvelope`, `bearerAuth` security scheme;
  registered contracts become `$ref`s. `check-catalog.ts` also checks raw meta keys in `paths` and dangling `$ref`s;
  drift covers paths because they are part of the `v1.yaml` artifact (test added).
- Decision 0001 got an amendment (paths are generated on top of the components).

Verify:

```
$ pnpm -F @core/contracts test       Test Files 11 passed (11) | Tests 107 passed (107)
$ pnpm -F @core/contracts typecheck  exit 0     $ pnpm -F @core/contracts lint  exit 0
$ pnpm contracts:catalog             contracts:catalog wrote 7 files for 2 contracts and 0 endpoints
$ pnpm contracts:check               contracts:check ok (2 contracts, 0 endpoints, 7 files)
framework-ok
```

`paths` stays `{}`; `v1.yaml` changed only by the new `http.ErrorEnvelope` component and
`components.securitySchemes.bearerAuth`.

## Deviations and concerns

1. **Endpoint `errors` shape.** The spec sketches `errors: ["UNAUTHORIZED", ...]`; the descriptor uses
   `errors: { 403: ["FORBIDDEN", ...] }` (status → codes), so OpenAPI renders one response per status without a
   code-to-status table. Pipeline errors (400/401/409/429/500) are implied and are not listed. Tasks 4–5 follow
   the typed shape.
2. **The plan's `EMU` command omits `storage`.** The existing `firebase-rules.emulator.test.ts` needs the Storage
   emulator, so `--only auth,firestore` fails that file. The emulator runs used `--only auth,firestore,storage`;
   the root `pnpm test:emulators` already includes storage.
3. **Per-endpoint OpenAPI examples** (`api.md` §15) are not generated yet: follow-up #16 added.
4. **TDD order.** For `firebase-admin.ts` and `envelopes.schema.ts` the tests were written first but first run
   after the implementation existed (they passed on first run); every other unit went red → green.
5. **Concurrent agents.** Other implementers (SP2, SP3) edit `pnpm-workspace.yaml`, `pnpm-lock.yaml`,
   `packages/services` (Postgres) and `packages/config`. Only my hunks were committed (the lockfile through a blob
   holding just the `firebase-admin` importer lines). When this report was written, `pnpm -F @core/services
   typecheck` failed in their uncommitted `with-tenant-transaction.postgres.test.ts`; my Task 2 commit typechecked
   clean before that.
