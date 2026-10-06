# SP2 — App shell and UI (web + desktop, i18n, currency, time zone, modules): implementation plan

> **For agentic workers:** Use skill `using-ddc` before coding. One implementer subagent per task (template
> `.claude/skills/writing-plans-ddc/implementer-brief.md`) plus a task reviewer (`task-reviewer-brief.md`).
> **Read `docs/plans/execution-constraints.md` first: `.contexts/` and `.claude/` are read-only.** Progress goes in
> `docs/plans/2026-09-29-sp2-app-shell-ui/progress.md`; reports in `docs/plans/2026-09-29-sp2-app-shell-ui/reports/task-<N>.md`.
> **Prerequisite:** SP1 complete (`docs/plans/2026-09-29-sp1-identity-tenancy-rbac.md`, gate report `sp1-summary.md`).

**Goal:** the shared FSD client with an Atomic shadcn library, i18n/money/time zone, the app shell with
organization/project switching, profile and tenant settings, the `/admin` surface skeleton, the module contract with
`modules/example`, wired into web (Next 16) and desktop (Tauri 2), with the SP2 gate (e2e + axe + Tauri) green.

**Architecture:** `app/packages/client` (`@core/client`, FSD; `shared/ui` Atomic), `app/packages/i18n`
(`@core/i18n`), `app/modules/example`; apps only compose and implement ports. Design:
`docs/superpowers/specs/2026-09-29-sp2-app-shell-ui-design.md` (the **SP2 spec**); SP1 spec for endpoints and sessions.

**Tech Stack:** pins already in the catalog (Node 26.10.0, pnpm 12.6.0, TS 7.0.2, ESLint 9.39.5 E3, Next 16.3.7,
React 19.3.0, Zod 4.6.5, Vitest 5.0.2, Vite 8.3.1, TanStack Router 1.170.40 / plugin 1.168.41, Tauri 2.12.0,
firebase 12.19.0). New packages, **measured 2026-09-29 (re-measure with `npm view` at install time and pin the then
latest stable in `catalog:`)**: next-intl 4.14.8, use-intl 4.14.8, tailwindcss / @tailwindcss/postcss /
@tailwindcss/vite 4.3.3, radix-ui 1.6.7, class-variance-authority 0.7.1, clsx 2.1.1, tailwind-merge 3.7.0,
lucide-react 1.49.0, cmdk 1.1.1, sonner 2.0.8, react-hook-form 7.89.0, @hookform/resolvers 5.9.1, zustand 5.0.15,
@tanstack/react-query 5.104.0, @tanstack/react-table 9.2.4, next-themes 0.4.6, @formatjs/intl-localematcher 0.9.0,
jsdom 30.1.1, @testing-library/react 16.3.3, @testing-library/dom 10.4.2, @testing-library/user-event 14.6.7,
axe-core 4.13.0, @axe-core/playwright 4.13.0, @playwright/test 1.63.0, eslint-plugin-react 7.37.5,
eslint-plugin-react-hooks 7.1.1, eslint-plugin-jsx-a11y 6.10.2, shadcn CLI 4.21.0 (via `pnpm dlx`, not a dependency),
@wdio/tauri-service 1.4.0 (+ webdriverio 9.x), Rust crate `keyring` 4.2.0.

## Global Constraints

- `docs/plans/execution-constraints.md` applies (PATH, `WEB_PORT=3100`, never kill foreign processes, git rules).
- ADR 0004 policy (latest stable; exceptions only via an app decision). pnpm 12 blocks build scripts: add
  `allowBuilds` entries with a reason only when a package really needs one.
- Architecture: `@.contexts/engineering/architecture/fsd.md`, `@.contexts/engineering/architecture/atomic-design.md`;
  import boundaries from `app/packages/config/eslint/boundaries.js` (client → contracts, i18n only; modules never
  imported by the core).
- UI: `@.contexts/engineering/stacks/frontend/shadcn-ui.md`, `radix-ui.md`, `tailwind@4.md`, `react@19.md`,
  `next@16.md`; tokens from `.design-system/DESIGN.md` (read-only; never copy the product name or domain examples
  from it into the app).
- Rules: `@.contexts/engineering/rules/accessibility.md` (WCAG 2.2 AA), `internationalization.md`,
  `state-management.md`, `performance.md`, `caching.md`, `security.md`, `testing.md`.
- **No hard-coded UI copy:** every string is an i18n key present in `pt-BR`, `en-US` and `es-419`
  (`pnpm i18n:check` gate from Task 2 on).
- Server state only in TanStack Query; product mutations only through `/v1`; Server Actions only for the web session.
- Files ≤ 500 lines, functions ≤ 50 (dense page JSX excepted), named exports (Next/Vite/config defaults commented).

## Conventions for every task

**Shell:** from `app/` after `export PATH="/c/Users/gsoar/AppData/Local/node-v26.10.0-win-x64:$PATH"`.

**Standard steps:** (1) read the task's Contexts and the SP2 spec sections named; (2) write failing tests;
(3) run — FAIL; (4) implement; (5) run — PASS, then `typecheck` + `lint` of touched packages and `pnpm i18n:check`
once it exists; (6) append `- YYYY-MM-DD | Task N complete | commits: <sha> | review: <clean|pending>` to
`docs/plans/2026-09-29-sp2-app-shell-ui/progress.md`; (7) commit only your files with the task's message + trailer
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; report to `reports/task-<N>.md`.

**Standard verify:** touched packages' `typecheck`/`lint`/`test` exit 0 and
`git diff --quiet main -- ../.contexts ../.claude && echo framework-ok` prints `framework-ok`.

**Component test rule:** every component in `shared/ui`, `widgets`, `features` and `views` has a colocated
`*.test.tsx` (Testing Library, role-first queries) that also runs `expectNoAxeViolations(container)` (Task 3 helper).

---

### Task 1: Decisions 0011–0018

**Contexts (Read first):**
- SP2 spec (all), SP1 spec §3.3–§3.5, §10
- `@.contexts/engineering/architecture/fsd.md`, `atomic-design.md`; `@.contexts/engineering/rules/state-management.md`,
  `internationalization.md`, `security.md` (§6)
