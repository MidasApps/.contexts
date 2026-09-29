# Revisão — Dados, storage e camada semântica

**Branch:** `chore/limpeza-vila-rosa` · **Data:** 2026-08-04 · **Escopo:** `src/shared/lib/{bigquery,firestore,metrics,firebase}`, `src/shared/{schemas,repositories}`, `src/features/sql-catalog`, `scripts/`

Convenções avaliadas: `.contexts/engineering/rules/{data-modeling,migration,validation,caching,performance,observability}.md`, `.contexts/engineering/contracts/{bigquery,firebase-firestore,schemas,secrets,postgres,pgvector}.md`, `.contexts/engineering/stacks/database/*.md`, `.contexts/engineering/stacks/validation/zod@4.md`.

Auditoria **read-only**. Nenhum documento do Firestore foi lido em produção — as afirmações sobre dados vêm de código, `firestore.rules`, `firestore.indexes.json` e histórico Git.

---

## 1. Inventário

### 1.1 BigQuery — `src/shared/lib/bigquery/` (6 módulos)

| Caminho | Responsabilidade | Modelo de dados |
|---|---|---|
| `client.ts` | Factory de clientes `BigQuery` com cache por `dataSourceId`; escopos OAuth (inclui `drive.readonly` p/ external tables em Sheets) | Firestore `dataSources` (lookup) → projetos BQ do cliente |
| `identifier.ts` | Sanitizadores de identificadores SQL (`safeIdentifier`, `safeProjectId`, `safeDatasetRef`, `quoteTableRef`) — BQ não parametriza identificadores | — (puro) |
| `queries.ts` | Queries legadas hard-coded do produto Credit: opções de filtro e agregação de benchmark cross-cliente | BQ `<dataset>.contratos` |
| `schema-resolver.ts` | Resolução legada `tabela.campo → coluna real` via `ClientSchema` nested | Firestore `clients.schema` (legado) |
| `sql-generation-logger.ts` | Telemetria de geração de SQL pelo agente (latência, bytes, erro), gated por env | BQ `liquid_meta.sql_generations` |
| `benchmark-cache.ts` | Cache in-process (1h) do agregado de benchmark cross-cliente | Firestore `clients` + BQ `<dataset>.contratos` |

### 1.2 Firestore — `src/shared/lib/firestore/` (5 módulos)

| Caminho | Responsabilidade | Modelo de dados |
|---|---|---|
| `vector-search.ts` | Busca vetorial brute-force por cosseno (ADR-0013), com filtros de igualdade p/ escopo de tenant | Firestore `embeddingsDocs` / `embeddingsSql` / `embeddingsBlocks` |
| `conversations.ts` | CRUD + listener em tempo real de conversas do chat (**Client SDK**) | Firestore `conversations` |
| `reports.ts` | Cliente HTTP de `/api/reports` — apesar do path, **não** fala com Firestore | Firestore `clients/{id}/groups/{gid}/reports/{rid}` (via API) |
| `dashboard-templates.ts` | Cliente HTTP de `/api/dashboard-templates` — idem | Firestore `dashboardTemplates` (via API) |
| `groups.ts` | Cliente HTTP de `/api/report-groups` — idem | Firestore `clients/{id}/groups` (via API) |

> Os três últimos estão em `lib/firestore/` mas são camada de fetch HTTP. O naming induz erro sobre a fronteira.

### 1.3 Camada semântica / métricas — `src/shared/lib/metrics/` (11 módulos)

| Caminho | Responsabilidade | Modelo de dados |
|---|---|---|
| `resolve-metric.ts` | **Núcleo**: resolve `Metric.recipe` (aggregation \| sql \| derived) contra o binding do cliente → SQL BQ + params nomeados | `metrics`, `clients.productBindings`, `relations` → BQ |
| `execute-metric.ts` | Orquestra 1 métrica: ownership, permissão de rota, escolha de binding por `contractRef`, cobertura, resolve, executa | `clients`, `dataSources`, `relations` → BQ |
| `coverage.ts` | Pré-checagem de lacunas de `requires[]` contra `schemaBindings` (diagnóstico agregado) | `clients.productBindings[].datasets[].schemaBindings` |
| `expression.ts` | Tokenizer/validador da `expression` de recipes `derived` (gramática restrita anti-injeção) | — (puro) |
| `ambient-filter.ts` | Schema Zod dos filtros ambiente (`in` \| `numeric_buckets`) | — (schema) |
| `dashboard-ambient.ts` | Mapeia filtros avançados da UI → `AmbientFilter[]` | — (puro) |
| `authorize-metric.ts` | Autorização de escrita de métrica por dono/admin | `clients` (via `verifyClientAccess`) |
| `create-chat-metric.ts` | Materializa indicador do chat como `Metric` do cliente (recipe `sql`) | Escreve em `metrics` |
| `metric-id.ts` | Gera `MetricId` `domain.slug` único | Lê `metrics` |
| `parameterize-sql.ts` | Converte predicados de filtro do SQL do chat em placeholders `{filter.*}` | — (puro) |
| `fetch-filter-values.ts` | Cliente HTTP de `/api/metrics/filter-values` | BQ (via API) |

### 1.4 Firebase — `src/shared/lib/firebase/` (2 módulos)

| Caminho | Responsabilidade | Modelo de dados |
|---|---|---|
| `admin.ts` | Bootstrap idempotente do Admin SDK; `getDb()`/`getAdminFirestore(dbId)` com cache; `getAdminAuth()` | Firestore `liquid-play-dataviz` (todas as coleções server-side) |
| `config.ts` | Bootstrap do Client SDK (app/auth/firestore) + emuladores | Firestore (client) |

### 1.5 Schemas Zod — `src/shared/schemas/` (10 + 5 em `ai-studio/`)

