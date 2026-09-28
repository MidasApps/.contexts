# Plano: Tools, SQL e BQML para Dashboard Builder

**Data**: 2026-05-04
**Escopo**: Redesenho do tool catalog do Canvas Orchestrator e do Orchestrator Analítico para gerar SQL confiável, usar BQML quando vale a pena, e habilitar reuso via catálogo de queries.

---

## 1. Diagnóstico

**Por que SQL falha hoje?**
- `get_table_schema` retorna apenas tipos, sem stats de coluna (NULL ratio, distinct count, min/max, sample values). O modelo inventa valores de filtro (`WHERE status = 'ATIVO'` quando o domínio real é `'A'`) e nomes próximos (`vlr_contrato` vs `valor_contrato`).
- Não há feedback loop estruturado: quando `query_data` falha, o modelo recebe a mensagem de erro crua. Sem dry-run prévio, cada tentativa custa scan real.
- Multi-cliente (OM/BRZ/CONX/IMCASA) com schemas parcialmente divergentes força o modelo a memorizar diferenças, sem `schema.describe_relationships`.

**Por que BQML é subutilizado?**
- `bqml-utils.ts` (`src/features/ai-agents/tools/bqml-utils.ts`) já existe com helpers `trainModel`, `queryBQML`, `modelRef`, `safeColumn`, `dropModel`, `sessionModelRef` — porém **não está exposto como tool de primeira classe**. O modelo precisaria reescrever DDL dentro de `query_data`.
- `query-data.ts` já recebe `bqmlEnabled`, ou seja, parte do gate está implementada — falta o catálogo de tools que o modelo possa invocar deliberadamente.
- Sem `bqml.list_models`, todo run recriaria modelo do zero. Sem `bqml.suggest_model` mapeando problema → tipo (ARIMA_PLUS, KMEANS, BOOSTED_TREE_CLASSIFIER, AUTOENCODER), o modelo evita BQML.

**Tools faltando**: dry-run validator, validated-queries RAG, family BQML (list/suggest/create_or_use/predict/forecast/detect_anomalies), schema enriquecido com stats, `describe_relationships`. Repair de SQL **não** é tool — é callback do AI SDK (ver §3).

---

## 2. Tool Catalog Redesenhado

| Tool | Tipo | Propósito |
|---|---|---|
| `bq.dry_run_sql` | static | BQ dry-run: valida sintaxe, retorna schema do result, bytes processados, EXPLAIN. Custo zero. **Sempre antes de execute.** |
| `bq.list_validated_queries` | static + RAG | Vector search sobre catálogo de SQLs aprovados (embedding sobre `description + schema_keys`). Pattern: `vector-query-tool`. |
| `bq.save_validated_query` | static, `needsApproval: true` | Persiste SQL no catálogo após uso bem-sucedido + revisão humana. |
| `bqml.list_models` | static | Lista modelos do dataset por cliente. Cache 1h. Envelopa `modelRef` de `bqml-utils.ts`. |
| `bqml.suggest_model` | static | Input: `{problem, target, features}` → output: `{model_type, ddl_template, expected_train_minutes, expected_train_bytes}`. |
| `bqml.create_or_use_model` | static, `needsApproval` quando cria | Hash de `(client_id, features, target, dataset, safra_window, source_columns_ddl_hash)` — reusa se hit, cria se miss. Envelopa `trainModel`. Yields preliminary results durante training. |
| `bqml.forecast` | static | Wrapper sobre `queryBQML` + `ML.FORECAST` (ARIMA_PLUS). |
| `bqml.predict` | static | Wrapper `ML.PREDICT`. |
| `bqml.detect_anomalies` | static | Wrapper `ML.DETECT_ANOMALIES`. |
| `schema.describe_relationships` | static | Heurística: detecta FK por convenção (`*_id` → PK em outra tabela). Retorna grafo. |
| `schema.get_table_schema` (refine) | static | Inclui stats por coluna: `null_ratio`, `approx_distinct`, `min/max/p50`, `top_5_values`. Resultado multi-modal: texto estruturado + opcional ER diagram PNG (base64) via `toModelOutput`. |

