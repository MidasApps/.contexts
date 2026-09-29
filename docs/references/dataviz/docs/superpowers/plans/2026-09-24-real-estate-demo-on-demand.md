# Real estate demo on `main`, runnable on demand — Implementation Plan

> **For agentic workers:** Use skill `using-ddc` before coding. Prefer subagent-per-task
> with templates in `writing-plans-ddc` (implementer + task-reviewer). Track progress in
> `.claude/agent-memory/progress.md`.

**Goal:** bring the real estate demo tenant into `main` as development tooling, with
English identifiers and file names, and a single command that anyone can run to create
or remove the whole demo: `pnpm demo:real-estate [--apply | --teardown]`.

**Architecture:** the demo is already built and tested on branch `feat/real-estate-demo`
(commit `49fbf0e`): a synthetic data generator for 20 BigQuery tables, 268 metric
recipes, 25 dashboard templates and five Firestore seeds. This plan (1) renames code
identifiers and files to English while keeping every data name (tables, columns,
entities, metric ids, client id, dataset) exactly as it is, (2) brings the synthetic data
loader it depends on, and (3) adds an orchestrator that runs the steps in order with a
dry-run default, a production guard and a teardown. No application behaviour changes
except the `'Imobiliária'` template category already on the branch.

**Tech Stack:** Node 24 (`v24.15` local), TypeScript 7 (`^7.0.2`), Zod 4.4 (`^4.4.3`),
Vitest 4 (`^4.1.10`), `firebase-admin ^14.2`, `@google-cloud/bigquery ^9.0.2`, `tsx ^4.21`.
Versions read from `package.json` on 2026-09-24; MEMORY baseline in
`@.contexts/engineering/MEMORY.md`.

## Global Constraints

- **Prerequisites merged in `main` before Task 1:** PR #1 (identifier language rule and
  ADR-0028) and the plan `docs/superpowers/plans/2026-09-24-filter-options-date-source.md`.
  Without the second, the demo client opens with no period selector.
- **Identifier language:** `@.contexts/engineering/rules/development.md`, "Idioma dos
  identificadores". Code identifiers, CLI flags and file names in English. **Data names
  never change**: BigQuery table and column names (`imoveis`, `leads`,
  `data_base_report`), contract entity and attribute ids, metric ids (`imobiliaria.*`),
  template ids (`imobiliaria-*`), client id `imob-demo`, product and contract id
  `imobiliaria`, dataset `imobiliaria_demo`, and every string inside SQL recipes.
- **Firestore:** seeds keep writing today's collections (`dataContracts`,
  `dashboardTemplates`, `metrics`, `clients`, `products`). ADR-0028 is `Proposed`; when
  its phases run, these seeds migrate with the rest of the code.
- **Template category:** keep the value `'Imobiliária'`, consistent with the other
  labels in `TemplateCategory`. ADR-0028 phase A converts all of them together.
- **Safety:** `@.contexts/engineering/rules/security.md` (child processes via
  `execFile`/`spawn` with an argument array, never a shell string),
  `@.contexts/engineering/processes/environments.md`, production database guard as in
  `scripts/seed-provisioning.ts` (`DATABASE_PRODUCAO` from
  `scripts/lib/provisioning-manifest.ts`).
- **Cost:** `@.contexts/engineering/rules/cost.md`. The validation step runs 268 queries;
  keep the existing `--dry-run` path of the validator for the orchestrator's dry-run.
- **Tests:** `@.contexts/engineering/rules/testing.md`,
  `@.contexts/engineering/practices/tdd.md`. The 29 existing tests are the safety net for
  the renames; they must stay green after every task.
- **Branch:** `feat/real-estate-demo-runner` from `main`, one PR, squash merge. Delete
  `feat/real-estate-demo` after the merge.

## Source material

- Branch `feat/real-estate-demo` (commit `49fbf0e`): all real estate files.
- Author's working tree (uncommitted): `scripts/bq-seed-synthetic-data.ts`,
  `scripts/lib/synthetic-portfolio.ts`, `scripts/lib/synthetic-portfolio.test.ts`.
  Copy them into the branch in Task 1; they are not on `main`.