| Caminho | Responsabilidade | Modelo de dados |
|---|---|---|
| `identifier.ts` | Primitivos: `SqlIdentifier`, `Slug`, `UserDocId`, `GcpProjectId` | — |
| `client.ts` | `ClientDoc` (legado `dataset`/`schema` + novo `productBindings[]`) | `clients/{id}` |
| `client-binding.ts` | `ClientProductBinding`, `ClientDatasetBinding`, `SemanticSchemaBinding` (flat) e `BindingSchemaMap` (legado) | `clients/{id}.productBindings` |
| `data-contract.ts` | `DataContract` / `Entity` / `Attribute` — vocabulário canônico | `dataContracts/{c}/entities/{e}/attributes/{a}` |
| `data-source.ts` | `DataSource` (projeto GCP + location) | `dataSources/{id}` |
| `product.ts` | `Product` (packaging: `contractRefs`, `entityRefs`, `metricRefs`, `routes`) + `FieldType` | `products/{id}` |
| `metric.ts` | `Metric` + `MetricRecipe` (discriminated union de 3 kinds) | `metrics/{id}` |
| `relation.ts` | `Relation` — chave de JOIN cross-contract | `relations/{id}` |
| `dashboard-template.ts` | `DashboardTemplate` (blocos/layout como JSON livre) | `dashboardTemplates/{id}` |
| `index.ts` | Barrel de re-export | — |
| `ai-studio/{agent,skill,workflow,knowledge-base,common}.ts` | Config data-driven do AI Studio (ADR-0016/0017) | `agents`, `skills`, `workflows`, `knowledgeBases` |

### 1.6 Repositórios — `src/shared/repositories/` (3 módulos)

| Caminho | Responsabilidade | Modelo de dados |
|---|---|---|
| `product-repo.ts` | Read-side de `products/` com cache TTL 60s + parse Zod | `products/{id}` |
| `data-source-repo.ts` | Read-side de `dataSources/` com cache TTL 5min + parse Zod | `dataSources/{id}` |
| `client-semantic-context.ts` | Monta o contexto semântico do cliente p/ a IA (métricas reusáveis + contract navegável), degradando graciosamente | `clients`, `products`, `metrics`, `dataContracts/*/entities/*/attributes` |

### 1.7 SQL Catalog — `src/features/sql-catalog/` (4 módulos)

| Caminho | Responsabilidade | Modelo de dados |
|---|---|---|
| `repository.ts` | CRUD do catálogo de SQL validado (ADR-0009), tenant-scoped estrito | `sqlCatalog` |
| `hash.ts` | Hash SHA-256 canônico de SQL (dedupe/reuso) | — (puro) |
| `revalidation.ts` | Marca `approved` desatualizadas como `needs_revalidation` (batch 500) | `sqlCatalog` |
| `use-count-hook.ts` | Incremento best-effort de `useCount` após execução bem-sucedida | `sqlCatalog` |

### 1.8 Scripts — `scripts/` (15 seeds/migrações/patches relevantes)

`seed-vila-rosa-client.mjs`, `seed-vila-rosa-reports.mjs`, `seed-liquid-play-plus-v2-contract.mjs`, `seed-covenants-v2-{metrics,relations}.mjs`, `seed-covenants-templates.ts`, `seed-test-data.mjs`, `seed-ai-studio.ts`, `seed-catalog-from-logs.ts`, `seed-eval-dataset.ts`, `migrate-embeddings-to-kb.ts`, `backfill-client-ids-claim.ts`, `hotfix-restore-recebiveis-pre-pos.mjs`, `patch-covenants-snapshot-pin.mjs`, `bq-bootstrap-{bqml-datasets,meta}.ts`.

**Total: 46 módulos de produção + 15 scripts.**

### 1.9 Fluxo semântico

```
metrics/{id}                                    ← catálogo global de KPIs
  requires: ["liquid-play.contratos.saldo_devedor", …]     (AttributeRef 3-part)
  recipe:   { kind: 'aggregation' | 'sql' | 'derived', … } (vocabulário entity.attribute)
  ownerClientId: null (global) | "<slug>" (do cliente)
        │
        │ requires[0].split('.')[0]  →  contractId              execute-metric.ts:210
        ▼
dataContracts/{contractId}/entities/{entityId}/attributes/{attributeId}
  ← vocabulário canônico: label, type (FieldType BQ), unit, isKey, deprecated
        │
        │ escolhe o dataset cujo `contractRef === contractId`   execute-metric.ts:211-224
        ▼
clients/{clientId}.productBindings[]
  ├─ productId              → products/{id} (packaging: metricRefs, entityRefs, routes)
  └─ datasets[]
       ├─ contractRef       "liquid-play" | "liquid-play-plus" | "canonical"
       ├─ dataSourceId      → dataSources/{id} → { projectId, location }
       ├─ datasetId         "projeto.dataset" | "dataset"
       ├─ schemaBindings    { "entity.attribute": "coluna_real" | null }   ← flat, ADR-0015
       ├─ tableBindings?    { entityId: tableId }  (divergência de nome físico)
       └─ schema            (legado nested; convertido por flattenLegacyBinding)
        │
        │ resolveColumn(binding, "entity.attr")                 resolve-metric.ts:71-107
        │   • string → coluna real (quoteIdentifier)
        │   • null   → MetricResolutionError (cliente declarou indisponível)
        │   • ausente + cliente migrado → MetricResolutionError (fail-loud)
        │   • ausente + cliente legado  → attributeId como coluna (fallback + console.warn)
        │ tableRef(binding, entityId, projectId)                resolve-metric.ts:130-144
        ▼
BigQuery  `projeto`.`dataset`.`tabela`
  SELECT <agg(coluna)> AS value FROM … WHERE <filtros com @params nomeados>
        │
        │ getBigQueryClientFor(dataSourceId)                    execute-metric.ts:251
        ▼
  rows → { ok: true, data, sql, outputColumns }
```

Recipes `derived` (R2) percorrem o mesmo caminho **por contrato**: `bindingsByContract[contractId]`, com JOINs resolvidos por `relations/{id}` (`leftRef`/`rightRef` 3-part) e a expressão aritmética validada por `expression.ts` antes de virar SQL (`resolve-metric.ts:513-633`).

---

## 2. Tabela de aderência

