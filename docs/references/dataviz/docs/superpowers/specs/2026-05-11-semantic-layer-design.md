# Semantic Layer — Data Contract + Metric Catalog Design

**Date:** 2026-05-11
**Status:** Draft
**Supersedes (parcialmente):** modelo atual de `Product` em `src/shared/schemas/product.ts`
**Relacionado:** ADR-0013 (Firestore storage), ADR-0006 (multi-tenancy), ADR-0009 (SQL catalog), spec `2026-03-16-client-schema-mapping-design.md`

## Goal

Desacoplar o vocabulário de dados (entidades + atributos) e a definição de KPIs/gráficos (métricas) do `Product`. O cadastro de um novo produto comercial passa a ser uma combinação de referências a um **Data Contract** canônico e a um **Metric Catalog** global, eliminando a duplicação de `expectedTables[]` e `indicators[]` entre Liquid Play, Play+, One Shot e Backtest.

## Problem

Hoje `Product` (em `src/shared/schemas/product.ts`) carrega três responsabilidades acopladas:

1. `expectedTables[]` — contrato canônico de tabelas/campos (`ExpectedTable`/`ExpectedField`).
2. `indicators[]` — KPIs/gráficos com `requiredFields: ["tabela.campo"]` (`ProductIndicator`).
3. `routes[]` — páginas do menu.

O `ClientProductBinding` (em `src/shared/schemas/client-binding.ts`) traz `BindingSchemaMap` mapeando `tabela.campo_canônico → coluna_real_BQ`. Resultado: ao cadastrar Play+, o admin redefine `saldo_devedor`, `pdd_total`, `ltv_banco` etc. — mesmo vocabulário replicado em quatro produtos. O `ProductIndicatorsEditor.tsx` e `ExpectedTablesEditor.tsx` empurram essa duplicação para a UI. Consequências:

- **Drift semântico**: nada impede que `saldo_devedor` em Play tenha `type: NUMERIC` e em Play+ vire `FLOAT64`.
- **Catálogo SQL frágil** (ADR-0009): queries validadas são escritas em vocabulário canônico mas o catálogo está implicitamente preso a um produto.
- **Onboarding caro**: criar Backtest exige replicar ~40 atributos manualmente.
- **Runtime de IA** (`src/shared/config/agents/orchestrator.ts`, `descriptive-agent.ts`) consome `Product.indicators` direto — qualquer mudança de schema propaga em todos os produtos.

## Modelo proposto — 5 camadas

```
PHYSICAL    Data Source    (mantém — src/shared/schemas/data-source.ts)
SEMANTIC    Data Contract  (NOVO) — entities + attributes globais
            Metric Catalog (NOVO) — métricas globais, requires:[contract refs]
PACKAGING   Product        (REFATORADO) — entityRefs[], metricRefs[], routes[]
TENANT      Client         (REFATORADO) — schemaBindings apontam para entity.attribute
```

## Data Model

### Data Contract (semantic layer)

Coleções Firestore (canonical-first, com fragmentação opcional — ver §Single vs Multi-contract):

```
dataContracts/{contractId}                                   (doc)
dataContracts/{contractId}/entities/{entityId}               (doc)
dataContracts/{contractId}/entities/{entityId}/attributes/{attributeId}   (doc)
metrics/{metricId}                                            (doc, top-level)
```

Zod schemas (a criar em `src/shared/schemas/data-contract.ts` e `src/shared/schemas/metric.ts`):