## File map

| From (`feat/real-estate-demo` / working tree) | To |
|---|---|
| `scripts/lib/vila-rosa-schemas.mjs` (+ `.test.ts`) | same path (client name is a proper noun) — exports renamed only |
| `scripts/lib/synthetic-portfolio.ts` (+ `.test.ts`) | same path — exports renamed only |
| `scripts/bq-seed-synthetic-data.ts` | same path — flags and locals renamed |
| `scripts/lib/imobiliaria-schemas.mjs` (+ `.test.ts`) | `scripts/lib/real-estate-schemas.mjs` (+ `.test.ts`) |
| `scripts/lib/synthetic-imobiliaria.ts` (+ `.test.ts`) | `scripts/lib/synthetic-real-estate.ts` (+ `.test.ts`) |
| `scripts/lib/imobiliaria/base.ts` | `scripts/lib/real-estate/base.ts` |
| `scripts/lib/imobiliaria/universo.ts` | `scripts/lib/real-estate/universe.ts` |
| `scripts/lib/imobiliaria/estrutura.ts` | `scripts/lib/real-estate/structure.ts` |
| `scripts/lib/imobiliaria/produto.ts` | `scripts/lib/real-estate/product.ts` |
| `scripts/lib/imobiliaria/locacao.ts` | `scripts/lib/real-estate/rental.ts` |
| `scripts/lib/imobiliaria/funil.ts` | `scripts/lib/real-estate/funnel.ts` |
| `scripts/lib/imobiliaria/apoio.ts` | `scripts/lib/real-estate/support.ts` |
| `scripts/metrics/imobiliaria.mjs` | `scripts/metrics/real-estate.mjs` |
| `scripts/metrics/imobiliaria/_helpers.mjs` | `scripts/metrics/real-estate/_helpers.mjs` |
| `scripts/metrics/imobiliaria/{executivo,lancamentos,prontos,locacao,marketing,financeiro,equipe,atendimento}.mjs` | `scripts/metrics/real-estate/{executive,launches,ready-units,rental,marketing,finance,team,customer-service}.mjs` |
| `scripts/metrics/__tests__/imobiliaria-shapes.test.ts` | `scripts/metrics/__tests__/real-estate-shapes.test.ts` |
| `scripts/templates/imobiliaria.mjs` | `scripts/templates/real-estate.mjs` |
| `scripts/templates/imobiliaria/_blocos.mjs` | `scripts/templates/real-estate/_blocks.mjs` |
| `scripts/templates/imobiliaria/{…same eight…}.mjs` | `scripts/templates/real-estate/{…same eight English names…}.mjs` |
| `scripts/templates/__tests__/imobiliaria-templates.test.ts` | `scripts/templates/__tests__/real-estate-templates.test.ts` |
| `scripts/seed-imobiliaria-base.mjs` | `scripts/seed-real-estate-contract.mjs` |
| `scripts/seed-imobiliaria-client.mjs` | `scripts/seed-real-estate-client.mjs` |
| `scripts/seed-imobiliaria-metrics.mjs` | `scripts/seed-real-estate-metrics.mjs` |
| `scripts/seed-imobiliaria-templates.ts` | `scripts/seed-real-estate-templates.ts` |
| `scripts/seed-imobiliaria-reports.mjs` | `scripts/seed-real-estate-reports.mjs` |
| `scripts/bq-validate-imobiliaria-metrics.ts` | `scripts/bq-validate-real-estate-metrics.ts` |
| `docs/imobiliarias-base-de-exemplos.md` | `docs/real-estate-demo-catalog.md` (content stays in Portuguese) |
| `docs/plans/2026-09-18-imobiliaria-demo-onboarding.md` | **not brought** — local validation plan |
| — | `scripts/demo-real-estate.ts` (new, Task 6) |
| — | `scripts/lib/real-estate-demo.ts` + `.test.ts` (new, Task 6) |

## Export rename map

