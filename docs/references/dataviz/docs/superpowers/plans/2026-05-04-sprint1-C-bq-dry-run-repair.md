# Sprint 1.C — BigQuery Dry-Run, Tool-Call Repair, Schema Enriquecido + sql_generations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar disciplina ao SQL gerado pelos agentes — tool `bq.dry_run_sql` (validação custo-zero), callback `experimental_repairToolCall` para auto-correção, enriquecer `get_table_schema` com estatísticas (NULL ratio, distinct count, sample values) e persistir todas as gerações de SQL em `liquid_meta.sql_generations` para análise post-mortem.

**Architecture:** `dry_run_sql` chama BigQuery `query({dryRun: true})` retornando schema previsto e bytes processados sem custo. `experimental_repairToolCall` é callback do `streamText`/`generateText` que intercepta SQL inválido, gera correção via `generateObject` e retenta. Schema enriquecido lê stats do `INFORMATION_SCHEMA` + amostragem agregada com `SAFE_DIVIDE(COUNT(IF(... IS NULL,1,NULL)), COUNT(*))`. `liquid_meta.sql_generations` é tabela BigQuery cliente-agnóstica para observabilidade.

**Tech Stack:** AI SDK v6 — §4.3 cobre Tool Call Repair (`experimental_repairToolCall`, linhas 866-888), Tool Execution Approval (`needsApproval`, linhas 599-656), Preliminary Tool Results (`async *execute`, linhas 794-818) e Multi-modal Tool Results (`toModelOutput`, linhas 890-914); §4.18 cobre apenas `.nullable()` vs `.optional()` no strict mode Gemini. `@google-cloud/bigquery@^8.1.1` (já instalado), Zod 4, Vitest 4 (já instalado em Sprint 1.A — não duplicar).

---

## Contexto pré-leitura obrigatória

Antes de iniciar qualquer task, leia integralmente:

- `docs/superpowers/plans/2026-05-04-mastra-tools-sql-bqml.md` — §2 (catalog), §3 (padrões), §6 (schema-aware pattern), §7 (Fase 1).
- `src/features/canvas-orchestrator/orchestrator.ts` (82 LOC) — montagem do `streamText`, lugar onde `experimental_repairToolCall` e `prepareStep` serão wired.
- `src/features/canvas-orchestrator/tools/query-data.ts` (65 LOC) — tool `query_data` atual; vai receber `needsApproval` e instrumentação de logger.
- `src/features/ai-agents/tools/get-table-schema.ts` (76 LOC) — versão atual sem stats; v2 derivada dela.
- `src/features/ai-agents/tools/get-sample-data.ts` — pattern para amostragem.
- `src/features/ai-agents/tools/execute-sql.ts` — executor SQL alternativo (espelhar mudanças se necessário).
- `src/features/ai-agents/tools/tool-context.ts` — `ToolContext` shape (dataset, filters, sessionId).
- `src/shared/lib/bigquery/client.ts` — `getBigQueryClient()`, `parseDatasetRef`, `TABLES`.
- `src/shared/lib/bigquery/identifier.ts` — `safeIdentifier`, `quoteTableRef` (use sempre que montar SQL dinâmico).
- `src/shared/config/agents/canvas-orchestrator.ts` — system prompt do orchestrator.

API BigQuery relevante (validar antes de implementar):

- `bigquery.createQueryJob({ query, dryRun: true })` retorna `[job]`; `job.metadata.statistics.query.schema` traz `{ fields: [{ name, type, mode }] }`; `job.metadata.statistics.totalBytesProcessed` (string) traz bytes.
- `bigquery.query({ query, dryRun: true })` é açúcar — preferir `createQueryJob` para dry-run pois `query()` pode tentar consumir resultset.

---

## Convenções

- TDD obrigatório (sub-skill `superpowers:test-driven-development`). Cada task com produto novo começa por teste vermelho, depois implementação.
- Zod schemas: `.nullable()` em vez de `.optional()` (Vertex Gemini strict mode).
- Imports absolutos com `@/`.
- Mocks: `vi.mock('@google-cloud/bigquery', ...)` pattern; ver Sprint 1.A test fixtures.
- Logs: `fire-and-forget` para telemetria — nunca bloquear caminho principal nem propagar erro.
- Toda nova tool deve ter `description` em PT-BR (consistência com prompts existentes).

---

## Task 1 — Tool `bq.dry_run_sql` (puro)

**Objetivo:** validar SQL via BigQuery dry-run, retornar schema + bytes, sem custo.