| Módulo | Convenção | Aderente? | Evidência | Observação |
|---|---|---|---|---|
| Todas as coleções | `contracts/firebase-firestore` §1 — coleções em kebab-case plural | ❌ | `src/features/sql-catalog/repository.ts:23` (`sqlCatalog`), `src/shared/repositories/data-source-repo.ts:6` (`dataSources`), `firestore.rules:99` (`workingMemory`), `firestore.indexes.json:129` (`judgeDrift`) | 11 de 21 coleções em camelCase; 3 no singular. Os nomes foram fixados por ADR-0013 (`adrs/decisions/0013-…:55-63`), que é `Accepted` e anterior ao harness. Rename = migração breaking. Recomendação: registrar exceção na ADR, não renomear. |
| `schemas/identifier.ts`, `firestore/conversations.ts` | `contracts/firebase-firestore` §2 — ordem de preferência de document ID | ⚠️ | `src/shared/schemas/identifier.ts:16-20` (Slug), `src/shared/lib/firestore/conversations.ts:70` (`addDoc` → auto-ID) | Slug natural é a opção 4 do próprio §2 e é adequado a entidades de catálogo. Auto-ID em `conversations` é a opção 2, condicionada a "o ID não aparece em URLs" — hoje não aparece. |
| Todos os schemas / coleções | `contracts/firebase-firestore` §5 — `createdBy`/`updatedBy` obrigatórios | ❌ | `src/shared/schemas/metric.ts:205-206`, `data-contract.ts:34-35,69-70`, `product.ts:74-75` — só `createdAt`/`updatedAt`; `grep -r createdBy src/ scripts/` = **0 ocorrências** | Nenhuma entidade de negócio registra autoria. `sqlCatalog` tem `curatedBy` (`repository.ts:248`), mas só p/ aprovação. Sem trilha de quem alterou métrica, contrato ou binding. |
| `firestore/{reports,dashboard-templates,groups,conversations}.ts` | `contracts/firebase-firestore` §5 — soft delete em entidade com auditoria/referências | ❌ | `reports.ts:146-163`, `dashboard-templates.ts:104`, `groups.ts:67`, `conversations.ts:122`; `grep -r deletedAt src/ scripts/` = **0** | `Metric`/`DataContract`/`Attribute` usam `status: 'deprecated'` (equivalente funcional, `metric.ts:42`, `data-contract.ts:27,67`). Report/Group/Template/Conversation fazem hard delete e carregam refs (`templateId`, `metricRefs`, `productRefs` — `reports.ts:15-20`). |
| `schemas/{product,client-binding,relation}.ts` | `contracts/firebase-firestore` §6 — referência como string ID, nunca `DocumentReference` | ✅ | `product.ts:63-67` (`contractRefs`/`entityRefs`/`metricRefs` = arrays de string), `client-binding.ts:47` (`contractRef: Slug`), `relation.ts:21-23` | |
| `sql-catalog/repository.ts`, `firestore.rules` | `contracts/firebase-firestore` §7 — tenant isolation com campo obrigatório + rules | ✅ | `repository.ts:116-120` (`assertClientId`), `:193,209,265,296` (todo query filtra `clientId`), `firestore.rules:30-36,126-129` | Isolamento estrito e fail-closed, alinhado a ADR-0006. |
| `schemas/data-contract.ts` | `contracts/firebase-firestore` §8 — campo denormalizado exige mecanismo de sync explícito | ⚠️ | `data-contract.ts:54-55` (`entityId` denormalizado no Attribute, comentado como "para query") | Escrito na criação pela rota; nada re-sincroniza se a entity for renomeada. Hoje entity id é imutável na prática, o que mitiga. |
| `create-chat-metric.ts` e rotas de escrita | `contracts/firebase-firestore` §13 — `FieldValue.serverTimestamp()` em todo write | ⚠️ | `src/shared/lib/metrics/create-chat-metric.ts:43` (`Timestamp.now()`); 17 call sites usam `Timestamp.now()` vs 46 com `serverTimestamp()` (`sql-catalog/repository.ts:185-186`) | Todos são Admin SDK server-side ⇒ é o relógio do processo, não do browser. O risco que §13 mira (skew de cliente) não se aplica; a divergência é de consistência. |
| Todos os enums de schema | `contracts/firebase-firestore` §14 — enums em SCREAMING_SNAKE_CASE | ❌ | `metric.ts:41-42` (`'kpi'`,`'active'`), `data-contract.ts:27` (`'draft'`), `product.ts:51`, `relation.ts:11-16`, `dashboard-template.ts:17-19` | Valores já persistidos em produção; o próprio §14 proíbe renomear valor existente. Recomendação: exceção registrada, não migração. |
| `firestore/vector-search.ts` | `contracts/firebase-firestore` §16 — `VectorValue` + índice vetorial | ⚠️ | `vector-search.ts:80-83` (embedding como `number[]`, cosseno em memória), `firestore.indexes.json:145` (`"fieldOverrides": []` — nenhum índice vetorial) | Trade-off declarado e justificado no próprio arquivo (`vector-search.ts:8-21`) e em ADR-0013. §16 aponta pgvector p/ volume, que ADR-0013 descontinuou. Revisitar quando Firestore Vector Search for GA. |
| Todos os documentos | `contracts/firebase-firestore` §17 — `schemaVersion` em doc com schema evolutivo | ❌ | `grep -r schemaVersion src/ scripts/` = **0**; `client-binding.ts:35-38` e `:66-67` mostram duas formas coexistindo (flat + nested) sem discriminador | Migração ativa entre formas de binding sem versão no documento — a detecção é heurística (`execute-metric.ts:188`, `:237`: "tem chave em `schemaBindings`?"). |
| `schemas/`, `sql-catalog/repository.ts`, rotas de reports | `contracts/firebase-firestore` §18 — todo documento tem schema Zod | ❌ | Cobertos: `schemas/index.ts:1-9` (9 coleções). Sem schema: `sqlCatalog` (`repository.ts:135-160` — `d.intent as string`, `d.status as SqlCatalogStatus`), `reports`/`groups` (`app/api/reports/route.ts` — 302 linhas, **0** `safeParse`), `conversations` (`conversations.ts:48-61` — casts) | 4 coleções sem schema. `reports` guarda `blockMap`/`layout` livres e é escrita por rota sem validação. |
| Repositórios | `contracts/firebase-firestore` §18 — `withConverter<T>` p/ encapsular parse | ⚠️ | `grep -r withConverter src/ app/ scripts/` = **0**; parse manual em `product-repo.ts:36`, `data-source-repo.ts:28` | Efeito equivalente onde o parse existe; a ausência do converter é justamente o que permite os 4 buracos da linha acima. |
| `firestore.rules` | `contracts/firebase-firestore` §19 — rules versionadas, revisadas, com validação básica e tenant matching | ✅ | `firestore.rules:1-149`; helper `tenantAllowed` fail-closed em `:30-36`; server-managed com `allow write: if false` (`:101,111,127`) | |
| `firestore.indexes.json` | `contracts/firebase-firestore` §20 — composite index declarado e versionado | ✅ | `firestore.indexes.json:36-70` cobre as 4 combinações de `listByClient` (`repository.ts:193-200`); `:3-10` cobre `onConversationsSnapshot` (`conversations.ts:141`) | |
| `firestore.indexes.json` | `contracts/firebase-firestore` §20 — TTL declarado em `fieldOverrides` | ❌ | `firestore.indexes.json:145` (`"fieldOverrides": []`); TTL implementado em código: `src/shared/lib/memory/eviction.ts:60` | ADR-0011 exige TTL de semantic recall. Eviction por cron funciona, mas paga reads+deletes que o TTL nativo faria de graça. |
| `resolve-metric.ts`, `queries.ts` | `contracts/bigquery` §18 — `SELECT` explícito, `SELECT *` proibido | ✅ | `resolve-metric.ts:344,366-375` (SELECT montado coluna a coluna), `queries.ts:22,29` (`SELECT DISTINCT <col>`) | `COUNT(*)` é o único `*` e é agregação, não projeção. |
| `resolve-metric.ts` | `contracts/bigquery` §9/§18 — filtro na partition column primeiro | ⚠️ | `resolve-metric.ts:173-174` e `:397-399` — filtro de página não preenchido vira `'1=1'`; `:369` omite o `WHERE` inteiro quando não há cláusula | Datasets são do cliente (não modelamos o particionamento), mas a degradação silenciosa para full scan é nossa. |
| `sql-generation-logger.ts` | `contracts/bigquery` §16 — Storage Write API sobre streaming inserts | ⚠️ | `sql-generation-logger.ts:64` (`table.insert([row])`) | É 1 linha por evento — streaming é o caso de uso adequado. O contrato desaconselha p/ *batch*, não p/ evento unitário. |
| `sql-generation-logger.ts` | `contracts/bigquery` §14 — dataset `ai_observability` com `llm_calls` (tokens, custo) | ⚠️ | `sql-generation-logger.ts:41-60` — registra `latency_ms`, `bytes_billed`, `error`, mas não `prompt_tokens`/`completion_tokens`/`cost_usd`/`model` | Tabela é `liquid_meta.sql_generations`. Cobre custo de BQ, não custo de LLM. |
| `client.ts`, `schemas/data-source.ts` | `contracts/bigquery` §21 — região do dataset explícita | ✅ | `data-source.ts:10-19` (`BigQueryLocation` enum, default `'US'`), `client.ts:72` (location vem do DataSource) | |
| `execute-metric.ts`, `queries.ts` | `stacks/database/bigquery` §Query API — `useLegacySql: false` sempre | ⚠️ | `execute-metric.ts:205,252`, `queries.ts:36,38,184` — nenhum seta a flag; setada corretamente em `src/features/ai-agents/tools/bq-dry-run.ts:42` | O client Node já usa Standard SQL por default ⇒ efeito nulo hoje. Divergência é de explicitude, não de comportamento. |
| `resolve-metric.ts`, `identifier.ts` | `stacks/database/bigquery` §Query API — parameterized queries; anti-pattern "string concatenation para montar WHERE" | ✅ | `resolve-metric.ts:179-181,190-192,199` (todo valor vai p/ `@named`), `:487-489`; identificadores passam por `quoteIdentifier`/`quoteTableRef` (`identifier.ts:64-81`) e o `expression.ts:6-8` recusa `.` e `;` | Melhor peça de defesa da camada. |
| `execute-metric.ts` | `stacks/database/bigquery` §Anti-patterns — sem `maximumBytesBilled` em query que aceita input de usuário | ❌ | `grep -r maximumBytesBilled src/ app/` = **0**; `execute-metric.ts:252` executa `recipe.template` criado a partir de output de LLM (`create-chat-metric.ts:51`) | Sem teto de bytes, um template mal formado varre a tabela inteira e a conta é do cliente. |
| `execute-metric.ts` | `stacks/database/bigquery` §Query API — `dryRun` antes de query pesada | ❌ | `execute-metric.ts:205,252` — sem dry-run; existe apenas nas tools do agente (`src/features/ai-agents/tools/bq-dry-run.ts:41`) | O caminho de dashboard/relatório é justamente o de maior volume. |
| `client.ts` | `stacks/database/bigquery` §Autenticação — ADC/metadata server em runtime GCP; `keyFilename` só quando inevitável | ✅ | `client.ts:37-43,75` — `keyFilename` só se `BIGQUERY_CREDENTIALS` estiver setado; caso contrário ADC | |
| `execute-metric.ts` | `stacks/database/bigquery` §Result handling — converter `BigQueryDate`/`Timestamp` na fronteira | ⚠️ | `execute-metric.ts:253` (`rows as unknown[]` direto p/ a resposta); conversão manual só em `queries.ts:45-52` | O cliente recebe `{ value: "YYYY-MM-DD" }` cru e cada consumidor re-implementa o unwrap. |
| Todo o storage | `contracts/postgres`, `contracts/pgvector`, `stacks/database/{postgres,pgvector}` | n/a | `adrs/decisions/0013-firestore-storage-config-metadata.md` (supersede ADR-0004); `package.json` sem `pg`, `drizzle` ou `pgvector` | **Conflito de baseline**: `.contexts/engineering/MEMORY.md:24-25` fixa "OLTP PostgreSQL 18 + Drizzle" e "pgvector 0.8" como stack do harness. Este produto não usa nenhum dos dois por decisão arquitetural aceita. Precisa de exceção registrada, senão toda revisão futura vai reabrir a discussão. |
| `firestore/dashboard-templates.ts`, `reports.ts`, `groups.ts` | `contracts/schemas` §1 — nunca declarar `interface`/`type` paralela a um schema | ❌ | `dashboard-templates.ts:4-17` (`TemplateRecord`) duplica `src/shared/schemas/dashboard-template.ts:21-38` (`DashboardTemplateDoc`); `reports.ts:4-21` (`Report`) e `groups.ts:1-5` (`Group`) não têm schema nenhum | `TemplateRecord.category` é union literal escrito à mão (`:8`) — vai divergir de `TemplateCategory` (`dashboard-template.ts:18`) silenciosamente. |
| `src/shared/schemas/` | `contracts/schemas` §2 — localização canônica `src/contracts/<context>/` | ⚠️ | `src/shared/schemas/index.ts:1-9` | Path diverge, substância não: é módulo único compartilhado por features e camadas, que é o objetivo da §2. Não vale a mudança. |
| `schemas/metric.ts`, `product.ts` etc. | `contracts/schemas` §3 — schemas em PascalCase com sufixo `Schema` | ❌ | `metric.ts:209` (`export const Metric`) e `:223` (`export type Metric`); idem `product.ts:78,88`, `relation.ts:30,34` | Funciona por namespaces separados de valor e tipo, mas `contracts/schemas` §24 lista explicitamente como anti-pattern. Refactor mecânico e de baixo risco. |
| `schemas/identifier.ts` | `contracts/schemas` §6 / `rules/data-modeling` §3 — branded types p/ IDs | ❌ | `identifier.ts:7-42` — `SqlIdentifier`, `Slug`, `UserDocId`, `GcpProjectId` sem `.brand<>()`; `metric.ts:23` (`MetricId`) idem | `resolveColumn(binding, ref, metricId)` (`resolve-metric.ts:71-75`) aceita três strings em qualquer ordem sem erro de tipo. Numa camada que monta SQL, o brand tem valor real. |
| `schemas/metric.ts`, `ambient-filter.ts` | `contracts/schemas` §12 — `discriminatedUnion` quando há campo discriminador | ✅ | `metric.ts:169-173` (`MetricRecipe` por `kind`), `ambient-filter.ts:17` (por `op`) | |
| `metrics/ambient-filter.ts` | `contracts/schemas` §12 — idem, aplicado a `NumericBucket` | ⚠️ | `ambient-filter.ts:4-7` (`z.union` de `{eq}` \| `{min?,max?}`) | Não há tag discriminadora natural; `z.union` é a escolha correta aqui. Refutado. |
| `schemas/__tests__/` | `contracts/schemas` §21 — cada schema com 1 fixture válido + 2 inválidos | ❌ | Existem: `metric.test.ts`, `data-contract.test.ts`, `dashboard-template.test.ts`, `relation.test.ts`. Faltam: `client-binding`, `product`, `client`, `data-source`, `identifier` | 4 de 9. `client-binding` é o schema mais crítico do fluxo semântico (define `schemaBindings`) e é o maior sem cobertura. |
| Todos os schemas | `contracts/schemas` §22 — schemas em escopo de módulo, uma única vez | ✅ | `metric.ts:14-207`, `client-binding.ts:12-78` — tudo top-level | |
| `schemas/metric.ts` | `contracts/schemas` §16 — `.describe()` em todos os campos de schema usado em prompt de LLM | ⚠️ | `metric.ts:176-207` — nenhum `.describe()`; o contexto p/ IA é montado à mão em `client-semantic-context.ts:18-40` | O schema não é passado ao modelo, então o requisito não morde diretamente — mas a duplicação manual é o custo. |
| `package.json`, todos os schemas | `stacks/validation/zod@4` — Zod 4 em todas as boundaries, sem Zod 3 | ✅ | `package.json:69` (`"zod": "^4.3.6"`); `z.record(K, V)` com 2 args (forma obrigatória em Zod 4) em `client-binding.ts:12-15,35-38` e `dashboard-template.ts:28,30` | |
| `schemas/metric.ts`, `dashboard-template.ts` | `stacks/validation/zod@4` §Anti-patterns / `rules/validation` §19 — `z.unknown()` como escape hatch | ⚠️ | `metric.ts:205-206` (`createdAt`/`updatedAt` como `z.unknown()`), `data-contract.ts:34-35,45-46,69-70`, `dashboard-template.ts:28-31` | `blockMap`/`layout` como JSON livre é decisão declarada (`dashboard-template.ts:9-11`) e defensável. `createdAt: z.unknown()` não é: é justamente o campo de auditoria que a §5 do contrato Firestore exige tipado como `Timestamp`. |
| Toda a aplicação | `rules/validation` §5 / `contracts/secrets` §5.4 — env validada no boot via Zod, `env` tipado exportado | ❌ | Não existe `src/env.ts`; 35 arquivos leem `process.env` direto — `bigquery/client.ts:37-42`, `firebase/admin.ts:18-29`, `firebase/config.ts:7-15`, `sql-generation-logger.ts:34-35` | Misconfiguração vira falha em runtime, não no boot. |
| `bigquery/client.ts` | `rules/validation` §5 — nunca `process.env.X ?? 'default'` p/ valor obrigatório | ❌ | `client.ts:83` — `DEFAULT_DATASET = process.env.BIGQUERY_DATASET ?? 'liquid_dataviz'` | Default silencioso: sem a env, o app aponta p/ um dataset que pode não existir e falha só na primeira query. |
| `product-repo.ts`, `data-source-repo.ts`, rotas de métrica | `rules/validation` §12 — validar documento Firestore que alimenta lógica crítica | ✅ | `product-repo.ts:36` (`Product.parse`), `data-source-repo.ts:28` (`DataSource.parse`), `app/api/metrics/[id]/data/route.ts:80` e `app/api/metrics/batch/route.ts:77` (`Metric.parse`) | Caminho de execução de métrica é validado ponta a ponta. |
| `sql-catalog/repository.ts`, `client-semantic-context.ts` | `rules/validation` §12 — idem | ❌ | `repository.ts:141-158` (`d.intent as string`, `d.status as SqlCatalogStatus`, `d.qualityScore as number`), `client-semantic-context.ts:161-175` (narrowing manual com `typeof`) | `qualityScore` alimenta o gate ADR-0009 (`repository.ts:241`) por cast, não por parse. |
| `metrics/create-chat-metric.ts` | `rules/validation` §12 — nunca escrever no Firestore objeto que não passou por schema de escrita | ❌ | `create-chat-metric.ts:44-57` — `.set({…})` direto, sem `MetricDoc.parse` | Escreve `metrics/{id}` fora de `POST /api/metrics` (comentado em `:32-33` como decisão). `recipe.template` escapa do `max(10000)` de `metric.ts:127`. |
| `metrics/create-chat-metric.ts` | `rules/validation` §10 — validar structured output de LLM antes de persistir | ❌ | `create-chat-metric.ts:11` (`sql` vem do agente), `:51` (`recipe: { kind: 'sql', template: opts.sql }`) | SQL gerado por LLM é persistido sem validação e depois executado em BQ (`execute-metric.ts:252`) sem `maximumBytesBilled` nem `dryRun`. É a cadeia mais frágil da camada. |
| `metrics/execute-metric.ts` | `rules/validation` §9 — `safeParse` sem engolir o erro | ⚠️ | `execute-metric.ts:62-67` — bindings que falham o parse são filtrados em silêncio | Se todos falharem, o usuário recebe 422 "sem productBindings utilizáveis" (`:230`) sem nenhuma pista de qual campo quebrou. |
| Todos os schemas | `rules/validation` §2 — tipo derivado do schema via `z.infer` | ✅ | `metric.ts:213-223`, `product.ts:82-88`, `client-binding.ts:80-84`, `relation.ts:32-34` | Consistente em 100% dos schemas. |
| `metric-id.ts` + `create-chat-metric.ts` | `rules/data-modeling` §16 — invariantes do agregado garantidas na escrita | ❌ | `metric-id.ts:16-20` (loop check-then-use, sem transação) seguido de `create-chat-metric.ts:42-44` (`.set()`, que sobrescreve) | Lost update: duas criações concorrentes com o mesmo intent resolvem o mesmo id e uma sobrescreve a outra. Correção: `.create()` (falha se existir) ou transação. |
| Schemas de catálogo | `rules/data-modeling` §2 — identificadores opacos, sem significado de negócio | ⚠️ | `metric.ts:23-25` (`domain.slug`), `identifier.ts:16-20` (Slug); `create-chat-metric.ts:19-28` deriva o id do texto do usuário | Entidades de catálogo/configuração, não de negócio com ciclo de vida — §2 mira o segundo caso e `contracts/firebase-firestore` §2.4 permite id natural. Ressalva real: o id derivado do intent expõe texto do usuário na chave. |
| `sql-catalog/repository.ts` e rotas de escrita | `rules/data-modeling` §7 — `updatedAt` atualizado automaticamente na camada de persistência | ❌ | `repository.ts:236,251,258,273,287` — `updatedAt` repetido manualmente em cada método; nenhum converter, trigger ou middleware | Um método novo que esqueça a linha grava sem `updatedAt` e ninguém percebe. |
| Entidades de dados | `rules/data-modeling` §8 — decisão explícita soft vs hard delete, sem misturar sem declarar | ⚠️ | Soft (via status): `metric.ts:42`, `data-contract.ts:27,67`. Hard: `reports.ts:146`, `groups.ts:67`, `conversations.ts:122`, `dashboard-templates.ts:104` | As duas estratégias coexistem sem declaração em lugar nenhum. §8 permite a mistura, mas exige a declaração. |
| `client-binding.ts`, `client.ts`, `product.ts` | `rules/data-modeling` §14 — campo deprecado com data planejada de remoção | ⚠️ | `client-binding.ts:66-67`, `client.ts:20-23`, `product.ts:70-71` — todos `@deprecated` sem data | O comentário aponta o substituto (bom), mas sem prazo vira campo zumbi. O `schema` legado já tem caminho de leitura permanente em `execute-metric.ts:189,238`. |
| `dashboard-template.ts` | `rules/data-modeling` §19 — sem blob JSON opaco quando o conteúdo é consultado | ✅ | `dashboard-template.ts:28-31` + justificativa em `:9-11` | `blockMap`/`layout` nunca são filtrados no Firestore (leitura sempre por id). Decisão declarada e correta. |
| `scripts/` | `rules/migration` §16 — nunca delete arquivos de migration antigos p/ limpar o repositório | ❌ | `git show f8c47c5 --stat` remove `scripts/seed-firestore.mjs` (criava `clients`, `groups`, `users`) e `scripts/seed-liquid-play-contracts.mjs` (criava `dataContracts/liquid-play` + `products/*`) | **Confirmado.** Consequência direta: `scripts/seed-liquid-play-plus-v2-contract.mjs:348` aborta com "dataContracts/liquid-play-plus não existe — este script só estende um contrato existente, não o cria do zero" e `scripts/seed-vila-rosa-client.mjs:305` aborta com "products/liquid-play-plus não existe". **O repositório não reprovisiona um ambiente do zero.** |
| `scripts/` | `rules/migration` §9 — migrações Firestore versionadas em `infra/migrations/firestore/` | ❌ | Não existem `infra/` nem `scripts/migrations/`; migrações vivem soltas em `scripts/migrate-embeddings-to-kb.ts`, `scripts/backfill-client-ids-claim.ts` | Sem diretório dedicado, migração e seed e hotfix são indistinguíveis por convenção de path. |
| `scripts/` | `rules/migration` §13 — identificador monotônico + nome descritivo (`20260520T1430-…`) | ❌ | `ls scripts/` — `seed-vila-rosa-client.mjs`, `patch-covenants-snapshot-pin.mjs`, `hotfix-restore-recebiveis-pre-pos.mjs` | Sem ordem determinável: não dá p/ saber o que roda antes do quê num ambiente novo. |
| `scripts/migrate-embeddings-to-kb.ts` | `rules/migration` §9 — marker doc com início, progresso e conclusão | ❌ | `grep -r "_migrations\|marker" scripts/` = **0** | Sem marker, retomada após falha é impossível e não há registro do que já rodou em cada ambiente. |
| `scripts/migrate-embeddings-to-kb.ts` | `rules/migration` §9 — `BulkWriter` ou batched writes (500 ops) com retry | ❌ | `migrate-embeddings-to-kb.ts:7-15` — `await doc.ref.update()` doc a doc, sequencial, sobre `.get()` sem limite | O padrão correto **existe** no repo (`sql-catalog/repository.ts:281-291` e `revalidation.ts:57` fazem batch de 500); os scripts simplesmente não o usam. |
| `scripts/*.mjs` | `rules/migration` §3 — idempotência por inspeção do estado atual | ✅ | `migrate-embeddings-to-kb.ts:11` (`if (data.knowledgeBaseId) skip`); `seed-test-data.mjs:5` ("idempotente — skip se já existe"); 12 scripts com flag `--dry-run`/`--apply` | Ponto forte dos scripts. |
| `scripts/`, `firebase/admin.ts` | `rules/migration` §2/§16 — nunca dispare migration no boot da aplicação | ✅ | `firebase/admin.ts:70` só chama `ensureAdminApp()`; scripts rodam via `pnpm tsx`, nunca importados pelo app | |
| `scripts/` | `rules/migration` §12/§14 — teste de migração e runbook escrito | ⚠️ | Testes: `scripts/migrate-embeddings-to-kb.test.ts`, `scripts/ingest-rag.test.ts`. Runbook: docstrings ricas (`seed-vila-rosa-client.mjs:1-50`) mas sem plano de rollback | Cobre a função pura, não o pacote completo em base limpa (§12). Nenhum script declara rollback. |
| `product-repo.ts`, `data-source-repo.ts`, `benchmark-cache.ts` | `rules/caching` §Chaves — namespace com prefixo de domínio e versão | ❌ | `product-repo.ts:31` (`cache.get(id)` — id cru), `data-source-repo.ts:23`, `benchmark-cache.ts:14` (`${start}:${end}`) | Sem versão na chave, mudança no shape do valor cacheado (ex.: novo campo em `Product`) serve dado velho até o TTL expirar. |
| `product-repo.ts`, `data-source-repo.ts`, `benchmark-cache.ts` | `rules/caching` §TTL — TTL explícito e assimétrico por natureza do dado | ✅ | `product-repo.ts:15` (60s), `data-source-repo.ts:7` (300s, comentado "muda raramente"), `benchmark-cache.ts:5` (1h) | Escalonamento coerente com a volatilidade de cada um. |
| `product-repo.ts`, `data-source-repo.ts` | `rules/caching` §Cache stampede — single-flight e jitter no TTL | ❌ | `product-repo.ts:28-38`, `data-source-repo.ts:20-31` — sem lock; N requests concorrentes em miss fazem N reads no Firestore | Com TTL fixo de 60s, todas as entradas de um pod expiram juntas. |
| Todos os caches | `rules/caching` §Observabilidade — nunca operar cache em produção sem métrica de hit rate | ❌ | `product-repo.ts`, `data-source-repo.ts`, `benchmark-cache.ts`, `bigquery/client.ts:17` — nenhum counter, nenhum log de hit/miss | Quatro caches em produção, zero visibilidade sobre eficácia. |
| `bigquery/benchmark-cache.ts` | `rules/caching` §Escopo — identificador do principal na chave quando o valor depende do contexto | ⚠️ | `benchmark-cache.ts:14-15` (chave sem tenant), `:20` (lê **todos** os `clients` e agrega) | O valor é agregado anônimo de toda a base — por desenho não é per-tenant, então a chave global é coerente. O ponto de atenção é a *fonte* (dados de todos os clientes num único payload), que é questão de autorização: **confirmar com rev-auth/rev-rotas quem pode chamar o endpoint**. |
| `product-repo.ts` | `rules/caching` §Camadas — invalidação coordenada entre instâncias | ⚠️ | `product-repo.ts:41-44` (`invalidateProductCache` limpa só o `Map` local) | Multi-instância: update do admin propaga em até 60s nos outros pods. TTL curto é a mitigação e é aceitável para o dado. |
| `benchmark-cache.ts`, `vector-search.ts`, `migrate-embeddings-to-kb.ts` | `rules/performance` §7 — nunca liste coleção com `.get()` sem `.limit()` | ❌ | `benchmark-cache.ts:20` (`db.collection('clients').get()`), `vector-search.ts:71` (`q.get()` sobre `embeddings*`), `scripts/migrate-embeddings-to-kb.ts:7` | `vector-search` é brute-force por desenho (documentado em `:8-21`), mas o custo cresce linear e não há teto. |
| `client-semantic-context.ts`, `metric-id.ts` | `rules/performance` §7 — nunca faça N+1 em Firestore | ❌ | `client-semantic-context.ts:152` (1 `doc().get()` por métrica), `:204-210` (1 query por entity), `metric-id.ts:16` (1 read por tentativa de id) | Cliente com 60 métricas ⇒ 60 reads sequenciais só p/ montar contexto de chat. `getAll()` resolveria. |
| `client-semantic-context.ts`, `execute-metric.ts` | `rules/performance` §9 — `Promise.all` p/ operações independentes | ❌ | `client-semantic-context.ts:149-176` e `:199-233` (await em loop), `execute-metric.ts:177-197` (loop de contratos com 2 awaits cada) | Somado ao N+1 acima, é o principal custo de latência da montagem de contexto. |
| `sql-catalog/use-count-hook.ts` | `rules/performance` §9 — nunca fire-and-forget sem handler em serverless | ⚠️ | `use-count-hook.ts:19-24` — `try/catch` engolindo, documentado como best-effort em `:7-8` | Tem handler (não é floating promise). Se o caller faz `await`, está correto; verificar em `execute-sql.ts` (fora deste escopo). |
| Módulos de dados | `rules/observability` §Structured logging — logger central JSON; nunca `console.*` em runtime | ❌ | 13 ocorrências: `client-semantic-context.ts:116,120,154,158,163,212,229,243`, `sql-generation-logger.ts:37,66`, `resolve-metric.ts:103`, `conversations.ts:151`; `ls src/shared/lib/logger*` = **inexistente** | Sem logger central não há redaction configurável, nem campos estáveis, nem `requestId`. |
| Toda a camada | `rules/observability` §OTel/§Onde aplicar — span + métricas RED em função que cruza I/O | ❌ | `grep -r "@opentelemetry\|startSpan" src/ app/ package.json` = **0**; `execute-metric.ts:252` (query BQ) e `product-repo.ts:33` (read Firestore) sem instrumentação | Nenhuma visibilidade de latência/erro por operação de dados. É a base que falta p/ os itens de cache e performance acima. |
| `client-semantic-context.ts`, `sql-generation-logger.ts` | `rules/observability` §PII — nunca logue PII ou payload inteiro | ✅ | `client-semantic-context.ts:116-163` (só ids e mensagens), `sql-generation-logger.ts:28-31` (trunca SQL em 50k), `execute-metric.ts:256-257` (erro genérico p/ não vazar SQL/topologia) | Comentário em `:256` mostra que a decisão foi consciente. |
| `client-semantic-context.ts`, `use-count-hook.ts` | `rules/observability` §Anti-patterns — nunca silencie erro com `catch {}` vazio | ✅ | `client-semantic-context.ts:240-245` (loga antes de degradar), `use-count-hook.ts:22` (catch com log), `sql-generation-logger.ts:65-67` | |
| `client-semantic-context.ts` | `rules/observability` §Níveis — `error` só p/ falha que requer investigação | ⚠️ | `client-semantic-context.ts:243` — `console.error` p/ degradação que o próprio comentário descreve como tratada ("nunca quebra o chat") | Fluxo esperado e recuperado ⇒ `warn`. |
| `sql-generation-logger.ts` | `rules/observability` §LLM — tokens, custo USD e `finish_reason` por chamada | ⚠️ | `sql-generation-logger.ts:41-60` — sem `prompt_tokens`, `completion_tokens`, `cost_usd`, `model`, `finish_reason` | Cobre o custo de BigQuery, não o de LLM. Ver também a linha de `contracts/bigquery` §14. |
| `.gitignore`, `.env.example` | `contracts/secrets` §13 — `.env.local`/chaves gitignored, `.env.example` commitado | ✅ | `.gitignore:10-11,39-42` (`.env.local`, `.env`, `.env.docker`, `secrets/*` com `!secrets/.gitkeep`); `.env.example` presente e documentado (`:62,68`) | |
| `firebase/config.ts` | `contracts/secrets` §17 — `NEXT_PUBLIC_*` só p/ valor público por contrato | ✅ | `firebase/config.ts:7-12` — apenas config web do Firebase (pública por desenho) | |
| Módulos de dados | `contracts/secrets` §20 — nenhum secret hardcoded | ✅ | `grep -nE "sk-[A-Za-z0-9]{10}\|whsec_\|BEGIN (RSA )?PRIVATE" src/shared/lib src/shared/schemas src/shared/repositories src/features/sql-catalog` = **0** | |
| `bigquery/client.ts` | `contracts/secrets` §18 — SA JSON nunca commitado; Workload Identity preferido | ⚠️ | `client.ts:42,75` (`BIGQUERY_CREDENTIALS` → `keyFilename`); `.gitignore:39` cobre `secrets/` | Chave em disco é justificada p/ dev local (evita `invalid_rapt` do ADC). Confirmar que `BIGQUERY_CREDENTIALS` **não** é setado em Cloud Run — lá deve cair no metadata server. |
| Todos os secrets | `contracts/secrets` §5.4/§20 — secret sem schema Zod no boot | ❌ | Ver linha de `rules/validation` §5: não existe `src/env.ts` | `FIREBASE_ADMIN_PRIVATE_KEY` ausente faz `ensureAdminApp()` cair silenciosamente no branch ADC (`firebase/admin.ts:18,29`) em vez de falhar. |

