# Spec — SP2 App shell and UI (web + desktop, i18n, currency, time zone, modules)

- **Status:** approved for planning (defaults chosen by the planner, recorded as app decisions 0011–0018)
- **Date:** 2026-09-29
- **Parent:** `docs/superpowers/specs/2026-09-29-agentic-app-core-design.md` (umbrella) §3, §6, §13 (SP2 gate), §16.2
- **Origin:** `docs/prompts/2026-09-29-agentic-app-core-harness.md` items 10, 11, 12, "Stack e arquitetura" (FSD +
  Atomic, web/desktop/mobile, shadcn CLI + blocks, tokens from `.design-system/`), decisions 2 and 6
- **Depends on:** SP1 (`docs/superpowers/specs/2026-09-29-sp1-identity-tenancy-rbac-design.md`) — endpoints,
  sessions, `authorize()`, endpoint descriptors
- **Plan:** `docs/plans/2026-09-29-sp2-app-shell-ui.md`

---

## 1. Scope

In scope:

1. `packages/client` (`@core/client`): the shared FSD client (views, widgets, features, entities, shared) used by
   web (Next 16) and desktop (Tauri 2 + Vite). `shared/ui` follows Atomic Design with shadcn/ui (Radix base).
2. `packages/i18n` (`@core/i18n`): message catalogs (`pt-BR` source, `en-US`, `es-419`), ICU, locale negotiation,
   `Intl` formatters for money, dates, relative time and lists, the `i18n:check` gate.
3. App shell: sidebar with organization/project switchers and unit picker, navigation from module manifests
   filtered by permission, topbar with breadcrumbs, command palette, user menu, right-panel slot (chat in SP4).
4. User area: organization picker/creation, organization and project homes, profile (account, preferences —
   language, time zone, currency, theme —, security/MFA, sessions, notifications), tenant settings (general,
   members, invitations, roles, units, API keys, devices; connectors, agents and usage as slots for SP3/SP5).
5. `/admin` surface (web only): staff+MFA guard, admin shell and navigation slots; content arrives in SP5.
6. `defineModule()` contract, client module registration, module settings store and `modules/example`.
7. Web wiring (`apps/web`: locale segment, proxy, providers, route files, CSP) and desktop wiring (`apps/desktop`:
   TanStack Router routes, secure store, desktop session).
8. Tests: component tests with axe, Playwright e2e for the SP2 gate, a native desktop smoke test.
9. Follow-ups owned by SP2: #6 (desktop CI check) and #14 (mobile notes).

