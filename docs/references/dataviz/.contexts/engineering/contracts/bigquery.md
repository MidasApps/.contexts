---
title: Convenções de Modelagem para BigQuery
type: contracts
scope: warehouse analítico (OLAP) no GCP
status: active
last_updated: 2026-05-20
related:
  - "@rules/data-modeling"
  - "@rules/migration"
  - "@rules/governance"
  - "@rules/security"
  - "@rules/performance"
  - "@rules/observability"
  - "@contracts/events"
  - "@contracts/schemas"
  - "@architecture/ddd"
---

# Convenções de Modelagem para BigQuery

Este documento define a doutrina de modelagem de dados no BigQuery. Não cobre o manual da ferramenta (não existe `@stacks/database/bigquery` — BigQuery é tratado como destino analítico, não como stack de aplicação). Aqui ficam as regras de como o time desenha datasets, tabelas, colunas, partitioning, clustering, schema evolution, governance e ingestion no warehouse.

---

## 1. O que é e quando usar

BigQuery é o **warehouse analítico serverless** do GCP. Use **somente** para cargas OLAP: agregações em grandes volumes (GB-PB), análise histórica, BI, pipelines de avaliação de IA, observabilidade de produto e analytics.

**Não use BigQuery como:**
- Banco de serving para aplicação (latência de query é segundos, não milissegundos).
- Substituto de OLTP — para isso, ver `@stacks/database/postgres` (transacional relacional) ou `@stacks/database/firebase-firestore` (transacional documental).
- Fila ou broker de eventos — eventos chegam ao BQ via sink (ver `@contracts/events`).

**Regra-mãe:** se a query precisa retornar em menos de 200ms para um usuário final, **não é BigQuery**. Se a query agrega TBs ou cruza meses de histórico para análise, **é BigQuery**.

---

## 2. Posicionamento no projeto

BigQuery é o **destino analítico** dos seguintes fluxos:

- Eventos de domínio publicados pelas aplicações (ver `@contracts/events`).
- Exports periódicos ou CDC de Firestore (`@stacks/database/firebase-firestore`) e Postgres (`@stacks/database/postgres`).
- Telemetria de aplicação e logs estruturados.
- Telemetria de IA: chamadas de LLM, custo, latência, qualidade (ver seção 14).

BigQuery **não é fonte de verdade** para dados operacionais. É um espelho analítico — a fonte continua sendo o OLTP de origem.

---

## 3. Naming

### 3.1 Projetos GCP

Padrão: `<env>-<scope>`.

Correto:
- `prod-analytics`
- `staging-analytics`
- `dev-analytics`

Incorreto:
- `analyticsProd` (camelCase)
- `prod_analytics` (snake_case em project ID — GCP exige hífen)
- `analytics` (sem env)

### 3.2 Datasets

Padrão: `snake_case`, agrupando por **bounded context** (ver `@architecture/ddd`). Um dataset representa um contexto delimitado de dados, nunca um catch-all.

Correto:
- `auth_events`
- `billing_facts`
- `ai_observability`
- `catalog_dim`
- `audit_log`

Incorreto:
- `data` (genérico demais)
- `AuthEvents` (PascalCase)
- `misc` (lixeira semântica)
- `prod_data` (env não pertence ao dataset; pertence ao projeto)

### 3.3 Tables

Padrão: `snake_case`, **singular** para tabelas de fato e dimensão.

Correto:
- `user_signup_event`
- `payment_succeeded_event`
- `dim_user`
- `dim_product`
- `fact_subscription_revenue`

Incorreto:
- `Users` (PascalCase + plural sem motivo)
- `tblUsers` (prefixo húngaro)
- `user-signup` (hífen não é válido em table ID)

Quando o time convencionar pluralidade explicitamente (ex.: agregados pré-computados), documente a exceção no próprio dataset README.

### 3.4 Columns

Padrão: `snake_case` **sempre**. BigQuery é case-insensitive em nomes de coluna mas armazena o case original — não confie nisso.

Correto:
- `event_id`, `event_time`, `tenant_id`, `prompt_tokens`

