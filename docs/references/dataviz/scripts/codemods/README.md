# Codemods: English identifiers

Tooling for `docs/plans/2026-09-25-english-identifiers.md`, which enforces
`.contexts/engineering/rules/development.md`, section "Idioma dos identificadores".

Run everything from the repo root with `pnpm tsx --tsconfig tsconfig.scripts.json <file>`.

| File | What it does |
|---|---|
| `list-pt-identifiers.ts` | Lists Portuguese identifiers in a scope (`--summary`) and drafts a batch map (`--out`). |
| `check-fingerprint.ts` | Fails a batch that changed a string literal, JSX text or a property key the map does not rename (`--base <ref> [--head <ref>] [--map <file>]`). |
| `apply-rename-map.ts` | Applies a filled batch map, all or nothing (`--map <file> [--dry-run] [--include-mjs]`). Refuses persisted, unaudited, protected and colliding renames; lists strings equal to an old name for review. |
| `rename-identifiers.ts` / `rename-file.ts` / `rename-types.ts` | Identifier rename with prefix/suffix text (shorthands keep their key) and collision checks; file rename with import and `vi.mock` path rewrites. |
| `language-service.ts` | TS 6 language service over the repo or in-memory files, with edits kept in memory until written. |
| `identifier-words.ts` | Splits identifiers into words and classifies them against the lexicon. |
| `scan-identifiers.ts` | Parses a file with `@typescript/typescript6` and classifies each Portuguese identifier (`local`, `property`, `contract`, `tool-param`, `protected`, `data-key`). |
| `fingerprint.ts` | Literal, JSX-text and key multisets of a file, and the comparison. |
| `vocabulary.json` | Shared PT → EN translations; the first entry is the default. |
| `lexicon/pt-lexicon.json` | Accent-folded Portuguese words that are not English, plus domain terms that are never flagged. Generated once; see its `description`. |
| `lexicon/contract-vocabulary.json` | Data-contract names: a property with one of these names is data by default. |
| `lexicon/protected-names.json` | Persisted and model-facing names that a refactor must not rename, the tool folders, and the documented exceptions. |

Batch workflow: `list-pt-identifiers --scope <dir> --out maps/task-NN.json` → fill `to` from
`vocabulary.json` and audit each property (`needsAudit: false` only with evidence) →
`apply-rename-map --map …` → tsc, lint, full tests, build → `check-fingerprint --base <ref> --map …`.

Only code is read: comments, string literals, template text and JSX text are
never scanned or changed.