- [ ] Criar `src/features/ai-agents/tools/__tests__/bq-dry-run-sql.test.ts`:
  - [ ] Test: SQL válido → `{ valid: true, schema: [{name,type,mode}], bytesProcessed: number, statementType?: string }`. Mockar `BigQuery.prototype.createQueryJob` para retornar `[{ metadata: { statistics: { query: { schema: { fields: [{name:'id',type:'STRING',mode:'NULLABLE'}] }, statementType: 'SELECT' }, totalBytesProcessed: '1024' } } }]`.
  - [ ] Test: SQL inválido → `{ valid: false, error: string, errorClass: 'syntax'|'permission'|'reference'|'unknown' }`. Mockar `createQueryJob` para `throw new Error('Syntax error: Expected end of input')`. Classificar via regex no `error.message`.
  - [ ] Test: SQL não-SELECT (ex.: `DROP TABLE x`) → `{ valid: false, error: 'Apenas SELECT/WITH...', errorClass: 'forbidden' }` sem chamar BQ.
  - [ ] Test: schema input é `{ sql: string }` strict — extra keys rejeitadas (Zod `.strict()`).
- [ ] Criar `src/features/ai-agents/tools/bq-dry-run-sql.ts`:
  - [ ] Export `createBqDryRunSqlTool(ctx: ToolContext)` retornando `tool({...})`.
  - [ ] Allowlist: `^\s*(SELECT|WITH)\b/i`. Bloquear `INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|MERGE` em qualquer posição.
  - [ ] Implementar via `client.createQueryJob({ query: sql, dryRun: true, useLegacySql: false, defaultDataset: { datasetId, ...(projectId ? {projectId}:{}) } })`.
  - [ ] Extrair `schema.fields` → `{ name, type, mode }[]` (mode pode faltar — default `NULLABLE`).
  - [ ] `bytesProcessed = Number(metadata.statistics.totalBytesProcessed ?? 0)`.
  - [ ] Wrap em try/catch; usar `formatToolError` para mensagem; classificar `errorClass` via `classifyBqError(err.message)` helper local.
- [ ] Atualizar `src/features/ai-agents/tools/index.ts` (se existir barrel) para exportar a nova factory.
- [ ] `pnpm test:run src/features/ai-agents/tools/__tests__/bq-dry-run-sql.test.ts` deve passar.
- [ ] Commit: `feat(ai-agents): add bq.dry_run_sql tool with cost-zero validation`.

**Critério de aceite da task:**
- Cobertura ≥ 80% em `bq-dry-run-sql.ts`.
- Nenhuma chamada real ao BigQuery em testes (todos mockados).

---

## Task 2 — Wire `dry_run_sql` no canvas e nos agents analíticos

**Objetivo:** disponibilizar a tool no toolset do orchestrator e instruir o modelo via prompt a chamar dry-run antes de `query_data`.

- [ ] Modificar `src/features/canvas-orchestrator/orchestrator.ts`:
  - [ ] Importar `createBqDryRunSqlTool` de `@/features/ai-agents/tools/bq-dry-run-sql`.
  - [ ] Adicionar entrada em `tools: { ..., dry_run_sql: createBqDryRunSqlTool({ dataset: input.dataset, filters: input.filters, sessionId }) }`.
- [ ] Identificar agents analíticos via `grep -r "createExecuteSqlTool\|execute_sql" src/features/ai-agents/agents/`. Para cada agent encontrado (descritivo, diagnóstico, preditivo, prescritivo, etc.):
  - [ ] Adicionar `dry_run_sql: createBqDryRunSqlTool(ctx)` ao toolset.
  - [ ] Atualizar system prompt do agent (em `src/shared/config/agents/<agent>.ts`) para incluir: "Antes de executar SQL via `query_data`/`execute_sql`, **sempre** chame `dry_run_sql` primeiro. Se `dry_run_sql.valid === false`, corrija o SQL e tente novamente (máx 2x). Se mesmo assim falhar, use `ask_user`."
- [ ] Modificar `src/shared/config/agents/canvas-orchestrator.ts`:
  - [ ] Em `buildCanvasOrchestratorPrompt(...)`, adicionar bloco "Disciplina de SQL" listando: (1) chamar `get_table_schema` antes de compor SQL; (2) chamar `dry_run_sql` antes de `query_data`; (3) repair automático até 2x; (4) fallback `ask_user`.
- [ ] Test (smoke): `src/features/canvas-orchestrator/__tests__/orchestrator-tools.test.ts` — instanciar orchestrator com mocks e validar que `tools.dry_run_sql` existe e tem shape `{ description, inputSchema, execute }`.
- [ ] Commit: `feat(orchestrator): wire dry_run_sql into canvas + analytical agents`.

**Critério de aceite:**
- `pnpm build` sem warnings novos.
- Smoke test passa.

---

## Task 3 — Schema enriquecido: `get_table_schema_v2`

**Objetivo:** wrapper que retorna estatísticas por coluna (null ratio, distinct count, sample values) além do schema base.