Incorreto:
- `eventId` (camelCase)
- `EventTime` (PascalCase)
- `event-id` (hífen inválido)
- `from`, `select`, `table` (reservadas — evitar)

---

## 4. Star schema e denormalização

BigQuery favorece **denormalização**: storage é barato, JOINs são caros (shuffle distribuído).

Doutrina:
- Fact tables contêm eventos ou métricas observadas, com `*_id` apontando para dimensões.
- Dimension tables contêm atributos descritivos relativamente estáveis.
- **Prefira denormalizar** atributos de dimensão pequena/estável diretamente no fato quando o JOIN for executado em toda query analítica.
- **Prefira STRUCT/ARRAY** (seção 5) sobre tabelas auxiliares para dados nested ou repeated do mesmo evento.

Anti-pattern: replicar modelagem relacional 3NF do OLTP no BigQuery. O warehouse não é o OLTP.

---

## 5. STRUCT e ARRAY (RECORD e REPEATED)

BigQuery suporta nested e repeated nativamente. Use.

- `STRUCT` (`RECORD`): agrupa campos relacionados. Use para payloads de eventos, contexto, metadata.
- `ARRAY` (`REPEATED`): lista de elementos. Use para tags, line items, tool calls, qualquer relação 1:N do mesmo evento.
- `ARRAY<STRUCT<...>>`: combinação canônica para coleção nested.

Correto:
```sql
CREATE TABLE billing_facts.payment_event (
  event_id STRING,
  event_time TIMESTAMP,
  tenant_id STRING,
  user_id STRING,
  payment STRUCT<
    amount NUMERIC(18, 2),
    currency STRING,
    method STRING
  >,
  line_items ARRAY<STRUCT<
    sku STRING,
    quantity INT64,
    unit_price NUMERIC(18, 2)
  >>
)
```

Incorreto: criar `payment_line_items` como tabela separada e exigir JOIN em toda query analítica.

---

## 6. Tipos

Tipos canônicos por categoria:

| Categoria | Tipo BigQuery |
|---|---|
| Texto | `STRING` (nunca `VARCHAR` — não existe) |
| Inteiro | `INT64` |
| Decimal científico | `FLOAT64` |
| **Money / precisão fixa** | `NUMERIC(p, s)` ou `BIGNUMERIC(p, s)` (ver `@rules/data-modeling`) |
| Booleano | `BOOL` |
| Binário | `BYTES` |
| Data sem hora | `DATE` |
| Hora sem data | `TIME` |
| Data + hora sem TZ | `DATETIME` |
| **Instante UTC** | `TIMESTAMP` |
| Intervalo | `INTERVAL` |
| Geo | `GEOGRAPHY` |
| Semi-estruturado | `JSON` |

Regras:
- **Event time é sempre `TIMESTAMP` em UTC.** Nunca `STRING`. Nunca `DATETIME` sem TZ.
- **Money é sempre `NUMERIC(p, s)`** — nunca `FLOAT64` (ver `@rules/data-modeling`).
- IDs são `STRING` (ver seção 7).
- Para payloads de forma instável, prefira `JSON` (queryable, indexado parcialmente) sobre `STRING` serializado.

---

## 7. IDs

IDs são `STRING`. Use ULID ou UUIDv4/v7. **Nunca** invente `AUTO_INCREMENT` — BigQuery não tem sequences.

Correto:
- `event_id STRING` contendo `01HXYZ...` (ULID) ou `f47ac10b-58cc-...` (UUID).

Incorreto:
- `event_id INT64` autoincrementado pela aplicação (sujeito a colisão entre sources).
- IDs gerados via `ROW_NUMBER()` ou `GENERATE_UUID()` em ingest — gere na origem para idempotência.

---

## 8. Colunas comuns (canônicas)

Toda tabela de evento deve conter ao menos:

