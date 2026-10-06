# 0014. UI kit: shadcn (Radix, new-york) in the Atomic layout, Field forms, tokens from DESIGN.md, theme

- **Status:** accepted
- **Date:** 2026-09-29
- **Scope:** `app/packages/client/src/shared/ui`, `app/packages/client/components.json` (local decision; the framework and `.design-system/` are unchanged)
- **Refines:** SP2 spec §3; umbrella spec §6; `.contexts/engineering/stacks/frontend/shadcn-ui.md`, `tailwind@4.md`, `.contexts/engineering/architecture/atomic-design.md`

## Context

The framework standardizes shadcn/ui with Radix primitives and the `new-york` style, Tailwind 4 CSS-first tokens, `data-theme` dark mode through `next-themes`, and Atomic Design inside `shared/ui`. The visual tokens come from `.design-system/DESIGN.md` (dark-first, neutral surfaces, status accents, radius 14 px). DESIGN.md lists only part of the shadcn semantic variables, so the rest must be derived, and its light block is completed by `.design-system/styles.css`. `.design-system/` is read-only and product-specific: its product name and domain examples never enter the app.

## Decision

1. **shadcn with Radix, `new-york`.** `components.json` in `packages/client`: `style: "new-york"`, `rsc: true`, `tsx: true`, `tailwind.css: "src/shared/ui/styles/globals.css"`, `tailwind.config: ""`, `baseColor: "neutral"`, `cssVariables: true`, `iconLibrary: "lucide"`, aliases `components` → `@/shared/ui`, `ui` → `@/shared/ui/atoms` (where `add` writes before the move), `utils` → `@/shared/lib/cn`, `lib`/`hooks` → `@/shared/lib`. The CLI is pinned (`pnpm dlx shadcn@4.21.0`), never `-d`. If `init -b radix` cannot target this library package or cannot write `new-york`, the file is written by hand in this shape and the outcome is recorded below (SP2 Task 3).
2. **Atomic layout.** `shadcn add` writes into `shared/ui/atoms/`; each file then moves to its level folder (`atoms/Button/Button.tsx`, `molecules/Dialog/Dialog.tsx`, `organisms/Sidebar/Sidebar.tsx`), cva variants to `<name>-variants.ts`, imports fixed to `@/shared/lib/cn`. Components are imported by path, no barrel. Upstream changes are reviewed with `shadcn view <name>`; `add --overwrite` is not used after the move. Domain-aware components live in `features`/`widgets`, never in `shared/ui`.
3. **Forms** use shadcn's Field family (`Field`, `FieldLabel`, `FieldDescription`, `FieldError`, `FieldGroup`, `FieldSet`, `FieldLegend`) with `react-hook-form` + `@hookform/resolvers/zod`.
4. **Tokens.** `globals.css` declares raw tokens on `:root` (dark, the default) and `[data-theme="light"]`, then maps them in `@theme inline` to Tailwind's `--color-*`, radius, fonts and breakpoints. Dark mode variant: `@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *))`, matched by `next-themes` `attribute="data-theme"`.
5. **Theme:** dark-first tokens, but the user preference defaults to `system` (`next-themes` `defaultTheme="system"`, `enableSystem`); `:root` without a `data-theme` attribute renders dark, so no flash of light before hydration on dark systems. The profile offers `system | light | dark`.

### Token mapping (DESIGN.md → `globals.css`)

