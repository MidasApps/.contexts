# Auditoria de Arquitetura — Liquid DataViz (Camada Semântica ADR-0015)

> Pente-fino multi-agente (49 agentes; 38 gaps confirmados, 2 refutados) contra as 6 regras do modelo pretendido. Todas as afirmações têm evidência `file:line` verificada adversarialmente por subagentes. Estado: branch `develop`, ADR-0015 ainda `Proposed` — janela de coexistência legado↔semântico aberta.

---

## 1. A arquitetura funciona conforme as 6 regras?

| Regra | Status | Por quê (evidência) |
|---|---|---|
| **R1** — Contratos de dados multi-entidade/multi-atributo | 🟡 parcial | CRUD completo de contracts/entities/attributes existe e funciona (`app/api/data-contracts/[id]/entities/route.ts:64`), mas o modelo é **plano**: `EntityDoc` não tem relações/chaves de junção entre entidades (`src/shared/schemas/data-contract.ts:42-47`; `isKey` é flag binário sem alvo). |
| **R2** — Métrica cruza várias entidades e contratos | ❌ faltando (no caso central) | Cross-**contract** é impossível em runtime: a rota carrega 1 só dataset por `requires[0]` (`app/api/metrics/[id]/data/route.ts:116`). `aggregation` é mono-entidade, sem JOIN (`resolve-metric.ts:264`). Preço/m² só via SQL cru não-validado. |
| **R3** — Produtos associam métricas/contratos | 🟡 parcial | `metricRefs` funciona e é consumido downstream (`client-semantic-context.ts:104`), mas `contractRefs` é hardcoded `['canonical']` (`ProductForm.tsx:109-111`) e validação de refs é soft (`products/route.ts:131-140`). |
| **R4** — Templates = indicadores + layout + 1..N produtos | 🟡 parcial | Núcleo OK (blockMap+layout+productRefs.min(1), `dashboard-template.ts:26-32`), mas template é **mono-página** — não existe importar "páginas completas" de 1+ produtos numa ação (`dashboard-templates.ts:35-36`; `TemplateGallery.tsx:157-176`). |
| **R5** — Clientes, usuários, permissões | 🟡 parcial | CRUD de clientes/grupos/usuários existe, mas **permissões de rota/indicador só rodam no React** — bypass via API direta (`metrics/[id]/data/route.ts:178` só `verifyDatasetAccess`); cadastro de usuário não provisiona conta Auth (`users/route.ts:104-111`). |
| **R6** — Datasets do cliente resolvem campos via contratos/produtos | 🟡 parcial | Caminho semântico desenhado e fail-loud (`resolve-metric.ts:66-102`), mas detecção por IA (schema-detect/v2) lê `expectedTables` deprecado/vazio → 422; sem validação de cobertura `requires[]` × `schemaBindings`. |

**Veredito geral:** o esqueleto da camada semântica está implementado e é coerente para o caminho "template → métrica → contrato → binding → BigQuery". Mas a regra **R2 (cruzar entidades/contratos)** — coração analítico do produto — **não é expressável de forma estruturada e validável**, e há uma camada legada duplicada convivendo em quase todos os eixos.

---

## 2. Está bem amarrada? (gaps confirmados)

### 🔴 P0 — Quebram regra ou segurança

**G1. Permissões de rota/indicador não são aplicadas no servidor — bypass via API.**
As rotas de dados validam só acesso ao tenant/dataset. `routeOverrides`/`indicatorOverrides`/`indicators[]` de grupo só existem no React. Um usuário não-admin com acesso a um cliente pode buscar **qualquer** métrica/rota daquele cliente chamando a API direto. A config de permissão fina é cosmética.
*Evidência:* `app/api/metrics/[id]/data/route.ts:178`; `app/api/bigquery/route.ts:82-85`; `useUserPermissions.tsx:198`; `useIndicatorPermissions.ts:17`.
*Nuance:* é escalonamento horizontal **dentro** do tenant — cross-tenant continua barrado por `clientAccess`.

