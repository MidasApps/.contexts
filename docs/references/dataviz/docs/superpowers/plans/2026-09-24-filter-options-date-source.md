# Filter-options date source from the client binding — Implementation Plan

> **For agentic workers:** Use skill `using-ddc` before coding. Prefer subagent-per-task
> with templates in `writing-plans-ddc` (implementer + task-reviewer). Track progress in
> `.claude/agent-memory/progress.md`.

**Goal:** make `/api/filter-options` read the period dates and projects from the table
the client's binding declares, instead of the hard-coded `contratos` table, so any
domain (not only securitization) gets a period selector and working metrics.

**Architecture:** a pure resolver picks, inside the requested dataset, the first bound
entity that maps the `data_base_report` attribute (`contratos` first, for backward
compatibility) and returns `{ table, dateField, projectField }`. The route passes that
source to `queryFilterOptions`, which stops assuming `contratos`. Without bindings the
old literal stays as the default. No schema, contract or collection changes.

**Tech Stack:** Node 24, TypeScript 7 (`^7.0.2`), Next.js 16 (`^16.3.0` in
`package.json`; MEMORY pins 16.2 — use what is installed), Zod 4.4, Vitest 4, BigQuery
client `@google-cloud/bigquery ^9`.

## Global Constraints

- Pins: `@.contexts/engineering/MEMORY.md` (versions above were read from `package.json`
  on 2026-09-24).
