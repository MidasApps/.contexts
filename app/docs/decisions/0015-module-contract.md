# 0015. Module contract: `defineModule`, client modules, navigation slots, module settings store

- **Status:** accepted
- **Date:** 2026-09-29
- **Scope:** `app/packages/contracts/src/contracts/modules`, `app/packages/client/src/app-shell/modules`, `app/packages/services` (tenancy), `app/modules/*`, the apps' module lists (local decision; the framework is unchanged)
- **Refines:** SP2 spec §6; umbrella spec §3 and D6 (the core never imports a module)

## Context

A derived application adds its business capabilities as modules under `app/modules/`. A module must contribute permissions, unit types, navigation, settings, translations and pages (and, from SP3, agents, tools, workflows and skills) without editing the core, and the same manifest must be safe to import on the server (access and tenancy services) and on the client (navigation, pages). The core must not know which modules exist: the list lives only in the apps.

## Decision

1. **Data-only manifest** validated by `defineModule(manifest)` in `@core/contracts` (`src/contracts/modules/define-module.ts`), safe for server and client:
   `id` (kebab-case, not `core` or `platform`; it is the permission prefix, the message namespace and the route segment), `labelKey`, `permissions` (ids start with `<id>.`), `unitTypes?` (ids `<id>.<type>`), `navigation?` (`{ id, slot, labelKey, icon, path, permission?, order? }`), `settings?` (`{ contract /* kind "settings" */, readPermission, updatePermission }`), `messages` (per locale; any canonical BCP 47 tag, the supported set is enforced by `i18n:check` because `@core/contracts` cannot import `@core/i18n`), and `agents?`, `tools?`, `workflows?`, `skills?` as `CapabilityRef[]` placeholders SP3 extends additively.
2. **Navigation slots:** `organization`, `project`, `settings`, `admin`, `user-menu`. Core items, SP4 chat and SP5 admin pages use the same registry, so every item is filtered the same way: shown when `can(permission)` at the current node (`GET /v1/me/context`).
3. **Client side:** `defineClientModule({ manifest, pages })` in `@core/client/app-shell`; pages are keyed by the rest path after `/m/:moduleId/` and lazily loaded (decision 0012). The registry rejects duplicate module ids and merges messages under the module id.
4. **Server side:** `apps/web/src/server/modules.ts` passes manifests to `createAccessServices({ permissions })` and `createTenancyServices({ unitTypes, moduleSettings })` (SP1 composition).
5. **Installed modules** are listed only in `apps/web/src/modules.ts` and `apps/desktop/src/modules.ts`. `eslint-plugin-boundaries` forbids any core package from importing `modules/*`; a module may import `@core/client`, `@core/contracts`, `@core/i18n` and service use cases.
6. **Module settings store:** Firestore `module-settings/{tenantId}_{moduleId}` (`tenantId`, `moduleId`, `values`, audit fields; automatic-id rule does not apply because the id is a deterministic composite key for a singleton per tenant and module), validated by the module's settings contract on write. API: `GET|PUT /v1/organizations/{organizationId}/module-settings/{moduleId}` → `200`; `404` unknown module, `400` invalid values with field details, `403` without the manifest permission. Security Rules deny direct client access.
7. **Reference module:** `modules/example` (`@core/module-example`) exercises every field and is the template for new modules.

## Consequences