| File | Portuguese → English |
|---|---|
| `vila-rosa-schemas.mjs` | `paraTableFields` → `toTableFields`, `colunasFaltantes` → `missingColumns` (`MONITOR_SCHEMA`, `COVENANTS_SCHEMA`, `AUX_SCHEMA` stay) |
| `synthetic-portfolio.ts` | `Opcoes` → `PortfolioOptions`, `Linha` → `Row`, `Tabelas` → `Tables`, `BANCOS` → `BANKS`, `CATEGORIAS` → `CATEGORIES`, `gerarCarteira` → `generatePortfolio`; option keys `ultimaFoto` → `lastSnapshot`, `meses` → `months`, and every other key to English |
| `real-estate-schemas.mjs` | `IMOBILIARIA_SCHEMA` → `REAL_ESTATE_SCHEMA`, `IMOBILIARIA_CHAVES` → `REAL_ESTATE_KEYS`, `IMOBILIARIA_ENTIDADES` → `REAL_ESTATE_ENTITIES`; re-exports `toTableFields`, `missingColumns` |
| `synthetic-real-estate.ts` | `OpcoesImobiliaria` → `RealEstateOptions`, `gerarImobiliaria` → `generateRealEstate`; option keys `ultimaFoto` → `lastSnapshot`, `meses` → `months`, `imoveis` → `properties`, and the rest to English |
| `real-estate/base.ts` | `Linha` → `Row`, `Tabelas` → `Tables`, `criarRng` → `createRng`, `deIso` → `fromIso`, `fimDoMes` → `endOfMonth`, `inicioDoMes` → `startOfMonth`, `fotosMensais` → `monthlySnapshots`, `primeiroDia` → `firstDay`, `somaDias` → `addDays`, `somaMeses` → `addMonths`, `diasEntre` → `daysBetween`, `mesesEntre` → `monthsBetween`, `diaNoMes` → `dayOfMonth`, `carimbo` → `timestampOf`, `mesDe` → `monthOf`, `arred` → `roundTo` (`Rng`, `iso`, `id` stay) |
| `real-estate/universe.ts` | `UNIDADES` → `BRANCHES`, `UnidadeId` → `BranchId`, `DEPARTAMENTOS` → `DEPARTMENTS`, `DepartamentoSlug` → `DepartmentSlug`, `deptId` → `departmentId`, `CARGOS` → `ROLES`, `BAIRROS` → `NEIGHBORHOODS`, `TIPOS_IMOVEL` → `PROPERTY_TYPES`, `FINALIDADES` → `PURPOSES`, `ORIGENS_CAPTACAO` → `SOURCING_CHANNELS`, `STATUS_IMOVEL` → `PROPERTY_STATUSES`, `MOTIVOS_SAIDA` → `EXIT_REASONS`, `FAIXAS_ESTOQUE` → `INVENTORY_AGE_BANDS`, `faixaEstoque` → `inventoryAgeBand`, `FASES` → `PHASES`, `TIPOLOGIAS` → `UNIT_TYPES`, `STATUS_ESPELHO` → `UNIT_STATUSES`, `INCORPORADORAS` → `DEVELOPERS`, `ORIGENS_LEAD` → `LEAD_SOURCES`, `CANAIS_PAGOS` → `PAID_CHANNELS`, `INTERESSES` → `INTERESTS`, `STATUS_LEAD` → `LEAD_STATUSES`, `MOTIVOS_PERDA` → `LOSS_REASONS`, `FAIXAS_VALOR` → `PRICE_BANDS`, `CANAIS_INTERACAO` → `INTERACTION_CHANNELS`, `TIPOS_INTERACAO` → `INTERACTION_TYPES`, `FEEDBACKS` → `FEEDBACKS`, `STATUS_PROPOSTA` → `PROPOSAL_STATUSES`, `FORMAS_PAGAMENTO` → `PAYMENT_METHODS`, `BANCOS` → `BANKS`, `MOTIVOS_DISTRATO` → `CANCELLATION_REASONS`, `GARANTIAS` → `GUARANTEES`, `INDICES` → `ADJUSTMENT_INDEXES`, `STATUS_CONTRATO` → `LEASE_STATUSES`, `MOTIVOS_ENCERRAMENTO` → `TERMINATION_REASONS`, `STATUS_FATURA` → `INVOICE_STATUSES`, `FAIXAS_ATRASO` → `DELINQUENCY_BANDS`, `faixaAtraso` → `delinquencyBand`, `OBJETIVOS_CAMPANHA` → `CAMPAIGN_GOALS`, `NATUREZAS` → `ENTRY_KINDS`, `CATEGORIAS_RECEITA` → `REVENUE_CATEGORIES`, `CATEGORIAS_DESPESA` → `EXPENSE_CATEGORIES`, `STATUS_LANCAMENTO` → `ENTRY_STATUSES`, `TIPOS_CLIENTE` → `CUSTOMER_TYPES`, `ETAPAS_PESQUISA` → `SURVEY_STAGES`, `NOMES` → `FIRST_NAMES`, `SOBRENOMES` → `LAST_NAMES`, `SAZONALIDADE` → `SEASONALITY` |
| `real-estate/structure.ts` | `Corretor` → `Broker`, `Estrutura` → `Structure`, `gerarEstrutura` → `generateStructure`, `ativosEm` → `activeAt`, `sortearCorretor` → `pickBroker` |
| `real-estate/product.ts` | `Imovel` → `Property`, `UnidadeEmp` → `DevelopmentUnit`, `Empreendimento` → `Development`, `gerarImoveis` → `generateProperties`, `gerarEmpreendimentos` → `generateDevelopments`, `linhaImovel` → `propertyRow`, `linhaUnidadeEmp` → `developmentUnitRow`, `linhaEmpreendimento` → `developmentRow` |
| `real-estate/rental.ts` | `Contrato` → `Lease`, `resetContratos` → `resetLeases`, `criarContrato` → `createLease`, `contratoAtivoEm` → `isLeaseActiveAt`, `gerarCarteiraInicial` → `generateInitialLeases`, `Fatura` → `Invoice`, `gerarFaturas` → `generateInvoices`, `gerarCarteiraSnapshot` → `generateLeaseSnapshot`, `linhaContrato` → `leaseRow` |
| `real-estate/funnel.ts` | `Funil` → `Funnel`, `gerarFunil` → `generateFunnel` |
| `real-estate/support.ts` | `aplicarSaidas` → `applyExits`, `gerarEstoqueSnapshot` → `generateInventorySnapshot`, `gerarMarketing` → `generateMarketing`, `gerarFinanceiro` → `generateFinance`, `gerarPesquisas` → `generateSurveys` |
| `metrics/real-estate/_helpers.mjs` | `requiresDe` → `requiresFrom`, `mesFim` → `monthEnd`, `mesRef` → `monthRef`, `faixa` → `band`, `janela12` → `window12`, `mesLabel` → `monthLabel`, `quartis` → `quartiles`, `metaUnidade` → `branchTarget`, `UNIDADES_IDS` → `BRANCH_IDS`, `pivotUnidades` → `pivotBranches` (`CONTRACT`, `sql`, `pin`, `bucket` stay) |
| `metrics/real-estate.mjs`, `templates/real-estate.mjs` | `grupos` → `groups` (`metrics`, `templates` stay) |
| `templates/real-estate/_blocks.mjs` | `pagina` → `page` (block helpers are already English) |
| `seed-real-estate-*.mjs` | exports `CONTRACT_ID`, `PRODUCT_ID`, `CLIENT_ID` stay |
| `bq-validate-real-estate-metrics.ts` | `resolverIdentidade` → `resolveIdentity` |