| Coluna | Tipo | Descrição |
|---|---|---|
| `event_id` | `STRING` | ULID/UUID, PK lógica, gerado na origem |
| `event_time` | `TIMESTAMP` | UTC, momento em que o evento ocorreu no domínio (não o ingest) |
| `ingested_at` | `TIMESTAMP` | UTC, momento em que chegou ao warehouse |
| `event_name` | `STRING` | `SCREAMING_SNAKE_CASE`, ex.: `USER_SIGNED_UP` |
| `event_version` | `INT64` | Versão do schema do evento |
| `tenant_id` | `STRING` | Multi-tenant; obrigatório em SaaS |
| `user_id` | `STRING` | Quando aplicável |
| `org_id` | `STRING` | Quando aplicável |
| `source` | `STRING` | Sistema de origem (ex.: `web-api`, `billing-worker`) |
| `payload` | `STRUCT` ou `JSON` | Conteúdo específico do evento |

Para tabelas de dimensão, use `*_id` como PK lógica e inclua `valid_from` / `valid_to` se aplicar SCD Type 2.

---

## 9. Partitioning

**Partitioning é obrigatório** em qualquer tabela que cresça além de algumas dezenas de GB.

Doutrina:
- **Time-unit partitioning** é o default: `PARTITION BY DATE(event_time)`.
- Granularidade `DAY` por default; `HOUR` para alto volume (>10M eventos/dia); `MONTH` para histórico cold.
- **Integer range partitioning** quando time não é a dimensão primária de acesso (ex.: particionar por `tenant_id_hash` em multi-tenant denso).
- **Sempre exija partition filter** em tabelas grandes:
  ```sql
  OPTIONS (
    partition_expiration_days = 730,
    require_partition_filter = true
  )
  ```
- Particione pelo `event_time` (domínio), não pelo `ingested_at` — análise temporal é sobre quando o fato ocorreu.

Anti-pattern: tabela sem partitioning forçando full scan a cada query.

---

## 10. Clustering

Até **4 colunas** de clustering. Ordene por **seletividade decrescente** considerando as queries comuns.

Doutrina canônica para fact tables multi-tenant:
```sql
CLUSTER BY tenant_id, user_id, event_name
```

Regras:
- Coluna mais filtrada primeiro.
- Não cluster por colunas de alta cardinalidade pura (ex.: `event_id`) — clustering perde valor.
- Não cluster por `event_time` se já está particionado por ele (redundante).

---

## 11. Schema evolution

BigQuery aceita evolução **aditiva** sem rewrite:
- Adicionar coluna `NULLABLE` ou `REPEATED` — OK.
- Promover `REQUIRED` para `NULLABLE` — OK.
- Adicionar campos a um `STRUCT` existente — OK.

**Proibido sem versionamento:**
- Renomear colunas.
- Trocar tipo de coluna.
- Remover colunas.
- Promover `NULLABLE` para `REQUIRED`.

Quando precisar de breaking change:
1. Adicione coluna nova com nome novo.
2. Backfill se necessário.
3. Deprecie a antiga (marque no schema description; pare de escrever).
4. Remova após período de carência declarado.

Para mudanças estruturais grandes, ver seção 12 (versionamento de tabela).

Ver `@rules/migration` para o protocolo de mudança forward-only.

---

## 12. Versionamento de tabela

Para breaking changes de schema, crie tabela paralela versionada:

- `events` → tabela atual
- `events_v2` → nova estrutura
- View `events_current` apontando para a versão promovida

Promoção:
1. Crie `events_v2` com novo schema.
2. Dual-write durante período de carência.
3. Backfill histórico se aplicar.
4. Recrie view `events_current` apontando para `v2`.
5. Deprecie `events` (v1) com `partition_expiration_days` para TTL.

**Nunca** faça rename in-place de tabela ativa em produção. Sem rollback simples no BQ (ver `@rules/migration`).

---

## 13. Views e materialized views

- **View comum**: abstração lógica, sem custo de storage, custo de query igual ao subjacente. Use para encapsular regras de negócio analíticas.
- **Materialized view**: agregação pré-computada com auto-refresh. Use para acelerar queries recorrentes de agregação custosa. Avalie custo de refresh × economia de query.
- **Authorized view / authorized dataset**: para expor dados a outros projetos GCP sem dar acesso à tabela raw. Padrão para compartilhamento entre times sem violar least-privilege.