- Installing a module = add the package, list it in both apps' `modules.ts`, run `pnpm i18n:check`; no route files, no core edits.
- Permission ids are namespaced by construction, so modules cannot grant core permissions.
- **Amended 2026-09-29 (SP2 Task 1–3 review):** a module id cannot equal a core message namespace (`common`, `errors`, and every namespace `@core/i18n` adds later: `shell`, `auth`, `profile`, `settings`, `admin`, `core`). `loadMessages` rejects such a namespace with a `RangeError`; Task 9's `defineModule` adds the same list to its id validation.
- Module contracts join the generated data catalog only in SP3 (follow-up). *Superseded by the Task 17 outcome below: they join it in SP2.*
- The deterministic settings doc id is an exception to ADR 0005 (automatic ids) justified by the singleton shape; it holds no user-chosen text.
- **Outcome of SP2 Tasks 9–10 (2026-09-30).**
  - `defineModule` (`@core/contracts`) checks the shape with `ModuleManifestSchema`, then: reserved ids (`RESERVED_MODULE_IDS` = `core`, `platform` and the core message namespaces; a client test keeps the list in parity with `CORE_MESSAGES`), permission and unit type ids prefixed by `<id>.`, duplicates, navigation permissions declared by the module or in `CORE_PERMISSIONS`, settings contract of `kind: "settings"` over an object schema with read/update permissions declared by the module, every referenced message key (`labelKey`, permission `descriptionKey`, unit type and navigation labels) inside the module namespace and present in every declared locale, and `CapabilityRef` ids prefixed by `<id>-` or `<id>.`. It throws `ModuleDefinitionError` (`INVALID_MODULE`) listing every problem.
  - Module settings endpoints are core endpoints of a new `modules` context: `modules.getModuleSettings` / `modules.updateModuleSettings`. The `PUT` body is the values object itself (so `VALIDATION_FAILED.details[].field` names the settings field, as `SchemaForm` expects); the response is `modules.ModuleSettings` (`values`, `updatedAt`, `updatedBy` are `null` until the first save; `updatedBy` is the actor id: uid, device id or API key id). Order: unknown module → 404, `authorize()` at the organization (hidden organization → 404, missing permission → 403), module contract → 400, then the record and a `MODULE_SETTINGS_UPDATED` audit entry (changed field names only) in one transaction.
  - The server side lives in its own context `packages/services/src/services/modules/` (not `tenancy`, which SP1 Task 10 builds in parallel). `createCoreServer({ modules })` accepts `permissions`, `unitTypes` and `settings` per module, serves the settings routes and exposes `moduleUnitTypes` for `createTenancyServices({ unitTypes })` (SP1 Task 10 wires it). Firestore Rules deny `module-settings` explicitly.
  - Client: `defineClientModule` rejects malformed page keys, icons outside the client registry, a `project` item without a page, and module items in the `organization` or `user-menu` slots (no module route exists there); `settings` items lead to `/settings/m/:moduleId`, `admin` items to `/admin/<moduleId>/<path>`. Each module with settings also gets a `settings` slot entry gated by its `readPermission`. Registry shapes and consumer hooks (`useModuleRegistry`, `useNavigationRegistry`, `useShellSlots`, `useShellUi`, `useSession`) live in `shared/lib/{shell,session}` so FSD layers below `app-shell` can read what the app shell builds.

- **Outcome of SP2 Task 17 (2026-09-30).**
  - `modules/example` (`@core/module-example`) exports `./manifest` (data only), `./contracts` (`EXAMPLE_CONTRACTS`, Node-loadable) and `./client` (`exampleClientModule`). Settings contract `example.ExampleSettings` (`greeting` 1–80, `defaultBudget: Money`, field `ui` meta); the form's money currency defaults to `AccessContext.regional.currency`.
  - **Module contracts join the generated catalog now** (moved up from SP3; SP3 Task 19's `app/catalog.modules.ts` design): the workspace composition file `app/catalog.modules.ts` exports `CATALOG_MODULES = [{ moduleId, contracts }]`; `contracts:catalog`/`contracts:check` load it by path (`scripts/catalog/module-contracts.ts`), reject contract ids outside `<moduleId>.` and pass them to `composeCoreContracts(extra)`. No `@core/contracts` source imports a module. The root `package.json` depends on each listed module so the file resolves its package exports.
  - Capability refs: `EXAMPLE_CAPABILITIES` keeps `agents`/`tools`/`workflows`/`skills` typed and **empty**; SP3 adds each ref together with its `defineAgentModule()` implementation (a ref without one is a boot error, decision 0019).
  - Web composition: `apps/web/src/modules.ts` (`INSTALLED_MODULES`, manifests) feeds `src/server/modules.ts`; Task 18 derives the client module list from the same file. Desktop gets its list in Task 20.
  - Module-facing client API: `@core/client` exports `./entities/*`, `./widgets/*`, `./shared/ui/notify`, and the test harness `./testing` (`renderApp`, `shellRoutes`, fake `/v1`, fixtures, axe) plus `./testing/setup`, so module pages are tested inside the real composition.

## Alternatives rejected

- **Modules register themselves through side-effect imports.** Hidden global state and import-order bugs (`rules/ai-friendly-code`).
- **Manifest with React components.** Would make the manifest client-only; pages live in `defineClientModule` instead.
- **Settings as a generic JSON blob without contract.** Unvalidated input; no form rendering from the schema.