**CLI flags:** `bq-seed-synthetic-data.ts` → `--domain=vila-rosa|real-estate`,
`--months`, `--contracts`, `--properties`, `--leads`, `--dry-run`.
`bq-validate-real-estate-metrics.ts` → `--end` (was `--fim`), `--only`, `--dataset`, `--dry-run`.
Seeds keep `--dry-run`, `--apply`, `--force`, `--project`, `--database`.

**Locals and messages.** Every local variable, parameter and private function in the
moved files is renamed to English too. Log and error messages are user-facing strings
and may stay in Portuguese. Data values inside arrays (neighbourhood names, statuses
written to BigQuery) are data and do not change.

---

### Task 1: Loader and shared schemas

**Contexts (Read first):**
- `@.contexts/engineering/rules/development.md`
- `@.contexts/engineering/contracts/bigquery.md`
- `@.contexts/engineering/rules/cost.md`

**Files:**
- Create from working tree: `scripts/bq-seed-synthetic-data.ts`, `scripts/lib/synthetic-portfolio.ts`, `scripts/lib/synthetic-portfolio.test.ts`
- Create from branch: `scripts/lib/vila-rosa-schemas.mjs`, `scripts/lib/vila-rosa-schemas.test.ts`
- Modify: the five files above per the rename maps. In the loader, the domain key
  `imobiliaria` becomes `real-estate` and its import points to
  `./lib/synthetic-real-estate` (created in Task 2 — keep the import commented out
  with the domain disabled until Task 2, or do Task 1 and 2 in one commit).