Anti-pattern: view sobre view sobre view (3+ níveis) — degrada performance e legibilidade.

---

## 14. AI / Observability data

Dataset canônico: `ai_observability`.

Tabela canônica `ai_observability.llm_calls`:

| Coluna | Tipo |
|---|---|
| `request_id` | `STRING` (ULID) |
| `event_time` | `TIMESTAMP` |
| `tenant_id` | `STRING` |
| `user_id` | `STRING` |
| `model` | `STRING` (ex.: `claude-opus-4-7`) |
| `prompt_tokens` | `INT64` |
| `completion_tokens` | `INT64` |
| `cached_tokens` | `INT64` |
| `cost_usd` | `NUMERIC(12, 6)` |
| `latency_ms` | `INT64` |
| `finish_reason` | `STRING` |
| `tool_calls` | `ARRAY<STRUCT<name STRING, arguments JSON, latency_ms INT64>>` |
| `error` | `STRUCT<code STRING, message STRING>` |

Particionado por `DATE(event_time)`, clusterizado por `tenant_id, model`. Suporta análise de custo, qualidade e latência por modelo e tenant.

---

## 15. PII e governance

Ver `@rules/governance` e `@rules/security`.

Regras:
- **Policy tags** (Data Catalog) para column-level security em PII. Nunca `SELECT *` em tabela com PII sem policy tag.
- Prefira **colunas derivadas hasheadas** quando o uso analítico permite: `email_hashed STRING` (SHA-256) em vez de `email STRING`.
- **Retention via TTL**: configure `partition_expiration_days` para enforçar políticas de retenção automaticamente.
- **Row-level security** para multi-tenant quando datasets são compartilhados entre clientes ou times.
- **Audit logs** em dataset separado (`audit_log`) com acesso restrito ao security team. Acesso ao próprio audit log também é auditado.

---

## 16. Ingestion

Padrões aceitos:

| Padrão | Quando usar |
|---|---|
| **Storage Write API** | Default para ingestion em volume. Stream com exactly-once e schema enforcement. |
| **Streaming inserts (`tabledata.insertAll`)** | Legacy; use Storage Write API se possível. |
| **Batch load** (GCS → BQ) | Cargas grandes ou históricas. |
| **Pub/Sub → Dataflow → BQ** | Pipeline padrão para eventos de domínio (ver `@contracts/events`). |
| **Federated queries** | Apenas para queries ad-hoc sobre Firestore/Cloud SQL/Sheets. **Nunca em hot path** analítico. |
| **Scheduled queries / Dataform / dbt** | Transformações periódicas, modelagem incremental, testes de dados, lineage. |

Regras de schema na ingestão:
- **Schema explícito sempre.** Auto-detect causa drift silencioso — proibido em produção.
- Em pipelines Dataflow, valide o schema antes de gravar (ver `@contracts/schemas`).
- Idempotência por `event_id` — dedupe upstream ou via MERGE periódico.

---

## 17. Transformação: dbt e Dataform

Para camadas modeladas (staging → intermediate → marts), use **dbt** ou **Dataform**:
- Modelagem incremental com `event_time` como cursor.
- Testes de dados (`not_null`, `unique`, `relationships`, custom).
- Lineage automático e documentação.
- CI sobre PR em modelos.

Convenção de naming de modelos:
- `stg_<source>__<entity>` (staging)
- `int_<domain>__<entity>` (intermediate)
- `fct_<domain>__<entity>` (fact mart)
- `dim_<domain>__<entity>` (dimension mart)

---

## 18. Performance e custo

Ver `@rules/performance`.