**Total: 82 linhas** — 22 ✅, 25 ⚠️, 34 ❌, 1 n/a.

---

## 3. Os 5 achados mais graves

1. **O repositório não reprovisiona um ambiente do zero.** O commit `f8c47c5` removeu `scripts/seed-firestore.mjs` (criava `clients`/`groups`/`users`) e `scripts/seed-liquid-play-contracts.mjs` (criava `dataContracts/liquid-play` e `products/*`). Os seeds sobreviventes só *estendem* o que já existe e abortam explicitamente: `seed-liquid-play-plus-v2-contract.mjs:348` ("este script só estende um contrato existente, não o cria do zero") e `seed-vila-rosa-client.mjs:305` ("products/liquid-play-plus não existe — abortando merge"). Produção depende hoje de estado que não tem origem versionada.

2. **SQL gerado por LLM é persistido sem validação e executado sem teto de custo.** `create-chat-metric.ts:51` grava `recipe: { kind: 'sql', template: opts.sql }` direto em `metrics/{id}` sem `MetricDoc.parse` (violando `rules/validation` §10 e §12); `execute-metric.ts:252` executa esse template sem `maximumBytesBilled` e sem `dryRun` (ausentes no repo inteiro). Um template mal formado varre a tabela e a conta é do cliente.

