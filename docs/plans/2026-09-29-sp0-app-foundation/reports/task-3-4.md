# SP0 — Tasks 3 and 4 report

Date: 2026-09-29 · Branch: `feat/agentic-app-core-sp0`

## Commits

- `a507dcf` feat(contracts): add primitives and catalog metadata registry (Task 3)
- `c16c76d` feat(contracts): generate and check data catalog (Task 4, also carries the Task 3 progress line)
- this report and the Task 4 progress line go in a follow-up `docs(contracts)` commit

## Contexts read

`.claude/skills/using-ddc/SKILL.md`, `.claude/skills/zod-4/SKILL.md`, `.claude/skills/tdd/SKILL.md`;
plan header, Global Constraints, Tasks 3–4; spec §3, §4, §5, §16.2, §16.4;
`.contexts/engineering/contracts/schemas.md`, `stacks/validation/zod@4.md`, `rules/data-modeling.md`,
`decisions/0005-firestore-document-ids-use-automatic-ids.md`, `contracts/api.md` §5, §6, §8, §15.

## Versions (`npm view <pkg> version`, 2026-09-29)

| Package | latest | Pinned | Note |
|---|---|---|---|
| zod | 4.6.5 | 4.6.5 | already in the catalog |
| yaml | 2.9.1 | 2.9.1 | new catalog entry; dev dependency for `v1.yaml` |

Script runner: **Node 26 native type stripping** (`node scripts/build-catalog.ts`). No tsx.

## Task 3: `@core/contracts`

`app/packages/contracts` (`private`, ESM, `engines.node >=26.0.0 <27`, `exports["."] = ./src/index.ts`),
using the `@core/config` presets (tsconfig `nodenext`, `createCoreConfig`, `defineCoreVitestConfig`).

- `src/contracts/primitives/`
  - `ids.schema.ts`: `firestoreIdSchema<Brand>()` (`z.string().min(1).brand()`, ADR 0005), `TenantIdSchema`, `UserIdSchema`; ULID ids `EventIdSchema`, `IdempotencyKeySchema`, `RequestIdSchema`.
  - `money.schema.ts`: `CurrencySchema` (`^[A-Z]{3}$`), `MoneySchema { amountMinor: z.int().nonnegative(), currency }`.
  - `locale.schema.ts`: canonical BCP 47 through `Intl.getCanonicalLocales` (`pt-br` is rejected).
  - `time-zone.schema.ts`: IANA name validated by `Intl.DateTimeFormat`, with a shape regex because Intl accepts raw offsets such as `+03:00`.
  - `iso-datetime.schema.ts`: `z.iso.datetime({ offset: false })`.
  - `catalog-meta.schema.ts`: `CatalogMetaSchema` (strict object with the required fields `id` `<context>.<Name>`, `kind`, `description`, `examples` ≥ 1, `pii`, `tenancyScope`, `relations`; optional `ui`, `permission`, `deprecated`), `FieldMetaSchema` (`description`, `pii`; optional `ui`, `examples`, `deprecated`), `UiMetaSchema` (`widget`, `labelKey`, `order`, `group`, `visibleWith`), `RelationSchema` (`target`, `type`, `field`), `PermissionSchema` (`<module>.<resource>.<action>`), `CUSTOM_META_KEYS`.
- `src/contracts/registry.ts`: `createContractRegistry()` returns `defineContract` and `listContracts`, and a process-wide default is exported. `defineContract` checks four things:
  1. it validates the meta;
  2. it rejects a duplicate `id`;
  3. it requires `description` and `pii` on every top-level field of an object contract, reading them through optional, nullable and default wrappers;
  4. it registers the **same instance** in `z.globalRegistry` and keeps its own Map. `listContracts()` returns the contracts sorted by id.

  An error throws `ContractDefinitionError`, with `code` set to `INVALID_CONTRACT_META`, `DUPLICATE_CONTRACT_ID` or `MISSING_FIELD_META`.
- `src/contracts/field-meta.ts`: `readFieldMeta`, `listTopLevelFields`, `isFieldOptional`.

TDD: tests were written first, and the red run failed with `Cannot find module './money.schema.ts'` (3 files). Tests now pass (21).
Verified during the spike: Zod 4.6.5 `globalRegistry` does **not** throw on a repeated `id`, so the registry's own Map is the only duplicate guard.

## Task 4: generator and gate

- `scripts/catalog/*` (pure functions) plus the entry points `scripts/build-catalog.ts` and `scripts/check-catalog.ts`.
- The generator writes these artifacts, with paths relative to `app/`:
  - `docs/catalog/catalog.json`;
  - `docs/catalog/catalog.ai.json`;
  - `docs/catalog/<context>/<Name>.md`;
  - `docs/catalog/<context>/<Name>.schema.json`;
  - `docs/openapi/v1.yaml`, OpenAPI 3.1.0 with `paths: {}` and the contracts under `components.schemas`.