**Multi-modal tool results** (vide `adrs/vercel-ai-sdk.md` §4.3 "Multi-modal Tool Results", linhas 890-914): suporta texto + media (base64). `bq.dry_run_sql` retorna texto estruturado (`schema`, `bytes_processed`, `explain_plan`); preview de visualização pode ser anexado como imagem PNG base64 quando aplicável, via `toModelOutput`.

**Mecanismos de runtime (não tools)**:
- `experimental_repairToolCall` (§4.3 "Tool Call Repair", linhas 866-888): callback no `generateText`/`streamText` do orchestrator que recebe `{originalSQL, bqError, schemaContext}` e devolve SQL corrigido. **Roda no consumer**, não em tool dynamic.

---

## 3. Padrões de Tool-Call Disciplinados

- **Strict mode + Zod**: schemas usam `.nullable()` em vez de `.optional()` (`adrs/vercel-ai-sdk.md` §4.18). Vertex Gemini valida estrito; `optional` quebra silenciosamente. `temperature: 0` para tool-calling determinístico (§4.18).
- **`needsApproval`** (§4.3 "Tool Execution Approval", linhas 599-656, com `ToolApprovalResponse`):
  - `bqml.create_or_use_model`: gate por **bytes de training estimados** (não só tempo) — ver §4.
  - `bq.dry_run_sql` flagga aprovação se `bytes_processed > 5 GB` (≈ $0.03 on-demand a $6.25/TB; threshold ancorado em custo unitário, ajustável a % de quota mensal do projeto).
  - `bq.save_validated_query`: sempre.
- **Preliminary results** (§4.3 "Preliminary Tool Results", linhas 794-818, `async *execute`): `bqml.create_or_use_model` faz `yield { phase: 'training', progress: 0.3 }` durante CREATE MODEL.
- **`prepareStep` + `toolChoice`**: `prepareStep` apenas restringe quais tools o modelo vê em cada step — **não força ordem de chamada**. Para sequenciar schema → dry_run → execute, combina-se `activeTools` + `toolChoice: 'required'`:
  - Step 1: `activeTools: ['get_table_schema', 'get_sample_data']`
  - Step 2: `activeTools: ['bq.dry_run_sql']` + `toolChoice: 'required'`
  - Step 3: `activeTools: ['query_data']` + `toolChoice: 'required'`
- **Repair budget**: `experimental_repairToolCall` é uma `generateObject` adicional por retry — custo real. Cap **2 retries**, fallback para `ask_user`. Log cumulativo de tokens/$ por sessão em `liquid_meta.sql_generations` (ver §8).

---

## 4. Custo, IAM e Cache de BQML

**Custo financeiro de training**. BQML cobra por byte processado em training: ARIMA_PLUS é tarifa premium ($250/TB); logistic/kmeans usam preço on-demand ($6.25/TB). `bqml.suggest_model` deve estimar `expected_train_bytes` (linhas × largura média × passes), e `needsApproval` deve disparar acima de threshold em **dólares**, não só em minutos. Default proposto: aprovação se `estimated_cost_usd > $5` ou `expected_train_minutes > 5`.

**IAM para CREATE MODEL**. A service account de `/api/bigquery` é provavelmente read-only (`bigquery.dataViewer` + `jobUser`). CREATE MODEL exige `bigquery.models.create` + DDL no dataset. Recomendação: criar dataset dedicado `liquid_bqml_<client>` com SA própria que tem `bigquery.dataEditor` apenas nesse dataset. Dados de origem permanecem em datasets read-only; modelos são escritos isoladamente. Decisão a tomar antes da Fase 2.

**Schema drift e cache key**. Cache key inclui hash do **DDL das colunas-fonte**, não apenas nomes de features. Mudança de tipo de coluna (NUMERIC → BIGNUMERIC, ou nova nullability) invalida cache automaticamente. Composição: `sha1(client_id || features_canonical || target || safra_window_end || source_columns_ddl_hash)`.

