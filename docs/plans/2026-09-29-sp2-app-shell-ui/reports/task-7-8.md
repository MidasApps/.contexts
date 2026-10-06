# SP2 Tasks 7–8 — implementer report

- **Date:** 2026-09-30
- **Branch:** `feat/agentic-app-core-sp0`
- **Commits:** none. `git commit` for SP2 needs the user's permission (see `task-4-6.md`). Everything is in the
  working tree, verified and unstaged, on top of the uncommitted Tasks 4–6 work. The exact plan is in
  [Commit plan](#commit-plan).
- **Review:** pending

Contexts read: `docs/plans/execution-constraints.md`, `using-ddc`, plan header + Global Constraints + Tasks 7–8, SP2
spec (all), reports `task-1-3.md` and `task-4-6.md`, decisions 0011–0018, SP1 spec §3.3–§3.4, SP1 decision 0007;
`@core/contracts` (`field-meta.ts`, `catalog-meta.schema.ts`, `contract.ts`, `field-meta-rules.ts`,
`http/endpoint.ts`, `http/envelopes.schema.ts`, `http/error-codes.ts`, identity endpoints, access context, primitives
money/datetime/locale/time zone), `@core/i18n` (formatters, catalogs, `loadMessages`), client atoms/molecules used
(Field, Input, Textarea, Select, Switch, MoneyInput, LocaleSelect, TimeZoneSelect, CurrencySelect, Combobox, Alert,
LoadingState) and testing helpers; `rules/accessibility.md` (Formulários, live regions), `rules/state-management.md`
§1–§3, §10–§12, `rules/caching.md`, `rules/error-handling.md`, `contracts/api.md` §4–§6, §9, §11; Firebase Auth 12.19
type definitions (MFA, TOTP, emulator).

## Task 7 — `SchemaForm` organism

`app/packages/client/src/shared/ui/organisms/SchemaForm/`:

- `field-plan.ts`: `planSchemaForm(contract, { can })` → `{ sections, carried }` (pure). Uses `listTopLevelFields`,
  `readFieldMeta`, `isFieldOptional`. Widget = `ui.widget` or inferred (enum → select, boolean → switch, number →
  number (+ `integer`), `{ amountMinor, currency }` → money, ISO datetime → datetime, ISO date → date, string → text;
  `locale`/`timeZone`/`currency`/`textarea` via `ui.widget`). Sorted by `ui.order` then declaration; consecutive
  fields with the same `ui.group` share a fieldset. `hidden`, `ui.visibleWith` without `can()`, and types with no
  widget (arrays, objects) are `carried` (submitted from `defaultValues`, not rendered). `SchemaFormDefinitionError`
  for unknown widget, widget not fitting the type, or a rendered field without `ui.labelKey`.
- `widgets.tsx`: `SchemaFormField` — Field family wiring (`FieldControl` props forwarded to the real control), textual
  required mark (`common.form.required`) + `required` attribute, optional hint `<labelKey>Hint` before the control,
  enum option labels `<labelKey>Options.<value>`, switch in the horizontal row. Native inputs via `register`
  (`setValueAs`: empty → `undefined`, numbers), the rest via `Controller` (datetime shows `datetime-local` in the intl
  time zone and stores UTC ISO, with a time-zone hint; MoneyInput with `defaultCurrency`; Locale/TimeZone/Currency
  pickers).
- `contract-resolver.ts`: RHF resolver over the contract schema (`safeParseAsync`) with translated messages; merges
  money parse errors reported by the widget. `issue-messages.ts`: Zod issue → `common.form.errors.*` with limits
  (`tooShort {minimum}`, `tooBig {maximum}`, `required` for empty values, `notInteger`, `invalidOption`, …); server
  issue codes → generic copy.
- `server-errors.ts`: `SchemaFormResult`, `SchemaFormFailure` (the `ApiError` shape), `mapServerErrors`
  (`details[].field` → top-level field, first issue per field; unknown fields/other codes → form alert),
  `toSchemaFormFailure` (a thrown `onSubmit`, e.g. `ApiError`).
- `SchemaForm.tsx` + `SchemaFormStatus.tsx`: props `contract`, `defaultValues`, `onSubmit(values) → Promise<Result>`,
  `can`, `submitLabelKey`, `successMessageKey`, `defaultCurrency`, `loading` (+ form attributes, e.g. `aria-label`).
  States: loading skeleton, submitting (button `pending`, no double submit by Enter), success in an always-mounted
  polite live region, failure `alert` (`errors.<code>` + `common.errorState.reference`) that takes focus when no field
  can; client and server errors focus the first invalid field.
- `@hookform/resolvers` is **not** added (recorded in decision 0014 "Outcome of SP2 Tasks 7–8"): its zod resolver
  shows the schema's English messages and loses the limits the copy needs.
- `@core/i18n`: `utcToZonedWallTime(iso, timeZone)` (inverse of `zonedWallTimeToUtc`, tests incl. DST round trip);
  `common.form.*` messages in the three locales.

TDD: `field-plan.test.ts` and `SchemaForm.test.tsx` written first (RED: module missing; then 9 failing component
tests — labels not bound because `FieldControl` props stopped at the widget wrapper, and Zod not reporting inputs —
fixed). Tests: order/groups, widget inference, hidden and `visibleWith`, carried types, definition errors; component:
labels + required marks + legends + hints + axe, `visibleWith`, translated client errors with focus and
`aria-describedby`, submitted values (Money minor units, UTC date from the display zone, carried `id`), existing values
shown in the display zone, money parse error blocks submit, server `VALIDATION_FAILED` mapped + focus, other API error
alert focused with reference, pending submit disabled and single, loading state. `server-errors.test.ts` covers the
mappers.

## Task 8 — `shared/api`, `shared/lib` ports, `shared/config`

- `shared/api/`: `api-error.ts` (`ApiError { status, code, details, requestId }`, `CLIENT_ERROR_CODES`
  `NETWORK_ERROR|TIMEOUT|INVALID_RESPONSE`, `isClientError`), `http-client.ts` (`createHttpClient({ baseUrl,
  getIdToken, fetch, timeoutMs = 15 s })`: Bearer, ULID `x-request-id` per attempt, `Idempotency-Key`, JSON body,
  `AbortSignal.any([caller, timeout])`, envelope → `ApiError`, non-envelope → `INVALID_RESPONSE`; 401 → one forced
  refresh + retry only for GET/PUT/DELETE or keyed calls), `call-endpoint.ts` (`createEndpointCaller(http)` →
  `callEndpoint(endpoint, { params, query, body, idempotencyKey, signal })`, typed by SP1 descriptors: params
  required when declared, URI-encoded; query lists by comma; response parsed with the descriptor schema for the
  status, mismatch/undeclared status → `INVALID_RESPONSE`; key generated for `idempotency: "required"`),
  `query-client.ts` (`staleTime` 30 s, no retry on 4xx, ≤ 3 retries otherwise, mutations never), `query-keys.ts`
  (tenant data under `["organizations", id, …]`), `index.ts`.
- `shared/lib/router/`: `route-paths.ts` (route map of SP2 spec §4 as a `Route` union + `routeHref`, settings/profile
  section lists, `WEB_ONLY_ROUTE_IDS`), `parse-route.ts` (inverse), `router-port.ts`, `router-context.tsx`
  (`RouterProvider`, `useRouter`, `RouteLink`), `memory-router.tsx` (tests).
- `shared/lib/auth/`: `auth-port.ts` (`AuthPort`, `AuthState`, `SignInResult` with `mfa-required` challenge,
  `AuthError` codes), `firebase-auth-client.ts` (`initializeFirebaseAuth`: `inMemoryPersistence`; emulator +
  `appVerificationDisabledForTesting` only when `appEnv === "local"`; `createFirebaseAuthClient` with auth state store,
  email sign-in, custom token, ID token, sign-out), `firebase-mfa.ts` (SMS/TOTP sign-in challenge and enrollment),
  `firebase-errors.ts` (Firebase code → stable code, SDK message only as `cause`), `firebase-sdk.ts` (bound SDK
  functions), `auth-context.tsx`, `use-auth-state.ts`, `fake-auth.ts` (for later tasks' tests).
- `shared/lib/session-bridge/session-bridge-port.ts` (`establish({ idToken })`, `restore()` → custom token | null,
  `end()`), `shared/lib/secure-store/` (port + `SecureStoreError` + `createMemorySecureStore`),
  `shared/lib/platform/` (port + provider), `shared/lib/theme/` (`ThemeProvider` over next-themes, `data-theme`,
  `system` default, CSP nonce; `useThemePreference`), `shared/lib/format/` (`useFormatMoney`, `useFormatDateTime`:
  use-intl locale + provider time zone, which the app shell sets from `regional.displayTimeZone`).
  `shared/lib/shortcuts/use-shortcut.ts` already existed (Task 6).
- `shared/config/client-config.schema.ts`: `ClientConfigSchema` (`appEnv`, `apiBaseUrl` `""` or http(s) URL,
  `firebase { apiKey, authDomain, projectId }`, `authEmulatorUrl` required in local and forbidden elsewhere,
  `mfaFactors` `totp|phone` per SP1), `parseClientConfig` → `ClientConfigError` listing fields only.
- `package.json` exports `./shared/api` and `./shared/config`; `./shared/lib/*` already maps to each `index.ts`.
- Errors catalog: added `IDEMPOTENCY_REQUEST_IN_PROGRESS`, `UNKNOWN_APPROVAL_ACTION`, `APPROVAL_NOT_REQUIRED` (in
  `CORE_ERROR_CODES` but missing from the catalogs) and the three client codes, in all locales.
- Decision 0011 amended (retry policy, generated idempotency key, client codes, query-key scoping).
- Dependencies (measured 2026-09-30 with `npm view`, all latest): `react-hook-form` 7.89.0, `next-themes` 0.4.6
  (new catalog entries); `firebase` 12.19.0 and `ulid` 3.0.2 (existing catalog entries) added to `@core/client`.
  No `minimumReleaseAgeExclude` or `allowBuilds` change was needed.

TDD: `http-client.test.ts`, `call-endpoint.test.ts` and `route-paths.test.ts` were written before their modules but
first ran after the implementation existed (the one failure was the fake fetch ignoring an already-aborted signal —
fixed in the fake, matching real `fetch`). `error-messages-parity.test.ts` passed on first run because the missing
codes were added to the catalogs while preparing Task 7's messages.

## Verification (fresh, 2026-09-30)

```
$ pnpm -F @core/client test
 Test Files  75 passed (75)
      Tests  251 passed (251)        (no unhandled errors)
$ pnpm -F @core/client typecheck && pnpm -F @core/client lint
$ tsc --noEmit                        (exit 0)
$ eslint .                            (exit 0)
$ pnpm -F @core/i18n test
 Test Files  9 passed (9)
      Tests  51 passed (51)
$ pnpm -F @core/i18n typecheck && pnpm -F @core/i18n lint      (exit 0)
$ pnpm i18n:check
@core/i18n:i18n:check: i18n:check ok (3 namespaces, 9 catalogs)
$ pnpm lint
 Tasks:    11 successful, 11 total
$ pnpm typecheck
 Tasks:    11 successful, 11 total
$ git diff --quiet main -- .contexts .claude && echo framework-ok
framework-ok
```

## Commit plan

Apply **after** the Tasks 4–6 plan in `task-4-6.md` (these files build on it; several were already modified there).
Stage only the listed paths/hunks; nothing of mine is staged. Note: at report time another agent had **staged** its
own `libpg-query` hunks in `pnpm-workspace.yaml`/`pnpm-lock.yaml` — leave them alone (`git add -p` only my hunks).
Every message ends with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Paths relative
to `app/` unless noted.

1. `feat(client): add schema-driven form organism` —
   `packages/client/src/shared/ui/organisms/SchemaForm/` (all files),
   `packages/i18n/src/format/{date-time.ts,date-time.test.ts}`, `packages/i18n/src/index.ts`,
   `packages/i18n/src/messages/{pt-BR,en-US,es-419}/common.json` (the `form` subtree),
   `packages/client/package.json` (`react-hook-form` dependency),
   `pnpm-workspace.yaml` hunk `react-hook-form: 7.89.0`,
   `pnpm-lock.yaml` hunks: importer root catalog `react-hook-form`, importer `packages/client` `react-hook-form`,
   packages/snapshots `react-hook-form@7.89.0`,
   `docs/decisions/0014-ui-kit-shadcn-atomic.md` (section "Outcome of SP2 Tasks 7–8").
2. `feat(client): add api client and platform ports` —
   `packages/client/src/shared/api/`, `packages/client/src/shared/config/`,
   `packages/client/src/shared/lib/{router,auth,session-bridge,secure-store,platform,theme,format}/`,
   `packages/client/package.json` (`firebase`, `next-themes`, `ulid`; exports `./shared/api`, `./shared/config`),
   `packages/i18n/src/messages/{pt-BR,en-US,es-419}/errors.json`,
   `pnpm-workspace.yaml` hunk `next-themes: 0.4.6`,
   `pnpm-lock.yaml` hunks: catalog `next-themes`, importer `packages/client` `firebase`, `next-themes`, `ulid`,
   packages/snapshots `next-themes@0.4.6`,
   `docs/decisions/0011-client-data-and-rendering-model.md`.
   If splitting `packages/client/package.json` and the lockfile by hunk is impractical, commit both dependency sets in
   commit 1 (commit 2 then only adds code) — each commit must install and build.
3. `docs(client): record sp2 tasks 7-8 progress and report` — (repo root)
   `docs/plans/2026-09-29-sp2-app-shell-ui/progress.md` (the two 2026-09-30 lines; update with the SHAs),
   `docs/plans/2026-09-29-sp2-app-shell-ui/reports/task-7-8.md`.

## Concerns

1. **No commits** (permission); see the plan above.
2. **Lockfile noise not mine:** the install also rewrote `vite@8.3.1` peer resolution from
   `(…)(tsx@4.23.15)(yaml@2.9.1)` to `(…)(yaml@2.9.1)` (a new snapshot plus two references). That follows another
   agent's dependency change (tsx); leave that hunk with its owner.
3. SchemaForm conventions (`<labelKey>Hint`, `<labelKey>Options.<value>`, `ui.group` as a legend key) are app
   conventions recorded in 0014; `i18n:check` cannot verify that a contract's keys exist — a missing key throws in
   component tests (`renderWithProviders` fails on missing keys), so module/SP4 tests must render their contracts.
4. The session-bridge, secure-store and platform ports are type contracts only here; their adapters come in Tasks
   18–21. MFA flows in `firebase-mfa.ts` are typed against Firebase 12.19 but only exercised by e2e later (the Auth
   Emulator supports SMS only; TOTP needs a remote Identity Platform project).
5. `useFormatDateTime`/`SchemaForm` read the display time zone from the intl provider: the app shell (Task 10) must
   pass `regional.displayTimeZone` as the `IntlProvider` `timeZone`, and `defaultCurrency` =
   `regional.currency` to SchemaForm.
