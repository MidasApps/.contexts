# SP2 Tasks 1–3 — implementer report

- **Date:** 2026-09-29
- **Branch:** `feat/agentic-app-core-sp0`
- **Commits:** `df1168f` (Task 1), `7aa049f` (Task 2), `bc23f7a` (Task 3)
- **Review:** pending

Contexts read: `docs/plans/execution-constraints.md`, `.claude/skills/using-ddc`, the plan header, Global Constraints
and Tasks 1–3, the SP2 spec (all), SP1 spec §3.3–§3.5 and §10, `.design-system/DESIGN.md`, `styles.css`,
`tokens.html`, `breakpoints.html`, `architecture/fsd.md`, `architecture/atomic-design.md`, `rules/state-management.md`,
`rules/internationalization.md`, `rules/security.md` §2 and §6, `contracts/api.md` §8.1–§8.2,
`stacks/frontend/shadcn-ui.md` (version, CLI, `components.json`, tokens, theming), `stacks/frontend/tailwind@4.md`
(configuration, `@theme`, shadcn integration), skills `shadcn-ui`, `tailwind-4`, `vitest` (stack doc on environments),
SP0 `sp0-summary.md` §4, `spike-tauri.md`, `follow-ups.md`, the contracts primitives (`money`, `locale`, `time-zone`),
SP1 plan Task 5 (`CORE_ERROR_CODES` list), existing `@core/config` presets and catalog pins.

## Task 1 — decisions 0011–0018