**Cache global vs `sessionModelRef`**. `bqml-utils.ts` hoje isola modelos por sessão (`sessionModelRef`). Plano de cache global tem dois caminhos: (a) **modelo compartilhado por hash** entre tenants — eficiente, mas mistura dados de OM/BRZ/CONX/IMCASA num mesmo modelo, inaceitável; (b) **per-tenant** — chave inclui `client_id`, modelos vivem em datasets segregados, menos eficiente porém correto sob multi-cliente. **Recomendação: per-tenant.** `sessionModelRef` continua como fallback dev (desabilitado em prod).

---

## 5. MCP Server Interno — Tradeoff

**Recomendação: NÃO expor BQ/BQML como MCP server agora.** Razões reais (vide `adrs/mastra/tools/mcp-server.mdx`):
- **Sem consumidor externo**: somos mono-app; orchestrator interno consome tools diretamente via TS. MCP brilha para interop entre IDEs/agentes externos (Cursor, Claude Desktop) — não há esse caso ainda.
- **Overhead operacional**: stdio/HTTP transport, serialização JSON-RPC, deploy/healthcheck adicionais.
- **Perda de tipagem TS nativa**: schemas Zod compartilhados entre orchestrator e tools deixam de ser checados em compile-time.
- **Complexidade de transporte**: autenticação por sessão, propagação de `client_id`/auth Firebase exige adapter.

(`experimental_repairToolCall` roda no orchestrator e funciona com qualquer transport — o argumento "MCP perde repair" é **falso** e foi removido.)

**Quando reconsiderar**: ≥1 consumidor externo concreto (NXZ, app móvel, outro produto Liquid). Plano: manter tools puras (sem coupling com canvas state) para envelopar em MCPServer depois.

---

## 6. Smart BQML Decision Tree

```
problema = ?
├── forecast univariada (PDD próximos 6m, inadimplência por safra)
│     └── BQML ARIMA_PLUS (sazonalidade automática, holidays_region='BR')
├── forecast multivariada com regressores macro (Selic, IPCA)
│     └── BQML ARIMA_PLUS_XREG OU forecast_timeseries (Python) se < 100 séries
├── clustering de safras / clientes / contratos
│     └── BQML KMEANS (K via ML.EVALUATE silhouette)
├── classification (propensity-to-default, churn)
│     ├── < 1M rows → BOOSTED_TREE_CLASSIFIER
│     └── > 10M rows ou feature engineering pesado → AutoML Tables
├── anomaly em PDD / fluxo de caixa
│     └── BQML AUTOENCODER ou ARIMA_PLUS com detect_anomalies
└── causal / counterfactual
      └── NÃO BQML — usar run_causal_analysis (DoWhy externo)
```

**Templates por domínio (Crédito Imobiliário)**:
- `tpl_forecast_inadimplencia_safra` → ARIMA_PLUS, partition por safra, horizonte 12m
- `tpl_cluster_safras` → KMEANS sobre `[ltv, prazo, taxa, score_origem]`
- `tpl_propensity_default` → BOOSTED_TREE_CLASSIFIER, target = `dias_atraso > 90`
- `tpl_anomaly_pdd_mensal` → AUTOENCODER sobre série mensal de PDD por bucket

**Registry**: tabela `liquid_meta.bqml_model_registry` (`model_id, hash, client_id, created_at, last_used, train_bytes, metrics_json`). TTL 30d ou invalidação quando `safra_max_disponivel` avança ≥1 mês.

---

## 7. Schema-Aware SQL Generation Pattern

```
1. recuperar_schema_enriquecido(table)
     → cols + stats + descrições (RAG sobre data dictionary se existir)
2. bq.list_validated_queries(intent_text)
     → top-3 SQLs validados
3. sql_draft = compor(schema, queries_similares, intent)
4. dry = bq.dry_run_sql(sql_draft)
     if not dry.valid:
         → experimental_repairToolCall(error=dry.error, schemaContext)
         → goto 4 (max 2 retries; depois ask_user)
5. result = query_data(sql_draft)
     if rowCount == 0 or |outliers| > threshold:
         flag_for_review(); ask_user("0 linhas — verificar filtro X?")
6. opcional: bq.save_validated_query(sql_draft)  [needsApproval]
```