**G2. Default `contractRef:'canonical'` na UI diverge dos contratos reais → produto criado pela Admin fica sem dados.**
ProductForm e ProductBindingsEditor gravam `'canonical'`, mas as métricas reais exigem `liquid-play.*`/`liquid-play-plus.*`. A rota casa por `contractRef` exato e faz fail-loud 422. Qualquer produto/binding criado pela UI não resolve dados. Existe até script de migração `canonical.*→liquid-play.*`, provando que `'canonical'` é resíduo.
*Evidência:* `ProductForm.tsx:111`; `ProductBindingsEditor.tsx:228`; `client-binding.ts:47`; `seed-liquid-play-contracts.mjs:244`; `cleanup-canonical-and-play-metrics.mjs:32-33`; `metrics/[id]/data/route.ts:141-146`.

**G3. Cross-contract impossível em runtime + aggregation mono-entidade (R2 não cumprida).**
A rota seleciona 1 dataset por `requires[0]`; o recipe inteiro resolve contra esse binding único. O **recipe** só aceita refs 2-part `entity.attribute` (contrato implícito), então nomear um segundo contrato é estruturalmente impossível. `aggregation` tem `primaryEntity` única, sem JOIN. Preço/m² (exemplo canônico de R2) só via `sql` cru.
*Evidência:* `metrics/[id]/data/route.ts:116-146`; `metric.ts:96-127,148`; `resolve-metric.ts:264,293-345`.

### 🟠 P1 — Fragilidades reais que degradam o produto

**G4. Indicadores montados no chat NÃO viram métricas semânticas — viram snapshots estáticos.**
`convertToBlock` nunca seta `metricId`; o bloco carrega `value/data/rows` fixos. `updateReport` só persiste `blockMap`+`layout`. Ao reabrir, `useReportData` ignora blocos sem `metricId` e não refaz fetch → o indicador congela e não responde a filtro/data-base. Não há tool `create_metric`. **Quebra o objetivo (a) do produto.**
*Evidência:* `fill-block-internals.ts:39-91`; `fill-slot-subworkflow.ts:151-162`; `reports.ts:127-138`; `useReportData.ts:216-246`.

**G5. Chat gera SQL cru contra schema BigQuery hardcoded, ignorando a camada semântica.**
O canvas-orchestrator injeta um schema FIXO (`contratos/pagamentos/fluxo_caixa`) e as tools (`query_data`/`execute_sql`) escrevem SQL livre contra ele, sem usar `schemaBindings` do cliente. Cliente cujo dataset não tenha exatamente essas colunas → SQL inválido. Dois mecanismos de acesso a dados divergentes.
*Evidência:* `shared-context.ts:64-147`; `canvas-orchestrator.ts:104,106`; `query-data.ts:16,46,97`; `get-table-schema-v2.ts:13,131-151`.

**G6. Confusão `dataset` vs `clientId` no orchestrator enfraquece multi-tenancy e recall.**
O route resolve o `clientId` real, mas o orchestrator usa `input.dataset` como `clientId` em `vector_query`, `query_data`, `bqml_*`, `schema_describe_relationships`. Recall de SQL/blocos e modelos BQML ficam indexados pelo dataset, não pelo tenant → colisão entre clientes que compartilham dataset. Inconsistência interna: `build_dashboard_workflow` e o catálogo já usam `input.clientId ?? input.dataset`.
*Evidência:* `orchestrator.ts:107-148,153`; `canvas-chat/route.ts:92`.

**G7. schema-detect (IA) grava no formato errado / quebrado para o modelo novo.**
v2 depende de `product.expectedTables` (deprecado, default `[]`); produtos novos nascem com `expectedTables:[]` → v2 retorna 422. A detecção automática está quebrada para o modelo semântico; bindings precisam ser preenchidos à mão ou via seed-identidade.
*Evidência:* `schema-detect/v2/route.ts:74-79,148-166`; `product.ts:90`; `seed-play-product.mjs:133`.

**G8. Sem validação de cobertura `metric.requires[]` × `schemaBindings`.**
A rota seleciona dataset por contrato mas não confere se os attributes exigidos têm binding. Inconsistência só aparece tarde em `resolveColumn`, atributo a atributo. Não existe endpoint/etapa que valide a config do cliente contra o produto contratado — parte central de R6.
*Evidência:* `metrics/[id]/data/route.ts:116-146,186-191`; `resolve-metric.ts:66-102`.

