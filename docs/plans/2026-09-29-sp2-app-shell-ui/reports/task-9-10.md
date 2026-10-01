# SP2 Tasks 9–10 — implementer report

- **Date:** 2026-09-30
- **Branch:** `feat/agentic-app-core-sp0`
- **Commits:** none. `git commit` for SP2 needs the user's permission (see `task-4-6.md`). Everything is in the
  working tree, verified and unstaged, on top of the uncommitted Tasks 4–8 work. Plan: [Commit plan](#commit-plan).
- **Review:** pending

Contexts read: `docs/plans/execution-constraints.md`, `using-ddc`, plan header + Global Constraints + Tasks 9–10 (and
11–13, 17 to keep the seams right), SP2 spec (all), reports `task-1-3.md`, `task-4-6.md`, `task-7-8.md`, decisions
0011–0018, SP1 spec §3, §5.4, §10, SP1 plan Tasks 9, 10, 19, SP3 spec §2.1 and decision 0019 (capability refs),
`@core/contracts` (contract, catalog meta, endpoint, envelopes, permission definition, unit type, node ref, access
context, me, identity endpoints, audit action/entry, core permissions), `@core/services` (composition, core routes,
`withApiRoute`, handler context, api errors, `deniedResponse`, access core + write side, audit writer, Firestore
helpers, unit of work, rules test), `@core/client` shared layers (api, auth, router, session bridge, platform, theme,
testing helpers, Icon registry, OfflineNotice, ErrorState, Alert, Toaster, Tooltip), `rules/state-management.md`
§14–§15, `stacks/state/zustand@5.md` (persist, reset, SSR hydration), `rules/accessibility.md`.

## Task 9 — module contract and module settings backend

**Contracts** (`packages/contracts/src/contracts/modules/`):

- `nav-item.schema.ts` — `NAV_SLOTS` (`organization`, `project`, `settings`, `admin`, `user-menu`), `NavItemSchema`
  (`id` kebab, `labelKey`, `icon` kebab, `path` relative without params, `permission?`, `order?`).
- `capability-ref.schema.ts` — `CapabilityRefSchema { id }` (data-only; SP3 extends additively).
- `module-manifest.schema.ts` — `ModuleIdSchema`, `RESERVED_MODULE_IDS` (`core`, `platform` + every core message
  namespace), `ModuleSettingsDefinitionSchema` (`contract` = a `defineContract()` result, read/update permissions),
  `ModuleManifestSchema` (strict; messages keyed by canonical BCP 47 — the supported set stays with `i18n:check`).
- `define-module.ts` + `module-definition-error.ts` — `defineModule(manifest)` returns the manifest unchanged or throws
  `ModuleDefinitionError` (`INVALID_MODULE`, every problem listed): shape; reserved id; permission / unit type ids
  prefixed by `<id>.`; duplicates; navigation permission declared by the module or in `CORE_PERMISSIONS`; settings
  contract `kind: "settings"` over an object schema, permissions declared by the module; referenced message keys in
  the module namespace and present in every declared locale; capability ids prefixed by `<id>-`/`<id>.`, unique.
- `module-settings.schema.ts` — `ModuleSettingsValuesSchema` (generic record), `ModuleSettingsSchema` /
  `ModuleSettingsContract` (`modules.ModuleSettings`: `tenantId`, `moduleId`, `values|null`, `updatedAt|null`,
  `updatedBy|null` = actor id).
- `endpoints.ts` — `modules.getModuleSettings` (`GET`) and `modules.updateModuleSettings` (`PUT`, body = the values
  object) on `/v1/organizations/{organizationId}/module-settings/{moduleId}`; errors 403/404 (400 implied).
  A new `modules` context keeps the SP1 coverage test (`identity|tenancy|access|audit` only) exact.
- Registered in `composition.ts` (`CORE_CONTRACTS`, `CORE_ENDPOINTS`) and exported from `index.ts`;
  `AUDIT_ACTIONS` gains `MODULE_SETTINGS_UPDATED`. Catalog regenerated (`pnpm contracts:catalog`).

**Services** — own context `packages/services/src/services/modules/` (not `tenancy`, which SP1 Task 10 is writing in
parallel):

- `domain/module-settings-registry.ts` (`createModuleSettingsRegistry`, duplicate → `ModuleSettingsRegistryError`;
  `moduleSettingsDefinitionsOf(modules)`), `domain/module-settings-errors.ts` (`UnknownModuleError`,
  `InvalidModuleSettingsError` with details).
- `application/ports/driven/module-settings-repository.ts`; `application/module-settings-deps.ts`
  (`loadAuthorizedDefinition`: unknown module → error before any access read, then `authorize()` at the organization;
  `toModuleSettings`; Zod issues → `VALIDATION_FAILED` details like the pipeline's); use cases
  `get-module-settings.ts`, `update-module-settings.ts` (authorize → validate with the module contract → one unit of
  work: read existing, write the record keeping `createdAt/By`, audit `MODULE_SETTINGS_UPDATED` with changed field
  names only).
- `adapters/driven/firestore-module-settings-repository.ts` (`module-settings/{tenantId}_{moduleId}`, stored shape
  parsed by a converter, `schemaVersion: 1`, audit fields), `in-memory-module-settings-repository.ts`;
  `adapters/driving/module-settings-routes.ts` (404 unknown module / hidden organization via `deniedResponse`, 403,
  400 with details); `composition.ts`, `index.ts`.
- `services/composition.ts`: `CoreServerModule` accepts `unitTypes?` and `settings?` (a `defineModule` manifest fits);
  `createCoreServer` builds the Firestore module settings services, merges their routes and exposes
  `moduleSettings` and `moduleUnitTypes`. (SP1 Task 10 now passes `module.unitTypes` straight to
  `createTenancyServices`, so `moduleUnitTypes` is informational.) `src/index.ts` exports the context.
- `apps/web/src/app/v1/organizations/[organizationId]/module-settings/[moduleId]/route.ts` (`GET`/`PUT`);
  `apps/web/src/server/modules.ts` comment updated (the installed list arrives in Task 18).
- `firestore.rules`: explicit `match /module-settings/{settingsId} { allow read, write: if false; }`.

TDD: `define-module.test.ts` (18 cases, one per validation) RED on the missing module, then green;
`module-settings-use-cases.test.ts` + `module-settings-registry.test.ts` RED on the missing adapter/composition, then
green; `module-settings.emulator.test.ts` (unknown module → 404; invalid values → 400 with `greeting`,
`defaultBudget.currency`; viewer → 403, stranger → 404; PUT then GET round trip; stored doc; one audit entry with
field names and no values) and `module-settings-rules.emulator.test.ts` (anonymous and member denied read/write)
written with the implementation and green on first run; `module-composition.test.ts`.

Decision 0015 amended ("Outcome of SP2 Tasks 9–10").

## Task 10 — app shell

`packages/client/src/app-shell/`:

- `create-client-app.tsx` — `createClientApp({ config, modules, adapters, navigation?, slots? })` builds once the
  module registry, navigation registry (core + extra + module items), query client, `/v1` caller and shell UI
  store, and returns `ClientApp` (`locale`, children): Platform → Router → Auth → QueryClient → Api → shell registries
  → shell UI store → Session → Intl (`use-intl`: locale, core + module messages, **`timeZone` =
  `regional.displayTimeZone`** of the access context at the URL node, else the user's preference, else the browser)
  → Theme → Tooltip → error boundary, plus Toaster and (desktop) `RouteAnnouncer`. Adapters: `auth`, `router`,
  `sessionBridge`, `platform`, optional `fetch`, `reportError`, `onIntlError`, `shellUiStorage`, `themeNonce`.
- `modules/define-client-module.ts` — `defineClientModule({ manifest, pages })` (one `React.lazy` per page key;
  rejects bad page keys, unknown icons, project items without a page, module items in `organization`/`user-menu`
  slots). `modules/module-registry.ts` — duplicates rejected, messages merged under the module id,
  `resolvePage(moduleId, rest)` (static keys before `:param` keys), `navItems()` (module items + a `settings` entry
  per module with settings, gated by its `readPermission`).
- `navigation/navigation-registry.ts` (`visibleItems(slot, can)`, order then id, duplicate ids rejected),
  `navigation/core-navigation.ts` (organization home/settings, project overview, every settings section incl. the
  SP3/SP5 slots with their read permissions, every profile section in `user-menu`, the nine `/admin` slots of SP2 spec
  §7). Chat (SP4) joins the `project` slot through `createClientApp({ navigation })`; the right panel through
  `slots.rightPanel`.
- `session/session-machine.ts` (pure reducer; `booting → signed-out | exchanging → signed-in`, `signed-out →
  signed-in | mfa-required`; inapplicable events return the same state), `session/session-provider.tsx` +
  `session-effects.ts` (boot once: `restore()` → `signInWithCustomToken` → signed-in; `completeSignIn` establishes the
  bridge session; `signOut` ends the bridge, clears the query cache and the shell UI store, signs Firebase out; auth
  loss while signed in → local sign-out; **claims freshness**: `GET /v1/me` `accessVersion` newer than the token claim
  → `POST /v1/me/claims/sync` → forced refresh → invalidate `["organizations"]`), `session/use-current-node.ts`.
- `route-announcer.tsx` (desktop), `offline-banner.tsx` (`useOnlineStatus`, retry refetches active queries),
  `shell-error-boundary.tsx` (error state with the `ApiError` `requestId`, never the message), `shell-ui-store.ts`
  (Zustand vanilla store + `persist`: recents only, `partialize`, version 1, parsed on merge, `skipHydration` +
  rehydrate after mount, `reset`), `index.ts`.

Supporting pieces outside `app-shell` (so FSD layers below the app layer can read what the shell provides):

- `shared/lib/shell/` — registry and slot types, `navItemRoute`, `useModuleRegistry`, `useNavigationRegistry`,
  `useShellSlots`, `useShellUi`.
- `shared/lib/session/` — `SessionState`, `SessionController`, `useSession`.
- `shared/api/api-context.tsx` (`ApiProvider`, `useCallEndpoint`), `shared/api/core-queries.ts` (`meQuery`,
  `accessContextQuery` — query options shared by the shell and Task 11's `entities/session`).
- `shared/lib/auth`: `AuthPort.getIdTokenClaims()` (Firebase `getIdTokenResult().claims`; the fake gets `setClaims`).
- `zustand` 5.0.15 (measured 2026-09-30, latest) added to the catalog and `@core/client`.
- Messages: `shell.nav.*`, `shell.routeAnnouncer.fallback`, `shell.errorBoundary.*` in the three locales.

TDD: `module-registry.test.ts` and `navigation-registry.test.ts` RED on missing modules, then green;
`session-machine.test.ts`, `shell-ui-store.test.ts`, `create-client-app.test.tsx`, `shell-status.test.tsx` were
written before their implementations but first ran after them (one fix: after `queryClient.clear()` mounted observers
re-create disabled entries, so the test asserts no cached data instead of an empty cache). `create-client-app.test.tsx`
covers children in every provider (module messages, core navigation, axe clean), session resume + claims sync +
display time zone from the access context, sign-out through the bridge with cache and store cleared, the error
boundary's reference without the message, and duplicate modules rejected.

## Verification (fresh, 2026-09-30)

```
$ pnpm -F @core/contracts test          Test Files 27 passed (27) · Tests 282 passed (282)
$ pnpm -F @core/contracts typecheck && lint     tsc --noEmit (exit 0) · eslint . (exit 0)
$ pnpm contracts:check                  contracts:check ok (74 contracts, 59 endpoints, 151 files)
$ pnpm -F @core/services test           Test Files 53 passed (53) · Tests 387 passed (387)
$ pnpm -F @core/services typecheck && lint      exit 0 / exit 0
$ firebase emulators:exec --only auth,firestore "pnpm -F @core/services exec vitest run --project emulators src/services/modules"
                                        Test Files 2 passed (2) · Tests 8 passed (8)
$ firebase emulators:exec --only auth,firestore,storage "pnpm -F @core/services test:emulators"
                                        Test Files 1 failed | 10 passed (11) · Tests 3 failed | 43 passed (46)
   failed: access/adapters/driven/firestore-membership-repository.emulator.test.ts (3 × 5 s timeouts) — SP1 Task 9's
   file, being worked on concurrently; every other file (mine included) passed.
$ pnpm -F @core/client test             Test Files 81 passed (81) · Tests 292 passed (292)
$ pnpm -F @core/client typecheck && lint        exit 0 / exit 0
$ pnpm -F @core/i18n test               Test Files 9 passed (9) · Tests 51 passed (51)
$ pnpm i18n:check                       i18n:check ok (3 namespaces, 9 catalogs)
$ pnpm typecheck                        Tasks: 11 successful, 11 total
$ pnpm lint --continue                  Tasks: 10 successful, 11 total — Failed: @core/mastra#lint
   (apps/mastra/src/mastra/runtime.emulator.test.ts, SP3's untracked file; not touched here)
$ git diff --quiet main -- .contexts .claude && echo framework-ok
framework-ok
```

Note: the plan's `EMU` command (`--only auth,firestore`) cannot run SP0's `firebase-rules.emulator.test.ts`, which needs
the Storage emulator; use `--only auth,firestore,storage`.

## Commit plan

Apply **after** the plans in `task-4-6.md` and `task-7-8.md`. Stage only these paths/hunks; nothing is staged. Every
message ends with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Paths relative to `app/`
unless noted. SP1 Task 9 is already committed (`0c600de`), so the helpers used here (`unit-of-work`, `result`,
`deniedResponse`, `audit-actor`) exist in history.

1. `feat(contracts): add module contract and settings store`
   - `packages/contracts/src/contracts/modules/` (all 8 files)
   - `packages/contracts/src/composition.ts` (the two `modules` imports and the two "SP2 module settings" list hunks)
   - `packages/contracts/src/index.ts` (the appended "SP2 module contract and module settings" block)
   - `packages/contracts/src/contracts/audit/audit-action.schema.ts` — only the `MODULE_SETTINGS_UPDATED` line after
     `UNIT_DELETED` (the `AGENT_TOOL_EXECUTED`… hunk belongs to SP3)
   - generated catalog: `docs/catalog/modules/`, and `docs/catalog/{catalog.json,catalog.ai.json}`,
     `docs/catalog/audit/*.schema.json`, `docs/openapi/v1.yaml` — these also carry SP3's audit actions; regenerate
     with `pnpm contracts:catalog` from the staged state (or commit them with whichever of the two lands last) and
     confirm `pnpm contracts:check`
   - `packages/services/src/services/modules/` (all), `packages/services/src/services/module-composition.test.ts`
   - `packages/services/src/services/composition.ts` — my hunks: `ModuleSettingsManifest`/`UnitTypeDefinition` in the
     type import, the three `./modules/...` imports, `CoreServerModule` (`unitTypes?`, `settings?`), `CoreServer`
     `moduleSettings` + `moduleUnitTypes`, the `createCoreServer` JSDoc, and the tail (`modules`, `moduleSettings`,
     `moduleUnitTypes`, `...buildModuleSettingsRoutes(...)` in `routes`, the two return fields). **SP1 Task 10 edits the
     same lines** (`tenancy` in `buildCoreRoutes` and the return): commit this file in whichever of SP1 Task 10 / this
     commit lands second, after checking both sets of hunks are present
   - `packages/services/src/index.ts` (the appended "SP2 module settings store" block; the tenancy block is SP1's)
   - `apps/web/src/app/v1/organizations/[organizationId]/module-settings/[moduleId]/route.ts`,
     `apps/web/src/server/modules.ts`
   - `firestore.rules`
   - `docs/decisions/0015-module-contract.md` (the "Outcome of SP2 Tasks 9–10" bullet; the Tasks 1–3 amendment belongs
     to `task-4-6.md` commit 1)
2. `feat(client): add app shell providers and module registry`
   - `packages/client/src/app-shell/` (all), `packages/client/src/shared/lib/{shell,session}/`,
     `packages/client/src/shared/api/{api-context.tsx,core-queries.ts}` and the two appended lines of
     `packages/client/src/shared/api/index.ts`
   - `packages/client/src/shared/lib/auth/{auth-port.ts,fake-auth.ts,firebase-auth-client.ts}` (`getIdTokenClaims`
     hunks; the files themselves come from `task-7-8.md` commit 2)
   - `packages/client/package.json` (`zustand`), `pnpm-workspace.yaml` hunk `zustand: 5.0.15`, `pnpm-lock.yaml` hunks
     catalog `zustand`, importer `packages/client` `zustand`, packages/snapshots `zustand@5.0.15…`
   - `packages/i18n/src/messages/{pt-BR,en-US,es-419}/shell.json` (`nav`, `routeAnnouncer`, `errorBoundary`)
3. `docs(client): record sp2 tasks 9-10 progress and report` — (repo root)
   `docs/plans/2026-09-29-sp2-app-shell-ui/progress.md` (the two Task 9/10 lines; update with the SHAs),
   `docs/plans/2026-09-29-sp2-app-shell-ui/reports/task-9-10.md`.

## Concerns

1. **No commits** (permission); see the plan above. `composition.ts` and the generated catalog are shared with SP1
   Task 10 and SP3 — follow the ordering notes.
2. **FSD placement beyond the plan's file list:** registry types, consumer hooks, the session contract and the query
   options live in `shared/lib/{shell,session}` and `shared/api` so widgets/features/views (Tasks 11–16) can read them
   without importing `app-shell`. Task 11's `entities/session` should wrap `meQuery`/`accessContextQuery` (same keys,
   one cache) instead of redefining them; Task 13's command palette reads recents with `useShellUi`.
3. `ShellErrorBoundary`, `SessionProvider` and the shell UI rehydrate report through `adapters.reportError`, which
   defaults to ignoring: the apps (Tasks 18/20) must pass their logger. `onIntlError` defaults to silent per decision
   0013 (the fallback is silent, `i18n:check` is the gate).
4. Module nav items in the `organization` and `user-menu` slots are rejected by `defineClientModule` because no module
   route exists there; if a module needs them, the route map (decision 0012) needs a new entry first.
5. The access context is fetched per URL node; `can()` (Task 11 `entities/permission`) should read the same
   `accessContextQuery` so navigation filtering and the time zone share one request.
6. `OfflineBanner` wraps `OfflineNotice` (whose Alert is `role="status"`) in a polite live region so the notice is
   announced when it appears; a double announcement on some screen readers is possible — check in the e2e/a11y pass.