- JSON Schema comes from `z.toJSONSchema(registry, { uri: "#/components/schemas/<id>", override })`, so nested contracts become `$ref`. The `override` renames `kind|pii|tenancyScope|relations|ui|permission` to `x-*`. `description`, `examples` and `deprecated` stay as standard keywords. `$schema` and `$id` are dropped.
- `catalog.ai.json` handles PII in three ways:
  - it drops contracts whose `pii` is `sensitive`;
  - it drops fields and JSON Schema properties with `x-pii: sensitive` at every level, and removes them from `required`;
  - it replaces `personal` values in contract and field examples with `"[redacted]"`.
- Output is deterministic: keys are sorted recursively, there are no timestamps, and the YAML is written as 1.1 so ISO date strings are quoted.
- `contracts:check` fails on any of these:
  - `changed`, `missing` or `stale` files under `docs/catalog` and `docs/openapi`, with CRLF normalized because `core.autocrlf=true`;
  - missing field meta;
  - a relation target that is not in the catalog;
  - a raw meta key in any artifact's JSON Schema.
- Root `pnpm contracts:catalog` and `pnpm contracts:check` run through turbo. Both tasks are now `cache: false`, because they write and read `app/docs`, which is outside the package's inputs.
- `src/contracts/example/note.schema.ts`: the sample `example.Note`, re-exported from `src/index.ts` and removable.

TDD: the red run failed with `Cannot find module './catalog/artifacts.ts'`. Tests now pass (33 in total).

## Verify output

```
$ cd app && pnpm -F @core/contracts test
 Test Files  4 passed (4)
      Tests  33 passed (33)
$ pnpm -F @core/contracts typecheck
$ tsc --noEmit                        (exit 0)
$ pnpm -F @core/contracts lint
$ eslint .                            (exit 0)
$ pnpm turbo run lint typecheck test
 Tasks:    6 successful, 6 total

$ pnpm contracts:catalog
@core/contracts:contracts:catalog: contracts:catalog wrote 5 files for 1 contracts   (exit 0)
$ pnpm contracts:check
@core/contracts:contracts:check: contracts:check ok (1 contracts, 5 files)           (exit 0)

# corrupted catalog.json + added docs/catalog/example/Old.md
$ pnpm contracts:check                                                              (exit 1)
contracts:check failed; run `pnpm contracts:catalog` and commit the result:
  - changed: docs/catalog/catalog.json
  - stale: docs/catalog/example/Old.md
# restored with pnpm contracts:catalog → contracts:check ok

$ git diff --quiet main -- .contexts .claude && echo framework-ok
framework-ok
```

## Deviations and notes

- **OpenAPI generator:** `contracts/api.md` §15 and `schemas.md` §15 name `@asteasolutions/zod-to-openapi`. Here the spec is built from native `z.toJSONSchema`, as spec §16.4 and the brief ask, and no extra dependency was added. Revisit this when `/v1` endpoints (paths, examples per endpoint) arrive.
- **`MoneySchema.amountMinor` is non-negative**, following `schemas.md` §7 (the brief only said `int`). A signed amount, for example for refunds or balances, would need a separate primitive.
- **Registry uses `z.globalRegistry` only.** Field `.meta()` always writes there, so an injectable registry was dropped. Tests isolate state through a fresh `createContractRegistry()`, since the global registry tolerates repeated ids.
- **Registration on import:** contract modules call `defineContract` at module load. This is inherent to a registry, but the rule `development` limits module side effects to `composition.ts`. The catalog scripts load contracts through `src/index.ts`.
- **Redaction depth:** contract-level examples are redacted by top-level field `pii`. A `personal` or `sensitive` value nested inside an object field whose own `pii` is `none` is not redacted inside **examples**, although its JSON Schema property is. Authors should set the parent field's `pii` to the highest level it contains.
- **Relation targets must exist** in the catalog: `contracts:check` enforces this, so `example.Note` has `relations: []`.
- **Commit 1 scripts:** `package.json` already declared the `contracts:*` scripts in `a507dcf`, and the script files arrived in `c16c76d`.
- Not done here (out of scope for Tasks 3–4): semantic SQL views, the `contracts/data-catalog.md` doctrine (the framework is read-only), and the parity test between Drizzle and the contracts.
- Still open from Task 2: no test covers boundaries across bare workspace specifiers (`@core/contracts` imported from another package). The first consumer package should add one.