**G9. Caminho legado `/api/bigquery` zera silenciosamente campos sem mapping.**
Campo sem mapping vira literal `'0'` (`SUM('0')=0`) ou cai no nome canônico — produz números errados em vez de falhar. Semântica **oposta** ao caminho novo (fail-loud). Mesmo cliente tem dois comportamentos de "campo indisponível" conforme a tela. E lê `clientDoc.data.schema` top-level, ignorando `productBindings/schemaBindings`.
*Evidência:* `queries.ts:8-19,226-245`; `schema-resolver.ts:27-33`; `bigquery/route.ts:88`.

### 🟡 P2 — Dívida e riscos menores

- **G10.** Sem modelagem de relações/chaves de junção entre entidades (R1/R2): `EntityDoc` sem `relations`; JOIN no recipe `sql` é manual, não-validável, não-testado. (`data-contract.ts:42-75`; `resolve-metric.test.ts` zero casos de `sql`)
- **G11.** DELETE de entity é hard-cascade sem soft-delete nem guard de dependência (contract tem ambos). Apaga attributes deprecated junto. (`entities/[entityId]/route.ts:44-79` vs `data-contracts/route.ts:119-138`)
- **G12.** `EntityForm` não tem guarda de id duplicado → POST `set(merge:false)` sobrescreve entity existente silenciosamente, deixa attributes órfãos. (`EntityForm.tsx:15-21,40-57`; `entities/route.ts:106-113`)
- **G13.** Template editor re-deriva `metricRefs` dos blocos mas **não** `productRefs` → template pode ficar com métrica de um produto e productRef de outro. (`TemplateEditorPage.tsx:49-54`)
- **G14.** `outputColumns:[]` sempre vazio no recipe `sql` → shape de métricas de cruzamento não é introspectável. (`resolve-metric.ts:344`)
- **G15.** Validação de identificador (SqlIdentifier/Slug) ausente no client em EntityForm/AttributeForm/ContractForm (só `trim()`). (`EntityForm.tsx:41`)
- **G16.** Attribute `deprecated` não filtrado no path de **dados** (só avisa na validação da métrica). (`attributes/route.ts:69`; `resolve-metric.ts:66`)
- **G17.** Cadastro de usuário não cria conta Firebase Auth nem claims (só doc ACL). (`users/route.ts:104-111`)
- **G18.** Drift entre `DASHBOARD_TEMPLATES` (40 em código, só seed) e Firestore (runtime); re-seed sobrescreve por id. (`dashboard-templates.ts:1606`; `useTemplates.ts:12`)
- **G19.** Auto-fill de template via `setTimeout(2000)`+`(1000)` e CustomEvents fire-and-forget — prompt se perde se o sidebar não montou. (`ReportPage.tsx:157-159`; `AISidebar.tsx:537-551`)

---

## 3. Funcionalidades duplicadas / módulos inconsistentes