- Identifier language: `@.contexts/engineering/rules/development.md`, section
  "Idioma dos identificadores" (arrives with PR #1). Identifiers and file names in
  English; data names from the contract (`contratos`, `data_base_report`, `projeto`)
  stay verbatim as string values.
- Tenancy: the route already scopes by client (ADR-0006, ADR-0018). This change must
  not widen access — it only chooses which bound table to read.
- BigQuery identifiers go through `safeIdentifier` (`src/shared/lib/bigquery/client.ts`);
  never interpolate a table name without it (`@.contexts/engineering/rules/security.md`).
- Tests: `@.contexts/engineering/rules/testing.md`.

## Source material

The behaviour already exists, uncommitted and in Portuguese, in the author's working
tree. This plan ports it to `main` with English names. Reference copies:

- `app/api/filter-options/fonte-de-datas-base.ts` and `.test.ts`
- `src/shared/lib/bigquery/fonte-de-filtro.ts`
- working-tree diffs of `app/api/filter-options/route.ts`,
  `src/shared/lib/bigquery/queries.ts`, `src/shared/lib/bigquery/client.ts`

If those files are not available, the full behaviour is specified in Task 1 and Task 2.

## Rename map

| Portuguese (working tree) | English (this plan) |
|---|---|
| `src/shared/lib/bigquery/fonte-de-filtro.ts` | `src/shared/lib/bigquery/filter-source.ts` |
| `FonteDeFiltro` | `FilterSource` |
| `FONTE_DE_FILTRO_PADRAO` | `DEFAULT_FILTER_SOURCE` |
| field `projetoField` | field `projectField` |
| `app/api/filter-options/fonte-de-datas-base.ts` | `app/api/filter-options/date-source.ts` |
| `fonteDeDatasBase` | `resolveDateSource` |
| locals `alvo`, `doDataset`, `candidatos`, `escolhido`, `ClientComBindings` | `target`, `datasetBindings`, `candidates`, `chosen`, `ClientWithBindings` |

---

### Task 1: `FilterSource` type and `resolveDateSource`

**Contexts (Read first):**
- `@.contexts/engineering/rules/development.md`
- `@.contexts/engineering/rules/testing.md`
- `@.contexts/engineering/contracts/semantic-layer.md`

**Files:**
- Create: `src/shared/lib/bigquery/filter-source.ts`
- Create: `app/api/filter-options/date-source.ts`
- Test: `app/api/filter-options/date-source.test.ts`

**Interfaces:**
- Produces: `interface FilterSource { table: string; dateField: string; projectField: string | null }`,
  `const DEFAULT_FILTER_SOURCE: FilterSource = { table: 'contratos', dateField: 'data_base_report', projectField: 'projeto' }`,
  `resolveDateSource(client: ClientWithBindings | undefined, dataset: string): FilterSource`.
- `filter-source.ts` is its own module so tests that mock `queries.ts` still see the default.

- [ ] **Step 1: Read contexts** — the three paths above.
- [ ] **Step 2: Write failing test** `date-source.test.ts` with four cases:
  1. no client → returns `DEFAULT_FILTER_SOURCE`;
  2. dataset binds `contratos` and `fluxo_caixa`, both with `data_base_report` →
     returns `contratos`, with `projectField: 'projeto'`;
  3. dataset `imobiliaria_demo` binds `leads` (no `data_base_report`) and
     `estoque_snapshot` (with it, no `projeto`) → returns `estoque_snapshot`,
     `projectField: null`;
  4. binding renames physical names (`tableBindings.contratos = 'tb_contratos'`,
     `schemaBindings['contratos.data_base_report'] = 'dt_base'`,
     `['contratos.projeto'] = 'nm_projeto'`) → returns the physical names.
  The dataset argument may come as `project.dataset` or `dataset`; both must match.
- [ ] **Step 3: Run test — expect FAIL** (`pnpm exec vitest run app/api/filter-options/date-source.test.ts`).
- [ ] **Step 4: Minimal implementation.** Flatten `client.productBindings[].datasets[]`;
  keep those whose `datasetId` equals the dataset suffix or whose
  `` `${dataSourceId}.${datasetId}` `` equals the argument (fall back to all datasets if
  none match); for each key of `tableBindings` whose
  `schemaBindings['<entity>.data_base_report']` is a string, build a candidate; return
  the `contratos` candidate if present, else the first; else the default.
- [ ] **Step 5: Run test — expect PASS**, then `pnpm exec tsc --noEmit`.
- [ ] **Step 6: Append progress ledger.**
- [ ] **Step 7: Commit** `feat(filter-options): resolve period source from client binding`.

**Verify:**
- `pnpm exec vitest run app/api/filter-options/date-source.test.ts` → 4 passed.

### Task 2: Wire the source into the query and the route

**Contexts (Read first):**
- `@.contexts/engineering/rules/security.md`
- `@.contexts/engineering/contracts/bigquery.md`
- `@.contexts/engineering/rules/api-design.md`

**Files:**
- Modify: `src/shared/lib/bigquery/client.ts` — `formatTableRef(dataset, table: TableName | string)`:
  resolve `TABLES[table] ?? table` and pass the result through `safeIdentifier`.
- Modify: `src/shared/lib/bigquery/queries.ts` — `queryFilterOptions(dataset?, schema?, source: FilterSource = DEFAULT_FILTER_SOURCE)`;
  use `source.table`, `resolveColumn(schema, source.table, source.dateField) ?? source.dateField`
  and, only when `source.projectField` is set, the project column. Replace both
  `formatTableRef(dataset, 'contratos')` calls with `formatTableRef(dataset, source.table)`.
- Modify: `app/api/filter-options/route.ts` — after loading the client document, call
  `resolveDateSource(clientDoc?.data, dataset)` and pass it as the third argument.
- Test: `app/api/filter-options/route.test.ts` (existing) — add one case asserting the
  route forwards the resolved source to `queryFilterOptions` for a non-`contratos` client.

**Interfaces:**
- Consumes: `FilterSource`, `DEFAULT_FILTER_SOURCE`, `resolveDateSource` from Task 1.
- Produces: unchanged HTTP contract of `/api/filter-options`.

- [ ] **Step 1: Read contexts.**
- [ ] **Step 2: Write failing test** in `route.test.ts` (source forwarded).
- [ ] **Step 3: Run test — expect FAIL.**
- [ ] **Step 4: Implement** the three modifications.
- [ ] **Step 5: Run** `pnpm exec vitest run app/api/filter-options src/shared/lib/bigquery` and
  `pnpm exec tsc --noEmit` — expect PASS.
- [ ] **Step 6: Append progress ledger.**
- [ ] **Step 7: Commit** `feat(filter-options): read period dates from the bound table`.

**Verify:**
- `pnpm test` → no new failures versus `main` (record the baseline count before Task 1).
- `pnpm exec tsc --noEmit` → exit 0.
- Manual: with the dev server, a `vila-rosa` report still shows the same period options
  as on `main`.

---

## Delivery

- Branch `feat/filter-options-date-source` from `main`, one PR, squash merge.
- Rollback: revert the PR; the default source reproduces the old behaviour exactly.