**Interfaces:**
- Produces: `generatePortfolio`, `PortfolioOptions`, `toTableFields`, `missingColumns`,
  loader CLI with English flags.

- [ ] **Step 1: Read contexts.**
- [ ] **Step 2: Rename tests first** (update imports and expectations to the English names) — they fail.
- [ ] **Step 3: Run** `pnpm exec vitest run scripts/lib/synthetic-portfolio.test.ts scripts/lib/vila-rosa-schemas.test.ts` — expect FAIL.
- [ ] **Step 4: Rename implementation.**
- [ ] **Step 5: Run the same tests — expect PASS**; `pnpm exec tsc --noEmit` — exit 0.
- [ ] **Step 6: Append progress ledger.**
- [ ] **Step 7: Commit** `feat(demo): add synthetic data loader with English identifiers`.

**Verify:**
- `pnpm exec tsx scripts/bq-seed-synthetic-data.ts --domain=vila-rosa --dry-run` prints table counts and writes nothing.

### Task 2: Real estate generator

**Contexts (Read first):**
- `@.contexts/engineering/rules/development.md`
- `@.contexts/engineering/rules/testing.md`

**Files:**
- Create (moved + renamed): `scripts/lib/real-estate/{base,universe,structure,product,rental,funnel,support}.ts`,
  `scripts/lib/real-estate-schemas.mjs`, `scripts/lib/real-estate-schemas.test.ts`,
  `scripts/lib/synthetic-real-estate.ts`, `scripts/lib/synthetic-real-estate.test.ts`
- Modify: `scripts/bq-seed-synthetic-data.ts` — enable domain `real-estate`.

**Interfaces:**
- Produces: `generateRealEstate(options: RealEstateOptions): Tables`, `REAL_ESTATE_SCHEMA`,
  `REAL_ESTATE_KEYS`, `REAL_ESTATE_ENTITIES`.
- Output tables and columns are **byte-for-byte the same names** as today.

- [ ] **Step 1: Read contexts.**
- [ ] **Step 2: Move tests and rename their imports** — expect FAIL.
- [ ] **Step 3: Run** `pnpm exec vitest run scripts/lib/real-estate-schemas.test.ts scripts/lib/synthetic-real-estate.test.ts` — expect FAIL.
- [ ] **Step 4: Move and rename the eight source files.**
- [ ] **Step 5: Run the tests — expect PASS**; `pnpm exec tsc --noEmit` — exit 0.
- [ ] **Step 6: Append progress ledger.**
- [ ] **Step 7: Commit** `feat(demo): add real estate synthetic data generator`.

**Verify:**
- Determinism check: with the same seed, the table names, column names and row counts
  equal the branch version. Run on both and compare:
  `pnpm exec tsx scripts/bq-seed-synthetic-data.ts --domain=real-estate --dry-run`
  (branch: `--domain=imobiliaria`). Expected: identical counts for the 20 tables.