3. **Ausência total de campos de autoria e de `schemaVersion`.** `grep -r createdBy` e `grep -r schemaVersion` retornam zero em `src/` e `scripts/`. Nenhuma entidade registra quem alterou métrica, contrato ou binding — e as coleções estão em migração ativa (binding flat vs nested) sem discriminador de versão no documento, detectando a forma por heurística (`execute-metric.ts:188,237`).

4. **Migrações Firestore sem infraestrutura mínima.** Sem `infra/migrations/`, sem marker doc (`grep _migrations` = 0), sem versionamento monotônico nos nomes, sem batch/BulkWriter nos scripts (`migrate-embeddings-to-kb.ts:7-15` faz update doc a doc sobre `.get()` sem limite). Ironicamente o padrão correto já existe no produto — `sql-catalog/repository.ts:281-291` faz batch de 500 — mas os scripts não o usam.

5. **Zero observabilidade na camada de dados.** Nenhum OTel (`grep @opentelemetry` = 0), nenhum logger central (`src/shared/lib/logger*` inexistente, 13 `console.*` espalhados), nenhuma métrica de hit rate nos 4 caches in-process. Combinado com o N+1 sequencial de `client-semantic-context.ts:149-233` (1 read por métrica + 1 query por entity, tudo em série), a latência de montagem de contexto do chat é invisível e não instrumentada.

