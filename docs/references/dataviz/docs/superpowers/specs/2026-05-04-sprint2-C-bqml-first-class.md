# Sprint 2.C — BQML como Tools de Primeira Classe (envelopando `bqml-utils.ts`)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recommended) ou `superpowers:executing-plans` para implementar task-a-task. Sub-skills mandatórias por task: `superpowers:test-driven-development`, `superpowers:verification-before-completion`, `superpowers:systematic-debugging`. Agentes especialistas: `credit-risk-analyst` (validar templates de inadimplência/PDD/safra) e `Explore` (mapear callers atuais de `bqml-utils.ts`).

**Goal:** Expor BQML como tools tipadas no Canvas Orchestrator e nos agents analíticos (descritivo, diagnóstico, **predictive-agent**, **monitoring-agent**, prescritivo), envelopando os helpers existentes em `src/features/ai-agents/tools/bqml-utils.ts` (`trainModel`, `queryBQML`, `modelRef`, `safeColumn`, `dropModel`, `sessionModelRef`). Adicionar cache **per-tenant** com invalidação por DDL hash, gate de aprovação por bytes/$ estimados, preliminary streaming durante CREATE MODEL, decision tree de problema → modelo, templates por domínio (forecast inadimplência, clustering safras, propensity-to-default, anomaly PDD) e tool `schema.describe_relationships`.

**Architecture:**
- **Não recriamos** os helpers — toda tool envelopa os helpers já existentes em `bqml-utils.ts` (`trainModel`, `queryBQML`, `modelRef`, `safeColumn`, `dropModel`, `sessionModelRef`). Spec **proíbe** duplicar ou reescrever assinaturas desses helpers.
- **Dataset segregado por tenant** (ADR-0007 aceita): `liquid_bqml_<client>` com Service Account dedicada `liquid-bqml-sa` recebendo `bigquery.dataEditor` + `bigquery.jobUser` + `bigquery.models.create` apenas nesses datasets. Datasets de leitura (`liquid_play_om`, `liquid_play_brz`, `liquid_play_conx`, `liquid_play_imcasa`) permanecem read-only sob a SA atual. Multi-tenancy enforced (ADR-0006) via prefixo de model ref + `assertClientMatchesDataset(clientId, modelRef)` em runtime antes de qualquer chamada BQ.
- **Cache per-tenant** (ADR-0007 §Cache): registry em `liquid_meta.bqml_model_registry` indexado por `hash = sha1(client_id || intent || features_canonical || target || safra_window_end || source_columns_ddl_hash)`. Hit → reusa modelo; miss → cria com `needsApproval` quando custo estimado > $5 USD **ou** bytes > 5GB.
- **Templates** parametrizados em `src/features/ai-agents/tools/bqml/templates/{forecast,clustering,classification,anomaly}.ts` retornando string DDL via funções puras (testáveis).
- **Preliminary results**: `async *execute` em `bqml.create_or_use_model` faz polling do BigQuery job e yields `{ status: 'training', progress, etaMs }` a cada N segundos; resultado final é `{ status: 'ready', modelRef, metrics }`.
- **Logging**: cada invocação BQML em `liquid_meta.bqml_invocations` (mesmo padrão fire-and-forget de `liquid_meta.sql_generations` da Sprint 1.C).
- **Repair budget**: `experimental_repairToolCall` (callback do AI SDK §4.3, **não tool**) cap 2 retries para SQL gerada por `bqml.forecast/predict/detect_anomalies` — reutiliza o callback já implementado na Sprint 1.C apenas estendendo a allow-list. **Não replicar** o callback nem mover de Sprint.

**Tech Stack:**
- AI SDK v6 §4.3 (`needsApproval` async, preliminary results `async *execute`, multi-modal `toModelOutput` com text + base64 PNG quando aplicável; `experimental_repairToolCall` é callback do request, não tool)
- `@google-cloud/bigquery@^8.1.1` (versão fixada em `package.json`)
- Zod 4 com `.nullable()` (Vertex Gemini strict mode)
- Vitest 4.x (infra Sprint 1.A)
- Sprint 1.C dependencies: `liquid_meta.sql_generations`, `bq.dry_run_sql`, `experimental_repairToolCall`, schema enriquecido (`get_table_schema_v2`) — **prerequisite, devem estar mergeados**.

---

## Contexto pré-leitura obrigatória

Antes de iniciar qualquer task, leia integralmente:

- `docs/superpowers/plans/2026-05-04-mastra-tools-sql-bqml.md` — §3 (catalog `bqml.*`), §4 (custo BQML, IAM, schema drift, cache per-tenant), §6 (smart BQML decision tree), §8 (observabilidade).
- `docs/superpowers/plans/2026-05-04-sprint1-C-bq-dry-run-repair.md` — Tasks 5, 6, 8 (padrão de logger e repair callback que esta sprint reusa).
- `src/features/ai-agents/tools/bqml-utils.ts` (~98 LOC) — helpers JÁ EXISTENTES (`trainModel`, `queryBQML`, `modelRef`, `safeColumn`, `dropModel`, `sessionModelRef`, `safeWhereClause`, `safeDate`, `safeDateOrMonth`). **Spec ENVELOPA, NÃO recria. Não modificar assinaturas; qualquer duplicação em arquivos novos deve ser revertida em code review.**
- `src/features/canvas-orchestrator/tools/query-data.ts` — já recebe `bqmlEnabled`; integração existente é referência para como tools BQML herdam o flag.
- `adrs/decisions/0006-multi-tenancy-strict-isolation.md` (aceita) — base para `assertClientMatchesDataset`.
- `adrs/decisions/0007-bqml-dataset-dedicado-por-tenant.md` (aceita) — base para datasets, IAM, registry e cache.
- `src/features/ai-agents/tools/tool-context.ts` — `ToolContext { dataset, filters, sessionId }`. Esta sprint expande para incluir `clientId` derivado de `filters` ou injetado pela rota.
- `src/features/ai-agents/tools/forecast-timeseries.ts` (8.2K) — pattern atual de forecast (Python SARIMAX); BQML tools convivem como alternativa preferida quando dados ficam em BQ.
- `src/features/ai-agents/tools/run-clustering.ts` (5.3K) — pattern atual de clustering; BQML KMEANS substitui quando aplicável.
- `src/features/ai-agents/tools/detect-anomalies.ts` (5.8K) — pattern atual; BQML AUTOENCODER/ARIMA_PLUS substitui em séries temporais.
- `src/features/canvas-orchestrator/orchestrator.ts` — wire das tools. Hoje registra **23 tools** (`plan_analysis`, `create_page`, `add_text_block`, `add_kpi_block`, `add_chart_block`, `add_table_block`, `move_block`, `remove_block`, `update_text_block`, `update_kpi_block`, `update_chart_block`, `update_table_block`, `query_data`, `get_filter_options`, `get_table_schema`, `get_sample_data`, `set_filters`, `analyze`, `declare_layout`, `fill_block`, `add_slot`, `remove_slot`, e `submit_block_data` na nova rota). Sprint 2.C adiciona +8 (`bqml_list_models`, `bqml_suggest_model`, `bqml_create_or_use_model`, `bqml_forecast`, `bqml_predict`, `bqml_detect_anomalies`, `schema_describe_relationships`, mais fixtures de teste).
- `src/shared/config/agents/canvas-orchestrator.ts`, `predictive-agent.ts`, `monitoring-agent.ts` — system prompts a estender.
- `src/shared/lib/bigquery/client.ts` — `getBigQueryClient()`, `parseDatasetRef`.
- `src/shared/lib/bigquery/identifier.ts` — `safeIdentifier`, `quoteTableRef`.
- `adrs/vercel-ai-sdk.md` §4.3 (preliminary results, needsApproval, multi-modal toModelOutput).