### Task 3: Metric recipes

**Contexts (Read first):**
- `@.contexts/engineering/contracts/semantic-layer.md`
- `@.contexts/engineering/rules/development.md`

**Files:**
- Create (moved + renamed): `scripts/metrics/real-estate.mjs`, `scripts/metrics/real-estate/*.mjs` (9 files),
  `scripts/metrics/__tests__/real-estate-shapes.test.ts`

**Interfaces:**
- Produces: `metrics` (268 entries) and `groups`. **Metric ids and SQL are unchanged.**

- [ ] **Step 1: Read contexts.**
- [ ] **Step 2: Move the shapes test, rename imports** — expect FAIL.
- [ ] **Step 3: Run** `pnpm exec vitest run scripts/metrics/__tests__/real-estate-shapes.test.ts` — expect FAIL.
- [ ] **Step 4: Move and rename.**
- [ ] **Step 5: Run — expect PASS.** Also assert no recipe changed:
  `node -e` script that imports both versions (branch checkout in a temp worktree) and
  compares `JSON.stringify(metrics.map(m => [m.id, m.recipe]))` — expect equal.
- [ ] **Step 6: Append progress ledger.**
- [ ] **Step 7: Commit** `feat(demo): add real estate metric recipes`.

**Verify:** 268 metrics, ids `imobiliaria.*`, recipes identical to branch `49fbf0e`.

### Task 4: Dashboard templates and category

**Contexts (Read first):**
- `@.contexts/engineering/rules/development.md`
- `adrs/decisions/0022-contrato-de-bloco-como-regua-unica-de-layout.md`

**Files:**
- Create (moved + renamed): `scripts/templates/real-estate.mjs`, `scripts/templates/real-estate/*.mjs` (9 files),
  `scripts/templates/__tests__/real-estate-templates.test.ts`
- Modify (from branch, unchanged): `src/shared/schemas/dashboard-template.ts`,
  `src/shared/config/dashboard-templates.ts`, `src/shared/lib/firestore/dashboard-templates.ts`,
  `src/features/templates/ui/TemplateMetaFields.tsx` — add `'Imobiliária'` to the category.

**Interfaces:**
- Produces: `templates` (25) and `groups`. **Template ids unchanged.**

- [ ] **Step 1: Read contexts.**
- [ ] **Step 2: Move the templates test, rename imports** — expect FAIL.
- [ ] **Step 3: Run** `pnpm exec vitest run scripts/templates/__tests__/real-estate-templates.test.ts` — expect FAIL.
- [ ] **Step 4: Move, rename, apply the category change.**
- [ ] **Step 5: Run — expect PASS**; `pnpm exec tsc --noEmit` — exit 0.
- [ ] **Step 6: Append progress ledger.**
- [ ] **Step 7: Commit** `feat(demo): add real estate dashboard templates`.

**Verify:** the test confirms every block shape is accepted, every column and dataKey
exists in its metric, and every metric is used by some template.

### Task 5: Seeds and recipe validator

**Contexts (Read first):**
- `@.contexts/engineering/contracts/firebase-firestore.md`
- `@.contexts/engineering/rules/security.md`
- `@.contexts/engineering/rules/cost.md`

**Files:**
- Create (moved + renamed): `scripts/seed-real-estate-{contract,client,metrics,templates,reports}.{mjs,ts}`,
  `scripts/bq-validate-real-estate-metrics.ts`
- Modify: imports to the new module paths and names; `--fim` becomes `--end`.

**Interfaces:**
- Each seed: `--dry-run | --apply [--force]`, reads the database from
  `DATAVIZ_DATABASE_ID` (via `resolveDatabaseId` in `scripts/lib/gcp-ids.mjs`; the
  templates seed reads the same variable directly). Exit code 0 on success, non-zero on
  any failure.
- Validator: exit 0 when all 268 recipes execute and return the declared columns.

- [ ] **Step 1: Read contexts.**
- [ ] **Step 2: Move and rename.**
- [ ] **Step 3: Run every seed with `--dry-run`** against a non-production database —
  expect the same counts the branch prints (contract 20 entities / 255 attributes,
  1 client, 268 metrics, 25 templates, 8 groups / 25 reports).
