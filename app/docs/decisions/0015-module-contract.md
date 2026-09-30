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
- Module contracts join the generated data catalog only in SP3 (follow-up).
- The deterministic settings doc id is an exception to ADR 0005 (automatic ids) justified by the singleton shape; it holds no user-chosen text.

## Alternatives rejected

- **Modules register themselves through side-effect imports.** Hidden global state and import-order bugs (`rules/ai-friendly-code`).
- **Manifest with React components.** Would make the manifest client-only; pages live in `defineClientModule` instead.
- **Settings as a generic JSON blob without contract.** Unvalidated input; no form rendering from the schema.
