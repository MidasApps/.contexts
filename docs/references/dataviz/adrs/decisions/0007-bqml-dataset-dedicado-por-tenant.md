---
id: 0007
title: BQML — dataset dedicado por tenant + cache per-tenant com hash determinístico
status: Accepted
date: 2026-05-04
deciders: [giulliano.soares]
consulted: [time-data, time-ai]
informed: [time-eng, compliance]
tags: [bqml, bigquery, iam, multi-tenancy, cache]
supersedes: []
related: [0006]
---

# ADR-0007 — BQML: dataset dedicado por tenant + cache per-tenant

## Status

`Accepted` — desde 2026-05-04.

Histórico:
- 2026-05-04 — proposta.
- 2026-05-04 — aceita após revisão cruzada com planos macro, specs Sprint 1-3 e ADRs relacionadas.
  no Sprint 2.C.

## Contexto

Os helpers `bqml-utils.ts` (`src/features/ai-agents/tools/bqml-utils.ts`) já existem
(`trainModel`, `queryBQML`, `modelRef`, `safeColumn`, `dropModel`, `sessionModelRef`),
mas BQML é subutilizado pelos orchestrators (plano
`2026-05-04-mastra-tools-sql-bqml.md` §1):

- Não há tools de primeira classe (`bqml.list_models`, `bqml.suggest_model`,
  `bqml.create_or_use_model`, `bqml.forecast/predict/detect_anomalies`).
- Sem registry → todo run recriaria modelo do zero (caro: ARIMA_PLUS é tarifa
  premium $250/TB).
- Sem `bqml.suggest_model` mapeando problema→tipo (ARIMA_PLUS, KMEANS,
  BOOSTED_TREE_CLASSIFIER, AUTOENCODER), o modelo evita BQML.

Forças entrelaçadas:

1. **IAM — CREATE MODEL**. A SA da route `/api/bigquery` é provavelmente read-only
   (`bigquery.dataViewer` + `jobUser`). CREATE MODEL exige `bigquery.models.create` +
   DDL no dataset. Conceder `dataEditor` em datasets de produção (`liquid_play_om`,
   etc.) é inaceitável — risco de `DROP TABLE` por bug ou prompt injection.
2. **Custo de training**. ARIMA_PLUS cobra $250/TB processado em training; logistic
   e KMEANS usam preço on-demand ($6.25/TB). Threshold de aprovação deve estar em
   **dólares**, não só em minutos.
3. **Multi-tenancy** (ADR-0006). Modelo treinado em dados de OM **não pode** ser
   usado em queries de BRZ — features iguais não justificam reuso, dados são
   distintos. Cache global por hash de features cruzaria tenants.
4. **Schema drift**. Cache key apenas com nomes de features é frágil — mudança de
   tipo de coluna (`NUMERIC` → `BIGNUMERIC`, ou nova nullability) deveria invalidar
   o modelo. Hash precisa cobrir o **DDL das colunas-fonte**.
5. **`sessionModelRef`** existe como helper de dev — útil mas não para produção.

## Decisão

**(1) Datasets BQML dedicados por tenant: `liquid_bqml_<client>` (`liquid_bqml_om`,
`liquid_bqml_brz`, `liquid_bqml_conx`, `liquid_bqml_imcasa`), com Service Account
`liquid-bqml-sa` que recebe `bigquery.dataEditor` apenas nesses datasets.**

**(2) Cache de modelos per-tenant via tabela `liquid_meta.bqml_model_registry`,
indexada por hash determinístico:**
```
sha1(client_id || intent || features_canonical || target || safra_window_end || source_columns_ddl_hash)
```

**(3) Aprovação humana (`needsApproval`) em jobs com custo estimado > $5 USD ou
training estimado > 5 minutos.**

Especificações concretas:

### Datasets

- Datasets de leitura (existentes): `liquid_play_om`, `liquid_play_brz`,
  `liquid_play_conx`, `liquid_play_imcasa` — **permanecem read-only** com SA
  `liquid-app-sa` (`bigquery.dataViewer` + `bigquery.jobUser`).
- Datasets de modelo (novos, Sprint 2.C): `liquid_bqml_<client>` em mesma região
  (`southamerica-east1`).
- Dataset meta: `liquid_meta` (existente, ver Sprint 1.C `liquid_meta.sql_generations`)
  — adiciona `bqml_model_registry` e `bqml_invocations`.

### Service Accounts

