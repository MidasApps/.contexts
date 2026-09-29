# English identifiers — survey sources

Reference material for Task 0 of `docs/plans/2026-09-25-english-identifiers.md`.
These are the throwaway scripts that produced the survey numbers in the plan. They
are **not** repo tooling: Task 0 ports them into `scripts/codemods/` with tests.

- `scan.js`: parses every file in scope with `@typescript/typescript6` and classifies each identifier occurrence. Run it from the repo root.
- `words.js`, `lex.js`, `vocab.js`, `segments.js`: split identifiers into words and match them against the pt-BR lexicon.
- `final.js`, `agg.js`, `batches.js`, `sub.js`: aggregate the counts and propose the batches.
- `lstest.js`: read-only check that the TS 6 language service loads the project and finds rename locations.
- `vocab.json`, `ptNonEn.txt`, `ptAndEn.txt`, `neither.txt`, `nondict.txt`: the reviewed word lists.
- `filenames.json`, `final.json`: survey outputs.

Not committed, because the scripts regenerate them: the large derived files `occ.json`, `occcat.json`, `ptset.json`, `names.json` and `topfns.json`, and the downloaded pt-BR lexicon (`dictionary-pt` 4.0.0 and a 50k-word frequency list).