API BigQuery relevante:
- `bigquery.createQueryJob({ query: ddl, dryRun: true })` para estimar bytes ANTES de submeter CREATE MODEL.
- `bigquery.createQueryJob({ query: ddl })` retorna `[job]`; `job.getMetadata()` polled retorna `metadata.status.state in ('PENDING'|'RUNNING'|'DONE')` e `metadata.statistics.query.totalBytesProcessed`.
- `bigquery.dataset(id).model(name).getMetadata()` para ler metrics pós-training.
- `bigquery.dataset(id).getModels()` para listagem.

---

## Convenções

- TDD obrigatório (`superpowers:test-driven-development`). Cada task com produto novo começa por teste vermelho.
- Zod: `.nullable()` em vez de `.optional()`.
- Imports absolutos com `@/`.
- Mocks: `vi.mock('@google-cloud/bigquery', ...)`; reusar fixtures Sprint 1.A.
- Logs telemetria: fire-and-forget, **nunca** propagar erro.
- Tool `description` em PT-BR (consistência com prompts).
- **Multi-tenant safety**: toda tool BQML recebe `clientId` no `ToolContext` e valida com `assertClientMatchesDataset(clientId, modelRef)` antes de qualquer operação. Tentar acessar modelo de outro tenant → `Error: 'Cross-tenant model access denied'` e log de segurança.

---

## File Structure

```
adrs/decisions/
  0006-multi-tenancy-strict-isolation.md          [JÁ ACEITA — não recriar]
  0007-bqml-dataset-dedicado-por-tenant.md        [JÁ ACEITA — não recriar]

scripts/
  bq-bootstrap-bqml-datasets.ts                   [novo - idempotente]
  bq-bootstrap-bqml-datasets.sql                  [novo - DDL multi-cliente]
  bq-bootstrap-bqml-registry.sql                  [novo - liquid_meta.bqml_model_registry + bqml_invocations]

src/features/ai-agents/tools/bqml/
  templates/
    forecast.ts                                   [novo - ARIMA_PLUS / BOOSTED_TREE_REGRESSOR]
    clustering.ts                                 [novo - KMEANS]
    classification.ts                             [novo - LOGISTIC_REG / BOOSTED_TREE_CLASSIFIER]
    anomaly.ts                                    [novo - AUTOENCODER / ML.DETECT_ANOMALIES]
    __tests__/
      forecast.test.ts
      clustering.test.ts
      classification.test.ts
      anomaly.test.ts
  cache.ts                                        [novo - hash + registry lookup]
  invocation-logger.ts                            [novo - liquid_meta.bqml_invocations fire-and-forget]
  multi-tenancy.ts                                [novo - assertClientMatchesDataset, deriveBqmlDataset]
  list-models.ts                                  [novo - tool factory]
  suggest-model.ts                                [novo - tool factory]
  create-or-use-model.ts                          [novo - tool factory async *execute]
  forecast.ts                                     [novo - tool factory wrap ML.FORECAST]
  predict.ts                                      [novo - tool factory wrap ML.PREDICT]
  detect-anomalies.ts                             [novo - tool factory wrap ML.DETECT_ANOMALIES]
  __tests__/
    cache.test.ts
    multi-tenancy.test.ts
    list-models.test.ts
    suggest-model.test.ts
    create-or-use-model.test.ts
    forecast.test.ts
    predict.test.ts
    detect-anomalies.test.ts
    invocation-logger.test.ts

src/features/ai-agents/tools/schema/
  describe-relationships.ts                       [novo - heurística FK + sample JOIN]
  __tests__/
    describe-relationships.test.ts

src/features/ai-agents/lib/
  repair-sql.ts                                   [editar - estender allow-list para bqml.* tools]

src/features/canvas-orchestrator/
  orchestrator.ts                                 [editar - registrar 7 tools BQML + describe_relationships]

src/shared/config/agents/
  canvas-orchestrator.ts                          [editar - bloco "Disciplina BQML" + decision tree]
  predictive-agent.ts                             [editar - registrar tools BQML + prompt]
  monitoring-agent.ts                             [editar - registrar tools BQML + prompt]

docs/observability/
  bqml-setup.md                                   [novo - IAM, datasets, custos, runbook]

.env.example                                      [editar - BQML_ENABLED, BQML_APPROVAL_BYTES_THRESHOLD, BQML_INVOCATIONS_LOGGING]
```

---

## Task 1 — Confirmar ADRs aceitas (NÃO criar novos)

**Objetivo:** validar que decisões arquiteturais já estão registradas e referenciar nas seções subsequentes; **não criar novos ADRs**.

- [ ] Confirmar que `adrs/decisions/0006-multi-tenancy-strict-isolation.md` (aceita) governa `assertClientMatchesDataset` + filtro `WHERE client_id` em todas as tabelas `liquid_meta.*`. Se houver gap, **abrir issue** — não amendar ADR aqui.
- [ ] Confirmar que `adrs/decisions/0007-bqml-dataset-dedicado-por-tenant.md` (aceita) define:
  - Dataset `liquid_bqml_<client>` por tenant.
  - Service Account `liquid-bqml-sa` com `bigquery.dataEditor` + `bigquery.jobUser` + `bigquery.models.create` apenas nesses datasets.
  - Cache em `liquid_meta.bqml_model_registry` com hash `sha1(client_id || intent || features_canonical || target || safra_window_end || source_columns_ddl_hash)`.
  - `needsApproval` em jobs com custo estimado > $5 USD **ou** bytes > 5GB.
  - SLO: ≤ 100GB de training cumulativos por cliente/mês; alarme em 70%.
- [ ] Atualizar `docs/observability/bqml-setup.md` (Task 2) referenciando ambos ADRs por caminho absoluto.
- [ ] **Proibido**: criar `docs/adrs/ADR-003*.md` ou `ADR-004*.md` ou modificar 0006/0007. Qualquer divergência entre spec e ADRs aceitas resolve-se em favor do ADR.

**Critério de aceite:** revisor confirma que spec não introduz ADR novo; cada referência arquitetural cita explicitamente 0006 ou 0007 com caminho absoluto.

---

