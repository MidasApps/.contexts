---
id: 0015
title: Camada semântica — Data Contract + Metric Catalog separados do Product
status: Proposed
date: 2026-05-11
deciders: [giulliano.soares]
consulted: [time-eng, time-data]
informed: [time-ai, time-produto]
tags: [arquitetura, data-model, semantic-layer, admin, multi-tenancy]
supersedes: []
related: [0006, 0009, 0013, 0014]
---

# ADR-0015 — Camada semântica desacoplada do Product

## Status

`Proposed` — desde 2026-05-11.

Histórico:
- 2026-05-11 — proposta após sessão de design com o owner sobre o cadastro
  de produtos comerciais (Liquid Play, Play+, One Shot, Backtest) e a
  duplicação de `expectedTables`/`indicators` entre eles.
- Aguarda revisão antes de migrar para `Accepted`.

## Contexto

O schema atual de `Product` em `src/shared/schemas/product.ts` acopla três
responsabilidades em um único documento Firestore:

1. **Contrato canônico de dados** (`expectedTables[]` com `ExpectedTable` e
   `ExpectedField`) — define as tabelas e campos que o produto espera
   encontrar no BigQuery do cliente.
2. **Catálogo de indicadores** (`indicators[]` com `ProductIndicator`) —
   define os KPIs/gráficos com `requiredFields: ["tabela.campo"]`.
3. **Empacotamento comercial** (`routes[]`, `name`, `color`, `status`).

O `ClientProductBinding` em `src/shared/schemas/client-binding.ts` traz o
`BindingSchemaMap` — dicionário aninhado `tabela → { campo_canônico →
coluna_real | null }` que faz o de-para por cliente.

Esse acoplamento gera quatro problemas concretos:

- **Duplicação no cadastro**: ao criar Liquid Play+, o admin redigita
  `saldo_devedor`, `dias_atraso`, `rating` etc. mesmo que esses campos já
  tenham sido cadastrados no Liquid Play. Quatro produtos comerciais
  compartilham ~80% do vocabulário de dados, mas cada um carrega sua cópia.
- **Drift semântico silencioso**: nada impede que `saldo_devedor` em Play
  fique como `NUMERIC` e em Play+ vire `FLOAT64`. Não há autoridade única
  para o tipo/unidade/descrição de um attribute.
- **SQL catalog (ADR-0009) preso a produto**: o catálogo de queries
  validadas é escrito em vocabulário canônico, mas a indexação por
  `(productId, indicatorId)` desperdiça o potencial de reuso entre
  produtos.
- **Runtime de IA acoplado**: `src/shared/config/agents/orchestrator.ts` e
  `descriptive-agent.ts` consomem `Product.indicators` diretamente.
  Qualquer mudança no shape do indicador propaga pelo runtime sem
  intermediação.

Forças contraditórias:

- **Onboarding rápido** (cadastrar Backtest em minutos) vs. **estabilidade
  do modelo de dados** (não inventar nomes novos para o mesmo conceito).
- **Flexibilidade por cliente** (alguns têm campos a mais, outros a menos)
  vs. **determinismo das queries de risco de crédito** (PDD precisa ser
  reprodutível).
- **Coexistência com dados em produção** (4 clientes ativos com
  `productBindings` legados) vs. **simplicidade do código** (evitar branch
  legacy permanente).

Restrições:

- Storage canônico Firestore (ADR-0013) — sem Postgres.
- Multi-tenancy estrito (ADR-0006) — bindings continuam por cliente.
- SQL catalog (ADR-0009) já escrito em vocabulário canônico — refatoração
  não pode invalidar fingerprints.
- Runtime Mastra (ADR-0014) — tools e prompts precisam ler do novo modelo
  após migração.

## Decisão

Adotar **camada semântica em cinco níveis** com `Data Contract` e `Metric
Catalog` como cidadãos top-level no Firestore, desacoplados do `Product`:

```
PHYSICAL    Data Source       (mantém — src/shared/schemas/data-source.ts)
SEMANTIC    Data Contract     (NOVO) — entities + attributes globais
            Metric Catalog    (NOVO) — métricas globais com requires refs
PACKAGING   Product           (REFATORADO) — entityRefs + metricRefs + routes
TENANT      Client            (REFATORADO) — schemaBindings flat entity.attribute
```

### Coleções Firestore

```
dataContracts/{contractId}                                          (doc)
dataContracts/{contractId}/entities/{entityId}                      (doc)
dataContracts/{contractId}/entities/{entityId}/attributes/{attrId}  (doc)
metrics/{metricId}                                                  (doc, top-level)
products/{productId}                                                (refatorada)
clients/{clientId}                                                  (refatorada)
```

### Schemas Zod (criar em `src/shared/schemas/`)