Doutrina operacional:
- Pricing **on-demand** (por TB scanned) ou **capacity-based** (Reservations / slots). Documente a escolha por projeto.
- **`SELECT` explícito sempre.** `SELECT *` em fact tables é proibido — escaneia colunas desnecessárias e custa dinheiro.
- **Filter na partition column primeiro**, antes de qualquer outro filtro.
- **`APPROX_COUNT_DISTINCT`, `APPROX_QUANTILES`, `APPROX_TOP_COUNT`** quando exatidão não é crítica — ordens de magnitude mais barato.
- **`--dry-run`** (ou `EXPLAIN`) antes de queries pesadas — estime bytes scanned.
- **Result cache (24h)** é gratuito para queries determinísticas idênticas. Não invalide via `CURRENT_TIMESTAMP()` em queries cacheáveis.
- Avoid CROSS JOIN sem necessidade.
- BI Engine para dashboards de baixa latência sobre datasets quentes.

---

## 19. Observabilidade do warehouse

Ver `@rules/observability`.

- **`INFORMATION_SCHEMA.JOBS_BY_PROJECT`** / `JOBS_BY_USER` / `JOBS_BY_FOLDER`: top queries por custo, top usuários, queries com full scan.
- **Cloud Monitoring**: dashboards de slot utilization, bytes processed, query errors.
- **Audit logs** em dataset dedicado, com retention conforme política de compliance.
- Alertas: spike de custo diário, jobs com >1 TB scanned, queries sem partition filter em tabelas que exigem.

---

## 20. Domain events sink

Padrão canônico para sink de `@contracts/events`:

**Opção A — tabela única por contexto:**
```
<bc>_events.events
```
Com colunas canônicas (seção 8) + `payload STRUCT versionado`. `event_name` e `event_version` discriminam o tipo. Particionado por `DATE(event_time)`, clusterizado por `tenant_id, event_name`.

**Opção B — tabela por evento versionada:**
```
<bc>_events.<event_name>_v<n>
```
Cada evento tem sua própria tabela com schema fechado. Use quando o evento tem schema estável e queries dedicadas.

Default do projeto: **Opção A** para contextos com muitos tipos de evento de baixa cardinalidade individual; **Opção B** para eventos de alto volume com queries dedicadas (ex.: `payment_succeeded`).

---

## 21. Regiões e residência de dados

- Defina **região** do dataset explicitamente (`US`, `EU`, `southamerica-east1`, etc.).
- Datasets na região errada implicam custo de cross-region transfer e podem violar LGPD/GDPR.
- Não cruze regiões em uma query — BQ não permite JOIN cross-region. Replique se necessário.

---

## 22. Anti-patterns (proibidos)

- Tabela grande **sem partitioning**.
- **`SELECT *`** em fact tables.
- **PII sem policy tag** ou sem hash.
- **Money em `FLOAT64`** (ver `@rules/data-modeling`).
- **Timestamps em `STRING`** ou `DATETIME` sem TZ.
- **Renomear coluna** ou trocar tipo in-place (use add + deprecate).
- **Federated query em hot path** (use ingestion, não query federada).
- **Streaming inserts para batch** — use Storage Write API ou batch load.
- **Sem `require_partition_filter`** em tabela que excede dezenas de GB.
- **Auto-detect schema** na ingestion em produção (drift silencioso).
- Dataset em **região errada** (cross-region cost / LGPD).
- Usar BigQuery para **OLTP / serving** (não é banco transacional).
- **JOINs massivos** quando `STRUCT`/`ARRAY` resolveria.
- **View sobre view sobre view** (3+ níveis).
- Datasets genéricos (`data`, `misc`, `tmp`) sem bounded context.
- `event_id` autoincrementado pela aplicação em vez de ULID/UUID.

---

## 23. Referências cruzadas

- `@rules/data-modeling` — tipos canônicos, money, timestamps, IDs.
- `@rules/migration` — protocolo forward-only para mudanças de schema.
- `@rules/governance` — policy tags, retention, classification.
- `@rules/security` — controle de acesso, PII, audit.
- `@rules/performance` — custo, slots, query design.
- `@rules/observability` — monitoring, alerting, audit logs.
- `@contracts/events` — formato canônico de eventos, sink no BQ.
- `@contracts/schemas` — naming, evolução, validação de schemas.
- `@architecture/ddd` — bounded contexts como base para datasets.