**Bootstrap do catálogo de validated queries**. O catálogo nasce vazio. Estratégia: nos primeiros 30 dias após Fase 1, **minerar o histórico de `query-data`** (logs de `liquid_meta.sql_generations`, ver §8) — selecionar SQLs com `success=true`, `rows>0`, latência <10s, e curar manualmente top-100. Só após esse seed o `bq.list_validated_queries` é ativado no flow do orchestrator (até lá retorna vazio sem prejudicar a chain).

---

## 8. Observabilidade do SQL Gerado

Tabela `liquid_meta.sql_generations` registra cada geração: `(timestamp, persona, client_id, intent, sql_draft, dry_run_result, repair_attempts, final_sql, rows, latency_ms, bytes_billed, success, error)`. Usos: (a) post-mortem de falhas, (b) dataset de evals para `tool-call-accuracy`, (c) fonte para mineração do catálogo de validated queries (§7), (d) tracking de custo cumulativo de repair por sessão.

---

## 9. Plano de Adoção em Fases

### Fase 1 — Foundation (≤2 semanas)
- [ ] `bq.dry_run_sql` (BigQuery `dryRun: true` job config)
- [ ] `experimental_repairToolCall` no canvas orchestrator (cap 2 retries)
- [ ] Refine `schema.get_table_schema` com stats (`APPROX_COUNT_DISTINCT`, `COUNTIF(IS NULL)`, `TABLESAMPLE`)
- [ ] `prepareStep` + `toolChoice` enforcement (schema → dry_run → execute)
- [ ] Migrar tool schemas: `optional` → `nullable`; `temperature: 0`
- [ ] Tabela `liquid_meta.sql_generations` + logging
- [ ] Eval: Mastra `tool-call-accuracy` (`adrs/mastra/evals/tool-call-accuracy.mdx`) sobre 30 perguntas → SQL. Meta: ≥80% sem repair, ≥95% com repair.

### Fase 2 — BQML First-Class (≤2 semanas)
- [ ] Provisionar dataset `liquid_bqml_<client>` + SA com `bigquery.models.create`
- [ ] Envelopar `bqml-utils.ts` (`trainModel`, `queryBQML`, `modelRef`) em tools `bqml.list_models`, `bqml.suggest_model`, `bqml.create_or_use_model` (cache per-tenant + DDL hash)
- [ ] Templates `tpl_forecast_inadimplencia_safra`, `tpl_cluster_safras`, `tpl_propensity_default`, `tpl_anomaly_pdd_mensal`
- [ ] `bqml.forecast` / `predict` / `detect_anomalies`
- [ ] `liquid_meta.bqml_model_registry` + invalidation cron
- [ ] Preliminary results streaming durante CREATE MODEL
- [ ] `needsApproval` por bytes/$ estimados
- [ ] Eval: 15 perguntas onde BQML é a resposta certa. Meta: agente escolhe BQML em ≥70%.

### Fase 3 — Catalog & Optional MCP (≤2 semanas)
- [ ] Seed do catálogo via mineração de `liquid_meta.sql_generations` (curadoria humana)
- [ ] `bq.list_validated_queries` (Vertex embeddings + Vector Search ou pgvector)
- [ ] `bq.save_validated_query` com `needsApproval`
- [ ] `schema.describe_relationships`
- [ ] **Decisão MCP**: avaliar MCPServer somente se ≥1 consumidor externo concreto.
- [ ] Eval contínuo: `trajectory-accuracy` sobre flows chart-with-bqml.

---

## Referências

- `adrs/vercel-ai-sdk.md` §4.3 (Tool Call Repair, Tool Execution Approval, Preliminary Tool Results, Multi-modal Tool Results); §4.18 (`.nullable()`, `temperature: 0`)
- `adrs/mastra/tools/create-tool.mdx`, `vector-query-tool.mdx`, `mcp-server.mdx`
- `adrs/mastra/evals/tool-call-accuracy.mdx`, `trajectory-accuracy.mdx`, `create-scorer.mdx`
- `src/features/canvas-orchestrator/orchestrator.ts`, `tools/fill-block.ts`
- `src/features/ai-agents/tools/bqml-utils.ts` (helpers existentes a expor como tools)
- `src/features/ai-agents/tools/query-data.ts` (`bqmlEnabled` flag já presente)