## Task 2 — Migration: bootstrap datasets BQML por tenant + registry

**Objetivo:** scripts idempotentes para criar `liquid_bqml_<client>` e tabelas de registry/invocations.

- [ ] Criar `scripts/bq-bootstrap-bqml-datasets.sql`:
  ```sql
  -- Substitui ${PROJECT_ID}, ${BQ_LOCATION}, ${CLIENT}
  CREATE SCHEMA IF NOT EXISTS `${PROJECT_ID}.liquid_bqml_${CLIENT}`
    OPTIONS (
      location = '${BQ_LOCATION}',
      default_table_expiration_ms = NULL,
      labels = [('owner', 'liquid-bqml'), ('tenant', '${CLIENT}')]
    );
  ```
- [ ] Criar `scripts/bq-bootstrap-bqml-registry.sql`:
  ```sql
  -- Schema alinhado com ADR-0007 (PK lógica: (hash, client_id))
  CREATE TABLE IF NOT EXISTS `${PROJECT_ID}.liquid_meta.bqml_model_registry` (
    hash STRING NOT NULL,             -- sha1 determinístico (ADR-0007)
    client_id STRING NOT NULL,
    intent STRING NOT NULL,           -- 'forecast'|'clustering'|'classification'|'anomaly'
    model_type STRING NOT NULL,       -- 'ARIMA_PLUS'|'KMEANS'|'LOGISTIC_REG'|'BOOSTED_TREE_*'|'AUTOENCODER'
    model_ref STRING NOT NULL,        -- `liquid_bqml_<client>.model_<hash8>`
    features_canonical STRING NOT NULL,
    target STRING,
    safra_window_end DATE,
    source_columns_ddl_hash STRING NOT NULL,
    train_bytes INT64,
    train_cost_usd FLOAT64,
    metrics_json JSON,
    created_at TIMESTAMP NOT NULL,
    last_used_at TIMESTAMP,
    use_count INT64
  )
  PARTITION BY DATE(created_at)
  CLUSTER BY client_id, intent;

  CREATE TABLE IF NOT EXISTS `${PROJECT_ID}.liquid_meta.bqml_invocations` (
    id STRING NOT NULL,
    ts TIMESTAMP NOT NULL,
    client_id STRING,
    session_id STRING,
    agent_id STRING,
    tool_name STRING,                 -- 'bqml.create_or_use_model' etc
    intent STRING,
    hash STRING,                      -- FK lógica para bqml_model_registry.hash
    model_ref STRING,                 -- `liquid_bqml_<client>.model_<hash8>`
    cache_hit BOOL,
    bytes_estimated INT64,
    bytes_processed INT64,
    cost_usd FLOAT64,
    duration_ms INT64,
    success BOOL,
    error STRING,
    approved_by_user BOOL
  )
  PARTITION BY DATE(ts)
  CLUSTER BY client_id, tool_name, success;
  ```
- [ ] Criar `scripts/bq-bootstrap-bqml-datasets.ts`:
  - Lê `BIGQUERY_PROJECT_ID`, `BIGQUERY_LOCATION` do env.
  - Lista de clients hardcoded: `['om', 'brz', 'conx', 'imcasa']` (extrair de `src/shared/config/clients.ts` se existir).
  - Para cada client, executa SQL substituindo placeholders.
  - Executa registry SQL uma vez.
  - Idempotente; loga `[bootstrap-bqml] dataset liquid_bqml_om criado / já existia`.
- [ ] Adicionar npm script: `"bq:bootstrap-bqml": "tsx scripts/bq-bootstrap-bqml-datasets.ts"`.
- [ ] Documentar IAM em `docs/observability/bqml-setup.md` referenciando `adrs/decisions/0007-bqml-dataset-dedicado-por-tenant.md`:
  - Service Account `liquid-bqml-sa` com roles **conforme ADR-0007**: `bigquery.dataEditor` + `bigquery.jobUser` + `bigquery.models.create` em `liquid_bqml_<client>` (4 datasets); `bigquery.metadataViewer` nos datasets de leitura.
  - Pré-check no startup do route `/api/ai/canvas` (Task 14) valida que a SA possui `bigquery.models.create` no dataset alvo: tenta `bigquery.dataset('liquid_bqml_<client>').get()` **e** um `dryRun` de `CREATE OR REPLACE MODEL` mínimo. Falha fechado se faltar permissão (tools BQML são desativadas para a sessão; não quebra canvas).
  - Custos esperados: ARIMA_PLUS $250/TB; LOGISTIC_REG/KMEANS/BOOSTED_TREE $6.25/TB. Threshold default `BQML_APPROVAL_BYTES_THRESHOLD=5368709120` (5GB) **ou** custo > $5 USD (ADR-0007).
  - Runbook de revogação de tenant (revoga `dataEditor` e mantém histórico no registry).

**Critério de aceite:**
- `pnpm bq:bootstrap-bqml` em dev cria 4 datasets + 2 tabelas; segunda execução não falha.
- `bq ls liquid_bqml_om` retorna dataset; `bq show liquid_meta.bqml_model_registry` exibe schema.

---

## Task 3 — `multi-tenancy.ts`: assertClientMatchesDataset + deriveBqmlDataset

**Objetivo:** helpers de segurança para enforcing tenant isolation.

- [ ] Criar `src/features/ai-agents/tools/bqml/__tests__/multi-tenancy.test.ts`:
  - [ ] Test: `deriveBqmlDataset('om')` → `'liquid_bqml_om'`.
  - [ ] Test: `deriveBqmlDataset('OM')` → `'liquid_bqml_om'` (lowercase).
  - [ ] Test: `deriveBqmlDataset('foo; DROP --')` lança `'Invalid client id'`.
  - [ ] Test: `assertClientMatchesDataset('om', 'liquid_bqml_om.bqml_x')` resolve.
  - [ ] Test: `assertClientMatchesDataset('om', 'liquid_bqml_brz.bqml_x')` lança `'Cross-tenant model access denied'` e chama `recordSecurityEvent`.
  - [ ] Test: `assertClientMatchesDataset('om', 'liquid_play_om.bqml_x')` lança (não é dataset BQML).