```typescript
// dataContracts/{contractId}
export const DataContract = z.object({
  id: Slug,                               // "canonical"
  name: z.string().min(2).max(120),       // "Liquid Canonical Contract"
  version: z.string().regex(/^\d+\.\d+\.\d+$/), // semver: "1.0.0"
  status: z.enum(['draft','active','deprecated']).default('draft'),
  description: z.string().max(1000).optional().nullable(),
  createdAt: z.unknown(),
  updatedAt: z.unknown(),
});

// dataContracts/{contractId}/entities/{entityId}
export const Entity = z.object({
  id: SqlIdentifier,                      // "contratos"
  label: z.string().min(1).max(80),
  description: z.string().max(500),
  domain: z.string().max(40).optional(),  // "credit" | "covenants" | ...
});

// dataContracts/{contractId}/entities/{entityId}/attributes/{attributeId}
export const Attribute = z.object({
  id: SqlIdentifier,                      // "saldo_devedor"
  entityId: SqlIdentifier,                // denormalized for query
  label: z.string().min(1).max(80),
  description: z.string().max(500),
  type: FieldType,                        // reusa enum de product.ts
  unit: z.string().max(20).optional().nullable(),
  isKey: z.boolean().default(false),
  required: z.boolean().default(false),
  // Imutabilidade light: marcar deprecated em vez de deletar.
  deprecated: z.boolean().default(false),
  deprecatedReason: z.string().max(200).optional().nullable(),
});
```

### Metric Catalog (semantic layer)

```typescript
// metrics/{metricId}  --  id formato "domain.slug": "pdd.total", "carteira.saldo_devedor"
export const Metric = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/),
  label: z.string().min(1).max(120),
  description: z.string().max(500),
  type: z.enum(['kpi','chart','table']),  // mantém IndicatorType
  category: z.string().max(40).optional(),// "risco" | "fluxo" | "covenant"
  unit: z.string().max(20).optional().nullable(),
  // Referências para o contract — formato "contractId.entityId.attributeId"
  // Em modo single-contract, contractId é sempre "canonical".
  requires: z.array(z.string().regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/)).min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/).default('1.0.0'),
  status: z.enum(['active','deprecated']).default('active'),
});
```

### Product (refatorado)

```typescript
// products/{productId}  --  agora é só packaging
export const ProductDoc = z.object({
  name, slug, icon, color, status, description,
  // NOVO: referências em vez de definições embedded
  contractRefs: z.array(Slug).min(1),     // ["canonical"]
  entityRefs: z.array(SqlIdentifier).default([]),    // ["contratos","pagamentos"]
  metricRefs: z.array(z.string()).default([]),       // ["pdd.total","carteira.ltv"]
  routes: z.array(ProductRoute).default([]),
  // DEPRECATED — durante migração:
  expectedTables: z.array(ExpectedTable).optional(),
  indicators: z.array(ProductIndicator).optional(),
});
```

### Client schema binding (refatorado)

`BindingSchemaMap` passa a referenciar atributos do Data Contract:

```typescript
// Antes: { tabela: { campo_canônico: "coluna_real" | null } }
// Depois: { "entityId.attributeId": "coluna_real" | null }
export const SemanticSchemaBinding = z.record(
  z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/),
  SqlIdentifier.nullable(),
);

export const ClientDatasetBinding = z.object({
  id, dataSourceId, datasetId,
  contractRef: Slug.default('canonical'),
  schemaBindings: SemanticSchemaBinding.default({}),
  lastSchemaSync, isPrimary,
});
```

Estrutura plana (`entity.attribute`) em vez de nested mantém retrocompat fácil com o `BindingSchemaMap` legado (basta flatten).

## Resolution rules

Em cascata, do mais específico ao mais geral:

1. **Attribute existe + binding mapeia para coluna string** → query usa `coluna_real AS attribute_id`.
2. **Attribute existe + binding mapeia para `null`** → métrica que requer esse attribute é desabilitada (empty state).
3. **Attribute existe + binding ausente** → assume `attribute_id` como nome real (backward-compat com spec 2026-03-16).
4. **Métrica desabilitada** → `IndicatorGuard` mostra empty state; rota não esconde sozinha.
5. **Rota com 100% das métricas desabilitadas** → esconder do `NavSidebar` (gating em cascata terminal).
6. **Attribute marcado `deprecated`** → métrica continua funcionando, mas admin UI mostra warning.

## Single Contract vs Multi-Contract

**Decisão recomendada: começar com `dataContracts/canonical` único.**