| # | Duplicação | Onde |
|---|---|---|
| D1 | **3 fontes de verdade do "contrato de dados"**: `dataContracts/*` (novo), `Product.expectedTables` (deprecated, é o que v2 lê!), `EXPECTED_SCHEMA` hardcoded | `data-contract.ts:8-12`; `product.ts:88-90`; `admin/model/types.ts:21-73` |
| D2 | **4 modelos de "indicador/métrica"**: `Metric`, `ProductIndicator`, `Indicator` (app-store runtime), `ALL_INDICATORS` hardcoded | `metric.ts:135`; `product.ts:61`; `app-store.ts:43`; `admin/model/types.ts:130` |
| D3 | **2 resolvers de campo com semânticas opostas**: semântico flat fail-loud vs legado nested fallback-`'0'` | `resolve-metric.ts:66-102` vs `schema-resolver.ts:22-34`+`queries.ts:8-19` |
| D4 | **2 caminhos de execução de dados** sem fronteira/guard: `/api/metrics/[id]/data` vs `/api/bigquery`. `NEXT_PUBLIC_SEMANTIC_LAYER` só existe nos docs, não no código | `metrics/[id]/data` vs `queries.ts` |
| D5 | **2 endpoints schema-detect** no mesmo ClientForm (v1 hardcoded / v2 catálogo) | `schema-detect/route.ts` vs `/v2/route.ts`; `ClientForm.tsx:107,139` |
| D6 | **2 implementações de chat de canvas** quase idênticas | `AISidebar.tsx:553-641` vs `ConversationSidebar.tsx:599-759` |
| D7 | **Branch `editMode` do AISidebar é código morto** — nunca recebe `editMode=true`; edição real usa ReportEditChat | `NavSidebar.tsx:172-177`; `AISidebar.tsx:379,556` |
| D8 | **Editores legados órfãos** no barrel sem call-site: `ProductIndicatorsEditor`, `ExpectedTablesEditor`, `ProductRoutesEditor` | `admin/ui/index.ts:7,13,14` |
| D9 | **3 definições do shape de Template** (interface TS, TemplateRecord, DashboardTemplateDoc Zod) | `dashboard-templates.ts:27-52`; `firestore/dashboard-templates.ts:4-17`; `schemas/dashboard-template.ts:21-38` |
| D10 | **Acesso a cliente reimplementado em 3 lugares** | `api-auth.ts:181`; `clients/route.ts:9`; `bigquery/route.ts:48` |

---

## 4. Padronização de nomenclatura

**Colisões de termo (mesmo nome, conceitos diferentes):**
- **`groups`** = grupos de PERMISSÃO (`collection('groups')`) **e** pastas de RELATÓRIO (`clients/{c}/groups`). → renomear para `permissionGroups`/`roles` e `reportFolders`. (`groups/route.ts` vs `report-groups/route.ts`; `firestore.rules:38`)
- **`indicator`** = `Metric`, `ProductIndicator`, registry de canvas (app-store), e `ALL_INDICATORS` legado. `enabledIndicators` aceita IDs heterogêneos (`page.slug` E `domain.slug`). → adotar `Metric` como termo canônico; renomear `enabledIndicators→enabledMetricRefs`. (`client-binding.ts:76-77`)
- **`schema`** = nested legado, `schemaBindings` flat, e resultado do schema-detect. **`dataset`** = string `datasetId`, objeto `ClientDatasetBinding`, e campo legado `client.dataset`. → `columnBindings`/`fieldMap`; `datasetBinding`/`datasetId`/`dataSourceId`. (`client-binding.ts:40-71`)
- **`clientId`** usado como tenant slug E como dataset BQ no orchestrator (G6).

**Inconsistências de UI/idioma:**
- Aba "Metrics Contracts" (ADR diz "Metric Catalog", usuário diz "métricas") — três nomes. (`admin-nav.ts:37`)
- Mistura PT/EN: "Data Metrics oferecidas", "Filter by id or label…", "Loading metrics…" em UI PT-BR. (`MetricRefsPicker.tsx:70,89,97`)
- `EntityDoc.description` obrigatório vs `DataContractDoc.description` optional → doc legado sem description quebra o parse. (`data-contract.ts:33,45`)
- `AttributeDoc.entityId` denormalizado "para query" mas nunca usado em query e sobrescrito server-side. (`data-contract.ts:54-55`)

---

## 5. Objetivo final: (a) montar indicadores via chat; (b) importar/editar/perguntar templates

**(b) Importar template pronto, editar e perguntar — ✅ coerente.**
Alinhado à camada semântica: template carrega `metricRefs`, cada bloco tem `metricId`, dados vêm de `/api/metrics/[id]/data → resolveMetric → contract → binding → BigQuery`. A galeria filtra por produto contratado e a importação cria um Report numa pasta. Atualiza por filtro **para blocos importados de template** (que têm `metricId`).