| DESIGN.md / styles.css | Raw variable (both themes) | Tailwind theme variable | Derivation |
|---|---|---|---|
| `--background`, `--foreground` | same name | `--color-background`, `--color-foreground` | as given |
| `--card`, `--card-foreground` | same | `--color-card`, `--color-card-foreground` | light `--card-foreground` = `--foreground` |
| `--popover` | `--popover`, `--popover-foreground` | `--color-popover(-foreground)` | light `--popover` = `#ffffff` (styles.css); foreground = `--foreground` |
| `--muted`, `--muted-foreground` | same | `--color-muted(-foreground)` | as given |
| `--secondary`, `--accent` | + `--secondary-foreground`, `--accent-foreground` | `--color-secondary(-foreground)`, `--color-accent(-foreground)` | light values `#f5f5f5` (styles.css); foregrounds = `--foreground` |
| `--primary`, `--primary-foreground` | same | `--color-primary(-foreground)` | as given |
| `--destructive` | + `--destructive-foreground` | `--color-destructive(-foreground)` | foreground chosen for ≥ 4.5 contrast: dark `#0a0a0a` on `#ff6568`, light `#ffffff` on `#e40014` |
| `--border`, `--input`, `--ring` | same | `--color-border`, `--color-input`, `--color-ring` | as given |
| `--color-blue/emerald/amber/cyan/violet` | `--status-blue/emerald/amber/cyan/violet` | `--color-blue` … `--color-violet`; `--chart-1..5` = blue, emerald, amber, cyan, violet | raw names move to `--status-*` because `--color-*` is Tailwind's theme namespace (a self-reference would be circular) |
| `--sidebar` | `--sidebar` | `--color-sidebar` | light `#fafafa` (styles.css) |
| — | `--sidebar-foreground` | `--color-sidebar-foreground` | = `--foreground` |
| `--sidebar-primary` | `--sidebar-primary`, `--sidebar-primary-foreground` | `--color-sidebar-primary(-foreground)` | `#1447e6` both themes; foreground `#ffffff` |
| — | `--sidebar-accent`, `--sidebar-accent-foreground` | `--color-sidebar-accent(-foreground)` | = `--accent`, `--foreground` |
| — | `--sidebar-border`, `--sidebar-ring` | `--color-sidebar-border`, `--color-sidebar-ring` | = `--border`, `--ring` |
| `--radius` 0.875rem, `--radius-xl` | `--radius` | `--radius-sm/md/lg/xl` | sm = radius − 4px, md = radius − 2px, lg = radius, xl = radius × 1.4 |
| typography | — | `--font-sans`, `--font-mono`; `--text-micro/tiny/label/caption/body-sm/body/title` | system stacks of DESIGN.md (no web fonts); the type scale steps between Tailwind's sizes are decision 0057 |
| spacing, motion | `--component-xs..lg`, `--layout-sm..lg`, `--duration-instant/fast/moderate/deliberate` | `--spacing`, `--ease-in-out`, `--ease-out` | as given; durations collapse to 0s under `prefers-reduced-motion: reduce` |
| breakpoints (breakpoints.html) | — | `--breakpoint-sm/md/lg/xl` | 40rem / 48rem / 64rem / 80rem (640/768/1024/1280 px) |

`tokens.test.ts` parses `globals.css` and checks that every row exists in both themes and that `foreground/background`, `muted-foreground/background`, `primary-foreground/primary` and `destructive-foreground/destructive` reach WCAG 2.2 AA contrast (≥ 4.5) in both themes.

## Outcome of SP2 Task 3 (2026-09-29)

- **`shadcn init` cannot write `new-york`.** `pnpm dlx shadcn@4.21.0 init -b radix` asks for a preset (Nova, Vega, Maia, Lyra, Mira, Luma, Sera, Rhea, Custom); `-p new-york` fails with `Invalid preset: new-york. Available presets: nova, vega, maia, lyra, mira, luma, sera, rhea`. `packages/client/components.json` is therefore written by hand in the shape of point 1. A probe in a scratch project showed that `shadcn add button` accepts the hand-written file (style `new-york`, Radix `Slot` from `radix-ui`).
- **`shadcn add` rewrites the `cn` import to the npm package `cn`.** With the new-york registry of CLI 4.21.0, `add button` wrote `import { cn } from "cn"` and added the unrelated npm dependency `cn@^0.4.0`, whatever the `utils` alias was (`@/shared/lib/cn`, `@/shared/lib/utils`, `@/lib/utils`). Every `add` (SP2 Tasks 4–6) must be followed by removing that dependency from `package.json`/lockfile and rewriting the import to `#/shared/lib/cn.ts`; the reviewer checks that `cn` never appears in `dependencies`.
- **Package-local imports use `#/…`, not `@/…`.** A `@/*` tsconfig alias inside `@core/client` resolves through the importing app's tsconfig (web and desktop both map `@/*` to their own `src`), so shared code would break in the apps' `tsc`, Next and Vite. The client declares `"imports": { "#/*": "./src/*" }` in `package.json` and imports its own files as `#/shared/lib/cn.ts` (explicit extensions, like the other packages). Node, TypeScript (bundler resolution), Vite and Next resolve package `imports` per package. `tsconfig` keeps `paths` `@/*` only so the shadcn CLI can place files; ESLint (`no-restricted-imports`) forbids `@/` imports in the client.
- The stylesheet declares `@source "../../.."` so any app that imports `@core/client/styles.css` scans the client sources; apps still add `@source` for `modules/*/src` (SP2 Task 18/20).
- `tw-animate-css` (the `animate-in`/`fade-in-0` utilities used by shadcn overlays) is not installed yet; SP2 Task 4/5 decide whether to add it or accept no enter/exit animation.