Out of scope: chat UI and AI Elements (SP4; SP2 reserves the slot), `/admin` content and approval inbox (SP5),
agent/connector settings content (SP3/SP5), push notifications and App Check (follow-up #14), offline-first.

## 2. Client architecture (decision 0011)

- **Views are client components shared by both apps.** Server state lives in TanStack Query (`@tanstack/react-query`)
  fed by `/v1` with `Authorization: Bearer` (the Firebase ID token), through a typed caller built on SP1's endpoint
  descriptors. No server state in Zustand or Context (`rules/state-management.md` §3).
- **Web RSC is thin:** locale, `<html>` attributes, session guards (`requireWebSession()`,
  `requirePlatformStaffSession()` from SP1), metadata. Server Actions exist only for the web session
  (`createSession`, `exchangeSession`, `signOut`). Every product mutation goes through `/v1` (umbrella D8).
- **Client global state:** only UI preferences without server origin (command palette recents) in a small
  Zustand store with `persist`; theme through `next-themes` (both apps); URL holds organization, project, unit,
  tabs, filters and cursors.
- **Boundaries:** `@core/client` imports only `@core/contracts` and `@core/i18n` (lint, SP0). Platform specifics
  enter through ports implemented in the apps.

### 2.1 FSD layout of `packages/client/src`

```
app-shell/        FSD "app" layer: createClientApp(), providers (query, intl, theme, auth, router, modules,
                  toaster, tooltip), RouteAnnouncer, error boundary, module registry
views/            sign-in, invite, organizations, organization-home, project-home, module-page,
                  profile-{account,preferences,security,sessions,notifications},
                  settings-{general,members,invitations,roles,units,api-keys,devices,module,slot},
                  admin-home, admin-slot, not-found, forbidden
widgets/          app-sidebar, organization-switcher, project-switcher, unit-picker, user-menu,
                  command-palette, app-topbar, settings-nav, admin-sidebar, page-header
features/         auth-by-email, mfa-challenge, mfa-enrollment, change-password, sign-out,
                  switch-organization, create-organization, create-project, update-profile,
                  update-preferences, revoke-session, invite-member, accept-invitation, manage-membership,
                  edit-role, manage-units, create-api-key, revoke-api-key, create-device-activation,
                  revoke-device, update-organization, update-module-settings
entities/         session (me, access context), organization, project, unit, permission (can/Can),
                  member, role, invitation, api-key, device, module-settings
shared/
  ui/             Atomic library (§3)
  api/            http-client, call-endpoint (descriptor-typed), api-error, query-client, query-keys
  lib/            router (port), auth (port + Firebase client), secure-store (port), session-bridge (port),
                  platform (port), theme, format (hooks over @core/i18n), shortcuts, cn
  config/         ClientConfig schema (Firebase public config, API base URL, app env, MFA factors)
```

Rules: slices expose a minimal `index.ts`; same-layer slices never import each other; `shared` has no domain
words (`architecture/fsd.md`). Package exports: `@core/client/app-shell`, `@core/client/views/<slice>`,
`@core/client/shared/ui/*`, `@core/client/shared/lib/*` (subpath exports to `src/.../index.ts`).

### 2.2 Ports implemented by the apps

| Port (`shared/lib/...`) | Web adapter (`apps/web/src/client/`) | Desktop adapter (`apps/desktop/src/adapters/`) |
|---|---|---|
| `router` | next-intl `createNavigation` (locale-prefixed `Link`, `useRouter`, `usePathname`) + `useParams`/`useSearchParams` | TanStack Router (`Link`, `useNavigate`, `useLocation`, `useParams`) |
| `session-bridge` | Server Actions `createSession`/`exchangeSession`/`signOut` | `POST /v1/me/desktop-sessions`, `POST /v1/desktop-sessions/exchange`, secure store |
| `secure-store` | not used | Tauri commands backed by the `keyring` crate (decision 0017); in-memory in browser mode |
| `platform` | `{ kind: "web", apiBaseUrl: "" }` | `{ kind: "desktop", apiBaseUrl: VITE_API_URL }` |

`shared/lib/auth` owns the Firebase JS SDK (`firebase` 12.19.0) with `inMemoryPersistence` in both apps
(SP1 decision 0007) and connects to the Auth Emulator only when `appEnv === "local"` (follow-up #12c, client side).
It exposes `useAuthState()`, `signInWithEmail()` (returns `{ kind: "mfa-required", resolver }` when needed),
`resolveMfa()`, `enrollMfa()` (TOTP or SMS per `mfaFactors`), `getIdToken({ forceRefresh })`, `signOut()`.

## 3. UI library — Atomic Design over shadcn/ui (decision 0014)

- shadcn CLI pinned (`pnpm dlx shadcn@4.21.0`), base **Radix**, `components.json` in `packages/client` with
  `style: "new-york"`, `rsc: true`, `tsx: true`, `tailwind.css: "src/shared/ui/styles/globals.css"`,
  `baseColor: "neutral"`, `cssVariables: true`, `iconLibrary: "lucide"`, aliases `@/shared/ui/atoms`,
  `@/shared/lib/cn`, `@/shared/lib`. If `init` can no longer write `new-york`, the file is written by hand in the
  documented shape and the outcome is recorded in decision 0014 (research could not confirm; SP2 Task 3 checks).
- `shadcn add` drops files into `shared/ui/atoms/`; the task then moves each into its Atomic folder
  (`atoms/Button/Button.tsx`, `molecules/Dialog/Dialog.tsx`, …) and fixes imports. Upstream updates are reviewed with
  `shadcn view <name>` (doctrine allows it); `add --overwrite` is not used after the move.
- Forms use shadcn's current **Field** family (`Field`, `FieldLabel`, `FieldDescription`, `FieldError`, `FieldGroup`,
  `FieldSet`, `FieldLegend`) with `react-hook-form` + `@hookform/resolvers/zod` (accepts Zod 4).

| Level | Components |
|---|---|
| tokens | `globals.css`: DESIGN.md tokens (dark default on `:root`, light on `[data-theme="light"]`), shadcn semantic vars, `--sidebar-*` family derived from DESIGN.md, status accents (`--color-blue|emerald|amber|cyan|violet`), radius 0.875rem, durations/easings, `prefers-reduced-motion` |
| atoms | Button, Input, Textarea, Label, Checkbox, Switch, RadioGroup, Select, Avatar, Badge, Separator, Skeleton, Spinner, Kbd, Tooltip, VisuallyHidden, Icon (lucide by name) |
| molecules | Field (label + control + hint + error), MoneyInput, TimeZoneSelect, LocaleSelect, CurrencySelect, SearchField, DropdownMenu, Popover, Dialog, AlertDialog, Sheet, Tabs, Breadcrumb, Collapsible, Toaster (sonner), EmptyState, StatusPill, CopyField (secret shown once) |
| organisms | Sidebar (shadcn `sidebar`, collapsible `icon`, ⌘B), Command (cmdk; `CommandDialog`), DataTable (TanStack Table, cursor paging), SchemaForm (§3.1), TreeView (units), ConfirmDialog |
| templates | AppShellTemplate (sidebar 260/60 px, topbar 56 px, main max 1280 px, right panel 360 px slot, skip link), AuthTemplate, SettingsTemplate (section nav + content), AdminShellTemplate |

Domain-aware components (OrganizationSwitcher, LoginForm, …) live in widgets/features, never in `shared/ui`.
Sidebar block `sidebar-07` (team switcher, nav-main, nav-projects, nav-user, collapse to icons) is the reference for
the shell widgets; `login-03` for the sign-in form.

### 3.1 `SchemaForm`

`<SchemaForm contract={ContractDefinition} defaultValues onSubmit permissions />` renders a form from a Zod object
contract and its field meta (`readFieldMeta`): `ui.widget` (`text`, `textarea`, `number`, `money`, `select` for enums,
`switch` for booleans, `date`, `datetime`, `locale`, `timeZone`, `currency`, `hidden`), `ui.labelKey` (i18n),
`ui.order`, `ui.group` (fieldsets), `ui.visibleWith` (hidden unless `can(permission)`). Validation uses the same
schema via `zodResolver`; server errors (`VALIDATION_FAILED.details[].field`) map back to fields. SP4's `renderForm`
tool renders this component.

## 4. Routing (decision 0012)

One route map (`shared/lib/router/route-paths.ts`) used by both adapters; the web prefixes the locale.

| Route id | Path (web adds `/{locale}`) | View | Guard |
|---|---|---|---|
| `sign-in` | `/sign-in?next=` | sign-in | anonymous |
| `invite` | `/invite#token=` | invite | signed in (redirects to sign-in with `next`) |
| `home` | `/` | redirect to `users.lastContext` or `/organizations` | session |
| `organizations` | `/organizations` | organizations (pick/create) | session |
| `organization` | `/o/:organizationId` | organization-home (projects) | `core.organization.read` |
| `project` | `/o/:organizationId/p/:projectId?unit=` | project-home | `core.project.read` |
| `module` | `/o/:organizationId/p/:projectId/m/:moduleId/*` | module-page (client dispatch) | nav item permission |
| `settings` | `/o/:organizationId/settings/:section` | settings-* | per section |
| `settings-module` | `/o/:organizationId/settings/m/:moduleId` | settings-module | manifest permission |
| `profile` | `/profile/:section` | profile-* | session |
| `admin` | `/admin/*` (web only) | admin-home / admin-slot | staff + MFA (server) |

- **Modules never add route files:** the catch-all `module` route resolves the page from the client module registry
  (`pages: { "": ListPage, "items/:id": DetailPage }`), lazily loaded.
- The router port: `href(route)`, `navigate(route, { replace })`, `Link`, `useRouteParams()`,
  `useSearchParam(name)`, `useLocationPath()`. Views never import `next/*` or `@tanstack/*`.
- Switching organization navigates to `/o/:id`, calls `PUT /v1/me/active-organization`, forces
  `getIdToken(true)` and invalidates queries. `lastContext` is updated server-side (SP1).
- 404 for a resource the user cannot see (SP1 answers 404) renders `not-found`; 403 renders `forbidden`.

## 5. Internationalization, money and time zone (decision 0013)

- `@core/i18n`: `SUPPORTED_LOCALES = ["pt-BR", "en-US", "es-419"]`, source `pt-BR`, fallback chain
  `es-419 → pt-BR`, `en-US → pt-BR`; messages as JSON per locale and namespace (`common`, `auth`, `shell`, `profile`,
  `settings`, `admin`, `errors` keyed by API error `code`, `core` for contract `labelKey`s). Modules bring their own
  namespace (= module id) in the manifest. Types: `AppConfig` augmentation from the `pt-BR` catalog.
- **Web:** `next-intl` 4.14.8 with i18n routing, `localePrefix: "always"`, `app/[locale]/…`, locale negotiated in
  `proxy.ts` (URL → `NEXT_LOCALE` cookie mirroring the profile → `Accept-Language` → `pt-BR`), `<html lang dir>`
  from the segment, `hreflang`/canonical metadata on public pages (sign-in). `/v1` is excluded from the locale
  middleware. **Desktop:** `use-intl` `IntlProvider`, locale from the profile, then `navigator.languages`, then `pt-BR`.
  Client views import only `use-intl` hooks (the same instance `next-intl` provides).
- Changing the language: `PATCH /v1/me` (preference), cookie update, navigation to the same path in the new locale.
- **Money:** always `{ amountMinor, currency }`; `formatMoney(money, locale)` uses `Intl.NumberFormat` with
  `style: "currency"`; minor digits come from `resolvedOptions().maximumFractionDigits`; `parseMoneyInput(text,
  locale, currency)` accepts the locale's separators and returns integer `amountMinor`. Default currency for new
  amounts = `AccessContext.regional.currency` (SP1: unit → project → organization).
- **Time zone:** values travel in UTC ISO; display in `regional.displayTimeZone` (user → node → project →
  organization), browser zone only without tenant context; `use-intl` provider gets `timeZone`; date inputs convert
  local wall time in that zone to UTC before sending. Calendar rules use `nodeTimeZone` (SP5).
- `pnpm i18n:check` (CI): every locale has every key of `pt-BR`, placeholders match, ICU parses, no empty strings.

## 6. Module contract (decision 0015)

`defineModule()` in `@core/contracts` (`src/contracts/modules/define-module.ts`) validates a **data-only** manifest
(safe to import on server and client):

```ts
defineModule({
  id: "example",                       // kebab; permission prefix and route segment
  labelKey: "example.module.name",
  permissions: PermissionDefinition[], // ids must start with "example."
  unitTypes?: UnitTypeDefinition[],    // ids "example.<type>"
  navigation?: NavItem[],              // { id, slot, labelKey, icon, path, permission?, order? }
  settings?: { contract: ContractDefinition /* kind "settings" */, readPermission, updatePermission },
  messages: Record<Locale, Record<string, unknown>>,
  agents?: CapabilityRef[]; tools?: CapabilityRef[]; workflows?: CapabilityRef[]; skills?: CapabilityRef[]; // SP3 extends
});
```

- Navigation slots: `organization`, `project`, `settings`, `admin`, `user-menu`; the core's own items (and SP4's
  chat, SP5's admin pages) use the same registry, so `authorize`-filtered navigation is uniform. Items are shown
  when `can(permission)` at the current node (from `GET /v1/me/context`).
- Client side: `defineClientModule({ manifest, pages })` in `@core/client/app-shell`. Server side:
  `apps/web/src/server/modules.ts` passes manifests to `createAccessServices({ permissions })`,
  `createTenancyServices({ unitTypes, moduleSettings })`. The list of installed modules lives only in the apps
  (`apps/web/src/modules.ts`, `apps/desktop/src/modules.ts`); the core never imports a module (lint, D6).
- Module settings store (SP2 backend): `module-settings/{tenantId}_{moduleId}` (`tenantId`, `moduleId`, `values`,
  audit fields), validated by the module's settings contract; `GET|PUT
  /v1/organizations/{organizationId}/module-settings/{moduleId}` → `200` (`404` unknown module, `400`, `403`).
- `modules/example` (`@core/module-example`): permissions `example.item.read|write`, unit type `example.area`, nav
  item in the `project` slot, a page showing the resolved context, a formatted money value, a date in the display
  time zone and a permission-gated action, and settings `example.ExampleSettings` (`greeting`, `defaultBudget:
  Money`) rendered with `SchemaForm`. Module contracts join the generated catalog in SP3 (follow-up).

## 7. Surfaces

- **User area** (web and desktop): everything in §4 except `/admin`.
- **`/admin`** (web only): layout guard `requirePlatformStaffSession()` (staff doc + MFA, SP1); `AdminShellTemplate`
  with the `admin` slot: organizations, users, agents, prompts, connectors, datasets and evals, traces and logs,
  costs, flags — each an `admin-slot` empty state until SP5 registers it. Non-staff get `404` (not 403).

## 8. Profile and settings pages

| Page | Data | Actions |
|---|---|---|
| profile/account | `GET /v1/me` | edit display name (`PATCH /v1/me`) |
| profile/preferences | `GET /v1/me` | language, time zone (IANA search), currency (ISO 4217), theme (system/light/dark) |
| profile/security | `GET /v1/me` (`mfaEnrolled`), Firebase user factors | enroll/unenroll MFA (TOTP remote, SMS local), change password (re-auth) |
| profile/sessions | `GET /v1/me/sessions` | revoke one, sign out everywhere |
| profile/notifications | `GET /v1/me` | toggle `preferences.notifications.*` |
| settings/general | organization | name, default locale/time zone/currency |
| settings/members | members, memberships | change roles per node, remove member (last-owner error surfaced) |
| settings/invitations | invitations | invite (node + roles), copy link once, revoke |
| settings/roles | roles, `GET /v1/permissions` | create/edit custom role (permission picker grouped by module), delete |
| settings/units | projects, units, unit types | tree per project: create, rename, move, delete |
| settings/api-keys | api keys | create (name, scopes, node, expiry; secret shown once), revoke |
| settings/devices | devices | create activation code (shown once), revoke device |
| settings/connectors, agents, usage | — | slot empty states (SP3/SP5) |
| settings/m/:moduleId | module settings | `SchemaForm` + `PUT` |

## 9. Shell behavior

- Sidebar (organism + widget): brand, organization switcher (list, create), project switcher (visible projects,
  create when permitted), unit picker (tree popover, `?unit=`), grouped navigation per slot, user menu (profile,
  theme, language, sign out); collapses to icons at `md` (768 px) and becomes a sheet on mobile widths; state in
  shadcn's sidebar cookie (web) / local storage (desktop).
- Topbar: breadcrumbs (organization › project › unit › page), command palette trigger with `Kbd` (⌘K / Ctrl+K).
- Command palette: navigation items allowed at the node, switch organization/project, create organization/project
  (permission), toggle theme, change language, open profile, sign out; recents persisted (Zustand).
- Right-panel slot in `AppShellTemplate` (empty; SP4 mounts chat).
- States: loading skeletons, empty states, error states with `requestId`, offline banner (`navigator.onLine`).

## 10. Web app (`apps/web`)

- `src/app/[locale]/layout.tsx` (root layout per locale), `(auth)/sign-in`, `(auth)/invite`, `(app)/…` user area
  guarded by `requireWebSession()` inside `<Suspense>` (Cache Components), `admin/…` guarded by
  `requirePlatformStaffSession()`, `src/app/v1/**` route files (SP1) untouched by the locale segment.
- `src/proxy.ts`: request id and `/v1` CORS (SP0) + next-intl locale middleware for page routes + CSP.
- CSP (decision 0016): nonce-based `script-src` set in `proxy.ts` for HTML responses, `connect-src` adds
  `identitytoolkit.googleapis.com`, `securetoken.googleapis.com` and, in `local`, the Auth Emulator origin. If Next
  16.3.7 cannot combine nonces with Cache Components for these routes, the task keeps the static CSP from SP0 and
  records the justification in decision 0016 (`rules/security.md` §6 requires it).
- `src/modules.ts` lists installed modules (`[exampleModule]`); `src/server/composition.ts` (SP1) receives them.
- Tailwind 4 through `@tailwindcss/postcss`; `globals.css` imports `@core/client` styles with `@source` for
  `packages/client/src` and `modules/*/src`.

## 11. Desktop app (`apps/desktop`, decision 0017)

- TanStack Router file routes mirror §4 without locale and without `/admin`; each route file renders the shared view.
- `@tailwindcss/vite`; the same `globals.css`; `use-intl` provider.
- Session: SP1 desktop session (§3.5 there). Secret in the OS keychain through two Tauri commands
  (`secure_store_get|set|delete`) written in `src-tauri/src/secure_store.rs` with the `keyring` crate (4.2.0 measured;
  re-measure), granted by a dedicated capability. Browser mode (Vite without Tauri) uses an in-memory store so the
  same UI runs in Playwright.
- CSP `connect-src`: API origin (SP0 script) + Firebase Auth endpoints (+ emulator origin in development).
- Native smoke test: WebdriverIO with `@wdio/tauri-service` (Tauri's documented path; Playwright cannot drive the
  native shell) launches the debug build, signs in with the seeded user and asserts the user area renders.
  Local-only (`pnpm -F @core/desktop test:native`); CI runs `cargo check` in a new `desktop-check` job (#6).
- Mobile (#14, decision 0018): v1 ships no mobile target; the decision lists what a mobile build needs (Android/iOS
  targets, own thin plugins for FCM/APNs and Play Integrity/App Attest, keychain/keystore through `keyring`) and the
  shared-code guarantees SP2 keeps (touch targets ≥ 44 px on primary actions, sheet navigation on small widths).

## 12. Accessibility and quality

- WCAG 2.2 AA: landmarks (`header`, `nav` with labels, one `main`, one `h1` per page), skip link, visible focus
  (`:focus-visible` ring), 24×24 px minimum targets, reduced motion, route change announcements (Next's announcer on
  web, `RouteAnnouncer` on desktop), live regions for async status, forms with `aria-describedby`/`aria-invalid`,
  first-error focus on submit.
- Component tests (Vitest + jsdom + Testing Library) run `axe-core` on every atom/molecule/organism/template story
  fixture; e2e runs `@axe-core/playwright` (`wcag2a`, `wcag2aa`, `wcag22aa`) on every visited page.
- ESLint adds `eslint-plugin-react`, `eslint-plugin-react-hooks` and `eslint-plugin-jsx-a11y` (all accept ESLint 9, E3).

## 13. SP2 gate (umbrella §13)

Playwright (`apps/web/e2e`, emulators + seed, `WEB_PORT=3100`):

1. `auth.spec.ts`: sign in (seeded owner) → lands in the last context; sign out → protected pages redirect.
2. `shell.spec.ts`: switch organization and project from the sidebar and the command palette; unit picker updates
   `?unit=`; breadcrumbs follow; module page from `modules/example` renders; navigation hides a module item without
   permission (seeded viewer).
3. `profile.spec.ts`: edit display name, language (URL locale changes and copy switches), time zone and currency
   (example page reformats), theme (persists after reload), revoke a session.
4. `settings.spec.ts`: invite a member, copy link, accept as the invited user, change their role, create an API key
   (secret shown once), create a device activation code.
5. `admin.spec.ts`: non-staff gets 404; staff with SMS MFA (emulator) reaches `/admin`.
6. `a11y.spec.ts`: axe clean on sign-in, organization home, project home, module page, every profile and settings
   section, command palette open, admin home.
7. `desktop-web` Playwright project: the desktop frontend served by Vite runs journeys 1–3.
8. Native: `pnpm -F @core/desktop test:native` opens the Tauri app on the user area (local evidence in the report).

Plus `pnpm lint && pnpm typecheck && pnpm test && pnpm test:emulators && pnpm contracts:check && pnpm i18n:check`.

## 14. Decisions recorded by SP2 (`app/docs/decisions/`)

| # | Title |
|---|---|
| 0011 | Client data and rendering model (shared client views, TanStack Query over `/v1`, thin RSC, Server Actions only for web sessions) |
| 0012 | Routing: URL scheme, router port, locale segment on web, modules under `/m/:moduleId` |
| 0013 | i18n catalogs, locale negotiation, money and time-zone formatting |
| 0014 | UI kit: shadcn (Radix, new-york) in the Atomic layout, Field forms, tokens from DESIGN.md, theme |
| 0015 | Module contract (`defineModule`, client modules, navigation slots, module settings store) |
| 0016 | Web CSP (nonce or documented fallback) and Firebase origins |
| 0017 | Desktop: keychain secure store, desktop session, native smoke test, `desktop-check` CI |
| 0018 | Mobile targets deferred (follow-up #14) |

## 15. Hooks for SP3–SP5

- **SP3:** `CapabilityRef` fields in the manifest (agents, tools, workflows, skills) are data-only placeholders SP3
  extends additively; module contracts join the catalog; settings slots `connectors`/`agents`.
- **SP4:** right-panel slot and `project` navigation slot for chat; `SchemaForm` for `renderForm`; AI Elements
  install into `shared/ui` following decision 0014; command palette accepts contributed commands.
- **SP5:** `/admin` slots and `AdminShellTemplate`; `usage` settings slot; approval inbox uses DataTable and the
  navigation registry.

## 16. Risks and defaults chosen without asking

| Risk / question | Default |
|---|---|
| shadcn `init` may not write `new-york` anymore | write `components.json` by hand in the doctrine's shape; record in 0014 |
| TanStack Table has a v9 major; shadcn docs show v8 | adopt the measured latest (ADR 0004 policy); DataTable written against the installed API |
| next-intl + Cache Components (cookie locale is request-time) | locale in the URL segment (static per locale), session parts inside `<Suspense>` |
| Nonce CSP vs static prerender | nonce CSP; documented fallback to SP0's static CSP |
| Playwright cannot drive Tauri | web-mode Playwright project + local WebdriverIO smoke; CI does `cargo check` only |
| TOTP not emulated | UI supports TOTP and SMS; e2e uses SMS locally |
| `vaul` unmaintained | no Drawer; Sheet instead |
| Fonts from Google at build time | system font stack (DESIGN.md allows it); Geist can be added later |