**(a) Conversar no chat e montar indicadores — 🔴 NÃO coerente.**
**Maior problema do produto.** Indicadores criados via chat:
1. **Não viram métricas reutilizáveis** — sem `metricId`, blocos carregam dados inline e congelam (G4).
2. **Geram SQL contra schema hardcoded** — ignoram `schemaBindings`/recipes/contracts do cliente (G5); cliente com colunas diferentes recebe SQL inválido.
3. **Não respeitam isolamento por tenant** no recall/BQML (G6).

Os objetivos (a) e (b) usam **caminhos de dados divergentes e não-reconciliados**. Um indicador "montado conversando" é uma foto estática que ignora a infraestrutura semântica (R1–R6) que o resto do sistema construiu.

---

## 6. Recomendações priorizadas

### P0 — Bloqueiam segurança ou operação básica
1. **Aplicar permissões de rota/indicador no servidor** (G1) — checagem server-side em `/api/metrics/[id]/data` e `/api/bigquery`.
2. **Eliminar o default `'canonical'`** (G2) — derivar `contractRefs` dos `entityRefs` ou exigir escolha explícita.
3. **Decidir o destino de R2 cross-contract** (G3) — implementar multi-dataset + recipe `ratio`/`derived` com refs 3-part, **ou** documentar que não é suportado e **bloquear no MetricForm** a seleção de refs de >1 contrato.

### P1 — Quebram o objetivo central / geram dados errados
4. **Conectar o chat à camada semântica** (G4+G5) — tool `create_metric`/`bind_block_to_metric` que materialize o indicador conversado como `metrics/{id}` e anexe `metricId` ao bloco; tools de dados resolvendo via `schemaBindings`.
5. **Corrigir `clientId` vs `dataset`** no orchestrator (G6) — separar `tenantId` de `datasetId` no ToolContext.
6. **Unificar resolução de campos / encerrar o legado** (G9+D3+D4) — migrar páginas fixas para `/api/metrics` ou tornar o fallback `'0'` fail-loud; introduzir o guard `NEXT_PUBLIC_SEMANTIC_LAYER`.
7. **Reescrever schema-detect para ler `dataContracts/*`** (G7+D1+D5) retornando `SemanticSchemaBinding` flat; aposentar v1/`EXPECTED_SCHEMA`/`expectedTables`. Adicionar **validação de cobertura** `requires[]` × `schemaBindings` no onboarding (G8).

### P2 — Dívida técnica e robustez
8. **Modelar relações entre entidades** (G10) — chave de junção em `EntityDoc`/`AttributeDoc`; habilitar `outputColumns` em recipes `sql` (G14).
9. **Limpar coexistência legado↔novo** (D2,D7,D8,D9) — remover editores órfãos, deletar branch `editMode` morto, unificar os 2 chats, shape de Template de fonte Zod única.
10. **Padronizar nomenclatura** (seção 4) — `permissionGroups`/`reportFolders`; `Metric` canônico + `enabledMetricRefs`; PT-BR consistente.
11. **Endurecer CRUD de contratos** (G11,G12,G15,G16).
12. **Robustez de import/edit** (G13,G18,G19).

---

### Checados e descartados (não são gaps reais)
- **"productRefs plural mas só `[0]` honrado"** — REFUTADO. Resolução é **per-métrica pelo contrato da própria métrica** (`pickDatasetByContract`); `productRefs[0]` só desempata bindings que cobrem o **mesmo** contrato. Templates multi-produto resolvem corretamente.
- **"MCMV é clone cego"** — PARCIALMENTE REFUTADO. Clones existem, mas há templates MCMV bespoke (Assessment PJ, Litigiosidade com métricas próprias).

**Síntese final:** a fundação semântica (R1, R3, R4, R6) está construída e o fluxo de templates prontos funciona. Os dois calcanhares são **(1) R2 — cruzamento de entidades/contratos não é estruturalmente expressável** e **(2) o chat opera num universo paralelo** (SQL hardcoded, sem `metricId`, sem binding), divorciado da camada semântica. Some-se a permissão fina inexequível no servidor (P0 de segurança) e o resíduo `'canonical'` que quebra produtos criados pela UI. Resolver P0+P1 alinha o produto às 6 regras; P2 é a limpeza da coexistência que a ADR-0015 deixou aberta.