- [ ] Criar `src/features/ai-agents/tools/__tests__/get-table-schema-v2.test.ts`:
  - [ ] Test: shape de saída `{ success: true, table, columns: [{ name, type, mode, description, nullRatio: number, distinctCount: number, sampleValues: string[] }] }`. `sampleValues.length <= 5`.
  - [ ] Test: para tabela com >50 colunas, faz batching (uma query por batch de 30 colunas) — validar que `createQueryJob` é chamado N vezes.
  - [ ] Test: cache hit — duas chamadas consecutivas com mesma `(dataset, table)` resultam em apenas 1 round-trip BQ; segunda retorna do cache.
  - [ ] Test: cache TTL — após `Date.now()` mockado para >1h, segunda chamada faz round-trip novo.
  - [ ] Test: tipo não-amostrável (GEOGRAPHY, BYTES, ARRAY, STRUCT) → `sampleValues: []`, `distinctCount: null`. Apenas `nullRatio` calculado.
  - [ ] Test: erro BQ → `{ success: false, error, columns: [] }`.
  - [ ] Test: `getCacheStats()` retorna `{ hits: number, misses: number, hitRate: number, size: number }`.
- [ ] Criar `src/features/ai-agents/tools/get-table-schema-v2.ts`:
  - [ ] `createGetTableSchemaV2Tool(ctx: ToolContext)` factory.
  - [ ] InputSchema: `{ table: TABLE_ENUM }` (mesmo do v1).
  - [ ] Pipeline:
    1. Reusar `createGetTableSchemaTool` lógica para schema base via `getMetadata()`.
    2. Filtrar colunas amostráveis (`STRING|INT64|FLOAT64|NUMERIC|BIGNUMERIC|BOOL|DATE|DATETIME|TIMESTAMP`).
    3. Montar query agregada com `safeIdentifier` para cada nome de coluna (NUNCA concatenar nomes crus):
       ```sql
       SELECT
         COUNT(*) AS total_rows,
         SAFE_DIVIDE(COUNTIF(`col1` IS NULL), COUNT(*)) AS null_ratio_col1,
         APPROX_COUNT_DISTINCT(`col1`) AS distinct_col1,
         ARRAY(SELECT CAST(x AS STRING) FROM (SELECT DISTINCT `col1` AS x FROM `proj.ds.tbl` WHERE `col1` IS NOT NULL ORDER BY x LIMIT 5)) AS sample_col1,
         ...
       FROM `proj.ds.tbl`
       ```
    4. Batchear em grupos de 30 colunas para não estourar limite de 10000 caracteres em SELECT.
    5. Mesclar resultado base + stats em `columns[]`.
  - [ ] Cache:
    - [ ] `Map<string, { value, expiresAt }>`, key = `${datasetId}:${tableId}`.
    - [ ] TTL = 60 * 60 * 1000.
    - [ ] LRU manual: ao inserir e `size > 200`, remover entry com menor `expiresAt`.
    - [ ] Métricas internas: `cacheHits`, `cacheMisses` incrementados.
  - [ ] Export `getCacheStats()` e `clearSchemaV2Cache()` (segundo para testes).
- [ ] Commit: `feat(ai-agents): add get_table_schema_v2 with column stats and 1h cache`.

**Critério de aceite:**
- Cobertura ≥ 80%.
- Nenhuma string interpolada sem `safeIdentifier` (revisar diff manualmente).

---

## Task 4 — Substituir `get_table_schema` no canvas pelo v2

**Objetivo:** trocar tool wired sem quebrar prompts (mantém o mesmo nome `get_table_schema` exposto ao modelo).

- [ ] Modificar `src/features/canvas-orchestrator/orchestrator.ts`:
  - [ ] Trocar import: `import { createGetTableSchemaV2Tool } from '@/features/ai-agents/tools/get-table-schema-v2'`.
  - [ ] Substituir `get_table_schema: createGetTableSchemaTool(...)` por `get_table_schema: createGetTableSchemaV2Tool({ dataset: input.dataset, filters: input.filters, sessionId })`.
- [ ] Atualizar prompt em `src/shared/config/agents/canvas-orchestrator.ts` para mencionar que `get_table_schema` retorna agora `{ name, type, nullRatio, distinctCount, sampleValues }` — instruir o modelo a usar `sampleValues` para decidir literais de filtro (em vez de inventar valores).
- [ ] Identificar outros consumidores do v1 (agents analíticos) via `grep -r createGetTableSchemaTool src/`. Para cada um, decidir:
  - [ ] Migrar para v2 se não houver risco (default).
  - [ ] OU manter v1 com nota (apenas se stats forem inviáveis no contexto, ex.: tabela muito grande sem partição). Justificar no PR.
- [ ] Test de regressão `src/features/canvas-orchestrator/__tests__/orchestrator-tools.test.ts`:
  - [ ] Validar que `tools.get_table_schema` é a v2 (presença de `getCacheStats` exportado, ou mock retorna shape com `nullRatio`).
- [ ] Commit: `refactor(orchestrator): swap get_table_schema for v2 with column stats`.

**Critério de aceite:**
- `pnpm build` ok.
- Smoke manual: rodar `pnpm dev`, abrir canvas, pedir um KPI; verificar que console mostra schema v2 sendo retornado.