---

## 4. Pontos fortes (para não perder na refatoração)

- **Defesa contra SQL injection é sólida e em camadas.** Valores sempre em `@named params` (`resolve-metric.ts:179-192`), identificadores sempre por `quoteIdentifier`/`quoteTableRef` (`identifier.ts:64-81`), e a `expression` de recipes `derived` passa por um tokenizer que recusa `.` e `;` por construção (`expression.ts:6-8,31-51`).
- **Fail-loud onde importa.** `resolveColumn` (`resolve-metric.ts:71-107`) distingue cliente migrado de legado e recusa consultar coluna inexistente em vez de gerar SQL errado — com o fallback back-compat isolado e observável.
- **Multi-tenancy estrito no catálogo SQL.** `assertClientId` (`repository.ts:116-120`) + filtro obrigatório por `clientId` em toda query + `firestore.rules` fail-closed (`:30-36`).
- **Índices compostos completos e versionados.** `firestore.indexes.json` cobre as 4 combinações de `listByClient` e todas as queries compostas em uso.
- **Idempotência nos scripts.** 12 dos 15 têm `--dry-run`/`--apply` e verificam o estado antes de escrever.

---

## 5. Divergência de baseline a resolver fora desta revisão

`.contexts/engineering/MEMORY.md:24-25` fixa **PostgreSQL 18 + Drizzle** como OLTP e **pgvector 0.8** como store vetorial do baseline DDC. Este produto não usa nenhum dos dois: ADR-0013 (`Accepted`) supersede ADR-0004 e tornou o Firestore o storage canônico — `package.json` não tem `pg`, `drizzle` nem `pgvector`. Consequentemente `contracts/postgres.md`, `contracts/pgvector.md`, `stacks/database/postgres.md` e `stacks/database/pgvector.md` são **n/a** para este produto.

Mesma natureza de conflito, em menor escala: `contracts/firebase-firestore` §1 (kebab-case) e §14 (SCREAMING_SNAKE_CASE) contradizem nomes já persistidos e fixados por ADR-0013 e pelos schemas em produção. Nos dois casos a recomendação é **registrar exceção** (ADR nova ou nota no `.contexts`), não migrar dados — o próprio §14 proíbe renomear valor de enum em produção.
