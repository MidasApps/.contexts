# 0068. Biome formats the code; ESLint guards imports, size and complexity

- **Status:** accepted
- **Date:** 2026-10-04
- **Scope:** `app/` (whole workspace); local decision, the framework is unchanged
- **Doctrine:** `.contexts/engineering/practices/ai-friendly-code.md` (§7 "Determinismo de estilo", "Métricas práticas"); `.contexts/engineering/rules/development.md` (imports: lines 34–35; nesting: line 66; dependencies: line 123)

## Context

An audit against `.contexts/engineering` on 2026-10-04 measured four gaps:

- **No formatter.** 2,270 TypeScript lines exceeded 160 characters, and 29 exceeded 250. Style depended on who wrote the file. §7 asks for a formatter that every file follows.
- **Import order left to chance.** `development.md:35` says the linter orders imports: Node built-ins, then external libraries, then internal aliases, then relative paths.
- **Deep relative imports.** 380 files in `packages/services` imported through `../../../`. `development.md:34` forbids this and asks for aliases. `@core/client` already used `#/`.
- **No size or complexity guard.** No lint rule capped file length, function length, complexity or nesting depth. The practice asks for these metrics, and `development.md:66` caps nesting at 3 levels.

The audit also found three things that are not gaps:

- **Generated files are long by design.** `docs/openapi/v1.yaml` (29,262 lines) and `docs/catalog/catalog*.json` (about 27,000 lines each) come from the Zod contracts. `contracts/api.md` fixes the path `docs/openapi/v1.yaml`, and the practice exempts generated code. The per-entity pages in `docs/catalog/<context>/` are the readable form. They are now marked `linguist-generated` in `app/.gitattributes`.
- **Translation files are declarative data.** The i18n JSON files run to 1,640 lines.
- **There is no real `any`.** Every match is in the generated route tree or in a comment.

## Decision

1. **Formatter: Biome 2.5.15, format and import ordering only** (`biome.json`, `pnpm format`, `pnpm format:check`).
   - The practice names Biome, and one tool covers formatting and import ordering for TS, TSX, JSON and CSS.
   - Its linter stays off: ESLint 9 keeps every rule (type-aware rules, boundaries, React, a11y).
   - Settings:
     - 120-character lines, 2-space indent, double quotes, semicolons, trailing commas, LF.
   - Generated files are excluded, so `pnpm contracts:check` stays byte-stable:
     - `docs/openapi`, `docs/catalog`, `routeTree.gen.ts`, `apps/functions/lib`, the Drizzle snapshots and the Tauri-generated folders.
   - The one-time reformat is a commit of its own.
   - CI runs `pnpm format:check`.
2. **Line endings: `app/.gitattributes` sets `eol=lf`.** The generators write LF. A CRLF checkout made every regenerated file look modified.
3. **`@core/services` imports through `#/`.** This is the same `imports` map pattern as `@core/client`. The deep relative imports are rewritten once, and an ESLint `no-restricted-imports` pattern refuses `../../*` from then on.
4. **ESLint size and complexity guards** (shared `createCoreConfig`):
   - `max-lines` 500 (blank lines and comments skipped);
   - `max-lines-per-function` 100;
   - `complexity` 15;
   - `max-depth` 3.

   Test files and declarative files that the practice exempts get the limits that fit them; the exceptions are listed next to the rules. Existing violators are fixed, not excused.

## Consequences

- **Diffs.** A diff shows only real changes: no reflowed lines, no line-ending noise.
- **Editors and agents.** They no longer choose a style, because the formatter decides.
- **One large commit.** The reformat touches almost every file. It is one `style(workspace)` commit, kept apart from behaviour changes as `code-review.md` asks, so `git blame --ignore-rev` can skip it.

## Alternatives rejected

- **Prettier plus an import-order ESLint plugin.** Two more dependencies for what Biome does alone.
- **Biome as linter too.** ESLint already carries the type-aware, boundaries, React and a11y rules. Running two linters doubles the rule surface.
- **Splitting `v1.yaml` into `$ref` files.** The contract pins the single file, no consumer needs the split, and nobody edits it by hand.