- `docs/plans/2026-09-29-sp0-app-foundation/reports/sp0-summary.md` §4 (FCM/App Check), `reports/spike-tauri.md`
- `docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md` (#6, #14)

**Files:**
- Create in `app/docs/decisions/`: `0011-client-data-and-rendering-model.md`, `0012-routing-and-router-port.md`,
  `0013-i18n-money-and-time-zone.md` (includes: authenticated pages keep the locale in the URL segment as the rule's
  default; es-419/en-US fall back to pt-BR), `0014-ui-kit-shadcn-atomic.md` (token mapping table DESIGN.md → shadcn
  vars, `--sidebar-*` derivation, dark-first with `system` preference default), `0015-module-contract.md`,
  `0016-web-content-security-policy.md` (status "proposed" until Task 18 confirms nonce vs fallback),
  `0017-desktop-session-secure-store-and-testing.md`, `0018-mobile-targets-deferred.md` (follow-up #14: what mobile
  needs, own thin plugins for FCM/APNs and Play Integrity/App Attest, `keyring` coverage, what SP2 keeps portable)
- Modify: `app/README.md` (decision list), `docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md` (#14 → decision 0018)

- [ ] Steps: read → write eight MADRs → progress → commit `docs(client): record sp2 decisions`.

**Verify:** eight files exist and each has Context/Decision/Consequences/Alternatives; `framework-ok`.

### Task 2: `packages/i18n` — locales, negotiation, formatters, catalogs, `i18n:check`

**Contexts (Read first):**
- `@.contexts/engineering/rules/internationalization.md` (all), `@.contexts/engineering/contracts/api.md` (§8.1, §8.2)
- `app/packages/contracts/src/contracts/primitives/{money,locale,time-zone}.schema.ts`
- `app/docs/decisions/0013-i18n-money-and-time-zone.md`; SP2 spec §5

**Files (new package `app/packages/i18n`, `@core/i18n`, `private`, ESM, exports `.`):**
- Create `package.json` (deps: `@formatjs/intl-localematcher`, ICU parser `@formatjs/icu-messageformat-parser` —
  measure; devDeps as other packages), `tsconfig.json` (nodenext), `eslint.config.js`, `vitest.config.ts`
- Create `src/locales.ts` (`SUPPORTED_LOCALES`, `SOURCE_LOCALE = "pt-BR"`, `fallbackChain(locale)`), `src/negotiate-locale.ts`
  (`negotiateLocale({ requested: string[], saved?, fallback })`), `src/format/money.ts` (`formatMoney`,
  `currencyMinorDigits`), `src/format/parse-money-input.ts`, `src/format/date-time.ts` (`formatDateTime(iso, { locale,
  timeZone, style })`, `zonedWallTimeToUtc(local, timeZone)`), `src/format/relative-time.ts`, `src/format/list.ts`,
  `src/catalog/currencies.ts` (`Intl.supportedValuesOf("currency")`), `src/catalog/time-zones.ts`,
  `src/messages/{pt-BR,en-US,es-419}/{common,errors}.json` (errors: one key per `CORE_ERROR_CODES` entry of SP1 Task 5 —
  copy the list; the parity test lives in Task 8), `src/messages/load-messages.ts` (`loadMessages(locale, extra
  namespaces)`, deep merge + fallback chain), `src/index.ts`
- Create `scripts/check-messages.ts` + `pnpm i18n:check` (package script; root script `"i18n:check": "turbo run i18n:check"`
  and `turbo.json` task, uncached): key parity with `pt-BR`, placeholder parity, ICU parse, no empty values; also
  scans `modules/*/src/messages/**` when present
- Modify: `app/turbo.json`, `app/package.json`, `.github/workflows/app-ci.yml` (step `pnpm i18n:check` in `checks`)
- Test: `negotiate-locale.test.ts`, `money.test.ts` (BRL 12345 → "R$ 123,45" in pt-BR with NBSP-agnostic assertion,
  JPY 0 digits, KWD 3 digits, en-US "$1,234.56"), `parse-money-input.test.ts` ("1.234,56" pt-BR → 123456; "1,234.56"
  en-US; rejects two decimal separators), `date-time.test.ts` (UTC ISO shown in America/Sao_Paulo and Asia/Kolkata;
  DST boundary in America/New_York for `zonedWallTimeToUtc`), `check-messages.test.ts` (fixtures: missing key,
  placeholder mismatch, bad ICU)

**Interfaces:** Produces `@core/i18n` (formatters, negotiation, `loadMessages`, `SUPPORTED_LOCALES`), consumed by
client (Tasks 3+), apps (Tasks 18–21).

- [ ] Standard steps. Commit: `feat(i18n): add locales, formatters and message catalogs`.

**Verify:** `pnpm -F @core/i18n test` → PASS; `pnpm i18n:check` → exit 0; `pnpm lint` → exit 0 (boundaries: i18n
imports nothing internal); `framework-ok`.

### Task 3: `packages/client` scaffold — tooling, tokens, shadcn config

**Contexts (Read first):**
- `@.contexts/engineering/stacks/frontend/tailwind@4.md` (CSS-first, `@theme`), `shadcn-ui.md` (CLI,
  `components.json`, theming), skill `shadcn-ui`, skill `tailwind-4`
- `.design-system/DESIGN.md`, `.design-system/styles.css` (token values), `.design-system/tokens.html`
- `@.contexts/engineering/stacks/testing/vitest.md`; `app/docs/decisions/0014-ui-kit-shadcn-atomic.md`; SP2 spec §2.1, §3

**Files:**
- Create `app/packages/client/package.json` (`@core/client`, deps pinned via catalog: react, react-dom, radix-ui,
  class-variance-authority, clsx, tailwind-merge, lucide-react, use-intl, @core/contracts, @core/i18n, zod;
  devDeps: tailwindcss, jsdom, @testing-library/*, axe-core, vitest, typescript, eslint; `exports` subpaths per
  SP2 spec §2.1; `sideEffects: ["**/*.css"]`)
- Create `tsconfig.json` (bundler preset, `jsx: react-jsx`, `paths: { "@/*": ["./src/*"] }`), `vitest.config.ts`
  (jsdom, `setupFiles: ["./src/shared/testing/setup.ts"]`), `eslint.config.js`
- Modify `app/packages/config/eslint/index.js` — `createReactConfig()` adding `eslint-plugin-react`,
  `eslint-plugin-react-hooks` (recommended), `eslint-plugin-jsx-a11y` (recommended); catalog entries for the three
- Create `src/shared/ui/styles/globals.css` — `@import "tailwindcss"`; `@custom-variant dark ([data-theme=dark] &)`;
  `:root` = DESIGN.md dark tokens; `[data-theme="light"]` = light tokens; shadcn semantic variables (`--card-foreground`,
  `--popover-foreground`, `--secondary-foreground`, `--accent-foreground`, `--destructive-foreground`,
  `--sidebar-foreground|primary|primary-foreground|accent|accent-foreground|border|ring`) derived per decision 0014;
  `@theme inline` mapping to `--color-*`; radius, spacing, durations/easings; `@media (prefers-reduced-motion: reduce)`
- Create `components.json` — run `pnpm dlx shadcn@4.21.0 init -b radix` inside `packages/client`; if it cannot target a
  library package or cannot write `style: "new-york"`, write the file by hand exactly as SP2 spec §3 and record the
  outcome in decision 0014 (amend it)
- Create `src/shared/lib/cn.ts`, `src/shared/testing/{setup.ts, axe.ts (expectNoAxeViolations), render.tsx
  (renderWithProviders: intl + query client)}`
- Modify `app/packages/config/eslint/boundaries.test.ts` only if fixtures need a client TSX case
- Test: `cn.test.ts`, `src/shared/ui/styles/tokens.test.ts` (parses `globals.css`: every DESIGN.md token present in
  both themes; WCAG contrast ≥ 4.5 for `foreground/background`, `muted-foreground/background`,
  `primary-foreground/primary` in both themes — computed with a tiny relative-luminance helper)

**Interfaces:** Produces the client package skeleton, tokens, test helpers, `createReactConfig`.

- [ ] Standard steps. Commit: `build(client): scaffold client package with tokens and tooling`.

**Verify:** `pnpm -F @core/client test` → PASS; `pnpm -F @core/client lint && pnpm -F @core/client typecheck` → exit 0;
`pnpm lint` (all packages) → exit 0; `framework-ok`.

### Task 4: Atoms (shadcn CLI → Atomic folders)

**Contexts (Read first):**
- `@.contexts/engineering/architecture/atomic-design.md` ("Como o time adotou"), `stacks/frontend/shadcn-ui.md`,
  `stacks/frontend/radix-ui.md`, `rules/accessibility.md`; decision 0014; SP2 spec §3 (atoms row)

**Files (under `app/packages/client/src/shared/ui/atoms/`):**
- Run `pnpm dlx shadcn@4.21.0 add button input textarea label checkbox switch radio-group select avatar badge separator
  skeleton spinner kbd tooltip` from `packages/client`; move each generated file to `<Name>/<Name>.tsx` (plus
  `<name>-variants.ts` when cva is exported), rename exports only if needed, fix imports to `@/shared/lib/cn`
- Create `Icon/Icon.tsx` (lucide icon by name from an allowlisted map; `aria-hidden` unless `label` given),
  `VisuallyHidden/VisuallyHidden.tsx`
- Create `atoms/index.ts`? **No** — each component is imported by path (`@/shared/ui/atoms/Button/Button`); the
  package `exports` exposes `./shared/ui/*`
- Test: one `*.test.tsx` per atom (renders, keyboard interaction where relevant — Checkbox/Switch toggle with Space,
  Select opens with Enter — variants apply token classes, `expectNoAxeViolations`), `Icon.test.tsx` (decorative vs labelled)

- [ ] Standard steps. Commit: `feat(client): add atom components from shadcn`.

**Verify:** `pnpm -F @core/client test` → PASS (≥ 17 atom test files); `framework-ok`.

### Task 5: Molecules

**Contexts (Read first):** same as Task 4, plus `@.contexts/engineering/rules/internationalization.md`
(formularios), `.design-system/formularios.html`, `toasts.html`, `empty.html`, `status.html`; SP2 spec §3 (molecules row)

**Files (under `app/packages/client/src/shared/ui/molecules/`):**
- `pnpm dlx shadcn@4.21.0 add field dropdown-menu popover dialog alert-dialog sheet tabs breadcrumb collapsible sonner`
  then move each into `<Name>/<Name>.tsx`
- Create `Field/` (the shadcn Field family; `FieldError` wires `aria-describedby`/`aria-invalid`), `MoneyInput/`
  (text input + currency suffix; uses `parseMoneyInput`/`formatMoney` from `@core/i18n`; value `{ amountMinor,
  currency }`), `CurrencySelect/`, `TimeZoneSelect/` (searchable, grouped by region), `LocaleSelect/` (language names
  in their own language via `Intl.DisplayNames`, no flags), `SearchField/`, `EmptyState/`, `StatusPill/`
  (accent tokens only, text + icon, never color alone), `CopyField/` (read-only value, copy button, live region
  "copied", `sensitive` variant masks until revealed), `Toaster/` (sonner, `aria-live` polite)
- Add message keys (`common` namespace: copy, copied, reveal, hide, search, clear, close, no results) in all three locales
- Test: one `*.test.tsx` each (MoneyInput round-trips "1.234,56" in pt-BR to 123456; Dialog traps focus and returns
  focus to the trigger; DropdownMenu arrow-key navigation; CopyField announces; axe clean)

- [ ] Standard steps. Commit: `feat(client): add molecule components`.

**Verify:** `pnpm -F @core/client test` → PASS; `pnpm i18n:check` → exit 0; `framework-ok`.

### Task 6: Organisms and templates

**Contexts (Read first):** Task 4 contexts, plus `.design-system/layout.html`, `navegacao.html`, `breakpoints.html`,
`atalhos.html`; shadcn sidebar docs (`ui.shadcn.com/docs/components/sidebar`, block `sidebar-07`); SP2 spec §3, §9

**Files (under `app/packages/client/src/shared/ui/`):**
- `pnpm dlx shadcn@4.21.0 add sidebar command table` then move: `organisms/Sidebar/` (collapsible `icon`, ⌘B/Ctrl+B,
  state persisted through an injected `persistState` callback so web uses the cookie and desktop local storage),
  `organisms/Command/` (`CommandDialog` with ⌘K/Ctrl+K opener hook `useCommandShortcut`), `atoms/Table/`
- Create `organisms/DataTable/` (TanStack Table at the installed major; columns, empty/loading/error states, cursor
  pagination "next/previous" driven by `meta.page`, `caption` required), `organisms/TreeView/` (WAI-ARIA tree:
  arrows, Home/End, type-ahead), `organisms/ConfirmDialog/`
- Create `templates/AppShellTemplate/` (slots: `sidebar`, `topbar`, `children`, `rightPanel?`; skip link first
  focusable; `main#main` with `tabIndex=-1`; grid 260/60 px sidebar, 56 px topbar, content max 1280 px, 360 px right
  panel; breakpoints sm/md/lg/xl from DESIGN.md), `templates/AuthTemplate/`, `templates/SettingsTemplate/` (section
  nav + content, `nav` labelled), `templates/AdminShellTemplate/`
- Add `shell` namespace keys (skip link, toggle sidebar, open command palette) in all locales
- Test: sidebar collapses via shortcut and button, state callback called; command dialog opens with the shortcut and
  filters; DataTable renders caption/headers with `scope="col"` and pages with cursor callbacks; TreeView keyboard
  model; templates have exactly one `main`, the skip link moves focus to main; axe clean on all

- [ ] Standard steps. Commit: `feat(client): add organisms and page templates`.

**Verify:** `pnpm -F @core/client test` → PASS; `pnpm i18n:check` → exit 0; `framework-ok`.

### Task 7: `SchemaForm` organism

**Contexts (Read first):**
- `app/packages/contracts/src/contracts/field-meta.ts`, `primitives/catalog-meta.schema.ts` (UiMeta),
  `app/docs/decisions/0005-contract-pii-semantics.md`
- `@.contexts/engineering/rules/validation.md`, `@.contexts/engineering/rules/accessibility.md` (Formulários),
  `@.contexts/engineering/stacks/validation/zod@4.md`; SP2 spec §3.1

**Files (under `app/packages/client/src/shared/ui/organisms/SchemaForm/`):**
- Create `SchemaForm.tsx` (props: `contract`, `defaultValues`, `onSubmit(values) → Promise<Result>`, `can(permission)`,
  `submitLabelKey`), `field-plan.ts` (pure: contract → ordered, grouped `FieldPlan[]` from `readFieldMeta`,
  enum options, optional/required, hidden), `widgets.tsx` (widget → atom/molecule), `server-errors.ts` (maps
  `VALIDATION_FAILED.details[].field` to RHF errors); deps `react-hook-form`, `@hookform/resolvers` (catalog)
- Test: `field-plan.test.ts` (order, groups, `visibleWith`, hidden widgets, enums → select, booleans → switch, Money →
  MoneyInput), `SchemaForm.test.tsx` (renders `example.Note`-like fixture contract; client validation messages from
  i18n; server error mapped to field with focus moved to first error; submit disabled while pending; axe clean)

**Interfaces:** Produces `SchemaForm` (settings pages in Tasks 16–17, SP4 `renderForm`).

- [ ] Standard steps. Commit: `feat(client): add schema-driven form organism`.

**Verify:** `pnpm -F @core/client test` → PASS; `framework-ok`.

### Task 8: `shared/api` and `shared/lib` ports

**Contexts (Read first):**
- `@.contexts/engineering/rules/state-management.md` (§1–§3, §12), `rules/error-handling.md`, `rules/caching.md`
- `@.contexts/engineering/contracts/api.md` (§5, §6, §9), SP1 spec §3.3, §7.1; decisions 0011, 0012, 0017;
  SP2 spec §2.2, §4

**Files (under `app/packages/client/src/shared/`):**
- `api/http-client.ts` (`createHttpClient({ baseUrl, getIdToken, fetch })`: Bearer, `x-request-id` ULID per call,
  `AbortSignal` + 15 s timeout, 401 → one forced token refresh + retry, never retries non-idempotent calls),
  `api/call-endpoint.ts` (`callEndpoint(endpoint, { params, query, body, idempotencyKey })` typed by SP1 descriptors;
  parses the response with the descriptor schema), `api/api-error.ts` (`ApiError { status, code, details, requestId }`),
  `api/query-client.ts` (defaults: `staleTime` 30 s, no retry on 4xx), `api/query-keys.ts`
- `lib/router/{route-paths.ts (SP2 spec §4 table), router-port.ts, router-context.tsx, memory-router.tsx (tests)}`
- `lib/auth/{auth-port.ts, firebase-auth-client.ts (initializeAuth with inMemoryPersistence; emulator only when
  `config.appEnv === "local"`; `appVerificationDisabledForTesting` only in local for SMS MFA), auth-context.tsx,
  use-auth-state.ts}`
- `lib/session-bridge/session-bridge-port.ts`, `lib/secure-store/secure-store-port.ts` (+ `memory-secure-store.ts`),
  `lib/platform/platform-port.ts`, `lib/theme/{theme-provider.tsx (next-themes, `attribute="data-theme"`,
  `defaultTheme="system"`), use-theme-preference.ts}`, `lib/format/{use-format-money.ts, use-format-date-time.ts}`
  (read `AccessContext.regional` + `use-intl` locale), `lib/shortcuts/use-shortcut.ts`
- `config/client-config.schema.ts` (`ClientConfig`: `appEnv`, `apiBaseUrl`, `firebase { apiKey, authDomain, projectId }`,
  `authEmulatorUrl?`, `mfaFactors`), parsed once by the app
- Test: `http-client.test.ts` (fake fetch: Bearer header, 401 refresh once, error envelope → ApiError, timeout),
  `call-endpoint.test.ts` (path params encoded, query serialization, schema mismatch → `INVALID_RESPONSE`),
  `route-paths.test.ts` (href round trip for every route id), `firebase-auth-client.test.ts` (emulator connect only
  in local — fake SDK functions injected), `error-messages-parity.test.ts` (every `CORE_ERROR_CODES` code has an
  `errors.*` key in every locale)

**Interfaces:** Produces the ports every later client task and both apps implement/consume.

- [ ] Standard steps. Commit: `feat(client): add api client and platform ports`.

**Verify:** `pnpm -F @core/client test` → PASS; `framework-ok`.

### Task 9: Module contract and module settings backend

**Contexts (Read first):**
- `app/docs/decisions/0015-module-contract.md`; SP2 spec §6; SP1 spec §5.1, §7.1
- `@.contexts/engineering/contracts/schemas.md`, `@.contexts/engineering/architecture/hexagonal.md`,
  `@.contexts/engineering/contracts/firebase-firestore.md` (§7)

**Files:**
- Create `app/packages/contracts/src/contracts/modules/{module-manifest.schema.ts, nav-item.schema.ts,
  capability-ref.schema.ts, define-module.ts}` — `defineModule(manifest)` validates: `id` kebab and not `core`/
  `platform`; permission ids start with `<id>.`; unit type ids start with `<id>.`; nav slot enum; settings contract
  kind `settings`; message locales ⊆ supported set (string list duplicated from `@core/i18n` is not allowed —
  contracts cannot import i18n: accept any canonical BCP 47 and let `i18n:check` enforce the set)
- Create `app/packages/contracts/src/contracts/modules/module-settings.schema.ts` (+ endpoints `GET|PUT
  /v1/organizations/{organizationId}/module-settings/{moduleId}`)
- Create `app/packages/services/src/services/tenancy/{application/use-cases/get-module-settings.ts,
  update-module-settings.ts, application/ports/driven/module-settings-repository.ts,
  adapters/driven/firestore-module-settings-repository.ts, adapters/driving/module-settings-routes.ts}`; composition
  accepts `moduleSettings: ModuleSettingsDefinition[]`
- Create route file `app/apps/web/src/app/v1/organizations/[organizationId]/module-settings/[moduleId]/route.ts`
- Modify: `createCoreServer({ modules })` passes manifests' permissions, unit types and settings to access/tenancy
- Modify: `app/firestore.rules` (explicit deny for `module-settings`, covered by the Rules test list)
- Test: `define-module.test.ts` (each validation), `module-settings.emulator.test.ts` (unknown module → 404; invalid
  values → 400 with field details; member without permission → 403; PUT then GET round trip; audit entry)

**Interfaces:** Produces `defineModule`, `ModuleManifest`, `NavItem`, module settings API.

- [ ] Standard steps; `pnpm contracts:catalog`. Commit: `feat(contracts): add module contract and settings store`.

**Verify:** `pnpm -F @core/contracts test && pnpm -F @core/services test` → PASS; `EMU`
(`pnpm exec firebase emulators:exec --project demo-core --only auth,firestore "pnpm -F @core/services test:emulators"`)
→ PASS; `pnpm contracts:check` → exit 0; `framework-ok`.

### Task 10: `app-shell` — providers, module registry, navigation, session bootstrap

**Contexts (Read first):**
- `@.contexts/engineering/architecture/fsd.md` (app layer), `rules/state-management.md`, `stacks/state/zustand@5.md`,
  `rules/accessibility.md` (route announcements); decisions 0011, 0012, 0015; SP1 spec §3.3, §3.5; SP2 spec §2, §6, §9

**Files (under `app/packages/client/src/app-shell/`):**
- `create-client-app.tsx` (`<ClientApp config modules adapters>`: QueryClientProvider, IntlProvider (`use-intl`, locale +
  messages + `timeZone` from access context), ThemeProvider, AuthProvider, RouterContext, ModuleRegistryProvider,
  Toaster, TooltipProvider, error boundary with `requestId`)
- `modules/define-client-module.ts` (`defineClientModule({ manifest, pages })`, lazy pages), `modules/module-registry.ts`
  (duplicates rejected; messages merged under the module id)
- `navigation/navigation-registry.ts` (core items + module items per slot; `visibleItems(slot, can)`), `navigation/core-navigation.ts`
  (settings and profile sections, admin slots of SP2 spec §7)
- `session/session-machine.ts` (pure reducer: `booting → signed-out | exchanging → signed-in | mfa-required`),
  `session/session-provider.tsx` (on boot: `sessionBridge.resume()` → custom token → `signInWithCustomToken`; exposes
  `me`, `accessContext` queries; claims `accessVersion` mismatch → `POST /v1/me/claims/sync` + forced refresh)
- `route-announcer.tsx` (desktop; web uses Next's), `offline-banner.tsx`, `shell-ui-store.ts` (Zustand + persist:
  command palette recents only)
- Test: `session-machine.test.ts` (all transitions), `navigation-registry.test.ts` (permission filtering, order, slots),
  `module-registry.test.ts`, `create-client-app.test.tsx` (renders children with a fake adapter set; axe clean)

- [ ] Standard steps. Commit: `feat(client): add app shell providers and module registry`.

**Verify:** `pnpm -F @core/client test` → PASS; `pnpm i18n:check` → exit 0; `framework-ok`.

### Task 11: Entities

**Contexts (Read first):** `@.contexts/engineering/architecture/fsd.md` (entities), `rules/state-management.md`,
`rules/caching.md`; SP1 spec §7.3; SP2 spec §2.1

**Files (under `app/packages/client/src/entities/`), each slice `api/` (query hooks over `callEndpoint`), `model/`,
`ui/` (small presentational pieces), `index.ts`:**
- `session/` (`useMe`, `useAccessContext(node)`, `useMyOrganizations`), `permission/` (`useCan(permission)`, `<Can>`),
  `organization/` (`useOrganization`, `OrganizationAvatar`), `project/` (`useProjects`, `useProject`),
  `unit/` (`useUnits`, `useUnitTypes`, `UnitBreadcrumb`), `member/`, `role/` (`usePermissionsCatalog`), `invitation/`,
  `api-key/`, `device/`, `module-settings/`
- Query keys scoped by organization; mutations live in features and invalidate these keys
- Test: one test per slice with a fake http client (cursor pages merge, 404 → `null`, keys include organization id),
  `Can.test.tsx`

- [ ] Standard steps. Commit: `feat(client): add tenancy and identity entities`.

**Verify:** `pnpm -F @core/client test` → PASS; `framework-ok`.

### Task 12: Authentication features and entry views

**Contexts (Read first):** `@.contexts/engineering/rules/security.md` (§2), `rules/accessibility.md` (forms, focus),
shadcn block `login-03`; SP1 spec §3.3, §3.4, §6.2; SP2 spec §4, §8

**Files (under `app/packages/client/src/`):**
- `features/auth-by-email/` (email + password form, `Field` family, errors from Firebase mapped to i18n keys),
  `features/mfa-challenge/` (TOTP code or SMS code per resolver hint), `features/sign-out/`,
  `features/accept-invitation/` (reads `#token=` from `location.hash`, preview then accept, clears the hash),
  `features/create-organization/` (name + defaults prefilled from preferences/browser, `Idempotency-Key`)
- `views/sign-in/`, `views/invite/`, `views/organizations/` (list with last used first; create), `views/home/` (redirect
  to `lastContext` or `organizations`)
- Messages: `auth` namespace in all locales
- Test: component tests (MFA branch; generic credential error never reveals which field was wrong; invitation
  mismatch shows `errors.EMAIL_MISMATCH`; create organization navigates to `/o/:id`; axe clean)

- [ ] Standard steps. Commit: `feat(client): add sign-in, invitation and organization entry flows`.

**Verify:** `pnpm -F @core/client test` → PASS; `pnpm i18n:check` → exit 0; `framework-ok`.

### Task 13: Shell widgets, command palette and tenant home views

**Contexts (Read first):** shadcn block `sidebar-07` (team switcher, nav-main, nav-projects, nav-user),
`.design-system/navegacao.html`, `atalhos.html`, `avatar.html`; `rules/accessibility.md` (keyboard, landmarks);
SP2 spec §4, §9

**Files (under `app/packages/client/src/`):**
- `widgets/app-sidebar/` (composes switchers, navigation slots, user menu), `widgets/organization-switcher/`,
  `widgets/project-switcher/`, `widgets/unit-picker/` (TreeView in a Popover; `?unit=`), `widgets/user-menu/`,
  `widgets/app-topbar/` (breadcrumbs org › project › unit › page, palette trigger with `Kbd`),
  `widgets/command-palette/` (groups of SP2 spec §9; recents from the shell store), `widgets/page-header/`
- `features/switch-organization/` (navigate → `PUT /v1/me/active-organization` → forced token refresh → invalidate
  queries), `features/create-project/`
- `views/organization-home/` (projects list, create when `can`), `views/project-home/` (overview: project, units,
  module entry points), `views/module-page/` (resolves `moduleId` + rest path via the registry; unknown → not-found),
  `views/not-found/`, `views/forbidden/`
- Messages: `shell` namespace additions
- Test: switching organization calls the endpoints in order and resets project; palette lists only permitted
  navigation; unit picker writes the search param; module page renders a fake module page; axe clean on each

- [ ] Standard steps. Commit: `feat(client): add app sidebar, command palette and home views`.

**Verify:** `pnpm -F @core/client test` → PASS; `pnpm i18n:check` → exit 0; `framework-ok`.

### Task 14: Profile views

**Contexts (Read first):** `@.contexts/engineering/rules/internationalization.md` (locale selector, time zone),
`rules/security.md` (§2), `rules/accessibility.md`; SP1 spec §3.3–§3.5, §7.3 (me, sessions); SP2 spec §8

**Files (under `app/packages/client/src/`):**
- `features/update-profile/`, `features/update-preferences/` (language → `PATCH /v1/me` then router `switchLocale`
  hook from the router port; time zone; currency; theme → theme provider + `PATCH`), `features/mfa-enrollment/`
  (TOTP: QR from `generateQrCodeUrl` rendered as an `<img>` with alt text and the secret as text fallback; SMS: phone
  number + code; unenroll with confirm), `features/change-password/` (re-auth), `features/revoke-session/`
  (one / all, confirm dialog)
- `views/profile-account/`, `views/profile-preferences/`, `views/profile-security/`, `views/profile-sessions/`,
  `views/profile-notifications/`; `widgets/profile-nav/`
- Messages: `profile` namespace
- Test: preferences form sends only changed fields; theme persists through the provider; MFA enrollment branches by
  `mfaFactors`; revoke-all signs out locally; axe clean on each view

- [ ] Standard steps. Commit: `feat(client): add profile pages`.

**Verify:** `pnpm -F @core/client test` → PASS; `pnpm i18n:check` → exit 0; `framework-ok`.

### Task 15: Tenant settings — general, members, invitations, roles

**Contexts (Read first):** SP1 spec §5.3, §6.2, §7.3 (organizations, members, memberships, invitations, roles);
`rules/accessibility.md` (tables, dialogs); SP2 spec §8

**Files (under `app/packages/client/src/`):**
- `features/update-organization/` (name + defaults with Locale/TimeZone/Currency selects), `features/manage-membership/`
  (change roles per node, remove member; `LAST_OWNER`/`ESCALATION_FORBIDDEN` messages), `features/invite-member/`
  (email, node picker, roles; shows `acceptUrl` once in `CopyField`), `features/edit-role/` (permission picker grouped
  by module with `descriptionKey` labels)
- `views/settings-general/`, `views/settings-members/`, `views/settings-invitations/`, `views/settings-roles/`;
  `widgets/settings-nav/` (sections of SP2 spec §8 filtered by permission, module settings entries)
- Messages: `settings` namespace
- Test: each flow with a fake http client including error codes; tables have captions; axe clean

- [ ] Standard steps. Commit: `feat(client): add organization, member, invitation and role settings`.

**Verify:** `pnpm -F @core/client test` → PASS; `pnpm i18n:check` → exit 0; `framework-ok`.

### Task 16: Tenant settings — units, API keys, devices, module settings, slots

**Contexts (Read first):** SP1 spec §4 (units), §6.3, §6.4, §7.3; SP2 spec §6, §8

**Files (under `app/packages/client/src/`):**
- `features/manage-units/` (TreeView per project: create with type select from `useUnitTypes`, rename, move via
  "move to…" dialog (no drag-only interaction), delete with confirm; `INVALID_UNIT_PARENT`/`SUBTREE_TOO_LARGE`),
  `features/create-api-key/` (name, scopes picker limited to the actor's permissions, node, expiry ≤ 365 days;
  secret in `CopyField` shown once with warning), `features/revoke-api-key/`, `features/create-device-activation/`
  (code shown once, countdown to expiry announced politely), `features/revoke-device/`,
  `features/update-module-settings/` (`SchemaForm` + `PUT`)
- `views/settings-units/`, `views/settings-api-keys/`, `views/settings-devices/`, `views/settings-module/`,
  `views/settings-slot/` (connectors, agents, usage: `EmptyState` with slot-specific copy)
- Messages: `settings` additions
- Test: flows with fake http client; secret never re-rendered after closing the dialog; axe clean

- [ ] Standard steps. Commit: `feat(client): add unit, api key, device and module settings`.

**Verify:** `pnpm -F @core/client test` → PASS; `pnpm i18n:check` → exit 0; `framework-ok`.

### Task 17: `modules/example`

**Contexts (Read first):** decision 0015; SP2 spec §6; `app/packages/config/eslint/boundaries.js`;
`app/packages/contracts/src/contracts/example/note.schema.ts` (catalog meta style)

**Files (new package `app/modules/example`, `@core/module-example`):**
- `package.json` (exports `./manifest`, `./client`), `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`
- `src/manifest.ts` (`defineModule`: permissions `example.item.read` (read; owner, admin, member, viewer) and
  `example.item.write` (write; owner, admin), unit type `example.area` (parents: project, `example.area`), nav item
  slot `project` path `""` permission `example.item.read`, settings `example.ExampleSettings`, messages)
- `src/contracts/example-settings.schema.ts` (`greeting: string 1–80`, `defaultBudget: Money`; field `ui` meta)
- `src/client.ts` (`defineClientModule({ manifest, pages: { "": ExampleHomePage } })`), `src/ui/ExampleHomePage.tsx`
  (resolved context, `formatMoney(defaultBudget)`, now in display time zone, `<Can permission="example.item.write">`
  action showing a toast)
- `src/messages/{pt-BR,en-US,es-419}.json`
- Modify: `app/packages/config/eslint/boundaries.test.ts` (fixture: `packages/client` importing `modules/example` →
  violation; `modules/example` importing `@core/client` → allowed)
- Test: `manifest.test.ts` (valid per `defineModule`), `ExampleHomePage.test.tsx` (formats money in pt-BR and en-US;
  write action hidden for viewer; axe clean)

- [ ] Standard steps. Commit: `feat(client): add example module`.

**Verify:** `pnpm -F @core/module-example test` → PASS; `pnpm lint` → exit 0 (boundaries); `pnpm i18n:check` → exit 0;
`framework-ok`.

### Task 18: Web wiring I — locale segment, proxy, CSP, providers

**Contexts (Read first):** `@.contexts/engineering/stacks/frontend/next@16.md` (proxy, Cache Components,
typedRoutes), skill `next-16`, next-intl docs (routing with `localePrefix`, `createNavigation`, `getRequestConfig`,
`NextIntlClientProvider`), `@.contexts/engineering/rules/security.md` (§6); decisions 0012, 0013, 0016; SP2 spec §10

**Files (under `app/apps/web/`):**
- `package.json` (+ `@core/client`, `@core/i18n`, `@core/module-example`, `next-intl`, `tailwindcss`,
  `@tailwindcss/postcss`, `postcss` if required), `next.config.ts` (`createNextIntlPlugin`, `transpilePackages` +
  client/i18n/module), `postcss.config.mjs` (default export commented)
- `src/i18n/routing.ts` (`defineRouting({ locales: SUPPORTED_LOCALES, defaultLocale: "pt-BR", localePrefix: "always",
  localeCookie: { name: "NEXT_LOCALE" } })`), `src/i18n/navigation.ts` (`createNavigation(routing)`),
  `src/i18n/request.ts` (`getRequestConfig`: messages from `loadMessages(locale, installed modules)`)
- `src/http/create-proxy.ts` (+ test): page routes → next-intl middleware; `/v1` → SP0 CORS path; request id on both;
  CSP header with per-request nonce (`script-src 'self' 'nonce-…' 'strict-dynamic'`; `connect-src` + Firebase Auth
  origins + emulator in local); `src/config/security-headers.ts` (static headers minus CSP)
- `src/app/[locale]/layout.tsx` (root layout: `<html lang dir suppressHydrationWarning>`, fonts = system stack,
  `NextIntlClientProvider`, `generateStaticParams` for locales), `src/app/[locale]/globals.css` (imports client
  styles, `@source` for `packages/client/src` and `modules/*/src`), delete `src/app/layout.tsx` and
  `src/app/(app)/page.tsx` (moved under `[locale]`)
- `src/client/{web-router-adapter.tsx, web-session-bridge.ts, web-client-app.tsx ("use client"), client-config.ts
  (parses NEXT_PUBLIC_*)}`, `src/app/[locale]/(auth)/actions.ts` (`"use server"` one-line wrappers over SP1
  `session-actions` with `session-cookie-jar`)
- `src/modules.ts` (`[exampleManifest]` server side, `[exampleClientModule]` client side in `src/client/modules.ts`)
- Modify `src/web-env.schema.ts` (+ `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_MFA_FACTORS`), `app/.env.example`
- Decide nonce vs fallback: run `pnpm -F @core/web build` and a request to `/pt-BR/sign-in`; if Next refuses nonce with
  Cache Components or the page cannot render, revert to the static CSP (+ Firebase origins) and amend decision 0016
  (status accepted with the chosen variant and evidence)
- Test: `create-proxy.test.ts` (locale redirect `/` → `/pt-BR`, cookie wins over `Accept-Language`, `/v1` untouched
  by locale, CSP nonce differs per request, request id everywhere), `web-router-adapter.test.tsx` (hrefs carry locale)

- [ ] Standard steps. Commit: `feat(web): add locale routing, providers and csp`.

**Verify:** `pnpm -F @core/web test && pnpm -F @core/web build` → PASS/exit 0; `WEB_PORT=3100 pnpm -F @core/web dev`
then `curl -sI http://localhost:3100/` → `307` to `/pt-BR…`; `curl -s http://localhost:3100/v1/health` → `{"data":{"status":"ok"}}`
(stop only the process you started); `framework-ok`.

### Task 19: Web wiring II — route files, session guards, `/admin` surface

**Contexts (Read first):** skill `next-16` (thin entry points, Suspense with Cache Components), SP1 spec §3.3, §3.4
(guards); SP2 spec §4, §7, §10

**Files:**
- `app/apps/web/src/app/[locale]/(auth)/sign-in/page.tsx`, `(auth)/invite/page.tsx`, `(auth)/layout.tsx` (AuthTemplate)
- `app/apps/web/src/app/[locale]/(app)/layout.tsx` — `<Suspense fallback={<ShellSkeleton/>}>` around a server component
  that calls `requireWebSession()` (redirect to `/{locale}/sign-in?next=`) and renders `<WebClientApp>` with the shell
- Pages (one-line re-exports of views): `(app)/page.tsx` (home), `(app)/organizations/page.tsx`,
  `(app)/o/[organizationId]/page.tsx`, `(app)/o/[organizationId]/p/[projectId]/page.tsx`,
  `(app)/o/[organizationId]/p/[projectId]/m/[moduleId]/[[...path]]/page.tsx`,
  `(app)/o/[organizationId]/settings/[section]/page.tsx`, `(app)/o/[organizationId]/settings/m/[moduleId]/page.tsx`,
  `(app)/profile/[section]/page.tsx`, `not-found.tsx`
- `app/apps/web/src/app/[locale]/admin/layout.tsx` (`requirePlatformStaffSession()` → `notFound()` for non-staff),
  `admin/[[...section]]/page.tsx`
- `app/packages/client/src/views/{admin-home,admin-slot}/`, `widgets/admin-sidebar/` (+ tests, `admin` messages)
- Metadata: page titles from i18n (`generateMetadata`), `robots: noindex` for everything except sign-in
- Test: `app/apps/web/src/server/guards.test.ts` (guard wrappers map guard results to `redirect`/`notFound` using
  fakes), client tests for admin views; build succeeds with typed routes

- [ ] Standard steps. Commit: `feat(web): add app, profile, settings and admin routes`.

**Verify:** `pnpm -F @core/web build` → exit 0; with `pnpm dev` (WEB_PORT=3100) + `pnpm seed:local`, sign in manually at
`http://localhost:3100/pt-BR/sign-in` as `owner@demo.local` and reach the last context (screenshot in the report);
`framework-ok`.

### Task 20: Desktop wiring I — routes, i18n, providers, browser mode

**Contexts (Read first):** TanStack Router file-based routing docs, `app/apps/desktop/README.md`,
`docs/plans/2026-09-29-sp0-app-foundation/reports/spike-tauri.md` (CSP, capabilities), decisions 0012, 0017; SP2 spec §11

**Files (under `app/apps/desktop/`):**
- `package.json` (+ `@core/client`, `@core/i18n`, `@core/module-example`, `use-intl`, `tailwindcss`,
  `@tailwindcss/vite`), `vite.config.ts` (tailwind plugin)
- `src/routes/`: `__root.tsx` (ClientApp providers with desktop adapters), `sign-in.tsx`, `invite.tsx`, `index.tsx`,
  `organizations.tsx`, `o/$organizationId/index.tsx`, `o/$organizationId/p/$projectId/index.tsx`,
  `o/$organizationId/p/$projectId/m/$moduleId/$.tsx`, `o/$organizationId/settings/$section.tsx`,
  `o/$organizationId/settings/m/$moduleId.tsx`, `profile/$section.tsx` (each renders the shared view); delete the SP0
  health page route (keep `health-client` only if still used by a test, else remove with its tests)
- `src/adapters/{desktop-router-adapter.tsx, desktop-locale.ts (profile → `navigator.languages` → pt-BR),
  desktop-client-config.ts}`, `src/styles.css` (imports client styles + `@source`)
- `src/config/desktop-env.schema.ts` (+ `VITE_APP_ENV`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
  `VITE_FIREBASE_PROJECT_ID`, `VITE_AUTH_EMULATOR_URL` (local only), `VITE_MFA_FACTORS`), `.env.development`
- `scripts/tauri-api-config.ts` (+ test): `connect-src` adds Firebase Auth origins and, in development, the emulator
  origin; verify whether sonner/Radix need `style-src 'unsafe-inline'` in builds and record the answer in decision 0017
- Browser mode: when `window.__TAURI_INTERNALS__` is absent, the secure store is `memory-secure-store` (Task 21 adds the
  native one)
- Test: route tree test (every SP2 route id has a desktop route except admin), adapter tests, env schema tests

- [ ] Standard steps. Commit: `feat(desktop): render the shared user area with tanstack router`.

**Verify:** `pnpm -F @core/desktop test && pnpm -F @core/desktop build` (with `VITE_API_URL=http://localhost:3100`)
→ PASS/exit 0; `pnpm -F @core/desktop dev` + `pnpm dev` (WEB_PORT=3100, desktop `.env.development` pointing at 3100)
shows the sign-in page at `http://localhost:1420/sign-in`; `framework-ok`.

### Task 21: Desktop wiring II — OS keychain secure store and desktop session

**Contexts (Read first):** Tauri 2 docs (commands, capabilities/permissions), `keyring` crate docs,
`@.contexts/engineering/rules/security.md` (§1, §2); SP1 spec §3.5; decision 0017

**Files:**
- `app/apps/desktop/src-tauri/Cargo.toml` (+ `keyring = "=<measured>"` with platform-native features),
  `src-tauri/src/secure_store.rs` (commands `secure_store_get|set|delete` for service = bundle identifier,
  account = `desktop-session`; errors mapped to stable codes, never the secret), `src-tauri/src/lib.rs`
  (register commands), `src-tauri/capabilities/default.json` (+ `allow-secure-store-*` custom permissions in
  `src-tauri/permissions/secure-store.toml`)
- `app/apps/desktop/src/adapters/{tauri-secure-store.ts (invoke), desktop-session-bridge.ts (SP1 desktop session:
  create after first sign-in, exchange on boot, rotate, clear on sign-out)}`
- Rust unit test for argument validation (`cargo test` in `src-tauri`); TS tests with a fake `invoke`
- Modify `app/apps/desktop/README.md` (secure store, session, native test command)

- [ ] Standard steps (+ `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`).
- [ ] Commit: `feat(desktop): keep the desktop session in the os keychain`.

**Verify:** `pnpm -F @core/desktop test` → PASS; `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` → PASS;
`pnpm dev:desktop` (web on 3100): sign in, close the app, reopen → still signed in (exchange worked); sign out → the
keychain entry is gone (Windows Credential Manager shows no entry for the identifier); `framework-ok`.

### Task 22: Playwright e2e — infrastructure, auth, shell, a11y

**Contexts (Read first):** `@.contexts/engineering/stacks/testing/playwright.md` (setup, storage state, axe), skill
`playwright`, `@.contexts/engineering/rules/testing.md`; SP2 spec §13 items 1, 2, 6

**Files:**
- `app/apps/web/playwright.config.ts` (projects `setup`, `chromium`, `firefox`, `webkit`, `mobile-chrome`; `baseURL`
  `http://localhost:3100/pt-BR/`; `webServer`: `next start --port 3100` after build; `locale: "pt-BR"`,
  `timezoneId: "America/Sao_Paulo"`), `app/apps/web/e2e/global.setup.ts` (UI sign-in per seeded user →
  storage states in `e2e/.auth/` — gitignored; storage holds only the `__session` cookie by design),
  `e2e/fixtures/{axe.ts, emulator.ts (verification codes REST for SMS MFA), seed-users.ts}`
- `e2e/auth.spec.ts`, `e2e/shell.spec.ts`, `e2e/a11y.spec.ts` (SP2 spec §13 items 1, 2, 6; axe tags `wcag2a`, `wcag2aa`,
  `wcag22aa`)
- `app/apps/web/package.json` scripts `test:e2e` (`playwright test`), `start:e2e`; root `app/package.json`
  `test:e2e` → `firebase emulators:exec --project demo-core --only auth,firestore "node scripts/seed-local.ts && turbo run test:e2e"`
  (seed refuses non-local targets by itself); `app/.gitignore` (`e2e/.auth/`, `test-results/`, `playwright-report/`)
- Modify `.github/workflows/app-ci.yml`: job `e2e` (Java 21, `pnpm exec playwright install --with-deps`,
  `cp .env.example .env.local` with `WEB_PORT=3100` and `NEXT_PUBLIC_APP_URL=http://localhost:3100`, `pnpm test:e2e`,
  upload report on failure)

- [ ] Standard steps (the specs are the failing tests). Commit: `test(web): add e2e auth, shell and accessibility journeys`.

**Verify:** `pnpm exec playwright install chromium firefox webkit` once, then `pnpm test:e2e` → all specs PASS on
all projects; `framework-ok`.

### Task 23: Playwright e2e — profile, settings, admin, desktop frontend

**Contexts (Read first):** same as Task 22; SP2 spec §13 items 3, 4, 5, 7

**Files:**
- `app/apps/web/e2e/profile.spec.ts`, `settings.spec.ts`, `admin.spec.ts` (staff sign-in with SMS MFA code from the
  emulator REST endpoint)
- `app/apps/desktop/playwright.config.ts` + `app/apps/desktop/e2e/{global.setup.ts, desktop-journeys.spec.ts}`
  (project `desktop-web`: `vite build` with `VITE_API_URL=http://localhost:3100` + `vite preview --port 1420
  --strictPort`; journeys 1–3; web server from the web config reused), desktop `test:e2e` script (turbo picks it up)
- Test data isolation: specs that mutate (invite, API key, device code, preferences) use unique names and reset
  preferences in `afterEach` through `/v1` with the same storage state

- [ ] Standard steps. Commit: `test(web): add e2e profile, settings, admin and desktop journeys`.

**Verify:** `pnpm test:e2e` → every spec PASS (web projects + `desktop-web`); `framework-ok`.

### Task 24: Native desktop smoke, `desktop-check` CI (#6) and SP2 gate

**Contexts (Read first):** Tauri WebDriver testing docs (`@wdio/tauri-service`), `.github/workflows/app-ci.yml`,
`docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md` (#6, #14); decisions 0017, 0018; umbrella §13 (SP2 gate)

**Files:**
- `app/apps/desktop/wdio.conf.ts` + `app/apps/desktop/test-native/user-area.e2e.ts` (launch debug build, sign in as
  `owner@demo.local`, assert the sidebar with the organization switcher and `main` are visible), script
  `test:native` (local-only; not part of `pnpm test` or turbo `test:e2e`); measure `webdriverio` and
  `@wdio/tauri-service` versions and pin
- `.github/workflows/app-ci.yml` job `desktop-check` (ubuntu-24.04; apt `libwebkit2gtk-4.1-dev
  libayatana-appindicator3-dev librsvg2-dev libxdo-dev libssl-dev`; rustup toolchain from `rust-toolchain.toml`;
  cache `~/.cargo` + `src-tauri/target`; `pnpm -F @core/desktop build` with `VITE_API_URL=https://api.example.invalid`;
  `cargo check --locked --manifest-path apps/desktop/src-tauri/Cargo.toml`); third-party actions pinned by SHA like
  the existing jobs
- `app/README.md` (SP2: client package, how to create a module step by step using `modules/example`, i18n workflow,
  e2e and native tests, desktop keychain), `docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md` (#6 done; #14 →
  decision 0018; new follow-up: "module contracts in the generated catalog" → SP3)
- `docs/plans/2026-09-29-sp2-app-shell-ui/reports/sp2-summary.md` (gate evidence: each command with output summary,
  axe results, native smoke screenshot path, CI job validation status)

- [ ] Run the native smoke locally (web on 3100 + emulators + seed). If `@wdio/tauri-service` cannot drive the app on
  this machine, record the failure, attach a manual `pnpm dev:desktop` screenshot of the user area as evidence and mark
  the item `DONE_WITH_CONCERNS`.
- [ ] Validate the workflow file (`pnpm dlx @action-validator/cli@<measured> .github/workflows/app-ci.yml` or
  `actionlint` if available) and `cargo check --locked` locally; the Linux run happens on the first push (no push here).
- [ ] Full gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:emulators && pnpm contracts:check &&
  pnpm i18n:check && pnpm test:e2e`.
- [ ] Commit: `ci(desktop): add desktop check job and native smoke test`, then `docs(client): record sp2 gate`.

**Verify:** all gate commands exit 0; `pnpm -F @core/desktop test:native` → PASS (or documented concern);
`framework-ok`.

---

## Traceability

| Requirement (source) | Tasks |
|---|---|
| Prompt item 10 — i18n, multi-currency, time zone | 2, 5, 8, 14, 17, 18 |
| Prompt item 11 — `/admin` and user area as two surfaces | 13, 19 |
| Prompt item 12 — sidebar, organization/project selection, profile with settings | 13, 14, 15, 16 |
| Prompt "Arquitetura" — FSD front + Atomic UI library | 3–7, 10–16 |
| Prompt "Plataformas" — web, desktop (mobile deferred with reasons) | 18–21, 24, 1 (0018) |
| Prompt "UI" — shadcn CLI, components and blocks, tokens from `.design-system/` | 3–6, 12, 13 |
| Prompt decision 2 — web + Tauri share the FSD layer; `/admin` web only | 10, 18–21 |
| Prompt decision 6 — `defineModule()` registers permissions, navigation, settings, translations (agents/tools/workflows/skills as SP3 hooks) | 9, 10, 17 |
| Prompt "Contratos" — forms rendered from contracts | 7, 16, 17 |
| Umbrella §6 base (shadcn new-york Radix via CLI, Tailwind 4, DESIGN.md tokens) | 3–6 |
| Umbrella §6 Atomic in `shared/ui` (`SchemaForm`, `DataTable`, `AppSidebar`, templates) | 4–7, 13 |
| Umbrella §6 shell: switchers, permission-filtered navigation, command palette | 10, 13 |
| Umbrella §6 profile (data, security/MFA, sessions, language, time zone, currency, theme, notifications) | 14 |
| Umbrella §6 `/settings` (members, invitations, roles, units, connectors, agents, usage) | 15, 16 |
| Umbrella §6 router port with Next and TanStack adapters | 8, 18, 20 |
| Umbrella §6 i18n (`next-intl` web, `use-intl` desktop, ICU, pt-BR source) | 2, 18, 20 |
| Umbrella §6 money `{ amountMinor, currency }` via `Intl`; default node → project → organization | 2, 5, 8 (+ SP1 Task 10) |
| Umbrella §6 time zone: UTC storage, display chain, node zone for calendars | 2, 8 (+ SP1 Task 10) |
| Umbrella §16.2 desktop: ID token in memory, refresh credential in the OS vault via `secure-store` port | 8, 21 |
| Umbrella §13 SP2 gate: e2e login → switch → profile; axe clean; Tauri opens the user area | 22, 23, 24 |
| Umbrella §3 `modules/example` proves the contract; core never imports a module | 9, 17 |
| Follow-up #6 desktop CI check | 24 |
| Follow-up #14 mobile notes | 1 (0018), 24 |
| SP3/SP4/SP5 hooks (capability refs, right panel, nav slots, SchemaForm, admin slots) | 9, 6, 10, 7, 19 |

## Self-review

- Every SP2 spec section maps to a task; every umbrella §6 bullet and the SP2 gate are covered.
- Versions: catalog pins reused; new packages list their 2026-09-29 measurement and must be re-measured at install.
- Every task names real Contexts (checked 2026-09-29) and ends with `framework-ok`.
- Known uncertainties have an explicit fallback inside the task (shadcn `new-york` in Task 3, CSP nonce in Task 18,
  CSP styles in Task 20, native smoke in Task 24).
- Order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12–17 (12–16 in order; 17 after 10) → 18 → 19 → 20 → 21 →
  22 → 23 → 24. Tasks 20–21 may run in parallel with 19 once 18 is done.