| SA | Roles | Datasets |
|---|---|---|
| `liquid-app-sa` | `bigquery.dataViewer`, `bigquery.jobUser` | `liquid_play_*` (read), `liquid_meta` (read+write) |
| `liquid-bqml-sa` | `bigquery.dataEditor`, `bigquery.jobUser`, `bigquery.models.create` | `liquid_bqml_<client>` (4 datasets) |

Tools de BQML usam `liquid-bqml-sa` via `BIGQUERY_BQML_SA_KEY` env var.
Tools de leitura (`query_data`, `dry_run_sql`) usam `liquid-app-sa`.

### Tabela registry

```sql
CREATE TABLE liquid_meta.bqml_model_registry (
  hash STRING NOT NULL,                    -- sha1 determinístico
  client_id STRING NOT NULL,
  intent STRING NOT NULL,                  -- 'forecast_inadimplencia_safra' etc
  model_ref STRING NOT NULL,               -- `liquid_bqml_om.model_<hash8>`
  model_type STRING NOT NULL,              -- ARIMA_PLUS | KMEANS | ...
  features_canonical STRING NOT NULL,      -- JSON canônico ordenado
  target STRING,
  safra_window_end DATE,
  source_columns_ddl_hash STRING NOT NULL, -- sha256 do DDL ordenado
  created_at TIMESTAMP NOT NULL,
  last_used_at TIMESTAMP,
  use_count INT64 NOT NULL DEFAULT 0,
  train_bytes_processed INT64,
  train_cost_usd_estimated NUMERIC,
  metrics_json JSON
);
```

PK lógica: `(hash, client_id)`. Cluster por `client_id`.

### Hash determinístico

`features_canonical`: array ordenado lexicograficamente, JSON.stringify.
`source_columns_ddl_hash`: query a `INFORMATION_SCHEMA.COLUMNS` filtrada para as
colunas-fonte, ordenada por `column_name`, projetada como
`column_name|data_type|is_nullable`, juntada com `\n`, sha256.

```ts
const hash = sha1([
  clientId,
  intent,
  JSON.stringify(featuresCanonical),
  target ?? '',
  safraWindowEnd?.toISOString().slice(0,10) ?? '',
  sourceColumnsDdlHash,
].join('|'));
```

### Tool flow `bqml.create_or_use_model`

```
1. Compute hash → SELECT FROM bqml_model_registry WHERE hash=$1 AND client_id=$2.
2. Se hit:
     UPDATE last_used_at, use_count++; return modelRef.
3. Se miss:
     - bqml.suggest_model fornece model_type + ddl_template + estimated_train_bytes
     - estimated_cost_usd = bytes × tariff(model_type)
     - if estimated_cost_usd > $5 OR estimated_train_minutes > 5: needsApproval
     - User approves → CREATE MODEL `liquid_bqml_<client>.model_<hash8>` ...
     - INSERT INTO bqml_model_registry; return modelRef.
4. Yields preliminary results { phase: 'training', progress, etaMs } a cada N segundos.
```

### Invalidação

- **TTL**: 30 dias sem reuso → marca `deprecated`, não deleta automaticamente
  (auditoria).
- **Schema drift**: cron semanal recalcula `source_columns_ddl_hash` para tabelas
  fonte; se diferente, marca `deprecated`.
- **Safra advance**: quando `safra_max_disponivel` avança ≥1 mês, modelos com
  `safra_window_end` antigo são marcados `stale` e re-treinados sob demanda.

### Logging

- Cada invocação BQML em `liquid_meta.bqml_invocations`
  `(timestamp, client_id, hash, model_ref, action, latency_ms, bytes_billed,
   cost_usd, success, error)`. Fire-and-forget.

### `sessionModelRef`

- Mantido como **fallback dev only** (env `BQML_USE_SESSION_REF=true`). Em produção,
  `BQML_USE_SESSION_REF=false` força registry.

## Consequências

### Positivas
- **IAM seguro**: `liquid-bqml-sa` não toca dados de produção; `liquid-app-sa` não
  cria modelos. Privilege separation.
- **Multi-tenancy correto**: zero risco de modelo cross-tenant — datasets fisicamente
  separados.
- **Cache eficaz**: hash determinístico cobre features+target+safra+DDL — cache hit
  é seguro (mesmas features sobre mesmos dados ⇒ mesmo modelo).
- **Custo controlado**: aprovação por custo USD evita training surpresa (ex:
  ARIMA_PLUS sobre 500GB).
- **Auditoria**: `bqml_invocations` registra tudo.

