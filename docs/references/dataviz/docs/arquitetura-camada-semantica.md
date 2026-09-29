# Camada Semântica — Data Contract + Metric Catalog (ADR-0015)

Como o Liquid DataViz resolve dados: **Template → Métricas (contrato de KPI) → Data Contract (contrato de dados) → Client binding → BigQuery**.

> Fontes canônicas: `adrs/decisions/0015-semantic-layer-data-contract.md`, `src/shared/schemas/{metric,data-contract,client-binding}.ts`, `src/shared/lib/metrics/resolve-metric.ts`, `app/api/metrics/[id]/data/route.ts`.

Versão visual (HTML renderizado): `docs/arquitetura-camada-semantica.html`.

---

## Organograma de entidades (ER)

Entidades, campos e cardinalidades (1:N, N:N). Coleções Firestore: `dataContracts/{id}/entities/{e}/attributes/{a}`, `metrics/{id}`, `products/{id}`, `clients/{id}` (`productBindings → datasets`), `clients/{id}/groups/{g}/reports/{r}`.

```mermaid
erDiagram
  DATA_CONTRACT ||--o{ ENTITY : "entities/"
  ENTITY ||--o{ ATTRIBUTE : "attributes/"
  METRIC }o--o{ ATTRIBUTE : "requires"
  PRODUCT }o--o{ DATA_CONTRACT : "contractRefs"
  PRODUCT }o--o{ METRIC : "metricRefs"
  CLIENT ||--o{ PRODUCT_BINDING : "productBindings"
  PRODUCT_BINDING }o--|| PRODUCT : "productId"
  PRODUCT_BINDING ||--|{ DATASET_BINDING : "datasets"
  DATASET_BINDING }o--|| DATA_CONTRACT : "contractRef"
  DATASET_BINDING }o--|| DATA_SOURCE : "dataSourceId"
  CLIENT ||--o{ GROUP : "groups/"
  GROUP ||--o{ REPORT : "reports/"
  TEMPLATE }o--o{ METRIC : "metricRefs"
  REPORT }o--o| TEMPLATE : "templateId"
  REPORT }o--o{ METRIC : "metricRefs"

  DATA_CONTRACT {
    Slug id
    string name
    semver version
    enum status
  }
  ENTITY {
    SqlIdentifier id
    string label
  }
  ATTRIBUTE {
    SqlIdentifier id
    SqlIdentifier entityId
    FieldType type
    string unit
    bool isKey
    bool deprecated
  }
  METRIC {
    MetricId id "domain.slug"
    string label
    enum type "kpi chart table"
    AttributeRef requires "contractId.entity.attr"
    Recipe recipe "aggregation ou sql"
    enum status
  }
  PRODUCT {
    Slug id
    string name
    Slug contractRefs
    SqlId entityRefs
    MetricId metricRefs
    Route routes
  }
  CLIENT {
    Slug id
    string name
    SchemaMap schema
  }
  PRODUCT_BINDING {
    Slug productId
    string enabledIndicators
  }
  DATASET_BINDING {
    Slug id
    Slug dataSourceId
    SqlId datasetId
    Slug contractRef
    Map schemaBindings "entity.attr to coluna ou null"
    Map tableBindings
    bool isPrimary
  }
  DATA_SOURCE {
    Slug id
    string projectId
    string datasetId
  }
  GROUP {
    Slug id
    string name
    int order
  }
  REPORT {
    Slug id
    string name
    BlockMap blockMap
    Row layout
    MetricId metricRefs
    Slug templateId
  }
  TEMPLATE {
    Slug id
    string name
    string category
    string segment
    BlockMap blockMap
    MetricId metricRefs
  }
```

## Mapa de camadas e fluxo

```mermaid
flowchart TB
  T["Template<br/>blockMap · layout · metricRefs"]

  subgraph SEM["SEMANTIC — global"]
    DC["Data Contract<br/>entities + attributes<br/>(liquid-play / liquid-play-plus / external)"]
    M["Metric Catalog<br/>metrics/{domain.slug}<br/>requires[] + recipe"]
  end

  subgraph PKG["PACKAGING"]
    P["Product<br/>contractRefs · metricRefs · routes"]
  end

  subgraph TEN["TENANT"]
    C["Client<br/>productBindings[]"]
    B["dataset binding<br/>contractRef + schemaBindings"]
  end

  subgraph PHY["PHYSICAL"]
    DS["Data Source<br/>BigQuery real (colunas do cliente)"]
  end

  M -- "requires: contractId.entity.attribute" --> DC
  P -- "metricRefs" --> M
  P -- "contractRefs" --> DC
  T -- "metricRefs" --> M
  C -- "assina produtos" --> P
  C --> B
  B -- "contractRef = contrato coberto" --> DC
  B -- "schemaBindings: entity.attribute &rarr; coluna real" --> DS
```

