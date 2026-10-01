# SP2 Tasks 4–6 (+ review fixes of Tasks 1–3) — implementer report

- **Date:** 2026-09-29
- **Branch:** `feat/agentic-app-core-sp0`
- **Commits:** none created — the first `git commit` (review fix, i18n) was denied to this implementer by the
  permission classifier ("Modify Shared Resources"). All work is in the working tree, verified; the exact commit
  plan (files + messages) is in [Commit plan](#commit-plan). Nothing is staged.
- **Review:** pending

Contexts read: `docs/plans/execution-constraints.md`, `using-ddc`, plan header + Global Constraints + Tasks 4–6, SP2
spec (all), `reports/task-1-3.md`, decisions 0011–0018 (0013/0014/0015 amended here), `.design-system/DESIGN.md`,
`styles.css` and the pages componentes, formularios, navegacao, layout, empty, toasts, status, avatar, tipografia,
raios, elevacao, motion, a11y, atalhos, breakpoints; skills shadcn-ui, radix-ui, tailwind-4, atomic-design, fsd,
react-19; `architecture/atomic-design.md` ("Como o time adotou"), `stacks/frontend/shadcn-ui.md`,
`rules/accessibility.md`, `rules/internationalization.md`; TanStack Table 9.2.4 type definitions (v9 API).

## Review fixes of Tasks 1–3 (controller note)

1. **`parseMoneyInput` separators** — read from `new Intl.NumberFormat(locale).formatToParts(1234567.8)`; currency
   symbol still from the currency formatter. Tests: pt-BR + JPY `"1.234"` → 1234, `"1.234.567"` → 1234567,
   es-419 + CLP, pt-BR + KRW `"1.234,5"` → `TOO_MANY_FRACTION_DIGITS`. RED first (4 failing tests for items 1 and 3).
2. **AA contrast** — DESIGN.md untouched; `globals.css` derives text tokens: `--status-<blue|emerald|amber|cyan|violet>-foreground`,
   `--destructive-text`, `--muted-foreground-strong` (light: #075fdd, #007944, #ac4e00, #00738a, #7c46d9, #c90012,
   #6b6b6b; dark aliases pass already). Mapped to `text-<name>-foreground`, `text-destructive-text`,
   `text-muted-foreground-strong`. Raw accents restricted to non-text (decision 0014 amendment with table and rules).
   `tokens.test.ts` PAIRS extended (text tokens on background/card/muted, strong muted on muted/secondary/accent) plus
   a 14 % tint check (sRGB approximation of the `color-mix` pill tint). 72 token tests.
3. **Minors** — `loadMessages` rejects extra namespaces that shadow a core namespace (`RangeError`, decision 0015
   amended); fallback reporting: decision 0013 amended (`i18n:check` is the gate, runtime fallback stays silent);
   `wallTimeAsUtcMs` validates minutes and seconds; `negotiateLocale` canonicalizes the saved locale (`pt-br` →
   `pt-BR`); `react`, `react-dom`, `use-intl`, `@tanstack/react-query` are `peerDependencies` of `@core/client`
   (+ devDependencies for tests).
4. Found on the way: `tokens.test.ts` failed on CRLF checkouts (`core.autocrlf=true`) — reads are now normalized.
   `setup.ts` polyfilled `matchMedia` only when the key was absent (jsdom 30 declares it) and lacked
   `setPointerCapture` (unhandled error from Radix Select) — both fixed.

**For Tasks 18/20 (not done here):** verify the `#/` package `imports` under Turbopack (Next 16) and Vite 8.

## Task 4 — atoms

`src/shared/ui/atoms/<Name>/<Name>.tsx` (+ `*-variants.ts` / helpers), each with a colocated test (behaviour + axe):
Button (`pending` state, `asChild`, default `type="button"`), Input, Textarea, Label, Checkbox, Switch, RadioGroup,
Select, Avatar (sizes xs–xl, initials, hashed tone, presence as text, `decorative`), Badge (shadcn variants + `count`,
`tag`, `tag-blue`, `tag-violet` from avatar/navegacao pages), Separator, Skeleton, Spinner (translated status label),
Kbd/KbdGroup, Tooltip/TooltipProvider, Icon (allowlisted lucide names, decorative vs labelled), VisuallyHidden
(`focusable`), **Card** (added: componentes.html "cards de ação", flat, chosen heading level). Shared class lists in
`shared/ui/styles/surface-classes.ts` (floating surfaces, menu items).

- **shadcn CLI:** `pnpm dlx shadcn@4.21.0 add …` (all Task 4–6 components + `alert`, `card`) ran in a scratch copy of
  `components.json`/`globals.css`/`cn.ts`; the files were moved and rewritten into the Atomic folders with `#/…`
  imports. Running it in `packages/client` would have edited `package.json`, added the npm `cn` package and run
  `pnpm install` in the shared workspace. `cn` is not a dependency (checked). Decision 0014 "Outcome of Tasks 4–6".
- **`tw-animate-css` adopted** (1.4.0, CSS only) for the overlay enter/exit utilities; 240 ms + `--ease-surface`
  (motion.html); reduced motion collapses it.
- Extra theme values: `--radius-xs` 8 px, `--radius-2xs` 6 px, `--shadow-hover|popover|modal` (elevacao.html),
  `--ease-surface`; `cn` extends tailwind-merge with them (test).
- **Focus:** buttons/checkbox/radio/switch keep the global 2 px `--ring` outline (shadcn's `ring-ring/50` is ≈ 2.6:1
  on the dark page); text controls follow componentes.html (border → `--ring` + soft halo); menu items get an inset
  outline on keyboard focus.
- Deviations for AA (recorded in 0014): checkbox/radio outline `--muted-foreground` (the `--input` hairline is
  ≈ 1.4:1); avatar fallback = 14 % tint + text token instead of white initials on saturated gradients (≈ 2.4–3.3:1).

## Task 5 — molecules

`src/shared/ui/molecules/`: Field family (+ `FieldControl` wiring `id`, `aria-describedby`, `aria-invalid`; errors
not a live region — forms focus the first error), DropdownMenu, Popover, Dialog, AlertDialog, Sheet, Tabs
(`segmented` = formularios `.seg`, `line`), Breadcrumb (current page = `aria-current`, not a disabled pseudo-link),
Collapsible, **Command** (shadcn command pieces; molecule so the searchable selects can reuse them, `label` required
because cmdk labels its input from the root and defaults the listbox to English "Suggestions"), **Combobox** (added:
Popover + Command, substring filter ignoring accents/case — cmdk's fuzzy match found "Kolkata" in
"Kentucky/Monticello"), CurrencySelect, TimeZoneSelect (grouped by region, current offset in the label), LocaleSelect
(endonyms with `lang`, no flags), MoneyInput (locale text ↔ `{ amountMinor, currency }` on blur, currency in the
description, mono tabular), SearchField, CopyField (live region, `sensitive` mask + `aria-pressed` reveal, clipboard
failure message), StatusPill (text + dot/icon, AA text tokens), Toaster (sonner, toasts.html look, translated region
and dismiss) + `notify` (4 s success/info, 8 s warning, errors persist with close button).

**State building blocks (quality bar) — added because the plan lacked them:** `StatePanel` (shared empty.html
layout), `EmptyState`, `ErrorState` (alert, default copy, `requestId` reference, retry with pending), `NoAccessState`
(403 copy), `LoadingState` (skeleton or spinner, one polite status, `aria-busy`), `OfflineNotice` (amber status +
retry), `Alert` (info/success/warning/destructive, role by urgency). Success feedback = Toaster/`notify`.

`@core/i18n`: `listTimeZonesByRegion` now lists current IANA names (`Asia/Kolkata`, `Europe/Kyiv`, …) instead of
CLDR's legacy canonical ids (`Asia/Calcutta`); both remain valid for `TimeZoneSchema`.

Messages (`common`, all three locales): copy, search (+ results, noResults), navigation, pickers, money, errorState,
noAccess, notifications, presence.

## Task 6 — organisms and templates

- `organisms/Sidebar/` split in four files (shadcn's single file is 726 lines): `sidebar-context.tsx`
  (`SidebarProvider` with injected `persistState`, ⌘B/Ctrl+B through `useShortcut`, 260/60 px), `Sidebar.tsx`
  (Sidebar with labelled mobile sheet, SidebarTrigger with `aria-expanded`, SidebarRail out of tab order,
  SidebarInset as `div` — the template owns `main`), `sidebar-sections.tsx`, `sidebar-menu.tsx` (`aria-current`,
  40 px collapsed targets, names kept when collapsed, deterministic skeletons, count badge).
- `organisms/Command/CommandDialog.tsx` + `useCommandShortcut` (⌘K/Ctrl+K, works inside inputs).
- `atoms/Table/` (caption, `scope="col"` default, focusable labelled scroll region), `organisms/DataTable/` on
  **TanStack Table v9** (`tableFeatures`/`useTable`/`table.FlexRender`, core row model only — server-side
  sorting/filtering), caption required, numeric/headerHidden column meta, skeleton loading with `aria-busy`, empty
  slot, `ErrorState` with `requestId`/retry, `DataTablePagination` (cursor previous/next).
- `organisms/TreeView/` (WAI-ARIA tree: roving tabindex, ↑/↓/←/→/Home/End/Enter/Space, type-ahead, names exclude
  children), `organisms/ConfirmDialog/` (async pending, stays open on failure with inline alert, returns focus to the
  opener even without an AlertDialogTrigger).
- `templates/AppShellTemplate` (skip link first, sticky 56 px banner, `main#main tabIndex=-1`, 1280 px content, 360 px
  labelled `aside` or sheet when compact), `AuthTemplate` (login-03 card, 400 px), `SettingsTemplate` (labelled
  section `nav`), `AdminShellTemplate` (`data-surface="admin"`). `atoms/SkipLink` (focuses the target explicitly).
- `shared/lib/media/use-media-query.ts` (`useIsMobile`, breakpoints) and `shared/lib/shortcuts/use-shortcut.ts`
  created here (Task 8 lists `use-shortcut.ts`: it exists now; single-key shortcuts never fire in editable fields).
- New `shell` namespace (skip link, sidebar, command palette) registered in `core-catalog.ts`; `common.pagination`.

## Verification (fresh, 2026-09-29)

```
$ pnpm -F @core/client test
 Test Files  60 passed (60)
      Tests  182 passed (182)          (atoms: 20 test files; no unhandled errors)
$ pnpm -F @core/i18n test
 Test Files  9 passed (9)
      Tests  48 passed (48)
$ pnpm i18n:check
@core/i18n:i18n:check: i18n:check ok (3 namespaces, 9 catalogs)
$ pnpm -F @core/client typecheck && pnpm -F @core/client lint
$ tsc --noEmit        (exit 0)
$ eslint .            (exit 0)
$ pnpm lint
 Tasks:    11 successful, 11 total
$ pnpm typecheck
 Tasks:    11 successful, 11 total
$ git diff --quiet main -- .contexts .claude && echo framework-ok
framework-ok
```

## Commit plan

Stage only the listed paths (other agents have uncommitted work in `packages/services`, `packages/contracts`,
and hunks of their own in `pnpm-workspace.yaml`/`pnpm-lock.yaml`). Every message ends with a blank line and
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Paths are relative to `app/` unless noted.

1. `fix(i18n): read locale separators and harden negotiation inputs` — `packages/i18n/src/format/{parse-money-input,date-time}{,.test}.ts`,
   `packages/i18n/src/negotiate-locale{,.test}.ts`, `packages/i18n/src/messages/load-messages{,.test}.ts`,
   `docs/decisions/0013-i18n-money-and-time-zone.md`, `docs/decisions/0015-module-contract.md`.
2. `fix(client): add aa-safe text tokens and client peer dependencies` — `packages/client/src/shared/ui/styles/{globals.css,tokens.test.ts}`,
   `packages/client/src/shared/lib/{cn.ts,cn.test.ts}`, `packages/client/src/shared/testing/setup.ts`,
   `packages/client/package.json`, `docs/decisions/0014-ui-kit-shadcn-atomic.md`, and **only these hunks** of the
   shared files: `pnpm-workspace.yaml` catalog lines `@tanstack/react-table`, `cmdk`, `sonner`, `tw-animate-css`;
   `pnpm-lock.yaml` importer `packages/client` + packages `@tanstack/react-table`, `@tanstack/table-core`, `cmdk`,
   `sonner`, `tw-animate-css` (at report time the lockfile diff held only these; the `@ai-sdk/*`/`ai` catalog lines
   in `pnpm-workspace.yaml` belong to another agent). These files also carry the
   Task 4–6 theme values and UI dependencies (one install; hunk-splitting them would leave intermediate commits
   unbuildable).
3. `feat(client): add atom components from shadcn` — `packages/client/src/shared/ui/atoms/{Avatar,Badge,Button,Card,Checkbox,Icon,Input,Kbd,Label,RadioGroup,Select,Separator,Skeleton,Spinner,Switch,Textarea,Tooltip,VisuallyHidden}/`,
   `packages/client/src/shared/ui/styles/surface-classes.ts`, `packages/i18n/src/messages/{pt-BR,en-US,es-419}/{common,shell}.json`,
   `packages/i18n/src/messages/core-catalog.ts` (all message keys of Tasks 4–6 go here so every later commit builds).
4. `feat(client): add molecule components` — `packages/client/src/shared/ui/molecules/`,
   `packages/client/src/shared/ui/styles/modal-classes.ts`, `packages/i18n/src/catalog/{time-zones.ts,catalogs.test.ts}`.
5. `feat(client): add organisms and page templates` — `packages/client/src/shared/ui/{organisms,templates}/`,
   `packages/client/src/shared/ui/atoms/{Table,SkipLink}/`, `packages/client/src/shared/lib/{media,shortcuts}/`.
6. `docs(client): record sp2 tasks 4-6 progress and report` — (repo root) `docs/plans/2026-09-29-sp2-app-shell-ui/progress.md`,
   `docs/plans/2026-09-29-sp2-app-shell-ui/reports/task-4-6.md` (update the progress lines with the SHAs).

## Concerns

1. **No commits** (permission denied for `git commit`); see the plan above.
2. Text inputs keep the DESIGN.md `--input` hairline (≈ 1.4:1 non-text contrast); label/placeholder identify them,
   but the UX review should decide whether to darken it (would need a derived token like the text ones).
3. Light `--muted-foreground` stays #737373 for text on `background`/`card` (4.74 / 4.54 on the light sidebar) —
   compliant but tight; muted text on muted surfaces must use `text-muted-foreground-strong`.
4. jsdom has no layout: contrast, focus-ring visibility and responsive behaviour (sheet sidebar, compact right panel)
   are covered by tokens tests and must be confirmed by the e2e axe run (Tasks 22–23).
5. cmdk's active option uses `aria-selected` for the highlighted item (its design); the chosen value is announced on
   the combobox trigger, not in the list.