- `data-contract.ts` — `DataContract`, `Entity`, `Attribute`.
- `metric.ts` — `Metric` (id no formato `domain.slug`, `requires` no
  formato `contractId.entityId.attributeId`).
- `product.ts` (modificar) — adicionar `contractRefs`, `entityRefs`,
  `metricRefs`. Tornar `expectedTables` e `indicators` opcionais para
  coexistência.
- `client-binding.ts` (modificar) — adicionar `SemanticSchemaBinding`
  (record flat `entity.attribute → coluna | null`) e `contractRef` em
  `ClientDatasetBinding`.

### Single vs Multi-Contract

Iniciamos com **um único contract canônico** (`dataContracts/canonical`).
Fragmentar em múltiplos contracts só quando:

- o canonical passar de ~50 entities, **ou**
- domínios tiverem 0% de overlap de attributes (ex.: `credit` vs
  `covenants` sem nenhum atributo compartilhado).

O schema já suporta multi-contract (`Product.contractRefs` é lista,
`Metric.requires` usa fully-qualified `contractId.entity.attribute`). A
mudança quando vier é aditiva.

### Versionamento

- `DataContract.version` e `Metric.version` em semver (`x.y.z`). Bump
  major exige migração de bindings.
- `Attribute` não tem version própria — usa `deprecated: true` +
  `deprecatedReason`. Imutabilidade light: não deletar, só deprecar.
- Histórico via subcoleção append-only `dataContracts/{id}/events/{id}`
  fica como non-goal de MVP.

### Resolution rules (gating em cascata)

1. Attribute existe + binding mapeia para coluna string → query usa
   `coluna_real AS attribute_id`.
2. Attribute existe + binding mapeia para `null` → métrica que requer
   esse attribute é desabilitada (empty state na UI).
3. Attribute existe + binding ausente → assume `attribute_id` como nome
   real (backward-compat com spec 2026-03-16).
4. Métrica desabilitada → `IndicatorGuard` mostra empty state; rota não
   esconde sozinha por causa de 1 métrica.
5. Rota com 100% das métricas desabilitadas → esconder do `NavSidebar`.
6. Attribute marcado `deprecated` → métrica continua funcionando, admin
   mostra warning.

### Coexistência durante migração

Mesmo padrão da migração legacy→productBindings em `client.ts`:

- `Product` mantém `expectedTables?` e `indicators?` opcionais. Resolver
  lê `metricRefs` se presente, senão fallback para `indicators[]`.
- `ClientDatasetBinding.schema` (nested legado) e `schemaBindings` (flat
  novo) coexistem. Helper `flattenLegacyBinding()` em
  `src/shared/lib/semantic/flatten-binding.ts` traduz on-the-fly.
- Feature flag de UI: `NEXT_PUBLIC_SEMANTIC_LAYER=1` controla quais
  editores aparecem na admin (legado vs. novo). Não controla leitura.
- Migração de dados via `scripts/migrate-semantic-layer.ts` idempotente
  com `--dry-run` / `--apply` / `--rollback`.

### Documentação de referência

- Spec de design: `docs/superpowers/specs/2026-05-11-semantic-layer-design.md`.
- Plano de implementação: `docs/superpowers/plans/2026-05-11-semantic-layer-plan.md`.

## Consequências

### Positivas

- **Onboarding de produto**: cadastrar Liquid Play One Shot deixa de
  exigir redigitar 40 attributes e 15 indicadores. Form do produto vira
  basicamente dois multi-select pickers (entities + métricas).
- **Autoridade única**: `saldo_devedor` tem um lugar único onde label,
  tipo, unidade e descrição vivem. Drift semântico fica impossível por
  construção.
- **SQL catalog desacoplado**: fingerprint passa a indexar por
  `metricId` global, reaproveitando query validada entre produtos
  comerciais.
- **Runtime de IA**: tools e prompts consomem `metrics/*` direto,
  semantic recall (ADR-0011) e RAG (ADR-0005) indexam embeddings por
  `metricId` / `attributeId` estáveis.
- **Gating em cascata explícito**: cliente sem `data_vencimento` no BQ
  desabilita automaticamente "Inadimplência 90+" — sem flag manual.

### Negativas / Trade-offs

- **Complexidade adicional de coleções**: passamos de `products/` +
  `clients/` para `dataContracts/`, `metrics/`, `products/`, `clients/`.
  Mitigação: spec e ADR documentam o modelo; admin UI agrupa por camada.
- **Migração de dados em produção**: 4 clientes ativos com
  `productBindings` legados. Mitigação: script idempotente com
  `--dry-run` + `--rollback`, coexistência de schemas via campos
  opcionais.
- **Janela de coexistência**: ~2 sprints com ambos os modelos vivos no
  código aumenta superfície de bugs. Mitigação: feature flag e cleanup
  agendado (Phase 6 do plano).