**Leitura:** o *Data Contract* é o vocabulário canônico (entidades + atributos). As *Métricas* declaram de que atributos precisam (`requires`) e como calcular (`recipe`). O *Product* só referencia contrato + métricas (não duplica schema). O *Client* assina produtos e, em cada `dataset binding`, diz **qual contrato cobre** (`contractRef`) e faz o de-para **atributo → coluna real** (`schemaBindings`). O *Template* é uma página que referencia métricas.

---

## Fluxograma — resolução de uma métrica

```mermaid
flowchart TD
  A["Bloco do template precisa de dados"] --> B["POST /api/metrics/:id/data<br/>clientId · productId · pageFilters"]
  B --> C["Carrega metric<br/>contractId = 1ª parte de requires[0]"]
  C --> D{"Cliente tem dataset com<br/>contractRef == contractId?"}
  D -- "não" --> E["422 — Nenhum dataset cobre o contrato"]
  D -- "sim" --> F["Para cada ref do recipe:<br/>resolveColumn(entity.attribute)"]
  F --> G{"schemaBindings do ref?"}
  G -- "string" --> H["usa a coluna real"]
  G -- "null" --> I["métrica desabilitada<br/>(empty state)"]
  G -- "ausente + cliente migrado" --> J["422 — sem mapping<br/>(FAIL-LOUD)"]
  G -- "ausente + cliente legado" --> K["assume o nome do atributo<br/>(warn)"]
  H --> L["monta SQL + roda no BigQuery"]
  L --> N["retorna linhas → preenche o bloco"]

  classDef ok fill:#0f2a22,stroke:#1f5d49,color:#34d399;
  classDef bad fill:#2a1313,stroke:#6b2b2b,color:#f87171;
  classDef warn fill:#2a230f,stroke:#6b5a1f,color:#fbbf24;
  class H,L,N ok;
  class E,J bad;
  class I,K warn;
```

**Regra crítica (`resolveColumn`):** `string` → usa a coluna; `null` → métrica desabilita (empty state); **ausente + cliente "migrado"** (schemaBindings não-vazio) → **fail-loud** (não adivinha coluna); ausente + legado (schemaBindings vazio) → assume o nome do atributo (back-compat, com warn). A ADR-0015 (status `Proposed`) propunha "assume o nome" sempre; a implementação refinou para fail-loud em cliente migrado — proposital, para não rodar SQL contra colunas erradas em risco de crédito.

---

## Dois caminhos de dados

```mermaid
flowchart LR
  subgraph LEG["Legado (páginas fixas)"]
    L1["/api/bigquery + queries.ts<br/>SQL hardcoded"]
  end
  subgraph SEMP["Semântico (templates)"]
    S1["/api/metrics/:id/data<br/>resolveMetric()"]
  end
  L1 --> BQ["BigQuery"]
  S1 --> BQ
```

- **Legado** alimenta Visão Geral, Contratos, PDD… → por isso o **dashboard da BRZ funciona**.
- **Semântico** alimenta os blocos de **template importado** → é onde a **BRZ falha** (config semântica incompleta).

---

## Onde a BRZ está (diagnóstico)

| Item | Estado | Situação |
|---|---|---|
| `contractRef` dos datasets | era `canonical` (default do schema; contrato **inexistente** — os reais são `liquid-play`/`liquid-play-plus`) | ✅ corrigido → `liquid-play` |
| `schemaBindings` | mapeia só 2 atributos (`contratos.data_base_report`, `contratos.saldo_devedor`) | ❌ incompleto |
| schema semântico detectado | só 2 colunas, 1 entidade (`contratos`) | ❌ não sincronizado |
| métricas dos templates | exigem dezenas de atributos de `liquid-play` | ❌ não cobertos |

Como o `schemaBindings` não está vazio, a BRZ é tratada como **"migrada"** → todo atributo não mapeado dá fail-loud (ex.: `Attribute "contratos.rating_liquid" sem mapping`).

## Para a BRZ funcionar conforme a arquitetura

1. **Sincronizar o schema real** da BRZ (`/api/schema-detect` / `INFORMATION_SCHEMA`).
2. **Completar o `schemaBindings`** — mapear cada `entity.attribute` que as métricas usam → coluna real da BRZ (ou `null` para os ausentes, que desabilita a métrica com empty state).
3. **Conferir o `contractRef`** por binding (`liquid-play` e/ou `liquid-play-plus`).

Tooling: Admin → **Data Contracts** + **Schema Map** editor + detecção de schema. Mapeamento não deve ser adivinhado (é o que o fail-loud previne) — precisa casar atributos do contrato com as colunas reais da BRZ.
