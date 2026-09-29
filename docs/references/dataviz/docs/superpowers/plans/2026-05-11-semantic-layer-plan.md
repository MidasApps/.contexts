# Semantic Layer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desacoplar Data Contract (entities + attributes) e Metric Catalog do `Product`, com migração coexistente de dados em produção e zero downtime no SQL catalog / runtime de IA.

**Architecture:** Cinco camadas (Physical → Semantic → Packaging → Tenant). Spec: `docs/superpowers/specs/2026-05-11-semantic-layer-design.md`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Zod, Firestore (Admin SDK), Mastra runtime, Vitest. Storage canônico Firestore (ADR-0013).

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/shared/schemas/data-contract.ts` | Create | `DataContract`, `Entity`, `Attribute` Zod schemas |
| `src/shared/schemas/metric.ts` | Create | `Metric` schema (id `domain.slug`, requires refs) |
| `src/shared/schemas/product.ts` | Modify | Add `contractRefs`, `entityRefs`, `metricRefs`; deprecate `expectedTables`/`indicators` |
| `src/shared/schemas/client-binding.ts` | Modify | Add `SemanticSchemaBinding` flat shape + `contractRef` |
| `src/shared/schemas/index.ts` | Modify | Re-export novos symbols |
| `app/api/data-contracts/route.ts` | Create | CRUD contracts (admin-only) |
| `app/api/data-contracts/[id]/entities/route.ts` | Create | CRUD entities |
| `app/api/data-contracts/[id]/entities/[entityId]/attributes/route.ts` | Create | CRUD attributes |
| `app/api/metrics/route.ts` | Create | CRUD metrics |
| `app/api/products/route.ts` | Modify | Aceitar `entityRefs`/`metricRefs`; ler ambos modelos |
| `app/api/clients/route.ts` | Modify | Persistir `schemaBindings` flat + retrocompat |
| `app/api/schema-detect/route.ts` | Modify | Prompt referencia attributes globais |
| `src/features/admin/ui/DataContractsTab.tsx` | Create | Tab + lista contracts |
| `src/features/admin/ui/EntityEditor.tsx` | Create | Editor entities + attributes |
| `src/features/admin/ui/MetricsTab.tsx` | Create | CRUD métricas |
| `src/features/admin/ui/MetricForm.tsx` | Create | Form com autocomplete `requires` |
| `src/features/admin/ui/ProductForm.tsx` | Modify | Substituir `ExpectedTablesEditor`/`ProductIndicatorsEditor` por pickers |
| `src/features/admin/ui/EntityPicker.tsx` | Create | Multi-select de entities |
| `src/features/admin/ui/MetricPicker.tsx` | Create | Multi-select de métricas |
| `src/features/admin/ui/SchemaMapEditor.tsx` | Modify | Renderiza `entity.attribute` em vez de `tabela.campo` |
| `src/features/admin/ui/AdminPage.tsx` | Modify | Adicionar tabs Data Contracts e Metrics |
| `src/shared/hooks/useActiveProduct.ts` | Modify | `useActiveProductMetrics()`, fallback `indicators[]` |
| `src/shared/hooks/useDataContract.ts` | Create | Hook lendo contract + entities + attributes |
| `src/shared/hooks/useMetrics.ts` | Create | Hook lendo `metrics/*` filtrado por `product.metricRefs` |
| `src/shared/lib/bigquery/schema-resolver.ts` | Modify | Aceitar `SemanticSchemaBinding` flat |
| `src/shared/lib/bigquery/queries.ts` | Modify | Adapter de binding flat (sem mudar SQL) |
| `src/shared/stores/app-store.ts` | Modify | Adicionar `metrics`, `contracts` em memória |
| `src/shared/config/agents/orchestrator.ts` | Modify | Consumir `metrics/*` em vez de `product.indicators` |
| `src/shared/config/agents/descriptive-agent.ts` | Modify | Idem |
| `scripts/migrate-semantic-layer.ts` | Create | Script idempotente Firestore→Firestore, dry-run flag |
| `scripts/migrate-semantic-layer.test.ts` | Create | Vitest cobrindo idempotência e rollback |
| `adrs/decisions/0015-semantic-layer-data-contract.md` | Create | ADR Nygard PT-BR, supersedes parcial de `product.ts` |
| `src/shared/schemas/__tests__/data-contract.test.ts` | Create | Validação Zod |
| `src/shared/schemas/__tests__/metric.test.ts` | Create | Validação Zod |

---

## Phase 0 — Foundations (1–2 dias)

**Done when:** ADR-0015 aceita, spec linkada, schemas Zod compilando.

- [ ] **Step 0.1: Redigir ADR-0015**
  - File: `adrs/decisions/0015-semantic-layer-data-contract.md`
  - Formato Nygard PT-BR (ver `adrs/_template.md`).
  - `supersedes: [parcial — modelo Product 0001-pre]` — explicar que `Product.expectedTables`/`indicators` continuam aceitos durante migração mas são caminho deprecado.
  - `related: [0006, 0009, 0013]`.
  - Decisão central: Data Contract + Metric Catalog como camada semântica isolada do packaging.
  - Alternativas descartadas: (a) manter tudo dentro de `Product`; (b) contract por produto sem catalog global; (c) materializar contract em BQ.
- [ ] **Step 0.2: Criar Zod schemas semantic**
  - `src/shared/schemas/data-contract.ts` — `DataContract`, `Entity`, `Attribute`.
  - `src/shared/schemas/metric.ts` — `Metric`.
  - Re-exportar de `src/shared/schemas/index.ts`.
- [ ] **Step 0.3: Testes Zod**
  - `src/shared/schemas/__tests__/data-contract.test.ts`, `metric.test.ts` — happy-path + edge (deprecated, id regex, requires ref format).
- [ ] **Step 0.4: `pnpm tsc --noEmit` + `pnpm vitest run`**.

---

## Phase 1 — Refatorar schemas legados (1 dia)

**Done when:** `Product` e `ClientProductBinding` aceitam ambos modelos sem quebrar build atual.

- [ ] **Step 1.1: Estender `src/shared/schemas/product.ts`**
  - Adicionar `contractRefs`, `entityRefs`, `metricRefs` (default `[]`).
  - Marcar `expectedTables` e `indicators` como `.optional()` (atualmente `.min(1)` / `.default([])`).
  - Manter export types existentes — consumers continuam compilando.
- [ ] **Step 1.2: Estender `src/shared/schemas/client-binding.ts`**
  - Adicionar `SemanticSchemaBinding` (record flat `entity.attribute → string|null`).
  - Adicionar `contractRef: Slug.default('canonical')` em `ClientDatasetBinding`.
  - Adicionar `schemaBindings: SemanticSchemaBinding.optional()` ao lado do `schema` legado.
- [ ] **Step 1.3: Helper de conversão**
  - `src/shared/lib/semantic/flatten-binding.ts` — converte `BindingSchemaMap` nested em `SemanticSchemaBinding` flat e vice-versa. Idempotente.
- [ ] **Step 1.4: Testes** + `pnpm tsc --noEmit`.

---

## Phase 2 — API + Storage (2–3 dias)

**Done when:** admin endpoints retornam contracts/metrics, regras de validação aplicadas.

- [ ] **Step 2.1: Routes Data Contracts**
  - `app/api/data-contracts/route.ts` (GET list, POST upsert).
  - `app/api/data-contracts/[id]/entities/route.ts` (GET list, POST upsert).
  - `app/api/data-contracts/[id]/entities/[entityId]/attributes/route.ts` (GET, POST, soft-delete via `deprecated: true`).
  - Auth: reutilizar `verifyAdmin()` de `app/api/schema-detect/route.ts`.
- [ ] **Step 2.2: Routes Metrics**
  - `app/api/metrics/route.ts` (GET list filtered, POST upsert, validar `requires` contra contract).
- [ ] **Step 2.3: Modificar `app/api/products/route.ts`**
  - POST aceita `contractRefs`, `entityRefs`, `metricRefs`. Mantém `expectedTables`/`indicators` opcionais.
- [ ] **Step 2.4: Modificar `app/api/clients/route.ts`**
  - POST aceita `schemaBindings` flat em `productBindings[].datasets[]`. Salva ambos (`schema` nested + `schemaBindings` flat) durante migração.
- [ ] **Step 2.5: Testes integração** (mock Firestore admin via Vitest).

---

## Phase 3 — Admin UI (3–4 dias)

**Done when:** admin consegue criar contract, entity, attribute, métrica, e produto via pickers.

- [ ] **Step 3.1: `DataContractsTab.tsx` + `EntityEditor.tsx`**
  - Lista contracts → drill-down em entities → list attributes.
  - Reusar visual de `ExpectedTablesEditor.tsx`.
- [ ] **Step 3.2: `MetricsTab.tsx` + `MetricForm.tsx`**
  - Form com type, category, autocomplete `requires` (puxa entities/attributes do contract `canonical`).
- [ ] **Step 3.3: `EntityPicker.tsx`, `MetricPicker.tsx`**
  - Multi-select com search. Pode reusar `IndicatorCheckboxGrid.tsx` como base visual.
- [ ] **Step 3.4: Modificar `ProductForm.tsx`**
  - Substituir `<ExpectedTablesEditor>` por `<EntityPicker>`.
  - Substituir `<ProductIndicatorsEditor>` por `<MetricPicker>`.
  - Manter os antigos atrás de feature flag `NEXT_PUBLIC_SEMANTIC_LAYER` durante coexistência.
- [ ] **Step 3.5: Modificar `SchemaMapEditor.tsx`**
  - Renderizar entries `entity.attribute` em vez de `tabela.campo`.
  - Adapter de leitura: se cliente tem só `schema` legado, fazer flatten on-the-fly.
- [ ] **Step 3.6: Modificar `AdminPage.tsx`**
  - Adicionar tabs Data Contracts e Metrics no nav.
- [ ] **Step 3.7: Smoke test manual** (`pnpm dev`, criar contract, métrica, produto referenciando ambos).

---

## Phase 4 — Consumo (runtime + agents) (2 dias)

**Done when:** dashboard renderiza usando novo modelo; agents leem `metrics/*`.

- [ ] **Step 4.1: `useDataContract.ts`, `useMetrics.ts`**
  - Carregar contract + metrics no boot do app (mesmo padrão de `useClients`).
- [ ] **Step 4.2: Modificar `useActiveProduct.ts`**
  - Nova função `useActiveProductMetrics()`: se `product.metricRefs` existe, joina com `metrics/*`; senão fallback para `product.indicators ?? []` (shape compatível).
- [ ] **Step 4.3: Modificar `app-store.ts`**
  - Adicionar `contracts: DataContract[]`, `entities: Record<contractId, Entity[]>`, `metrics: Metric[]`.
- [ ] **Step 4.4: Modificar `schema-resolver.ts`**
  - Aceitar `SemanticSchemaBinding` (flat) além de `ClientSchema` (nested). Função `resolveColumn(binding, "entity.attribute")`.
- [ ] **Step 4.5: Modificar `orchestrator.ts` + `descriptive-agent.ts`**
  - Trocar `product.indicators` por `useActiveProductMetrics()` no momento de construir tools/system prompt.
  - SQL catalog (ADR-0009) já é canônico — só atualizar fingerprint para indexar por `metricId`.
- [ ] **Step 4.6: Modificar `/api/schema-detect/route.ts`**
  - Prompt referencia `attributes/*` global em vez de `EXPECTED_SCHEMA` hardcoded. Output continua flat por compatibilidade.
- [ ] **Step 4.7: Testes Vitest** dos hooks e schema-resolver com bindings ambíguos (legado + novo).

---

## Phase 5 — Migração de dados (1–2 dias)

**Done when:** dry-run reporta contagem esperada; aplicação em prod sem regressão.

- [ ] **Step 5.1: Script `scripts/migrate-semantic-layer.ts`**
  - Flags: `--dry-run`, `--apply`, `--rollback`.
  - Fluxo `--apply`:
    1. Ler todos `products/*`. Coletar união de `expectedTables[].fields` → criar `dataContracts/canonical/entities/{table}/attributes/{field}` (skip se já existe ou se attribute igual).
    2. Coletar `indicators[]` → criar `metrics/{indicator.id}` com `requires` mapeado de `requiredFields`.
    3. Popular `product.entityRefs` e `product.metricRefs` em cada produto, **mantendo** `expectedTables`/`indicators` para fallback.
    4. Para cada `clients/*/productBindings[].datasets[]`, gerar `schemaBindings` flat a partir de `schema` nested.
  - Idempotência: chave determinística por path; re-rodar é no-op.
  - Rollback: `--rollback` deleta `dataContracts/*`, `metrics/*`, e remove `entityRefs`/`metricRefs`/`schemaBindings`/`contractRef` dos docs existentes (deixa legado intacto).
- [ ] **Step 5.2: Testes script**
  - `scripts/migrate-semantic-layer.test.ts` — fixture Firestore in-memory (firebase-admin emulator ou mock), validar idempotência e rollback.
- [ ] **Step 5.3: Dry-run em prod**
  - `pnpm tsx scripts/migrate-semantic-layer.ts --dry-run` — revisar contagens antes de `--apply`.
- [ ] **Step 5.4: Apply em prod com janela de baixa carga** + verificação manual no admin.

---

## Phase 6 — Cleanup (1 dia, após 2 sprints estáveis)

**Done when:** modelo legado removido, feature flag retirada.

- [ ] **Step 6.1: Verificar 100% dos produtos têm `metricRefs.length > 0` e clientes têm `schemaBindings`.**
- [ ] **Step 6.2: Remover `expectedTables`/`indicators` de `ProductDoc`** (campos passam a ser apenas leitura legada).
- [ ] **Step 6.3: Remover `BindingSchemaMap.schema` nested de `ClientDatasetBinding`.**
- [ ] **Step 6.4: Apagar `ExpectedTablesEditor.tsx`, `ProductIndicatorsEditor.tsx`.**
- [ ] **Step 6.5: Apagar feature flag `NEXT_PUBLIC_SEMANTIC_LAYER`.**
- [ ] **Step 6.6: Atualizar ADR-0015 para `Status: Stable`.**

---

## Estratégia de testes

- **Vitest**: schemas, hooks, schema-resolver, script de migração (já é padrão do repo, ver `src/shared/schemas/__tests__/`).
- **Integração admin**: roteiros manuais por tab — criar contract, criar metric, criar product referenciando.
- **SQL catalog regression**: rodar suíte de queries validadas pós-migração; fingerprint não pode mudar (vocabulário canônico preservado).
- **Eval harness (ADR-0010)**: rodar suite de personas pós-Phase 4 antes de mergear.

---

## Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Queries do SQL catalog quebram | Manter nomes canônicos idênticos (attribute.id = field.id legado). Roteiro de eval ADR-0010 antes de merge. |
| Clientes em prod perdem indicadores | Coexistência de schemas. Resolver lê novo se existe, senão fallback legacy. Migração idempotente com `--rollback`. |
| Drift contract ↔ binding | Validação Zod no save do `ClientDatasetBinding` rejeita chave fora do contract. |
| Métrica órfã (`requires` aponta para attribute inexistente) | Validação no `POST /api/metrics` consulta contract antes de aceitar. |
| Admin se confunde com 2 modelos durante migração | Feature flag `NEXT_PUBLIC_SEMANTIC_LAYER` esconde editores legados quando ativada. |
| Runtime de IA injeta tools obsoletas | Cache de `metricRefs` no orchestrator invalidado a cada save de produto. |

---

## Estimativa grosseira

| Fase | Esforço |
|------|---------|
| 0 — Foundations + ADR | 1–2 dias |
| 1 — Schemas legados refatorados | 1 dia |
| 2 — API + storage | 2–3 dias |
| 3 — Admin UI | 3–4 dias |
| 4 — Consumo runtime + agents | 2 dias |
| 5 — Migração de dados | 1–2 dias |
| 6 — Cleanup (após 2 sprints estáveis) | 1 dia |
| **Total ativo** | **10–14 dias úteis** |

---

## Verification (acceptance final)

- [ ] `pnpm tsc --noEmit` passa.
- [ ] `pnpm vitest run` verde.
- [ ] Admin: criar contract `canonical`, entity `contratos`, attribute `saldo_devedor`; criar métrica `pdd.total`; criar produto Backtest referenciando ambos sem redigitar campos.
- [ ] Dashboard renderiza KPIs de cliente em prod usando novo modelo (flag ativada).
- [ ] Eval harness ADR-0010 verde nas 4 personas.
- [ ] SQL catalog sem invalidação (fingerprints estáveis).