- [ ] Criar `src/features/ai-agents/tools/bqml/multi-tenancy.ts`:
  - Allow-list `KNOWN_CLIENTS = ['om','brz','conx','imcasa']`.
  - `deriveBqmlDataset(clientId)`: lower, validar contra allow-list, retornar `liquid_bqml_${id}`.
  - `assertClientMatchesDataset(clientId, modelRef)`: regex `/^`?(?:[\w-]+\.)?liquid_bqml_(\w+)\.bqml_/`; comparar com `clientId`.
  - `recordSecurityEvent(payload)`: emit log estruturado (reusa `recordSpan` se Sprint 1.B existir).

**Critério de aceite:** cobertura ≥ 90% (segurança); teste adversarial cross-tenant comprovadamente falha.

---

## Task 4 — Tool `bqml.list_models`

**Objetivo:** listar modelos do dataset BQML do tenant atual com cache 1h.

- [ ] Criar `src/features/ai-agents/tools/bqml/__tests__/list-models.test.ts`:
  - [ ] Test: factory recebe `ToolContext{ clientId: 'om' }`; mockar `bigquery.dataset('liquid_bqml_om').getModels()` retornando `[{ id: 'bqml_forecast_inad_safra' }, ...]`.
  - [ ] Test: input vazio (zero args) válido; output `{ models: [{ name, intent, modelType, createdAt, lastUsedAt }] }` (intent/modelType vêm do registry).
  - [ ] Test: cross-tenant — passar `clientId: 'brz'` mas tentar acessar dataset `om` via input → bloqueado (na verdade a tool não recebe dataset de input, sempre deriva do `clientId`).
  - [ ] Test: cache hit — duas chamadas em 1h → 1 round-trip BQ.
- [ ] Criar `src/features/ai-agents/tools/bqml/list-models.ts`:
  - Factory `createBqmlListModelsTool(ctx: ToolContext & { clientId: string })`.
  - InputSchema vazio (Zod `z.object({}).strict()`).
  - Pipeline: derive dataset → list models via SDK → JOIN com `liquid_meta.bqml_model_registry WHERE client_id = @client` para enriquecer.
  - Cache `Map<clientId, { models, expiresAt }>`, TTL 1h.

**Critério de aceite:** cobertura ≥ 80%; nenhuma chamada real a BQ em testes.

---

## Task 5 — Templates por intent (forecast, clustering, classification, anomaly)

**Objetivo:** funções puras que geram CREATE MODEL DDL parametrizado, com snippets de cada caso da decision tree.

> **Sub-skill obrigatória:** dispatch `credit-risk-analyst` para validar features e horizon defaults dos templates de inadimplência/PDD/safra.

- [ ] Criar `src/features/ai-agents/tools/bqml/templates/__tests__/forecast.test.ts`:
  - [ ] Test ARIMA_PLUS: `buildForecastDdl({ kind: 'arima_plus', dataset, modelName, target: 'inadimplencia_pct', timeColumn: 'data_safra', horizon: 12, holidayRegion: 'BR', sourceQuery })` retorna DDL contendo `CREATE OR REPLACE MODEL`, `MODEL_TYPE='ARIMA_PLUS'`, `TIME_SERIES_DATA_COL='inadimplencia_pct'`, `HORIZON=12`, `HOLIDAY_REGION='BR'`.
  - [ ] Test BOOSTED_TREE_REGRESSOR (forecast multivariado): mesmo formato com `MODEL_TYPE='BOOSTED_TREE_REGRESSOR'` e `INPUT_LABEL_COLS`.
  - [ ] Test column safety: target inválido (`'foo;DROP'`) lança via `safeColumn`.
- [ ] Criar `src/features/ai-agents/tools/bqml/templates/forecast.ts` exportando `buildForecastDdl(opts)`. Snippet ARIMA_PLUS:
  ```sql
  CREATE OR REPLACE MODEL `liquid_bqml_${client}.bqml_${name}`
  OPTIONS (
    MODEL_TYPE='ARIMA_PLUS',
    TIME_SERIES_TIMESTAMP_COL='${timeCol}',
    TIME_SERIES_DATA_COL='${target}',
    TIME_SERIES_ID_COL=${idCol ? `'${idCol}'` : 'NULL'},
    HORIZON=${horizon},
    AUTO_ARIMA=TRUE,
    HOLIDAY_REGION='${holidayRegion}'
  ) AS ${sourceQuery};
  ```
- [ ] Criar `clustering.ts` + teste KMEANS sobre `[ltv, prazo, taxa, score_origem]`:
  ```sql
  OPTIONS (MODEL_TYPE='KMEANS', NUM_CLUSTERS=HPARAM_RANGE(2,8), KMEANS_INIT_METHOD='KMEANS++')
  ```
- [ ] Criar `classification.ts` + teste LOGISTIC_REG e BOOSTED_TREE_CLASSIFIER (target = `dias_atraso > 90 AS default_flag`):
  ```sql
  OPTIONS (MODEL_TYPE='BOOSTED_TREE_CLASSIFIER', INPUT_LABEL_COLS=['default_flag'], MAX_ITERATIONS=50, EARLY_STOP=TRUE)
  ```
- [ ] Criar `anomaly.ts` + teste AUTOENCODER e wrapper de query `ML.DETECT_ANOMALIES` sobre série mensal de PDD:
  ```sql
  OPTIONS (MODEL_TYPE='AUTOENCODER', ACTIVATION_FN='RELU', HIDDEN_UNITS=[8,4,8])
  ```
- [ ] Cada template usa `safeColumn` em todos os nomes de coluna recebidos. Source query é assumida pré-validada (responsabilidade do caller que veio de `bq.dry_run_sql`).

**Critério de aceite:** 4 testes cobrindo cada template; snippet ARIMA_PLUS executa em smoke (Task 16) gerando modelo válido.

---

## Task 6 — Cache layer per-tenant (`cache.ts`)

**Objetivo:** hash determinístico + lookup/insert no registry.

- [ ] Criar `src/features/ai-agents/tools/bqml/__tests__/cache.test.ts`:
  - [ ] Test: `computeModelHash({ clientId, intent, features, target, safraWindowEnd, sourceColumnsDdlHash })` é determinístico (mesmo input → mesmo hash) e sensível a cada componente (mudar 1 char invalida).
  - [ ] Test: `lookupCachedModel(hash, clientId)` SELECT em `liquid_meta.bqml_model_registry WHERE hash = @hash AND client_id = @client` (PK lógica per ADR-0007). Mock de retorno populado → retorna entry; vazio → `null`.
  - [ ] Test: cross-tenant — registry tem entry com `client_id='brz'`, lookup com `clientId='om'` → `null` (filtro WHERE; ADR-0006).
  - [ ] Test: schema drift — mesma chave exceto `sourceColumnsDdlHash` diferente → hash diferente → cache miss.
  - [ ] Test: `recordModelInRegistry({...})` faz `INSERT` com `created_at = NOW()`.
  - [ ] Test: `bumpUsage(hash, clientId)` faz UPDATE `last_used_at = NOW(), use_count = use_count + 1` filtrando por `(hash, client_id)`.
- [ ] Criar `src/features/ai-agents/tools/bqml/cache.ts`:
  - `computeSourceColumnsDdlHash(columns: ColumnSchema[])`: serializa `name|type|mode` ordenado, sha1.
  - `computeFeaturesCanonical(features: string[])`: lower + sort + join `|`.
  - `computeModelHash(parts)`: sha1 de `${clientId}|${intent}|${featuresCanonical}|${target}|${safraWindowEnd}|${sourceColumnsDdlHash}` (alinhado com ADR-0007 §Cache).
  - `lookupCachedModel(hash, clientId)`: query `liquid_meta.bqml_model_registry WHERE hash = @hash AND client_id = @client` (filtro de tenant obrigatório; ADR-0006).
  - `recordModelInRegistry(entry)`: insert (campos `hash`, `model_ref`, `features_canonical` etc — schema da Task 2).
  - `bumpUsage(hash, clientId)`: update filtrando por `(hash, client_id)`.

**Critério de aceite:** cobertura ≥ 85%; hash colisão impossível em 4 dimensões testadas.

---

## Task 7 — Tool `bqml.suggest_model`

**Objetivo:** dado intent + dados, retornar template + features sugeridas via structured output.

- [ ] Criar `src/features/ai-agents/tools/bqml/__tests__/suggest-model.test.ts`:
  - [ ] Test forecast PDD: input `{ intent: 'forecast', target: 'pdd_pct', timeColumn: 'data_safra', knownFeatures: ['ltv','prazo'] }` → output `{ modelType: 'ARIMA_PLUS', ddlTemplate: <snippet>, suggestedFeatures: [...], expectedTrainMinutes: <est>, expectedTrainBytes: <est>, expectedCostUsd: <est> }`.
  - [ ] Test clustering safras: `{ intent: 'clustering', features: ['ltv','prazo','taxa','score_origem'] }` → KMEANS.
  - [ ] Test propensity-to-default: `{ intent: 'classification', target: 'default_flag', rowCount: 800_000 }` → LOGISTIC_REG (< 1M rows).
  - [ ] Test propensity-to-default volume alto: `rowCount: 12_000_000` → BOOSTED_TREE_CLASSIFIER.
  - [ ] Test anomaly PDD: `{ intent: 'anomaly', timeColumn: 'data_base', target: 'pdd_pct' }` → ML.DETECT_ANOMALIES sobre ARIMA_PLUS.
- [ ] Criar `src/features/ai-agents/tools/bqml/suggest-model.ts`:
  - InputSchema Zod com `intent: z.enum(['forecast','clustering','classification','anomaly'])` + campos contextuais nullable.
  - Decision tree codificado em pure function `decideModelType(input) → { modelType, template }`.
  - Estimativa de bytes: `rowCount * estimatedRowWidthBytes * passes(modelType)` (passes ARIMA_PLUS ~ 5; KMEANS ~ 10; BOOSTED_TREE ~ 50).
  - Estimativa de custo: `bytes / 1e12 * pricePerTb(modelType)` ($250 ARIMA_PLUS; $6.25 outros).

**Critério de aceite:** 4 casos cobertos com modelType correto; estimativas dentro de ±50% do real medido em smoke.

---

## Task 8 — Tool `bqml.create_or_use_model` (cache + needsApproval + preliminary results)

**Objetivo:** tool primária que orquestra cache lookup → estima custo → gate de aprovação → CREATE MODEL com streaming de progresso.

- [ ] Criar `src/features/ai-agents/tools/bqml/__tests__/create-or-use-model.test.ts`:
  - [ ] Test cache hit: mock `lookupCachedModel` retorna entry → resolve imediatamente com `{ status: 'ready', modelRef, cacheHit: true, metrics }`; `createQueryJob` NÃO é chamado.
  - [ ] Test needsApproval acima de threshold: estimativa retorna `bytes: 6e9` → `needsApproval` resolve `true`.
  - [ ] Test needsApproval abaixo: `bytes: 1e9` → `false`.
  - [ ] Test multi-tenant: input passa `dataset: 'liquid_bqml_brz.bqml_x'` mas `clientId: 'om'` → falha fechado em `assertClientMatchesDataset` antes de qualquer chamada BQ.
  - [ ] Test preliminary streaming: mock `createQueryJob` com job que polling 3x (RUNNING, RUNNING, DONE); validar que `async *execute` yields 3 valores intermediários `{ status: 'training', progress, etaMs }` antes do final.
  - [ ] Test schema drift invalida cache: mesma chave exceto `sourceColumnsDdlHash` → cria modelo novo (não reusa).
  - [ ] Test registry insert: após CREATE MODEL bem-sucedido, `recordModelInRegistry` chamado com hash + métricas.
  - [ ] Test logger: `bqml_invocations` recebe entry com `cache_hit`, `bytes_processed`, `success`, `approved_by_user`.
- [ ] Criar `src/features/ai-agents/tools/bqml/create-or-use-model.ts`:
  - InputSchema:
    ```ts
    z.object({
      intent: z.enum(['forecast','clustering','classification','anomaly']),
      features: z.array(z.string()).min(1),
      target: z.string().nullable(),
      sourceQuery: z.string(),                  // SQL pré-validada via bq.dry_run_sql
      sourceColumns: z.array(z.object({ name: z.string(), type: z.string(), mode: z.string().nullable() })),
      safraWindowEnd: z.string().nullable(),
      modelTypeOverride: z.string().nullable(), // se vier de suggest_model
      ddlOptions: z.record(z.unknown()).nullable(),
    }).strict()
    ```
  - `needsApproval` é **async** (AI SDK v6 §4.3): `async ({ ...args }) => { const estimate = await estimateTrainBytes(...); const bytesGate = estimate.bytes > Number(process.env.BQML_APPROVAL_BYTES_THRESHOLD ?? 5e9); const costGate = estimate.costUsd > Number(process.env.BQML_APPROVAL_COST_USD ?? 5); return bytesGate || costGate; }` (ADR-0007 §Aprovação).
  - `execute` é `async function*`:
    1. Derive dataset via `deriveBqmlDataset(clientId)`; assertClient.
    2. Compute hash; `lookupCachedModel`; if hit → `bumpUsage`; yield/return `{ status:'ready', cacheHit:true, modelRef, metrics }`.
    3. Miss → `buildXxxDdl` via template (intent → builder map).
    4. Estimate via `bigquery.createQueryJob({ query: ddl, dryRun: true })`.
    5. Submit `createQueryJob({ query: ddl })` (non-dry).
    6. Poll `job.getMetadata()` a cada 3s (timeout `BQML_TIMEOUT=180_000`); a cada poll yield `{ status:'training', progress: estimateProgress(elapsed, expectedMinutes), etaMs }`.
    7. DONE → `recordModelInRegistry`; load metrics via `dataset.model(name).getMetadata()`; final value `{ status:'ready', cacheHit:false, modelRef, metrics, bytesProcessed }`.
    8. Fire-and-forget `logBqmlInvocation(...)`.
  - `toModelOutput` (multi-modal AI SDK v6 §4.3): retorna `content: [{ type: 'text', text: <métricas resumidas> }, { type: 'media', mediaType: 'image/png', data: <base64PreviewPng | null> }]` quando preview de série/forecast for útil. **NÃO** retornar `viz_preview_url` — o canal multi-modal é base64 PNG inline. Sem preview disponível → enviar apenas `text`.

**Critério de aceite:** todos testes verdes; cache hit confirmado em smoke (Task 16); preliminary results visíveis em UI dev.

---

## Task 9 — Tool `bqml.forecast` (wrapper `ML.FORECAST`)

**Objetivo:** consumir modelo ARIMA_PLUS criado e retornar previsões.

- [ ] Criar `__tests__/forecast.test.ts`:
  - [ ] Test: input `{ modelRef, horizon: 12, confidenceLevel: 0.9 }` → SQL `SELECT * FROM ML.FORECAST(MODEL ${modelRef}, STRUCT(12 AS horizon, 0.9 AS confidence_level))`.
  - [ ] Test cross-tenant: `modelRef` de outro tenant → assertClientMatchesDataset bloqueia.
  - [ ] Test integração com repair: SQL malformada gerada pelo modelo aciona `experimental_repairToolCall` (cap 2 retries); validar via mock.
- [ ] Criar `src/features/ai-agents/tools/bqml/forecast.ts`:
  - Envelopa `queryBQML(dataset, sql)` de `bqml-utils.ts`.
  - InputSchema strict; `safeColumn` em qualquer coluna nomeada.
  - Logger fire-and-forget.

**Critério de aceite:** cobertura ≥ 80%.

---

## Task 10 — Tool `bqml.predict` (wrapper `ML.PREDICT`)

**Objetivo:** consumir modelos de classification/regression.

- [ ] `__tests__/predict.test.ts`:
  - [ ] Test: input `{ modelRef, inputQuery: '<SQL>' }` → `SELECT * FROM ML.PREDICT(MODEL ${modelRef}, (${inputQuery}))`.
  - [ ] Test: `inputQuery` é validada via `bq.dry_run_sql` antes de submeter (chamada mock).
  - [ ] Test: cross-tenant bloqueado.
- [ ] Implementação envelopando `queryBQML`. Logger.

---

## Task 11 — Tool `bqml.detect_anomalies` (wrapper `ML.DETECT_ANOMALIES`)

**Objetivo:** consumir modelos de anomalia em série temporal.

- [ ] `__tests__/detect-anomalies.test.ts`:
  - [ ] Test: input `{ modelRef, anomalyProbThreshold: 0.95 }` → `SELECT * FROM ML.DETECT_ANOMALIES(MODEL ${modelRef}, STRUCT(0.95 AS anomaly_prob_threshold))`.
  - [ ] Test: cross-tenant bloqueado.
  - [ ] Test: integração com `monitoring-agent` — agente recebe alerta estruturado quando `is_anomaly=true` rate > X.
- [ ] Implementação envelopando `queryBQML`. Logger.

---

## Task 12 — Tool `schema.describe_relationships`

**Objetivo:** discovery heurístico de FKs por convenção `*_id` + sample JOINs.

- [ ] `src/features/ai-agents/tools/schema/__tests__/describe-relationships.test.ts`:
  - [ ] Test heurística: mock schemas de 3 tabelas (`contratos`, `clientes`, `projetos`); colunas `cliente_id`, `projeto_id` em `contratos` → output `{ edges: [{ from: 'contratos', column: 'cliente_id', to: 'clientes', toColumn: 'id', confidence: <heuristic_score> }, ...] }`.
  - [ ] Test sample JOIN: para cada candidate edge, executa `SELECT COUNT(*) FROM a JOIN b ON a.col = b.id LIMIT 1000` para validar que match > 0; mock `query` retorna 850/1000 matches → confidence alta; 5/1000 → baixa.
  - [ ] Test cache 1h por dataset.
  - [ ] Test `safeIdentifier` em todos os nomes.
- [ ] `src/features/ai-agents/tools/schema/describe-relationships.ts`:
  - InputSchema: `{ tables: string[] | null }` (null = todas as tabelas do dataset).
  - Pipeline: list tables → fetch schemas (reusa `get_table_schema_v2` da Sprint 1.C) → detect `*_id` → para cada candidato, montar JOIN sample → score.

**Critério de aceite:** detecta corretamente FKs de OM em smoke (`contratos → projetos`, `contratos → clientes`).

---

## Task 13 — Logger `bqml_invocations` + estender `repair-sql.ts`

**Objetivo:** instrumentar todas as 7 tools BQML; estender allow-list de repair.

- [ ] Criar `src/features/ai-agents/tools/bqml/__tests__/invocation-logger.test.ts`:
  - [ ] Test fire-and-forget — erro de insert nunca propaga.
  - [ ] Test env `BQML_INVOCATIONS_LOGGING !== 'true'` → no-op.
  - [ ] Test shape correto: `id`, `ts`, `client_id`, `tool_name`, `cache_hit`, `bytes_estimated`, `bytes_processed`, `cost_usd`, `success`, `approved_by_user`.
- [ ] Criar `src/features/ai-agents/tools/bqml/invocation-logger.ts` (mesmo padrão de `sql-generation-logger.ts` da Sprint 1.C, tabela `liquid_meta.bqml_invocations`).
- [ ] Editar `src/features/ai-agents/lib/repair-sql.ts`:
  - Estender allow-list para incluir `bqml.forecast`, `bqml.predict`, `bqml.detect_anomalies` (NÃO `bqml.create_or_use_model` — DDL custosa, não vale repair automático).
  - Cap 2 retries por sessão (já existe na Sprint 1.C).
  - Test atualização: 3 tools BQML novas no allow-list.
- [ ] Wire logger em todas as 7 tools BQML criadas (Tasks 4, 7, 8, 9, 10, 11) — passada anterior já chamou `logBqmlInvocation`; esta task fecha cobertura.

**Critério de aceite:** `BQML_INVOCATIONS_LOGGING=true` em dev produz 1 row por chamada de tool BQML; repair budget cap 2 confirmado em teste.

---

## Task 14 — Wire 7 tools BQML + `describe_relationships` no Canvas Orchestrator

**Objetivo:** registrar tools, estender prompt com decision tree.

- [ ] Editar `src/features/canvas-orchestrator/orchestrator.ts`:
  - Importar 7 factories BQML + `createDescribeRelationshipsTool`.
  - Resolver `clientId` a partir de `input.filters.clientId`; passar em `ToolContext`.
  - Adicionar entradas em `tools: { ..., bqml_list_models, bqml_suggest_model, bqml_create_or_use_model, bqml_forecast, bqml_predict, bqml_detect_anomalies, schema_describe_relationships }`.
  - Pré-check no startup: tentar `bigquery.dataset(deriveBqmlDataset(clientId)).get()`; se 403/404, desabilitar tools BQML para esta sessão e logar warning (sem quebrar canvas).
- [ ] Editar `src/shared/config/agents/canvas-orchestrator.ts` adicionando bloco "Disciplina BQML" no system prompt:
  ```
  Quando a pergunta envolver previsão, classificação, agrupamento ou detecção de anomalias:
  1. Chame `bqml.suggest_model` com {intent, target, features} para obter template recomendado.
  2. Compose a `sourceQuery` SQL e valide via `bq.dry_run_sql` (Sprint 1.C).
  3. Chame `bqml.create_or_use_model` — se o gate de aprovação disparar (custo >$5 ou bytes >5GB), peça confirmação ao usuário.
  4. Para usar modelo existente: `bqml.list_models` → `bqml.forecast` / `bqml.predict` / `bqml.detect_anomalies`.

  Decision tree:
  - forecast univariada (PDD, inadimplência por safra) → ARIMA_PLUS
  - forecast multivariada com regressores macro → BOOSTED_TREE_REGRESSOR ou ARIMA_PLUS_XREG
  - clustering safras / clientes → KMEANS
  - propensity-to-default (target binário) — <1M rows: LOGISTIC_REG; >10M rows: BOOSTED_TREE_CLASSIFIER
  - anomaly em série temporal (PDD mensal) → AUTOENCODER ou ML.DETECT_ANOMALIES sobre ARIMA_PLUS
  ```
- [ ] Smoke test em `src/features/canvas-orchestrator/__tests__/orchestrator-bqml.test.ts` valida que 7 tools estão presentes com shape correto.

**Critério de aceite:** `pnpm build` clean; smoke test passa.

---

## Task 15 — Wire em `predictive-agent` e `monitoring-agent`

**Objetivo:** disponibilizar tools BQML nos agents analíticos relevantes.

- [ ] Editar `src/shared/config/agents/predictive-agent.ts`:
  - Adicionar 7 tools BQML ao toolset.
  - Estender system prompt com decision tree (mesmo bloco do canvas).
  - Recomendação adicional: prefere BQML sobre `forecast-timeseries.ts` (Python SARIMAX) quando dados estão em BQ e horizonte ≤ 24m.
- [ ] Editar `src/shared/config/agents/monitoring-agent.ts`:
  - Adicionar `bqml.detect_anomalies`, `bqml.list_models`, `bqml.forecast`.
  - Prompt: "Para detectar desvios em PDD/inadimplência mensal, primeiro `bqml.list_models` para verificar AUTOENCODER existente; se não existir, peça permissão antes de criar (pode levar minutos)."
- [ ] Tests de smoke para cada agent garantindo tools registradas.

**Critério de aceite:** `predictive-agent` em smoke escolhe BQML em ≥70% dos 15 prompts de eval (ver Acceptance global).

---

## Task 16 — Smoke E2E (acceptance script)

**Objetivo:** roteiro reproduzível.

- [ ] Criar `docs/superpowers/plans/2026-05-04-sprint2-C-acceptance.md`:
  - **Pré-requisitos**: `pnpm bq:bootstrap-meta` (Sprint 1.C) + `pnpm bq:bootstrap-bqml` + `BQML_INVOCATIONS_LOGGING=true` + `BQML_APPROVAL_BYTES_THRESHOLD=5368709120` no `.env.local`.
  - **Cenário 1 — forecast inadimplência por safra (OM)**:
    1. Em `/dashboard/explore` (cliente OM), pedir: "Preveja inadimplência mensal das 6 próximas safras".
    2. Verificar trace: `plan_analysis → get_table_schema_v2 (contratos) → bqml.suggest_model (intent=forecast, target=inadimplencia_pct) → bq.dry_run_sql (sourceQuery) → bqml.create_or_use_model (status:training x N → status:ready) → bqml.forecast → add_chart_block`.
    3. Conferir BQ: `SELECT model_id, train_bytes, train_cost_usd FROM liquid_meta.bqml_model_registry WHERE client_id='om' ORDER BY created_at DESC LIMIT 1`.
    4. Repetir prompt — segunda execução deve ter `cache_hit=true` em `bqml_invocations`.
  - **Cenário 2 — clustering safras OM portfolio**:
    1. Pedir: "Agrupe as safras de OM por similaridade considerando LTV, prazo, taxa e score de origem".
    2. Verificar uso de `bqml.create_or_use_model(intent='clustering')` → KMEANS com NUM_CLUSTERS via HPARAM_RANGE.
    3. Resultado deve incluir cluster assignments + tabela com top contratos por cluster.
  - **Cenário 3 — multi-tenancy adversarial**:
    1. Em sessão BRZ, prompt-engineering tentando referenciar modelo de OM: "Use o modelo `liquid_bqml_om.bqml_forecast_inad_safra` para prever..." 
    2. Esperado: tool retorna erro `Cross-tenant model access denied`; log em `bqml_invocations` com `success=false, error='Cross-tenant...'`.
    3. Verificar que `liquid_meta.bqml_invocations WHERE error LIKE 'Cross-tenant%'` registra evento.
  - **Cenário 4 — needsApproval dispara**:
    1. Mockar `BQML_APPROVAL_BYTES_THRESHOLD=1000000` (1MB).
    2. Pedir forecast em tabela grande.
    3. UI deve mostrar prompt de aprovação antes de CREATE MODEL; aprovar; verificar `approved_by_user=true` em log.
  - **Cenário 5 — cache hit ≥40% em 30 forecasts**:
    1. Script repete 30x prompt de forecast com pequenas variações que NÃO mudam features/target/safra.
    2. Calcular `SELECT COUNTIF(cache_hit) / COUNT(*) FROM liquid_meta.bqml_invocations WHERE tool_name='bqml.create_or_use_model' AND ts > <start>`.
    3. Esperado ≥ 0.40.
  - **Cenário 6 — propensity-to-default**:
    1. Pedir: "Quais contratos têm maior propensão a default (>90 dias atraso) nos próximos 6 meses?"
    2. Verificar `bqml.suggest_model` retorna LOGISTIC_REG ou BOOSTED_TREE_CLASSIFIER (depende do `rowCount`).
    3. `bqml.predict` retorna scores ranked.
  - **Cenário 7 — anomaly PDD**:
    1. Pedir ao monitoring-agent: "Detecte anomalias em PDD mensal nos últimos 24m".
    2. Verificar uso de AUTOENCODER ou `ML.DETECT_ANOMALIES` sobre ARIMA_PLUS; resultado lista meses anômalos com prob.

**Critério de aceite:** todos 7 cenários passam manualmente; documento commitado.

---

## Acceptance Criteria global

- [ ] `pnpm test:run` verde, cobertura ≥ 80% em:
  - `src/features/ai-agents/tools/bqml/templates/*.ts`
  - `src/features/ai-agents/tools/bqml/cache.ts`
  - `src/features/ai-agents/tools/bqml/multi-tenancy.ts` (≥ 90%)
  - `src/features/ai-agents/tools/bqml/{list-models,suggest-model,create-or-use-model,forecast,predict,detect-anomalies,invocation-logger}.ts`
  - `src/features/ai-agents/tools/schema/describe-relationships.ts`
- [ ] 7 tools BQML + `schema.describe_relationships` registradas em Canvas Orchestrator, `predictive-agent` e `monitoring-agent` (subset relevante).
- [ ] `liquid_bqml_<client>` criados para os 4 tenants; `liquid_meta.bqml_model_registry` e `liquid_meta.bqml_invocations` populando.
- [ ] **Cache hit ≥ 40%** em dataset de 30 forecasts repetidos (Cenário 5).
- [ ] **Multi-tenancy adversarial**: tentar acessar modelo de outro cliente falha fechado com `Cross-tenant model access denied` (Cenário 3); registry filtra por `client_id`.
- [ ] **`needsApproval`** dispara em job estimado >5GB (Cenário 4 mockado).
- [ ] **Decision tree cobre 4 problemas** com templates funcionais executados em smoke: forecast inadimplência (ARIMA_PLUS), clustering safras (KMEANS), propensity-to-default (LOGISTIC_REG/BOOSTED_TREE), anomaly PDD (AUTOENCODER/DETECT_ANOMALIES).
- [ ] **`predictive-agent` escolhe BQML em ≥70%** de 15 prompts de eval (`tool-call-accuracy` Mastra eval).
- [ ] **Repair budget cap 2** retries para tools `bqml.forecast/predict/detect_anomalies`.
- [ ] **Preliminary results** visíveis em UI dev durante CREATE MODEL longo (>30s).
- [ ] `pnpm build` sem warnings novos; `pnpm lint` clean.
- [ ] `adrs/decisions/0006-multi-tenancy-strict-isolation.md` e `adrs/decisions/0007-bqml-dataset-dedicado-por-tenant.md` (ambos JÁ aceitos) referenciados em `docs/observability/bqml-setup.md`. **Spec não cria ADRs novos.**

---

## Riscos e rollback

| Risco | Mitigação | Rollback |
|---|---|---|
| Custo BQML descontrolado (ARIMA_PLUS $250/TB) | `needsApproval` por bytes/$ + cap mensal por tenant em `bqml_invocations` (alarme em 70% do SLO) | `BQML_ENABLED=false` desativa todas as tools |
| Permissão IAM ausente para CREATE MODEL | Pré-check no startup do route `/api/ai/canvas` (Task 14); falha fechado com warning, tools BQML escondidas | Documentação `bqml-setup.md` runbook |
| Schema drift invalidando cache prematuramente | Hash de DDL completo (não só nomes); revisar via `bumpUsage` rate em registry; ajustar canonicalization | Reduzir granularidade do hash (campo `source_columns_ddl_hash` opt-out via env) |
| Cross-tenant leak | `assertClientMatchesDataset` em 100% das tools BQML; teste adversarial Cenário 3; logging de tentativas | Auditoria via `liquid_meta.bqml_invocations WHERE error LIKE 'Cross-tenant%'`; revogação imediata de SA |
| Cache hit baixo (<40%) | Revisar canonicalization de features; possível normalização case-insensitive; aumentar TTL no registry | Aceitar hit rate menor; ajustar SLO |
| Polling de job consome quota | Backoff exponencial 3s→6s→12s (cap 30s); timeout 180s herdado de `bqml-utils.ts` | Reduzir N de polls; mover para Pub/Sub trigger em fase futura |
| BQML SDK API muda (`getModels`, `createQueryJob`) | Pin `@google-cloud/bigquery@^8.1.1`; mocks em testes | Pin exact version |
| Vertex Gemini rejeita schemas com `optional` | Convenção `.nullable()` em todos os InputSchema | Reverter pontual |
| Preliminary results quebram UI | Feature flag `BQML_PRELIMINARY_RESULTS=true`; fallback para resultado final único | Desligar flag |

**Rollback geral:** cada commit reversível. Ordem: 16 → 15 → 14 → 13 → 12 → 11 → 10 → 9 → 8 → 7 → 6 → 5 → 4 → 3 → 2 → 1. Tasks 1-3, 5-7 são puras (libs) e seguras.

---

## Time de execução

- **Tasks 1, 5, 6, 7, 12** (puras / templates / cache / suggest / describe_relationships): general-purpose subagent + `credit-risk-analyst` review nos templates.
- **Tasks 2, 13** (BQ infra + logger): general-purpose subagent com creds GCP dev.
- **Tasks 3, 4, 8, 9, 10, 11** (tools BQML core): general-purpose subagent (8 depende de 3, 5, 6, 7).
- **Tasks 14, 15** (orchestrator + agents wiring): general-purpose subagent (sequencial após libs).
- **Task 16** (smoke): humano + `credit-risk-analyst` validando outputs de inadimplência/PDD.

**Ordem (dependências):**

```
Task 1, 2 ─┐
Task 3 ────┤
Task 5, 6 ─┼─→ Task 7 ─→ Task 8 ─┐
Task 4 ────┘                     │
Task 12 ──────────────────────────┼─→ Task 13 ─→ Task 14 ─→ Task 15 ─→ Task 16
                                  │
Tasks 9, 10, 11 (após 8) ─────────┘
```

Tasks 1, 2, 3, 4, 5, 6, 12 podem rodar em paralelo. Tasks 7-11 dependem das libs. 13-16 sequenciais.

---

## Self-review checklist (autor)

- [x] Header obrigatório presente.
- [x] 16 tasks (entre 12-16, no limite superior — escopo justifica).
- [x] Cada task tem files + steps de teste antes de implementação (TDD).
- [x] Acceptance criteria mensuráveis (cache hit ≥40%, BQML pickup ≥70%, cobertura ≥80%, threshold 5GB).
- [x] Riscos com mitigação e rollback.
- [x] Referências cruzadas com plano-fonte (`mastra-tools-sql-bqml.md` §3, §4, §6, §8) e Sprint 1.C prerequisite.
- [x] Path absolutos e tools alinhadas ao codebase real (`bqml-utils.ts` com helpers JÁ existentes, `query_data`, `bq.dry_run_sql`).
- [x] AI SDK v6 §4.3 features citados (`needsApproval` async, `async *execute` preliminary, `toModelOutput` multi-modal text+base64 PNG, `experimental_repairToolCall` como callback NÃO tool).
- [x] ADRs 0006 e 0007 (aceitas) referenciadas; spec NÃO cria ADR-003/004 nem duplica decisões.
- [x] Canvas Orchestrator hoje em **23 tools**; spec adiciona +7 BQML + `schema.describe_relationships`.
- [x] Vitest 4.x explícito.
- [x] BigQuery API endpoints concretos (`createQueryJob`, `dryRun`, `getMetadata`, `dataset.getModels`).
- [x] Multi-tenant safety: dataset por tenant + `assertClientMatchesDataset` + filtro `WHERE client_id` em registry + teste adversarial.
- [x] Decision tree codificado em `suggest-model` com 4 ramos (forecast/clustering/classification/anomaly) e snippets DDL concretos por tipo.
- [x] Cache per-tenant com hash determinístico incluindo `source_columns_ddl_hash`.
- [x] ADRs 0006 (multi-tenancy) e 0007 (dataset+IAM+cache) referenciadas — sem criação de novos ADRs.
- [x] Logging em `liquid_meta.bqml_invocations` reusa pattern de `sql_generations` (Sprint 1.C).
- [x] Repair budget estendido (allow-list) sem permitir repair em DDL custosa.