- [ ] **Step 4: Run** `pnpm exec tsc --noEmit` — exit 0.
- [ ] **Step 5: Append progress ledger.**
- [ ] **Step 6: Commit** `feat(demo): add real estate seeds and recipe validator`.

**Verify:** dry-run counts above; `pnpm exec tsx scripts/bq-validate-real-estate-metrics.ts --dry-run` lists 268 recipes.

### Task 6: `pnpm demo:real-estate` orchestrator

**Contexts (Read first):**
- `@.contexts/engineering/rules/security.md`
- `@.contexts/engineering/processes/environments.md`
- `@.contexts/engineering/rules/error-handling.md`
- `@.contexts/engineering/rules/testing.md`
- `scripts/seed-provisioning.ts` (production guard pattern)

**Files:**
- Create: `scripts/lib/real-estate-demo.ts` — pure planning logic, no I/O.
- Test: `scripts/lib/real-estate-demo.test.ts`
- Create: `scripts/demo-real-estate.ts` — thin runner: parses args, calls the planner,
  executes steps with `spawn(command, args, { stdio: 'inherit', env })`, stops on the
  first non-zero exit.
- Modify: `package.json` — add `"demo:real-estate": "tsx --env-file-if-exists=.env.local scripts/demo-real-estate.ts"`.

**Interfaces:**
- `parseDemoArgs(argv: string[]): DemoArgs` where
  `DemoArgs = { mode: 'dry-run' | 'apply' | 'teardown'; database: string | null; project: string | null; allowProd: boolean; force: boolean; confirm: boolean }`.
  `--apply` and `--teardown` are mutually exclusive; neither means dry-run.
  `--confirm` is only valid with `--teardown`: without it the teardown only lists what
  it would delete; with it, it deletes.
- `checkDemoTarget(args: DemoArgs, productionDatabase: string): { ok: true } | { ok: false; reason: string }`
  — fails when `--database` is missing, or when it equals the production database and
  `--allow-prod` is absent.
- `buildApplySteps(args): DemoStep[]` where `DemoStep = { label: string; command: string; args: string[] }`, in this order:
  1. load BigQuery data — `bq-seed-synthetic-data.ts --domain=real-estate` (+ `--dry-run` in dry-run);
  2. validate recipes — `bq-validate-real-estate-metrics.ts` (`--dry-run` in dry-run);
  3. contract and product — `seed-real-estate-contract.mjs`;
  4. client — `seed-real-estate-client.mjs`;
  5. metrics — `seed-real-estate-metrics.mjs`;
  6. templates — `seed-real-estate-templates.ts`;
  7. reports — `seed-real-estate-reports.mjs`.
  Seeds get `--apply` or `--dry-run`, and `--force` when `force` is set.
- `buildTeardownTargets(): { firestore: string[]; firestorePrefixes: { collection: string; idPrefix: string }[]; bigqueryDatasets: string[] }`:
  - `firestore` (recursive delete): `clients/imob-demo`, `dataContracts/imobiliaria`, `products/imobiliaria`;
  - `firestorePrefixes`: `{ collection: 'metrics', idPrefix: 'imobiliaria.' }`, `{ collection: 'dashboardTemplates', idPrefix: 'imobiliaria-' }`;
  - `bigqueryDatasets`: `imobiliaria_demo`.
- Runner env for every step: `DATAVIZ_DATABASE_ID=<database>` and, when given,
  `GOOGLE_CLOUD_PROJECT=<project>`.
- `--teardown` alone prints each target with its document or table count;
  `--teardown --confirm` deletes them, subject to the same production guard.
- Teardown does **not** remove `imob-demo` from users' `clientIds` claims; it prints the
  `grant-claims` command needed to remove it.
- End of apply prints the command to grant access:
  `pnpm tsx scripts/grant-claims.ts --email=<you> --clientIds=<current>,imob-demo`.