---

## Task 5 — Tabela `liquid_meta.sql_generations`

**Objetivo:** criar dataset `liquid_meta` (cross-tenant) e tabela particionada/clusterizada para logging.

- [ ] Criar `scripts/bq-create-sql-generations.sql`:
  ```sql
  CREATE SCHEMA IF NOT EXISTS `${PROJECT_ID}.liquid_meta`
    OPTIONS (location = '${BQ_LOCATION}');

  CREATE TABLE IF NOT EXISTS `${PROJECT_ID}.liquid_meta.sql_generations` (
    id STRING NOT NULL,
    ts TIMESTAMP NOT NULL,
    intent STRING,
    sql_draft STRING,
    dry_run_valid BOOL,
    dry_run_error STRING,
    dry_run_bytes INT64,
    repair_attempts INT64,
    final_sql STRING,
    rows INT64,
    latency_ms INT64,
    bytes_billed INT64,
    success BOOL,
    error STRING,
    persona_id STRING,
    client_id STRING,
    session_id STRING,
    agent_id STRING
  )
  PARTITION BY DATE(ts)
  CLUSTER BY client_id, agent_id, success;
  ```
- [ ] Criar `scripts/bq-bootstrap-meta.ts`:
  - [ ] Lê `process.env.BIGQUERY_PROJECT_ID` e `BIGQUERY_LOCATION`.
  - [ ] Lê o SQL e substitui placeholders.
  - [ ] Executa via `getBigQueryClient().query({ query, useLegacySql: false })`.
  - [ ] Idempotente (`CREATE ... IF NOT EXISTS`).
  - [ ] Loga `[bootstrap-meta] dataset criado / já existia`.
- [ ] Adicionar npm script em `package.json`: `"bq:bootstrap-meta": "tsx scripts/bq-bootstrap-meta.ts"`.
- [ ] Documentar IAM em `docs/observability/sql-generations-setup.md` (curto):
  - [ ] SA precisa de `bigquery.datasets.create` (one-time) ou criação manual do dataset por humano.
  - [ ] Após criação, basta `bigquery.tables.create` + `bigquery.tables.updateData` no dataset `liquid_meta`.
  - [ ] Recomendar criar role custom `liquid.metaWriter` se houver org policy.
- [ ] Commit: `chore(bq): bootstrap script for liquid_meta.sql_generations`.

**Critério de aceite:**
- Rodar `pnpm bq:bootstrap-meta` em dev cria dataset+tabela; segunda execução não falha.
- `bq show liquid_meta.sql_generations` exibe schema esperado.

---

## Task 6 — Logger `sqlGenerationLogger`

**Objetivo:** wrapper fire-and-forget que insere uma linha por geração de SQL.

- [ ] Criar `src/shared/lib/bigquery/__tests__/sql-generation-logger.test.ts`:
  - [ ] Test: `logSqlGeneration({...})` chama `table.insert([row])` exatamente uma vez com shape correto, `id` gerado via `crypto.randomUUID`, `ts` = ISO atual.
  - [ ] Test: erro de insert nunca propaga — `await logSqlGeneration({...})` resolve mesmo se `table.insert` rejeitar; logado via `console.warn`.
  - [ ] Test: env `SQL_GENERATIONS_LOGGING !== 'true'` → no-op (não chama BQ).
  - [ ] Test: campos opcionais (`intent`, `personaId`, etc.) ausentes viram `null` no row, não `undefined`.
- [ ] Criar `src/shared/lib/bigquery/sql-generation-logger.ts`:
  - [ ] Tipo:
    ```ts
    export interface SqlGenerationLogEntry {
      intent?: string;
      sqlDraft?: string;
      dryRunValid?: boolean;
      dryRunError?: string;
      dryRunBytes?: number;
      repairAttempts?: number;
      finalSql?: string;
      rows?: number;
      latencyMs?: number;
      bytesBilled?: number;
      success?: boolean;
      error?: string;
      personaId?: string;
      clientId?: string;
      sessionId?: string;
      agentId?: string;
    }
    ```
  - [ ] `export async function logSqlGeneration(entry: SqlGenerationLogEntry): Promise<void>`.
  - [ ] Curto-circuita se `process.env.SQL_GENERATIONS_LOGGING !== 'true'`.
  - [ ] Resolve `projectId` e dataset `liquid_meta` via env (`BIGQUERY_PROJECT_ID`).
  - [ ] Gera `id = crypto.randomUUID()`, `ts = new Date()`.
  - [ ] Normaliza `undefined` → `null` (BQ streaming insert é estrito).
  - [ ] `bigquery.dataset('liquid_meta').table('sql_generations').insert([row])`.
  - [ ] try/catch — `console.warn('[sql-gen-logger]', err.message)`; nunca rethrow.
  - [ ] Truncar `sqlDraft` e `finalSql` em 50_000 chars (limite prático).