Files: `app/docs/decisions/0011-client-data-and-rendering-model.md`, `0012-routing-and-router-port.md`,
`0013-i18n-money-and-time-zone.md` (locale kept in the URL segment for authenticated pages; `es-419`/`en-US` → `pt-BR`),
`0014-ui-kit-shadcn-atomic.md` (token mapping table DESIGN.md → shadcn variables, `--sidebar-*` derivation, dark-first
tokens with `system` preference default; amended by Task 3, see below), `0015-module-contract.md`,
`0016-web-content-security-policy.md` (status **proposed** until Task 18), `0017-desktop-session-secure-store-and-testing.md`,
`0018-mobile-targets-deferred.md` (follow-up #14). `app/README.md` decision list and follow-up #14 updated.

```
$ for f in app/docs/decisions/001[1-8]-*.md; do echo "$f $(grep -c -E '^## (Context|Decision|Consequences|Alternatives)' $f)"; done
app/docs/decisions/0011-client-data-and-rendering-model.md 4
app/docs/decisions/0012-routing-and-router-port.md 4
app/docs/decisions/0013-i18n-money-and-time-zone.md 4
app/docs/decisions/0014-ui-kit-shadcn-atomic.md 4
app/docs/decisions/0015-module-contract.md 4
app/docs/decisions/0016-web-content-security-policy.md 4
app/docs/decisions/0017-desktop-session-secure-store-and-testing.md 4
app/docs/decisions/0018-mobile-targets-deferred.md 4
framework-ok
```

## Task 2 — `@core/i18n`

- New package `app/packages/i18n` (private, ESM, exports `.`): `locales.ts`, `negotiate-locale.ts`
  (`@formatjs/intl-localematcher` best fit; saved choice first), `format/money.ts` (minor digits from `Intl`; decimal
  string formatting keeps precision), `format/parse-money-input.ts` (separators from `formatToParts`, grouping check,
  `INVALID_MONEY_INPUT` / `TOO_MANY_FRACTION_DIGITS`), `format/date-time.ts` (`formatDateTime`, DST-aware
  `zonedWallTimeToUtc` with Temporal "compatible" disambiguation), `format/relative-time.ts`, `format/list.ts`,
  `catalog/currencies.ts`, `catalog/time-zones.ts`, `messages/{pt-BR,en-US,es-419}/{common,errors}.json`
  (`errors`: the 20 `CORE_ERROR_CODES` of SP1 Task 5), `messages/core-catalog.ts` (`CoreMessages` type from pt-BR for the
  `AppConfig` augmentation), `messages/load-messages.ts` (deep merge over the fallback chain, module namespaces).
- `scripts/check-messages.ts` + `scripts/messages/{check-catalogs,read-catalogs}.ts`: key parity, placeholder parity
  (ICU argument names incl. plural/select/tag branches, `@formatjs/icu-messageformat-parser`), ICU parse, no empty
  values, unsupported locales; scans `modules/*/src/messages/<locale>.json` when present.
- Root `pnpm i18n:check` (`turbo run i18n:check`, uncached task), CI step in `checks`.
- Versions measured 2026-09-29: `@formatjs/intl-localematcher` 0.9.0, `@formatjs/icu-messageformat-parser` 3.5.20.
- TDD: 9 test files written first (RED: 9 failed, modules missing), then implementation.

```
$ pnpm -F @core/i18n test
 Test Files  9 passed (9)
      Tests  44 passed (44)
$ pnpm i18n:check
@core/i18n:i18n:check: i18n:check ok (2 namespaces, 6 catalogs)
 Tasks:    1 successful, 1 total
$ pnpm lint            (at Task 2 commit time)
 Tasks:    9 successful, 9 total
$ pnpm -F @core/i18n typecheck
$ tsc --noEmit         (exit 0)
framework-ok
```

## Task 3 — `@core/client` scaffold

- `app/packages/client`: `package.json` (deps via catalog; exports `./app-shell`, `./views/*`, `./shared/ui/*`,
  `./shared/lib/*`, `./shared/lib/cn`, `./styles.css`; `sideEffects: ["**/*.css"]`; `imports` `#/*`), `tsconfig.json`
  (bundler preset, `jsx: react-jsx`), `vitest.config.ts` (jsdom, setup file), `eslint.config.js`
  (`createReactConfig` + ban on `@/` imports), `components.json` (hand-written, see below).
- `src/shared/ui/styles/globals.css`: DESIGN.md tokens (dark on `:root`/`[data-theme="dark"]`, light on
  `[data-theme="light"]`), derived shadcn variables and `--sidebar-*` family, status accents as `--status-*`,
  `--chart-1..5`, `@theme inline` mapping, radius/fonts/breakpoints/easings, durations, `@custom-variant dark`,
  visible focus, reduced motion, `@source "../../.."`.
- `src/shared/lib/cn.ts`; `src/shared/testing/{setup.ts, axe.ts (expectNoAxeViolations), render.tsx
  (renderWithProviders: use-intl + TanStack Query + user-event; missing keys throw), contrast.ts}`.
- `packages/config/eslint/index.js`: `createReactConfig()` (react recommended + jsx-runtime, react-hooks recommended,
  jsx-a11y recommended); catalog entries for the three plugins and `@types/eslint-plugin-jsx-a11y`.
- Tests: `cn.test.ts`, `tokens.test.ts` (reads `.design-system/DESIGN.md` and asserts every token value in both
  themes; every themed token mapped to a Tailwind color; AA contrast ≥ 4.5 for foreground/background,
  muted-foreground/background, primary-foreground/primary, destructive-foreground/destructive,
  sidebar-primary-foreground/sidebar-primary in both themes; compiles `globals.css` with `@tailwindcss/node`),
  `testing-helpers.test.tsx` (providers, missing-key failure, axe pass/fail, contrast math). RED first (3 failed).
- Versions measured 2026-09-29 (all latest): radix-ui 1.6.7, class-variance-authority 0.7.1, clsx 2.1.1,
  tailwind-merge 3.7.0, lucide-react 1.49.0, use-intl 4.14.8, tailwindcss / @tailwindcss/node 4.3.3,
  @tanstack/react-query 5.104.0, jsdom 30.1.1, @testing-library/react 16.3.3, dom 10.4.2, user-event 14.6.7,
  axe-core 4.13.0, eslint-plugin-react 7.37.5, eslint-plugin-react-hooks 7.1.1, eslint-plugin-jsx-a11y 6.10.2,
  @types/eslint-plugin-jsx-a11y 6.10.1. pnpm admitted `lucide-react@1.49.0`, `use-intl@4.14.8` and `icu-minify@4.14.8`
  (published 2026-09-29) through `minimumReleaseAgeExclude`; commented with a removal date (2026-10-06).

### shadcn CLI outcome (recorded in decision 0014)

- `pnpm dlx shadcn@4.21.0 init -b radix` only offers presets (Nova … Rhea, Custom); `-p new-york` →
  `Invalid preset: new-york. Available presets: nova, vega, maia, lyra, mira, luma, sera, rhea`. `components.json`
  written by hand as SP2 spec §3.
- Probe (scratch project): `shadcn add button` works with the hand-written file but writes
  `import { cn } from "cn"` and adds the npm package `cn@^0.4.0` regardless of the `utils` alias. Tasks 4–6 must remove
  that dependency and rewrite the import after every `add`.

```
$ pnpm -F @core/client test
 Test Files  3 passed (3)
      Tests  26 passed (26)
$ pnpm -F @core/client lint && pnpm -F @core/client typecheck
client-lint-ok
client-typecheck-ok
$ pnpm -F @core/config typecheck && pnpm -F @core/config lint && pnpm -F @core/config test
 Test Files  1 passed (1)
      Tests  2 passed (2)
$ pnpm lint
 Tasks:    11 successful, 11 total
$ pnpm typecheck
 Tasks:    11 successful, 11 total
$ pnpm test --continue
 Tasks:    11 successful, 11 total
$ pnpm i18n:check
@core/i18n:i18n:check: i18n:check ok (2 namespaces, 6 catalogs)
$ git diff --quiet main -- .contexts .claude && echo framework-ok
framework-ok
```

## Concerns

1. **`@/` → `#/` deviation (Task 3).** The plan and spec write client imports as `@/shared/...`. That alias resolves
   through the importing app's tsconfig (web and desktop both map `@/*` to their own `src`), so it would break the
   apps' typecheck and bundling. The client uses package `imports` (`#/*` with explicit extensions) instead; `@/` stays
   only in `tsconfig` `paths` for the shadcn CLI and is banned by ESLint. Tasks 4+ must follow this (decision 0014).
2. **`shadcn add` injects the npm package `cn`** (CLI 4.21.0, new-york registry). Supply-chain hazard for Tasks 4–6.
3. **`tw-animate-css` not installed**: shadcn overlays reference `animate-in`/`fade-in-0`; Task 4/5 decide.
4. `pnpm lint`/`pnpm typecheck` were red for a while because of another agent's uncommitted `@core/services` Postgres
   files; they were green once those were committed. One `@core/scripts` supervisor test timed out under load
   (5 s, process-tree kill on Windows) and passed on rerun — unrelated to these tasks.
5. `app/README.md` still says `packages/client` and `packages/i18n` are planned; Task 24 rewrites the README for SP2.
6. SP1 is a prerequisite of SP2 but only SP1 Tasks 1–3 exist; Tasks 1–3 here do not depend on SP1 code
   (`errors` keys copy the SP1 plan list; Task 8's parity test will compare against the real `CORE_ERROR_CODES`).
