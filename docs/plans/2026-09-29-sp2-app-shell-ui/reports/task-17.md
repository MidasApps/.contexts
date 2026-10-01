# SP2 Task 17 — `modules/example` — implementer report

- **Date:** 2026-09-30
- **Branch:** `feat/agentic-app-core-sp0`
- **Commits:** none. `git commit` for SP2 needs the user's permission (see `task-4-6.md`). Everything is in the
  working tree, verified and unstaged, on top of the uncommitted Tasks 4–16 work. Plan: [Commit plan](#commit-plan).
- **Review:** pending

Contexts read: `docs/plans/execution-constraints.md`, `using-ddc`, plan header + Global Constraints + Tasks 9, 10, 16,
17, SP2 spec §5, §6, §15, umbrella D6, reports `task-9-10.md` and `task-14-16.md`, decisions 0015 and 0019, SP3 plan
Task 19 (catalog design), `boundaries.js` + test, `note.schema.ts`, `defineModule` and its schemas, `defineClientModule`,
module registry types, `ModulePageView`, `SettingsModuleView`/`ModuleSettingsForm`/`SchemaForm` (money widget),
`entities/{session,permission,module-settings}`, `widgets/page-state`, test harness, `i18n:check` module reader,
catalog build/check scripts.

## What was built

**Package `app/modules/example` (`@core/module-example`)** — exports `./manifest`, `./contracts`, `./client`.

- `src/manifest.ts` — `defineModule`: permissions `example.item.read` (read; owner, admin, member, viewer) and
  `example.item.write` (write; owner, admin); unit type `example.area` (parents `project`, `example.area`); nav item
  `home` in the `project` slot, path `""`, icon `puzzle`, permission `example.item.read`; settings
  `example.ExampleSettings` (read = `example.item.read`, update = `example.item.write`); messages in 3 locales
  (JSON import attributes, Node-loadable); capability lists from `capabilities.ts`.
- `src/contracts/example-settings.schema.ts` — `greeting: string 1–80`, `defaultBudget: Money`, field meta
  (`description`, `pii`, `ui.widget/labelKey/order`, `examples`), `kind: "settings"`, `permission: example.item.read`.
  `src/contracts/index.ts` — `EXAMPLE_CONTRACTS`.
- `src/capabilities.ts` — `EXAMPLE_CAPABILITIES: Readonly<Record<CapabilityKind, CapabilityRef[]>>`, all four lists
  empty on purpose: SP3 adds each ref with its `defineAgentModule()` implementation (a ref without one is a boot error,
  decision 0019), so no fake capability is declared.
- `src/client.ts` — `exampleClientModule = defineClientModule({ manifest, pages: { "": lazy ExampleHomePage } })`.
- `src/ui/ExampleHomePage.tsx` + `ExampleSections.tsx` — page at `/o/:org/p/:project/m/example`: `QueryPage` over the
  access context (skeleton / not-found / forbidden / error+retry), `PageHeader`, context card (organization, project,
  unit or "none", locale, display time zone, currency, "now" formatted in the display time zone with an injectable
  clock), settings card over `GET …/module-settings/example` (skeleton, error+retry, no-access on 403, `EmptyState`
  with a "Set up" link to `/o/:org/settings/m/example` for editors or an "ask an admin" note for viewers, else the
  greeting and `formatMoney(defaultBudget)`), and a `<Can permission="example.item.write">` action (disabled offline)
  whose toast says honestly that nothing was saved (the module has no item store).
- `src/messages/{pt-BR,en-US,es-419}.json` — module namespace `example`.
- Tooling: `package.json`, `tsconfig.json` (bundler preset, `.ts` extensions), `eslint.config.js` (React config),
  `vitest.config.ts` (jsdom, `src/testing/setup.ts` → `@core/client/testing/setup`).

**Module contracts in the catalog** (SP3 Task 19's planned design, moved up): `app/catalog.modules.ts` (workspace
composition, `CATALOG_MODULES = [{ moduleId: "example", contracts: EXAMPLE_CONTRACTS }]`);
`packages/contracts/scripts/catalog/module-contracts.ts` (`loadModuleContracts`: loads the file by path, structural
contract check, ids must start with `<moduleId>.`, `ModuleCatalogError`); `build-catalog.ts`/`check-catalog.ts` pass
the result to `composeCoreContracts(extra)`. No `@core/contracts` source imports a module. Root `package.json`
devDependency `@core/module-example` so the composition file resolves the package export. Catalog regenerated:
`docs/catalog/example/ExampleSettings.{md,schema.json}` + `catalog.json`, `catalog.ai.json`, `openapi/v1.yaml`.

**Apps reference modules only through composition files:** `apps/web/src/modules.ts` (`INSTALLED_MODULES =
[exampleManifest]`) → `apps/web/src/server/modules.ts` (`serverModules`), so the web server now registers the example
permissions, unit type and settings. `apps/web/package.json` depends on `@core/module-example`. Task 18 derives the
client module list from the same file; desktop (Task 20) gets its own list.

**`@core/client` module-facing API** (`package.json` exports): `./entities/*`, `./widgets/*`, `./shared/ui/notify`,
`./testing` (new `src/app-shell/testing/index.ts`: `renderApp`, `TEST_CONFIG`, `shellRoutes`, `MEMBER_PERMISSIONS`,
fake `/v1` helpers, fixtures, `expectNoAxeViolations`), `./testing/setup`.

**Boundaries test:** fixtures `packages/client/src/imports-module.ts` (client → module: violation) and
`modules/example/src/imports-client.ts` (module → client: allowed), two new cases.

**Decision 0015** amended ("Outcome of SP2 Task 17"; the "catalog only in SP3" consequence marked superseded).

## TDD

- `module-contracts.test.ts` (4 cases) — RED (module missing), then green.
- `manifest.test.ts` (7), `ui/ExampleHomePage.test.tsx` (9: pt-BR context + `R$ 1.234,56` + "now" at 12:00 in
  São Paulo + axe; en-US `R$1,234.56`; editor action + toast; hidden for viewer; empty state with settings link + axe;
  viewer empty note; 404 → error with retry; 403 → no-access in the card; forbidden page without the read permission),
  `example-settings.test.tsx` (1: `SettingsModuleView` renders `ExampleSettings` with SchemaForm, money currency
  defaults to the regional currency — USD in the fixture — axe clean, PUT body `{ greeting, defaultBudget: {
  amountMinor: 150050, currency: "USD" } }`) — RED (files missing), then green. One test changed after the first run:
  a 500 is retried 3× by the query client, so the error case uses a 404 (server without the module).
- Boundaries cases passed on first run (the policy already existed; they are regression guards).

## Verification (fresh, 2026-09-30)

```
$ pnpm -F @core/module-example test    Test Files 3 passed (3) · Tests 17 passed (17)
$ pnpm -F @core/contracts test         Test Files 28 passed (28) · Tests 293 passed (293)
$ pnpm -F @core/client test            Test Files 150 passed (150) · Tests 473 passed (473)
$ pnpm -F @core/i18n test              Test Files 9 passed (9) · Tests 51 passed (51)
$ pnpm -F @core/config test            Test Files 1 passed (1) · Tests 4 passed (4)
$ pnpm -F @core/web test               Test Files 4 passed (4) · Tests 28 passed (28)
$ pnpm -F @core/services test          Test Files 70 passed (70) · Tests 534 passed (534)
$ pnpm -F @core/agents test            Test Files 22 passed (22) · Tests 187 passed (187)   (AI catalog now lists example.ExampleSettings)
$ pnpm typecheck --continue            Tasks: 12 successful, 12 total
$ pnpm lint --continue                 Tasks: 12 successful, 12 total   (boundaries included)
$ pnpm contracts:check                 contracts:check ok (77 contracts, 66 endpoints, 157 files)
$ pnpm i18n:check                      i18n:check ok (8 namespaces, 24 catalogs)
$ node (from apps/web) import('@core/module-example/manifest')   → example 2 [pt-BR, en-US, es-419]
$ git diff --quiet main -- .contexts .claude && echo framework-ok
framework-ok
```

Not run: `next build` of web (SP1 is editing `apps/web` concurrently; the manifest's JSON import attributes are the
same pattern SP3 bundles for Mastra).

## Commit plan

Apply **after** the plans in `task-4-6.md` … `task-14-16.md`. Stage only these paths/hunks (relative to `app/` unless
noted); every message ends with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

1. `feat(client): add example module`
   - `modules/example/` (all files except `node_modules/`, `.tscache/`, `.turbo/`, which are ignored)
   - `catalog.modules.ts`; `package.json` (root) — the `"@core/module-example": "workspace:*"` devDependency line
   - `packages/contracts/scripts/catalog/module-contracts.ts`, `module-contracts.test.ts`,
     `packages/contracts/scripts/catalog/fixtures/` (3 dirs); `packages/contracts/scripts/{build-catalog.ts,check-catalog.ts}`
     (import line + the `loadModuleContracts()` line with its comment)
   - generated: `docs/catalog/example/ExampleSettings.{md,schema.json}` and the `example.ExampleSettings` parts of
     `docs/catalog/{catalog.json,catalog.ai.json}` and `docs/openapi/v1.yaml` — these files also carry SP2 Task 9 and
     SP3 changes: regenerate with `pnpm contracts:catalog` from the staged tree (or commit them with whichever commit
     lands last) and confirm `pnpm contracts:check`
   - `packages/client/package.json` — only the export lines `./widgets/*`, `./entities/*`, `./shared/ui/notify`,
     `./testing`, `./testing/setup`; `packages/client/src/app-shell/testing/index.ts` (the rest of
     `app-shell/testing/` belongs to `task-9-10.md` commit 2)
   - `apps/web/src/modules.ts`, `apps/web/src/server/modules.ts` (whole file; Task 9's comment is replaced),
     `apps/web/package.json` — the `@core/module-example` dependency line
   - `packages/config/eslint/boundaries.test.ts` (two cases), `packages/config/eslint/fixtures/modules/example/src/
     {example-label.ts,imports-client.ts}`, `packages/config/eslint/fixtures/packages/client/src/imports-module.ts`
   - `pnpm-lock.yaml` — only these importer hunks: `importers['.'].devDependencies['@core/module-example']`
     (`link:modules/example`), `importers['apps/web'].dependencies['@core/module-example']`
     (`link:../../modules/example`), and the new `importers['modules/example']` block. No `packages:`/`snapshots:`
     entries are mine (every resolved version already existed); the `@google-cloud/bigquery`, `@mastra/memory`,
     `@mastra/otel-exporter`, `@opentelemetry/exporter-trace-otlp-proto` hunks that the same install wrote belong to SP3
   - `docs/decisions/0015-module-contract.md` — the "Outcome of SP2 Task 17" bullet and the "*Superseded…*" suffix
2. `docs(client): record sp2 task 17 progress and report` — (repo root)
   `docs/plans/2026-09-29-sp2-app-shell-ui/progress.md` (the Task 17 line; update with the SHA),
   `docs/plans/2026-09-29-sp2-app-shell-ui/reports/task-17.md`.

## Concerns

1. **No commits** (permission); see the plan. Generated catalog files and `pnpm-lock.yaml` are shared with SP3.
2. **Catalog scope moved up from SP3:** SP3 Task 19 should add its command contracts to `EXAMPLE_CONTRACTS` (they
   reach the catalog through `app/catalog.modules.ts` already) instead of building the list again.
3. **Web server now registers the example module** (`serverModules` is no longer empty): `GET /v1/permissions` lists
   `example.item.*`, the `example.area` unit type exists, and `…/module-settings/example` answers.
4. **Peer warnings:** `apps/web` depends on `@core/module-example`, whose peers (`use-intl`, `@tanstack/react-query`)
   web does not install until Task 18 adds `@core/client`; web imports only `./manifest` (no React), so nothing breaks.
5. **Sonner toasts persist between tests in a file** (global toaster state); harmless here, but a test asserting the
   absence of a toast text should `notify.dismiss()` first.
6. **Desktop list** (`apps/desktop/src/modules.ts`) is Task 20's; Task 18 builds the web client list from
   `INSTALLED_MODULES` (`exampleClientModule`).