Critério para fragmentar:
- >50 entities no contract canônico, OU
- Domínios com 0% de attribute overlap (ex: `credit` e `covenants` não compartilham nada).

Quando fragmentar: criar `dataContracts/credit`, `dataContracts/covenants`. `Product.contractRefs` vira lista para suportar produtos cross-domain. `Metric.requires` já usa fully-qualified `contractId.entity.attribute`, então a mudança é aditiva.

## SQL Catalog (ADR-0009) e Runtime de IA

O catálogo SQL validado já é escrito em vocabulário canônico. O fingerprint passa a indexar por `metricId` (top-level) ao invés de `(productId, indicatorId)`. Como métrica é global, o catálogo fica reutilizável entre produtos comerciais.

Mastra agents (`src/shared/config/agents/orchestrator.ts`, `descriptive-agent.ts`):
- Trocam `useActiveProduct().indicators` por `useActiveProductMetrics()` que joins `product.metricRefs[]` × `metrics/*`.
- Glossário dinâmico (Sprint 1.D) lê `attributes/*` direto, sem passar por produto.
- Semantic recall (Sprint 3.A) indexa embeddings por `metricId`/`attributeId` em vez de strings livres.

## Admin UI

`/admin` ganha tabs: **Data Contracts**, **Metrics**, além das atuais **Products**, **Clients**, **Data Sources**, **Groups**, **Users**.

- **Data Contracts tab** — lista contracts, drill-down em entities → attributes. Editor inline tipo `ExpectedTablesEditor` mas vivendo no nível do contract.
- **Metrics tab** — CRUD de métricas, autocomplete para `requires` puxando entities/attributes do contract selecionado.
- **Products tab** — substitui `ExpectedTablesEditor`/`ProductIndicatorsEditor` por dois **multi-select pickers**: "Entities disponíveis no produto" e "Métricas oferecidas". O preset legado de Liquid Play preenche automaticamente.
- **Clients tab** — `SchemaMapEditor.tsx` passa a renderizar `entity.attribute` em vez de `tabela.campo`. AI auto-detect (`/api/schema-detect`) continua usando `INFORMATION_SCHEMA` mas o prompt referencia `attributes/*` global.

## Versionamento

- **Contract.version** e **Metric.version** em semver. Bump major exige migração de bindings.
- **Attribute** não tem version própria — usa `deprecated: true` + `deprecatedReason`. Imutabilidade light (não deletar, só deprecar) inspirada em ADR-0001.
- Histórico de mudanças via `dataContracts/{id}/events/{eventId}` (subcoleção append-only) — opcional, não-MVP.

## Coexistência durante migração

Mesmo padrão de `client.ts` (legacy `dataset` + novo `productBindings`):
- `Product` mantém `expectedTables?` e `indicators?` opcionais.
- Resolver lê `metricRefs` se presente, senão fallback para `indicators[]`.
- `ClientDatasetBinding.schema` (legado nested) e `schemaBindings` (flat) coexistem; helper `flattenLegacyBinding()` faz a tradução em runtime.
- Feature flag de leitura: `NEXT_PUBLIC_SEMANTIC_LAYER=1` força preferência pelo novo modelo (útil para QA).

## Non-Goals

- Lineage automático attribute → BigQuery column (continua manual via binding).
- Suporte multi-contract por produto **no MVP** (schema permite, UI não expõe).
- Versionamento com diff visual (admin vê só `version` string).
- Materialização do contract em BQ (`INFORMATION_SCHEMA`-style table) — fora de escopo.

## Riscos arquiteturais

- **Quebra de queries do SQL catalog**: mitigado mantendo o mesmo vocabulário canônico (nomes de attribute = nomes de campo legados).
- **Drift contract ↔ binding**: mitigado por validação Zod no save do `ClientDatasetBinding` (rejeita binding com chave fora do contract referenciado).
- **Métrica órfã**: `Metric.requires` precisa validar que cada ref existe no contract — fail-loud no save.