### Negativas / Trade-offs
- **Sem reuso cross-tenant**: modelo idêntico entre clientes seria treinado 4×.
  Aceitável para correção; volume de retreinos baixo (registry cobre o caso comum).
- **Provisionamento extra**: 4 datasets + SA + IAM em `terraform/` ou setup manual.
  Custo único.
- **Latência de hash check**: query ao registry adiciona ~100ms a cada call BQML.
  Aceitável (training real custa ordens de grandeza mais).
- **Aprovação humana**: bloqueia pipeline quando custo alto. Mitigação:
  `bqml.suggest_model` retorna estimativas para o usuário decidir antes de tentar.

### Neutras
- Modelos antigos `deprecated` continuam consultáveis (`ML.PREDICT`) — cleanup
  manual quando volume incomodar.
- Scripts de seed/desfazer: criar `scripts/bqml-provisioning.sh` para reprodutibilidade.

## Alternativas consideradas

### Alternativa A — Dataset compartilhado com prefixo de cliente
**Pros**: 1 dataset, IAM mais simples.
**Cons**: prefixo é convenção, não enforcement; bug em modelRef → vazamento;
permission é por dataset, não por table — qualquer modelo é legível por todos.
**Por que rejeitada**: viola ADR-0006 (isolamento físico onde possível).

### Alternativa B — Cache global por hash de features (sem `client_id`)
**Pros**: máximo reuso.
**Cons**: cruza tenants — modelo de OM serve query de BRZ. Inaceitável.
**Por que rejeitada**: viola ADR-0006.

### Alternativa C — Sem cache (treina sob demanda)
**Pros**: simplicidade.
**Cons**: custo recorrente alto (ARIMA_PLUS $250/TB), latência alta (modelo retreinado
a cada call), ineficaz para uso real.
**Por que rejeitada**: inviável economicamente.

### Alternativa D — Vertex AutoML Tables em vez de BQML
**Pros**: modelos potencialmente melhores em classification.
**Cons**: dataset BQ → CSV → Vertex (ETL), latência maior, custo maior, exige
training pipeline separado.
**Por que rejeitada**: BQML cobre 80% dos casos de crédito imobiliário (forecast
ARIMA_PLUS, classification BOOSTED_TREE, KMEANS); AutoML reservado a casos onde
BQML falhar mensuravelmente.

## Implementação

- **Plano macro**: `docs/superpowers/plans/2026-05-04-mastra-tools-sql-bqml.md` §3,
  §4, §6 (BQML decision tree e templates).
- **Spec sprint**: `docs/superpowers/specs/2026-05-04-sprint2-C-bqml-first-class.md`.
- **Provisionamento** (Sprint 2.C Task inicial):
  - Criar 4 datasets `liquid_bqml_<client>` em `southamerica-east1`.
  - Criar SA `liquid-bqml-sa` + role bindings.
  - Adicionar `bqml_model_registry` e `bqml_invocations` em `liquid_meta`.
- **Tools a criar** (`src/features/ai-agents/tools/bqml/`):
  - `list-models.ts`, `suggest-model.ts`, `create-or-use-model.ts`
  - `forecast.ts`, `predict.ts`, `detect-anomalies.ts`
  - `templates/{forecast,clustering,classification,anomaly}.ts`
- **Helpers reusados** (`src/features/ai-agents/tools/bqml-utils.ts`):
  `trainModel`, `queryBQML`, `modelRef`, `safeColumn`, `dropModel`. Não recriar.
- **Variáveis de ambiente**:
  - `BIGQUERY_BQML_SA_KEY` (path para JSON da SA `liquid-bqml-sa`)
  - `BQML_APPROVAL_COST_USD_THRESHOLD=5`
  - `BQML_APPROVAL_MINUTES_THRESHOLD=5`
  - `BQML_USE_SESSION_REF=false` (prod) | `true` (dev local)
- **Decision tree** documentada em
  `src/features/ai-agents/tools/bqml/decision-tree.md`.

## Referências

- `docs/superpowers/plans/2026-05-04-mastra-tools-sql-bqml.md` §3, §4, §6.
- `docs/superpowers/specs/2026-05-04-sprint2-C-bqml-first-class.md`
- `src/features/ai-agents/tools/bqml-utils.ts` (existente, envelopado).
- `adrs/vercel-ai-sdk.md` §4.3 — `needsApproval`, preliminary results, `async *execute`.
- BigQuery ML pricing: https://cloud.google.com/bigquery-ml/pricing
- ADR-0006 (multi-tenancy strict isolation) — esta ADR materializa para BQML.