- **Métricas como cidadão top-level** (não subcoleção do contract):
  aumenta caminho de leitura quando precisamos validar refs. Aceito
  porque permite cross-contract no futuro sem mover docs.

### Neutras

- Admin UI ganha duas tabs novas (`Data Contracts`, `Métricas`). Tabs
  passam de 6 para 8 — exige reagrupamento visual (proposto no spec).
- `BindingSchemaMap` nested continua existindo no código durante
  coexistência. Helper de flatten é a única ponte.
- `INFORMATION_SCHEMA`-based auto-detection (`/api/schema-detect`) muda
  o prompt para referenciar `attributes/*` global em vez de
  `EXPECTED_SCHEMA` hardcoded, mas output continua flat.

## Alternativas consideradas

### Alternativa A — Manter tudo dentro de `Product`

**Pros**: zero migração; modelo mental simples (1 doc por produto).
**Cons**: duplicação só piora conforme produtos crescem; drift semântico
permanece estrutural; SQL catalog permanece preso a produto; impossível
ter "métrica reaproveitada entre produtos" como conceito de primeira
classe.
**Por que rejeitada**: o owner explicitou que pretende cadastrar 4+
produtos comerciais (Liquid Play, Play+, One Shot, Backtest) com
vocabulário compartilhado. Status quo já é o caminho de maior atrito
para essa direção declarada de produto.

### Alternativa B — Contract por produto, sem catálogo global de métricas

**Pros**: isolamento entre produtos; cada produto evolui no seu ritmo.
**Cons**: continua tendo `saldo_devedor` redefinido N vezes; perde o
ganho central do refactor (DRY no vocabulário de dados).
**Por que rejeitada**: meia-medida — paga custo de migração sem
capturar o benefício principal.

### Alternativa C — Materializar contract em BigQuery (`INFORMATION_SCHEMA`-style view)

**Pros**: contract vira queryável em SQL; possibilidade de ferramentas
externas (dbt, Atlan) lerem direto.
**Cons**: desacopla contract do Firestore (ADR-0013), introduz
sincronização Firestore↔BQ, custo operacional novo.
**Por que rejeitada**: fora de escopo do MVP; pode ser ADR futura se
ferramental externo for necessário.

### Alternativa D — Status quo (não decidir agora)

**Por que rejeitada**: o usuário acaba de pedir explicitamente "manda
bala" após review do design e do plano. Adiar a decisão custa mais
duplicação a cada produto novo cadastrado.

## Implementação

Engenharia de contexto:

- **Spec de design**: `docs/superpowers/specs/2026-05-11-semantic-layer-design.md`
- **Plano de implementação**: `docs/superpowers/plans/2026-05-11-semantic-layer-plan.md`
- **Código existente afetado**:
  - `src/shared/schemas/product.ts` (refatoração)
  - `src/shared/schemas/client-binding.ts` (refatoração)
  - `src/features/admin/ui/ProductForm.tsx`, `ExpectedTablesEditor.tsx`,
    `ProductIndicatorsEditor.tsx`, `ProductBindingsEditor.tsx`,
    `SchemaMapEditor.tsx`, `AdminPage.tsx`
  - `src/shared/hooks/useActiveProduct.ts`, `useProducts.ts`
  - `src/widgets/product-switcher/ui/ProductSwitcher.tsx`
  - `src/shared/lib/bigquery/schema-resolver.ts`
  - `src/shared/config/agents/orchestrator.ts`,
    `descriptive-agent.ts`
  - `app/api/products/route.ts`, `app/api/clients/route.ts`,
    `app/api/schema-detect/route.ts`
- **Código a criar**:
  - `src/shared/schemas/data-contract.ts`
  - `src/shared/schemas/metric.ts`
  - `src/shared/lib/semantic/flatten-binding.ts`
  - `src/shared/hooks/useDataContract.ts`, `useMetrics.ts`
  - `src/features/admin/ui/DataContractsTab.tsx`,
    `EntityEditor.tsx`, `MetricsTab.tsx`, `MetricForm.tsx`,
    `EntityPicker.tsx`, `MetricPicker.tsx`
  - `app/api/data-contracts/**`, `app/api/metrics/**`
  - `scripts/migrate-semantic-layer.ts`
- **Feature flag**: `NEXT_PUBLIC_SEMANTIC_LAYER` no `app-store` (controla
  apenas exibição dos editores legados na admin durante coexistência).

## Referências

- ADR-0006 — multi-tenancy strict isolation (bindings continuam
  por cliente).
- ADR-0009 — SQL reuse hierarchy & catalog (fingerprint passa a indexar
  por `metricId`).
- ADR-0013 — Firestore storage canônico (sem Postgres).
- ADR-0014 — Mastra runtime full (agents consomem `metrics/*` após
  migração).
- Spec de mapeamento legado: `docs/superpowers/specs/2026-03-16-client-schema-mapping-design.md`.