- [ ] Atualizar `.env.example` adicionando `SQL_GENERATIONS_LOGGING=false`.
- [ ] Commit: `feat(bq): add fire-and-forget sql_generations logger`.

**Critério de aceite:**
- Cobertura ≥ 80%.
- Logger nunca lança em testes que mockam BQ erro.

---

## Task 7 — Integrar logger em `query_data`

**Objetivo:** instrumentar `query-data.ts` para logar cada execução.

- [ ] Modificar `src/features/canvas-orchestrator/tools/query-data.ts`:
  - [ ] Importar `logSqlGeneration` de `@/shared/lib/bigquery/sql-generation-logger`.
  - [ ] Aceitar contexto adicional na factory: `createQueryDataTool(dataset, bqmlEnabled, filters, ctx?: { sessionId?: string; clientId?: string; agentId?: string })`.
  - [ ] Atualizar `orchestrator.ts` para passar `{ sessionId, clientId: filters.clientId ?? undefined, agentId: 'canvas-orchestrator' }`.
  - [ ] No `execute`:
    - [ ] `const t0 = Date.now()`.
    - [ ] Após sucesso: `void logSqlGeneration({ finalSql: sql, rows: totalCount, latencyMs: Date.now()-t0, bytesBilled: <opcional via job.metadata>, success: true, sessionId, clientId, agentId, intent: description })`.
    - [ ] Após erro: `void logSqlGeneration({ finalSql: sql, latencyMs: Date.now()-t0, success: false, error: formatToolError(error), sessionId, clientId, agentId, intent: description })`.
- [ ] Para capturar `bytesBilled`, trocar `client.query({...})` por `client.createQueryJob({...})` + `await job.getQueryResults()` + `job.metadata.statistics.query.totalBytesBilled`. Se invasivo demais, deixar `bytesBilled: undefined` nesta task e cobrir em iteração futura.
- [ ] Test em `src/features/canvas-orchestrator/tools/__tests__/query-data.test.ts`:
  - [ ] Mockar `logSqlGeneration` e validar que é invocada exatamente 1x por `execute`, com `success: true|false` apropriado.
  - [ ] Mockar para rejeitar — execução de query continua normalmente.
- [ ] Commit: `feat(query-data): instrument with sql_generations logger`.

**Critério de aceite:**
- Cada chamada produz exatamente 1 log entry (sucesso ou falha).
- Erro do logger não afeta retorno da tool.

---

## Task 8 — Callback `experimental_repairToolCall` para SQL

**Objetivo:** função de repair que recebe falha de tool-call e retorna tool-call corrigida.

- [ ] Criar `src/features/ai-agents/lib/__tests__/repair-sql.test.ts`:
  - [ ] Test: `repairSqlToolCall({ toolCall: { toolName: 'query_data', args: { sql: 'SELECT FRO m', description: 'x' } }, error: new Error('Syntax error: Expected end of input'), messages: [], system: '...', tools: {...}, parameterSchema: ... })` retorna `{ toolName: 'query_data', args: { sql: '<corrigido>', description: 'x' } }`. Mockar `generateObject` para retornar `{ object: { sql: 'SELECT 1' } }`.
  - [ ] Test: `toolName !== 'query_data' && toolName !== 'execute_sql' && toolName !== 'dry_run_sql'` → retorna `null` (não tenta reparar).
  - [ ] Test: schema cache de retries por `sessionId` — mais de 2 chamadas consecutivas para mesma session retornam `null` (cap budget).
  - [ ] Test: `generateObject` falha → retorna `null` e loga warning.
- [ ] Criar `src/features/ai-agents/lib/repair-sql.ts`:
  - [ ] Assinatura compatível com AI SDK v6 `experimental_repairToolCall: ({ toolCall, error, messages, system, tools, parameterSchema, ...}) => Promise<ToolCall|null>`.
  - [ ] Allow-list de tools que reparamos: `['query_data', 'execute_sql', 'dry_run_sql']`.
  - [ ] Map em memória `retriesPerSession: Map<string, number>` com cap 2; cleanup no fim de session via TTL 30min.
  - [ ] Compor prompt:
    ```
    O modelo gerou um SQL inválido para a tool {toolName}.
    Erro do BigQuery: {error.message}
    SQL original:
    {originalSql}
    Schema de contexto disponível: {extracted from previous get_table_schema results in messages}
    Retorne apenas o SQL corrigido. Não inclua explicações.
    ```
  - [ ] Chamar `generateObject({ model: getModel('fast'), schema: z.object({ sql: z.string() }), prompt, temperature: 0 })`.
  - [ ] Retornar `{ ...toolCall, args: { ...toolCall.args, sql: object.sql } }`.
  - [ ] Log via `logSqlGeneration({ sqlDraft: originalSql, dryRunValid: false, dryRunError: error.message, finalSql: object.sql, repairAttempts: currentCount, success: null, sessionId, agentId: 'repair' })`.