- [ ] **Step 1: Read contexts.**
- [ ] **Step 2: Write failing tests** for `parseDemoArgs` (defaults, exclusive flags,
  `--confirm` without `--teardown` rejected, unknown flag rejected), `checkDemoTarget` (missing database, production without
  flag, production with flag, non-production), `buildApplySteps` (order, dry-run vs
  apply flags, `--force` pass-through) and `buildTeardownTargets` (exact targets above).
- [ ] **Step 3: Run** `pnpm exec vitest run scripts/lib/real-estate-demo.test.ts` — expect FAIL.
- [ ] **Step 4: Implement** the planner, then the runner. Firestore deletes use
  `db.recursiveDelete(ref)`; prefix deletes query by document id range
  (`orderBy('__name__').startAt(prefix).endAt(prefix + '')`), as
  `seed-imobiliaria-metrics.mjs` already does. BigQuery uses
  `bq.dataset(id).delete({ force: true })`.
- [ ] **Step 5: Run tests — expect PASS**; `pnpm exec tsc --noEmit` — exit 0.
- [ ] **Step 6: Append progress ledger.**
- [ ] **Step 7: Commit** `feat(demo): add on-demand runner for the real estate demo`.

**Verify (against a non-production database, e.g. `dataviz-dev`):**
1. `pnpm demo:real-estate --database=dataviz-dev` → seven steps in dry-run, nothing written.
2. `pnpm demo:real-estate --database=dataviz` → refused (production).
3. `pnpm demo:real-estate --database=dataviz-dev --apply` → all steps exit 0.
4. Run step 3 again → every seed reports "already existed", nothing duplicated.
5. Grant the claim, open the app, open `imob-demo` → Painel Executivo loads with a period selector.
6. `pnpm demo:real-estate --database=dataviz-dev --teardown` → lists targets; `--teardown --confirm` → removes them; a second `--teardown` lists zero.

### Task 7: Documentation and cleanup

**Contexts (Read first):**
- `@.contexts/engineering/rules/documentation.md`

**Files:**
- Modify: `README.md` — replace section 4.1b with a short section "Demo de imobiliária
  (sob demanda)": what it creates, the three commands, the non-production requirement,
  how to grant access and how to remove it.
- Create (moved): `docs/real-estate-demo-catalog.md`; update the paths it cites.
- Modify: `package.json` — keep only `demo:real-estate`; the seven per-step scripts
  from the branch are not added.

- [ ] **Step 1: Read contexts.**
- [ ] **Step 2: Write the README section and move the catalog.**
- [ ] **Step 3: Identifier check** — list declared identifiers in the moved code and
  review for Portuguese:
  `grep -rhoE "(const|let|function|type|interface|class)\s+\w+" scripts/lib/real-estate scripts/lib/real-estate-*.* scripts/lib/synthetic-*.ts scripts/metrics/real-estate* scripts/templates/real-estate* scripts/seed-real-estate-* scripts/bq-*.ts scripts/demo-real-estate.ts | sort -u`
  Expected: English only, except data names used as values.
- [ ] **Step 4: Full suite** `pnpm test` and `pnpm exec tsc --noEmit` — no new failures versus the baseline recorded before Task 1.
- [ ] **Step 5: Append progress ledger.**
- [ ] **Step 6: Commit** `docs(demo): document the on-demand real estate demo`.

---

## Delivery

- One PR from `feat/real-estate-demo-runner` to `main`, squash merge.
- After merge: delete `feat/real-estate-demo` (local and remote).
- Rollback: revert the PR. The demo writes only to documents and a dataset that
  `--teardown` removes, and `main` code outside `scripts/` changes only by the
  `'Imobiliária'` category value.

## Self-review

1. Every requirement covered: English identifiers (maps + Task 7 check), demo on `main`
   (Tasks 1–5), on-demand command with dry-run, apply and teardown (Task 6),
   dependency on the filter-options fix (Global Constraints), docs (Task 7).
2. Versions match `package.json` and MEMORY.
3. Every task lists contexts to read.
4. No placeholders; commands and targets are explicit.
