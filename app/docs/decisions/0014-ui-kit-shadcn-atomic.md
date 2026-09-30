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
| typography | — | `--font-sans`, `--font-mono` | system stacks of DESIGN.md (no web fonts) |
| spacing, motion | `--component-xs..lg`, `--layout-sm..lg`, `--duration-instant/fast/moderate/deliberate` | `--spacing`, `--ease-in-out`, `--ease-out` | as given; durations collapse to 0s under `prefers-reduced-motion: reduce` |
| breakpoints (breakpoints.html) | — | `--breakpoint-sm/md/lg/xl` | 40rem / 48rem / 64rem / 80rem (640/768/1024/1280 px) |

`tokens.test.ts` parses `globals.css` and checks that every row exists in both themes and that `foreground/background`, `muted-foreground/background`, `primary-foreground/primary` and `destructive-foreground/destructive` reach WCAG 2.2 AA contrast (≥ 4.5) in both themes.

## Outcome of SP2 Task 3 (2026-09-29)

- **`shadcn init` cannot write `new-york`.** `pnpm dlx shadcn@4.21.0 init -b radix` asks for a preset (Nova, Vega, Maia, Lyra, Mira, Luma, Sera, Rhea, Custom); `-p new-york` fails with `Invalid preset: new-york. Available presets: nova, vega, maia, lyra, mira, luma, sera, rhea`. `packages/client/components.json` is therefore written by hand in the shape of point 1. A probe in a scratch project showed that `shadcn add button` accepts the hand-written file (style `new-york`, Radix `Slot` from `radix-ui`).
- **`shadcn add` rewrites the `cn` import to the npm package `cn`.** With the new-york registry of CLI 4.21.0, `add button` wrote `import { cn } from "cn"` and added the unrelated npm dependency `cn@^0.4.0`, whatever the `utils` alias was (`@/shared/lib/cn`, `@/shared/lib/utils`, `@/lib/utils`). Every `add` (SP2 Tasks 4–6) must be followed by removing that dependency from `package.json`/lockfile and rewriting the import to `#/shared/lib/cn.ts`; the reviewer checks that `cn` never appears in `dependencies`.
- **Package-local imports use `#/…`, not `@/…`.** A `@/*` tsconfig alias inside `@core/client` resolves through the importing app's tsconfig (web and desktop both map `@/*` to their own `src`), so shared code would break in the apps' `tsc`, Next and Vite. The client declares `"imports": { "#/*": "./src/*" }` in `package.json` and imports its own files as `#/shared/lib/cn.ts` (explicit extensions, like the other packages). Node, TypeScript (bundler resolution), Vite and Next resolve package `imports` per package. `tsconfig` keeps `paths` `@/*` only so the shadcn CLI can place files; ESLint (`no-restricted-imports`) forbids `@/` imports in the client.
- The stylesheet declares `@source "../../.."` so any app that imports `@core/client/styles.css` scans the client sources; apps still add `@source` for `modules/*/src` (SP2 Task 18/20).
- `tw-animate-css` (the `animate-in`/`fade-in-0` utilities used by shadcn overlays) is not installed yet; SP2 Task 4/5 decide whether to add it or accept no enter/exit animation.

## Consequences

- Components consume only semantic utilities (`bg-primary`, `text-muted-foreground`, `text-blue`); a theme change never edits a component.
- Status accents are information, not decoration (DESIGN.md principle): `StatusPill` pairs them with text and an icon.
- Borders use translucent white in dark mode (`#ffffff1a`); non-text contrast of focus indicators relies on `--ring`, not on borders.
- A derived app rebrands by editing `globals.css` and this table, not components.

## Alternatives rejected

- **Base UI or a new CLI preset (`nova`, `vega`, …).** The framework standardizes Radix + `new-york`; presets need an ADR.
- **`.dark` class strategy.** The framework convention is `data-theme`.
- **Copying `.design-system/styles.css`.** It is a catalog stylesheet with product examples; only token values are taken.