## Amendment — text-safe tokens (review of SP2 Tasks 1–3, 2026-09-29)

The light DESIGN.md values miss WCAG AA as text on some surfaces: `--muted-foreground` (#737373) on
`--muted`/`--secondary`/`--accent` (#f5f5f5) is 4.35:1, and the light status accents as text on the page or on
their 14% pill tint are 3.0–4.3:1 (amber, emerald, cyan, blue, violet, destructive). DESIGN.md stays read-only;
`globals.css` adds derived text tokens instead (same hue, darker in light; dark values alias the raw token because
they already pass):

| Raw token (non-text only: icons, dots, borders, tints) | Text token | Tailwind utility | Light value |
|---|---|---|---|
| `--status-blue/emerald/amber/cyan/violet` | `--status-<name>-foreground` | `text-<name>-foreground` | #0057d4 / #00703c / #9c4700 / #006a81 / #753dd0 |
| `--destructive` | `--destructive-text` | `text-destructive-text` | #c90012 |
| `--muted-foreground` (on `background`/`card` only) | `--muted-foreground-strong` | `text-muted-foreground-strong` | #6b6b6b |

Rules: text in a status colour (pills, inline status, error messages, destructive menu items) uses the text token;
`text-<name>` / `text-destructive` stay for icons and decorative marks (≥ 3:1 non-text contrast). Muted text placed on
`muted`, `secondary` or `accent` surfaces (tab lists, kbd, avatar fallback, secondary badges) uses
`text-muted-foreground-strong`. `tokens.test.ts` checks every text token against `background`, `card`, `muted` and
the 14% tint (sRGB approximation of the `color-mix(in oklab …)` tint) in both themes.

## Outcome of SP2 Tasks 4–6 (2026-09-29)

- **CLI in a scratch copy.** `shadcn add` (4.21.0) was run in a scratch project holding a copy of this
  `components.json`, `globals.css` and `cn.ts`, then the generated files were moved into the Atomic folders. Run in
  `packages/client` it would edit `package.json`, add the npm `cn` package and run `pnpm install` in a workspace other
  agents share. The generated `globals.css` edits (shadcn's own `--sidebar-*` HSL values) were discarded: the tokens
  above already define that family. Upstream comparison stays `shadcn view <name>`.
- **`tw-animate-css` adopted** (1.4.0, CSS only): the `animate-in`/`fade-in-0`/`zoom-in-95`/`slide-in-from-*`
  utilities of the overlays. Surfaces enter in 240 ms with `--ease-surface` (motion.html); reduced motion collapses
  them (`globals.css`).
- **Extra theme values** from the design pages: `--radius-xs` 8 px (menu items), `--radius-2xs` 6 px (kbd, small
  controls), `--shadow-hover|popover|modal` (elevacao.html: flat content, shadows only on popovers and modals),
  `--ease-surface`. `cn` teaches tailwind-merge the new shadow and radius names.
- **Focus.** Buttons, checkboxes, radios, switches and links keep the global `:focus-visible` outline (2 px `--ring`,
  offset 2 px; ≥ 3:1 in both themes) instead of shadcn's 50 % ring (≈ 2.6:1 on the dark page). Text controls follow
  componentes.html (border to `--ring` + soft halo). Menu and listbox items add an inset outline on keyboard focus.
- **Deviations from the catalogue, for AA:** checkbox and radio outlines use `--muted-foreground` (the `--input`
  hairline is ≈ 1.4:1 and is the only thing identifying the control); avatar fallbacks use the 14 % tint + text token
  instead of white initials on saturated gradients (≈ 2.4–3.3:1). Text inputs keep the `--input` hairline of the
  design system (label + placeholder identify them) — flagged for the UX review.

## Outcome of SP2 Tasks 7–8 (2026-09-30)

- **SchemaForm field-meta conventions** (`organisms/SchemaForm`, SP2 spec §3.1; SP4 `renderForm` relies on them):
  `ui.labelKey` is required on every rendered field (a missing one throws `SchemaFormDefinitionError`); the optional
  hint is `<labelKey>Hint` (shown before the control when the key exists); enum option labels are
  `<labelKey>Options.<value>`; `ui.group` is an i18n key used as the fieldset legend, and consecutive fields with the
  same group share one fieldset; `ui.order` then declaration order sorts fields. Widgets are inferred when
  `ui.widget` is absent (enum → select, boolean → switch, number → number, `{ amountMinor, currency }` → money, ISO
  datetime → datetime, ISO date → date, other strings → text); arrays and other objects are not rendered and pass
  through from `defaultValues`, like `hidden` widgets and `ui.visibleWith` fields the viewer cannot see. A declared
  widget that does not fit the type throws.
- **Validation copy.** SchemaForm validates with the contract schema through its own RHF resolver
  (`contract-resolver.ts`) instead of `@hookform/resolvers/zod`: the zod resolver surfaces the schema's English
  messages and drops the issue limits the translated copy (`common.form.errors.*`) needs. `@hookform/resolvers` is
  therefore not a dependency. Server `VALIDATION_FAILED.details[].field` maps to the top-level field (first issue per
  field); other codes, and details for fields not on screen, show a focused `alert` with `errors.<code>` and the
  request reference.
- **Dates.** A `datetime` field shows `datetime-local` in the intl provider's time zone (the display zone) and stores
  UTC ISO (`zonedWallTimeToUtc` / the new `utcToZonedWallTime` in `@core/i18n`).
- **Theme.** `next-themes` 0.4.6 with `attribute="data-theme"`, `defaultTheme="system"`, themes `light|dark`; the web
  passes the CSP nonce to its pre-paint script.

## Outcome of SP2 Tasks 22–23 (2026-09-30) — text tokens re-derived on the real tint

The Playwright axe run (WCAG 2.2 AA tags, both themes) failed `color-contrast` on avatar initials in the sidebar
switchers: 4.43–4.46:1 for amber, blue, emerald and violet in light (e.g. `#ac4e00` on `#f6e5d7`). The table above
was derived with an **sRGB average** of the 14% tint over `--background`; browsers mix `color-mix(in oklab, …)`,
which gives a darker tint, and the tint also sits on `--sidebar`/`--sidebar-accent`, not only on the page.
Changes (this amends the amendment's values and its "dark values alias the raw token" note):

- `tokens.test.ts` mixes in Oklab and checks every text token on its 14% tint over `--background`, `--card`,
  `--sidebar` and `--sidebar-accent` in both themes (AA 4.5).
- Light text tokens: blue `#0057d4`, emerald `#00703c`, amber `#9c4700`, cyan `#006a81`, violet `#753dd0` (≥ 4.8:1
  on the tint over the highlighted sidebar, ≥ 6.2:1 on white).
- Dark text tokens: blue `#5ba3ff`, amber `#f6853f`, violet `#b48cff`, `--destructive-text` `#ff7778` (the raw
  accents were 3.9–4.7:1 on the tint over `#262626`); emerald and cyan still alias their raw token.
- Raw accents (icons, dots, borders, tints) are unchanged, so DESIGN.md stays the source of every raw value.

## Consequences

- Components consume only semantic utilities (`bg-primary`, `text-muted-foreground`, `text-blue`); a theme change never edits a component.
- Status accents are information, not decoration (DESIGN.md principle): `StatusPill` pairs them with text and an icon.
- Borders use translucent white in dark mode (`#ffffff1a`); non-text contrast of focus indicators relies on `--ring`, not on borders.
- A derived app rebrands by editing `globals.css` and this table, not components.

## Alternatives rejected

- **Base UI or a new CLI preset (`nova`, `vega`, …).** The framework standardizes Radix + `new-york`; presets need an ADR.
- **`.dark` class strategy.** The framework convention is `data-theme`.
- **Copying `.design-system/styles.css`.** It is a catalog stylesheet with product examples; only token values are taken.