- [ ] Helper `extractSchemaContextFromMessages(messages)`: scan reverso por tool-results de `get_table_schema*` e concatena resumo.
- [ ] Commit: `feat(ai-agents): add experimental_repairToolCall handler for SQL`.

**Critério de aceite:**
- Cap de 2 retries comprovado em teste.
- Cobertura ≥ 80%.

---

## Task 9 — Wire `experimental_repairToolCall` no canvas orchestrator

**Objetivo:** plugar repair handler no `streamText` do canvas e em agents analíticos críticos.

- [ ] Modificar `src/features/canvas-orchestrator/orchestrator.ts`:
  - [ ] Importar `repairSqlToolCall` de `@/features/ai-agents/lib/repair-sql`.
  - [ ] Adicionar `experimental_repairToolCall: (params) => repairSqlToolCall({ ...params, sessionId, agentId: 'canvas-orchestrator' })` ao `streamText({...})`.
- [ ] Smoke test em `src/features/canvas-orchestrator/__tests__/orchestrator-repair.test.ts`:
  - [ ] Mockar `streamText` para invocar a callback `experimental_repairToolCall` manualmente com SQL inválido; validar que recebe um tool-call com SQL corrigido.
- [ ] Decidir (registrar no PR) se também aplica em agents analíticos. Default: SIM, mas pode ser excluído de agents puros de cálculo (ex.: causal/forecast Python que não tocam BQ).
- [ ] Cada repair deve gerar entry em `liquid_meta.sql_generations` com `repair_attempts > 0` (já coberto pela Task 8 quando chama `logSqlGeneration`).
- [ ] Commit: `feat(orchestrator): wire experimental_repairToolCall into canvas streamText`.

**Critério de aceite:**
- Smoke test passa.
- Manual: induzir SQL errado em dev, verificar log mostrando 1 retry com sucesso.

---

## Task 10 — `prepareStep` restringindo `activeTools` por step (schema → dry_run → execute)

**Objetivo:** `prepareStep` não força ordem entre tools por si só; ele restringe quais tools o modelo vê em cada step via `activeTools` (combinável com `toolChoice: 'required'` quando necessário). Aqui usamos apenas `activeTools` para induzir a disciplina sem travar fluxos de edição.

- [ ] Criar helper `src/features/canvas-orchestrator/lib/prepare-step.ts`:
  - [ ] `export function buildPrepareStep(opts: { sessionId: string }): PrepareStepFn` retornando função `({ stepNumber, messages }) => { activeTools?, toolChoice? }`.
  - [ ] Lógica:
    - Se ainda não há tool-call de schema nas mensagens: `activeTools: ['plan_analysis', 'get_table_schema', 'get_sample_data', 'get_filter_options']`, `toolChoice: 'auto'`.
    - Se há schema mas não há `dry_run_sql`: `activeTools: [...schemaTools, 'dry_run_sql']`, sem forçar `required` (modelo pode fazer outras escolhas como `add_text_block`).
    - Se há `dry_run_sql.valid: true` recente: `activeTools` inclui `query_data`, `analyze`, blocos de canvas.
    - Default fallback: tudo liberado (`activeTools: undefined`, `toolChoice: 'auto'`).
  - [ ] Inspecionar `messages` para detectar tool-results já presentes (procurar por `tool-result` com `toolName === 'get_table_schema'` etc.).
- [ ] Test `src/features/canvas-orchestrator/lib/__tests__/prepare-step.test.ts`:
  - [ ] Step 0, sem mensagens prévias: `activeTools` inclui `plan_analysis` e `get_table_schema`, NÃO inclui `query_data`.
  - [ ] Após mock de tool-result `get_table_schema`: `activeTools` inclui `dry_run_sql`.
  - [ ] Após mock de tool-result `dry_run_sql` válido: `activeTools` inclui `query_data`.
  - [ ] Não força `toolChoice: 'required'` em step 0 (evita travar quando intenção é só editar layout).
- [ ] Modificar `src/features/canvas-orchestrator/orchestrator.ts`:
  - [ ] `prepareStep: buildPrepareStep({ sessionId })`.
- [ ] Commit: `feat(orchestrator): add prepareStep gating schema → dry_run → execute`.

**Critério de aceite:**
- Testes verdes.
- Manual: prompt "ajuste título do bloco X" não bloqueia em schema (pois não há intenção de SQL).

**Nota:** evitar `toolChoice: 'required'` rígido neste sprint — risco de loops em fluxos de edição. Política completa fica para Sprint posterior.

---

## Task 11 — `needsApproval` para queries grandes em `query_data`

**Objetivo:** gate por bytes processados estimados via dry-run.

- [ ] Modificar `src/features/canvas-orchestrator/tools/query-data.ts`:
  - [ ] Adicionar:
    ```ts
    needsApproval: async ({ sql }) => {
      try {
        const threshold = Number(process.env.BQ_APPROVAL_BYTES_THRESHOLD ?? 5 * 1024 ** 3);
        const client = getBigQueryClient();
        const [job] = await client.createQueryJob({ query: sql, dryRun: true, useLegacySql: false, defaultDataset: { datasetId, ...(projectId ? {projectId}:{}) } });
        const bytes = Number(job.metadata?.statistics?.totalBytesProcessed ?? 0);
        return bytes > threshold;
      } catch {
        return false; // se dry-run falha, deixa execute lidar com erro
      }
    }
    ```
  - [ ] Skip do `needsApproval` se `bqmlEnabled && /CREATE\s+(OR\s+REPLACE\s+)?MODEL/i.test(sql)` — modelo BQML tem caminho separado (Sprint Fase 2).
- [ ] Test `src/features/canvas-orchestrator/tools/__tests__/query-data-approval.test.ts`:
  - [ ] Mock `createQueryJob` retornando `totalBytesProcessed: '6000000000'` (6GB) → `needsApproval` true.
  - [ ] Mock retornando `1000000` (1MB) → false.
  - [ ] Threshold custom via env var respeitado.
  - [ ] dry-run rejeita → false (não bloquear).
- [ ] Adicionar `BQ_APPROVAL_BYTES_THRESHOLD=5368709120` ao `.env.example` com comentário.
- [ ] Commit: `feat(query-data): gate large queries via needsApproval (dry-run bytes)`.

**Critério de aceite:**
- Testes verdes.
- 5GB ≈ 5_368_709_120 bytes; ajustável.

**Nota de custo:** BigQuery on-demand $6.25/TB. 5GB ≈ $0.03. O gate é mais sobre detecção de outlier (queries acidentais sem WHERE) que custo absoluto.

---

## Task 12 — Telemetria — schema cache hit rate

**Objetivo:** expor métricas do cache do `get_table_schema_v2` e instrumentar via `recordSpan` (Sprint 1.B) ou wrapper local.

- [ ] Verificar se `recordSpan` existe em `src/shared/lib/observability/` (assumido pelo Sprint 1.B). Se não existir, criar stub local em `src/shared/lib/observability/record-span.ts` que apenas chama `console.debug` em dev.
- [ ] Modificar `src/features/ai-agents/tools/get-table-schema-v2.ts`:
  - [ ] Em cada `execute`, após retornar, chamar `recordSpan('schema_v2.lookup', { table, cacheHit: hitOrMiss, durationMs, datasetId })`.
  - [ ] Periodicamente (a cada N=10 lookups), emitir `recordSpan('schema_v2.cache_stats', getCacheStats())`.
- [ ] Test:
  - [ ] `getCacheStats()` retorna corretamente após sequência mock 7 hits / 3 misses → `hitRate ≈ 0.7`.
  - [ ] `recordSpan` é chamado uma vez por lookup (mock).
- [ ] Commit: `feat(schema-v2): expose cache stats and span telemetry`.

**Critério de aceite:**
- Testes verdes.
- Manual: 10 calls em sessão de dev → `getCacheStats().hitRate > 0.5`.

---

## Task 13 — Smoke E2E manual (acceptance script)

**Objetivo:** roteiro reproduzível de validação manual end-to-end.

- [ ] Criar `docs/superpowers/plans/2026-05-04-sprint1-C-acceptance.md` com:
  - [ ] Pré-requisitos: `pnpm bq:bootstrap-meta` executado, `SQL_GENERATIONS_LOGGING=true` no `.env.local`, `pnpm dev`.
  - [ ] **Cenário 1 — fluxo feliz:**
    1. Abrir canvas em `/dashboard/explore`.
    2. Pedir: "Crie um KPI com a soma de valor_contrato no último mês".
    3. Verificar no console: tool calls em ordem `plan_analysis → get_table_schema → dry_run_sql (valid: true) → query_data → add_kpi_block`.
    4. Conferir BQ: `SELECT * FROM liquid_meta.sql_generations ORDER BY ts DESC LIMIT 5;` mostra entry com `success=true, dry_run_valid=true, repair_attempts=0`.
  - [ ] **Cenário 2 — repair em ação:**
    1. Pedir: "Liste contratos com `valor_contrato_xpto` > 1000". (coluna inexistente — força erro).
    2. Verificar nos logs: `dry_run_sql` retorna `valid: false`, depois callback de repair gera SQL com nome correto (ex.: `valor_contrato`), `dry_run_sql` segunda vez retorna `valid: true`, `query_data` executa.
    3. Conferir BQ: row com `repair_attempts=1, dry_run_valid=true (final), success=true`.
    4. Repetir induzindo erro persistente (3 tentativas) — após 2 retries, modelo deve cair em `ask_user`.
  - [ ] **Cenário 3 — schema cache hit:**
    1. Mesma sessão, pedir 5 KPIs sequenciais sobre `contratos`.
    2. Verificar via dev tools (Network ou logs) que `get_table_schema_v2` faz round-trip BQ apenas na 1ª chamada.
    3. Logar `getCacheStats()` em endpoint debug temporário ou no console.
  - [ ] **Cenário 4 — needsApproval:**
    1. Mockar via env `BQ_APPROVAL_BYTES_THRESHOLD=1000` (1KB).
    2. Pedir qualquer query agregada que processe >1KB.
    3. Verificar UI: prompt de aprovação aparece antes de execução.
    4. Aprovar; query executa.
- [ ] Commit: `docs(sprint1-C): manual acceptance script`.

**Critério de aceite:**
- Documento existe.
- Após reviewer rodar manualmente os 4 cenários, todos passam.

---

## Acceptance Criteria global

- [ ] `pnpm test:run` verde, cobertura ≥ 80% em:
  - `src/features/ai-agents/tools/bq-dry-run-sql.ts`
  - `src/features/ai-agents/tools/get-table-schema-v2.ts`
  - `src/features/ai-agents/lib/repair-sql.ts`
  - `src/shared/lib/bigquery/sql-generation-logger.ts`
- [ ] `liquid_meta.sql_generations` populando em dev — verificar 5+ rows após smoke session.
- [ ] Schema cache hit rate > 50% após 10 chamadas em sessão.
- [ ] Repair: induzir erro proposital, verificar correção em ≤ 2 tentativas.
- [ ] Approval prompt aparece em query mockada >5GB (ou threshold custom).
- [ ] `pnpm build` sem warnings novos.
- [ ] `pnpm lint` clean.

---

## Riscos e rollback

| Risco | Mitigação | Rollback |
|---|---|---|
| IAM faltando para criar `liquid_meta` | Doc em `docs/observability/sql-generations-setup.md`; fallback de criação manual no console | `SQL_GENERATIONS_LOGGING=false` desliga logger sem afetar app |
| Cache em memória estoura RAM em routes serverless | LRU manual com `max=200`, TTL 1h | Reduzir `max` via constante; ou desabilitar cache (env flag) |
| Repair entra em loop | Cap rígido 2 retries por sessão, log alerta após 2 | Setar `EXPERIMENTAL_REPAIR_DISABLED=true` para no-op a callback |
| `dry_run_sql` extra latency (~200-500ms) | Trade-off aceitável vs custo de query inválida; medir via span | Remover `dry_run_sql` do prompt mandatório; modelo só usa se quiser |
| Vertex Gemini rejeita schemas com `optional` | Já mitigado por convenção `.nullable()`; revisar diff | Reverter campos para `optional` em casos isolados |
| `createQueryJob` API muda (BQ SDK upgrade) | Locked at `^8.1.1`; testes mockam | Pin versão exata se necessário |

**Rollback geral:** cada commit é reversível; ordem de revert (mais novo → mais antigo): 13 → 12 → 11 → 10 → 9 → 8 → 7 → 6 → 5 → 4 → 3 → 2 → 1. Tasks 1, 3, 6, 8 são puras (libs novas) — reverter não afeta runtime existente.

---

## Time de execução

- **Tasks 1, 3, 8** (libs puras com TDD): general-purpose subagent.
- **Tasks 2, 4, 9, 10** (integração no orchestrator): general-purpose subagent (sequencial após libs).
- **Tasks 5, 6, 7** (BQ infra + logging): general-purpose subagent com acesso a credenciais GCP dev.
- **Tasks 11, 12, 13** (gates + acceptance): general-purpose subagent.

**Ordem de execução recomendada (dependências):**

```
Task 1 ─┐
Task 3 ─┼─→ Task 2, 4 ─┐
Task 5 ─┼─→ Task 6 ──→ Task 7 ─┤
Task 8 ─┘                       ├─→ Task 9 ─→ Task 10 ─→ Task 11 ─→ Task 12 ─→ Task 13
                                │
                              (orchestrator wiring converge aqui)
```

Tasks 1, 3, 5, 8 podem rodar em paralelo (independentes). Tasks 2, 4, 6, 7 dependem das libs. Tasks 9-13 são sequenciais no orchestrator.

---

## Self-review checklist (autor)

- [x] Header obrigatório presente.
- [x] 13 tasks (entre 12-16).
- [x] Cada task tem files + steps de teste antes de implementação.
- [x] Acceptance criteria mensuráveis.
- [x] Riscos com mitigação e rollback.
- [x] Referências cruzadas com plano-fonte (`mastra-tools-sql-bqml.md` §3, §6, §7).
- [x] Path absolutos e nomes de tools consistentes com codebase real (`get_table_schema`, `query_data`, `dry_run_sql`).
- [x] AI SDK v6 features citados (`experimental_repairToolCall`, `prepareStep`, `needsApproval`).
- [x] BigQuery API endpoints concretos (`createQueryJob`, `dryRun: true`, `totalBytesProcessed`).
- [x] Multi-tenant safety: `liquid_meta` cross-client, mas tabelas analíticas continuam por-cliente.
- [x] Observabilidade: cada SQL passa por logger; cache stats expostos.
