# Sprint 3.C — Validated Queries Catalog (Curated) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. TDD obrigatório (`superpowers:test-driven-development`) e `superpowers:verification-before-completion` antes de qualquer claim de completude.

**Goal:** Construir um **catálogo curado** de queries SQL validadas, complementar (não substituto) ao recall semântico automático do Sprint 3.A. O catálogo é alimentado por (a) **bootstrap** minerando `liquid_meta.sql_generations` (Sprint 1.C) — top-N SQLs com `success=true`, `rowCount>0`, baixa latência, alto reuso; (b) **curadoria humana** via UI `/admin/sql-catalog`. A tool `bq.list_validated_queries` aplica hierarquia **curated > recall (3.A) > geração from-scratch**, marca queries para revalidação quando `glossaryVersion`/`regulatoryPackVersion` muda, e respeita multi-tenancy estrito.

**Architecture:** Tabela BigQuery `liquid_meta.sql_catalog` com versionamento, status (`draft|approved|deprecated|needs_revalidation`), `qualityScore`, `tags[]`, `useCount`, **clusterizada por `client_id, status, persona_id`** para enforcement multi-tenant (ADR-0006). Script `seed-catalog-from-logs.ts` faz mineração inicial. Tool `bq.list_validated_queries` ordena por status/quality e cai em `embeddings_sql`/`recallSimilarSql` (Sprint 3.A) quando catálogo curado retorna vazio. Tool `bq.save_validated_query` (com `needsApproval: true`, conforme plano-fonte §3) permite ao agente sugerir entradas para curadoria. Hook em `query_data` (Sprint 1.C) carimba `useCount`/`lastUsedAt` (fire-and-forget) quando hash de SQL casa entrada do catálogo. Cron job detecta drift de versão de glossário/regulatório e dispara revalidação via single bulk UPDATE. UI admin Next.js `/admin/sql-catalog` (route group `(dashboard)` reaproveita `DashboardLayout` + auth Firebase com custom claim `role='admin'`). Repair budget cumulativo **herda** o cap do Sprint 1.C (max 2 retries por sessão) — esta sprint NÃO introduz novo cap.

**Tech Stack:** BigQuery (`@google-cloud/bigquery@^8.1.1`), pgvector (Sprint 2.A), AI SDK v6 tools (Zod 4 strict + `.nullable()`), Next.js 16 App Router (`app/(dashboard)/admin/sql-catalog`), Firebase Admin (auth role gate), Vitest 4.x, React Testing Library.

---

## Sprint Prerequisites

- **Sprint 1.C** concluído: `liquid_meta.sql_generations` populado por ≥30 dias com `(timestamp, persona, client_id, intent, sql_draft, dry_run_result, repair_attempts, final_sql, rows, latency_ms, bytes_billed, success, error)`. Helper `bq.dry_run_sql` operacional (mandatório antes de `approve`).
- **Sprint 2.A** concluído: vector store (pgvector) com `vector_query` para fallback do recall.
- **Sprint 3.A** concluído: tool `recall_similar_sql` + função `embeddings_sql` (auto-recall) funcionando — este sprint **complementa**, não substitui. Hierarquia: curated (3.C) > recall (3.A) > fresh.
- **Sprint 1.D** desejável: `glossaryVersion` e `regulatoryPackVersion` expostos como constantes em `src/shared/config/`.

**ADRs aceitas que esta spec implementa (não recriar):**
- `adrs/decisions/0006-multi-tenancy-strict-isolation.md` — `clientId` server-bound, filtro obrigatório, fail-closed, gate adversarial.
- `adrs/decisions/0009-sql-reuse-hierarchy-catalog-recall-fresh.md` — hierarquia `curated > recall > fresh`, gates `quality_score ≥ 0.7` + `dry_run` mandatório antes de approve, drift detection, hook `useCount`.

---

## Contexto pré-leitura obrigatória

Antes de iniciar qualquer task, ler integralmente:

- `docs/superpowers/plans/2026-05-04-mastra-tools-sql-bqml.md` — §3 (catálogo de validated queries), §6 (schema-aware pattern), §7 (Fase 3 / bootstrap).
- `docs/superpowers/plans/2026-05-04-sprint1-C-bq-dry-run-repair.md` — esquema de `liquid_meta.sql_generations`, padrões de tool TDD, uso de `safeIdentifier`/`quoteTableRef`.
- Spec do Sprint 3.A `recall_similar_sql` (ler antes de wirar fallback) — interface esperada `recallSimilarSql({intent, clientId, topK}) → {sql, score, source}[]`.
- `src/features/canvas-orchestrator/orchestrator.ts` — local onde o tool é wired e `prepareStep`/`activeTools` definem ordem.
- `src/features/canvas-orchestrator/tools/query-data.ts` — hook de `useCount` increment.
- `src/features/ai-agents/tools/tool-context.ts` — shape de `ToolContext` (`dataset`, `clientId`, `personaId`, `sessionId`).
- `src/shared/lib/bigquery/client.ts`, `src/shared/lib/bigquery/identifier.ts` — clients e helpers de SQL seguro.
- `src/features/auth/` — gate Firebase, role check (admin).
- `src/shared/ui/` — shadcn/ui (Table, Dialog, Badge, Button, Pagination).
- ADRs **já aceitas** (apenas ler, não recriar): `adrs/decisions/0006-multi-tenancy-strict-isolation.md` e `adrs/decisions/0009-sql-reuse-hierarchy-catalog-recall-fresh.md`. Esta spec **implementa** ambas; nenhuma ADR nova é criada.

---

## File Structure

```
adrs/decisions/
├── 0006-multi-tenancy-strict-isolation.md                 [já aceita — apenas referência]
└── 0009-sql-reuse-hierarchy-catalog-recall-fresh.md       [já aceita — apenas referência]

src/shared/lib/bigquery/migrations/
└── 2026-05-04-sql-catalog.sql                              [novo]

src/features/sql-catalog/
├── repository.ts                                           [novo]
├── repository.test.ts                                      [novo]
├── hash.ts                                                 [novo]  // canonical SQL hash
├── hash.test.ts                                            [novo]
├── revalidation.ts                                         [novo]  // version-drift detector
└── revalidation.test.ts                                    [novo]

src/features/ai-agents/tools/
├── bq-list-validated-queries.ts                            [novo]
├── bq-save-validated-query.ts                              [novo]  // needsApproval: true (plano §3)
└── __tests__/
    ├── bq-list-validated-queries.test.ts                   [novo]
    └── bq-save-validated-query.test.ts                     [novo]

src/features/canvas-orchestrator/
└── tools/query-data.ts                                     [editado]  // hook useCount

src/features/canvas-orchestrator/
└── orchestrator.ts                                         [editado]  // wire tool + prepareStep prio

src/features/ai-agents/agents/
└── sql-agent.ts                                            [editado]  // wire tool

scripts/
└── seed-catalog-from-logs.ts                               [novo]

scripts/cron/
└── revalidate-catalog.ts                                   [novo]

app/api/admin/sql-catalog/
├── route.ts                                                [novo]   // GET (list), POST (create draft)
├── [id]/route.ts                                           [novo]   // GET, PATCH, DELETE
├── [id]/approve/route.ts                                   [novo]   // POST
├── [id]/reject/route.ts                                    [novo]   // POST
└── [id]/revalidate/route.ts                                [novo]   // POST

app/(dashboard)/admin/sql-catalog/
├── page.tsx                                                [novo]
└── components/                                             [novo]
    ├── CatalogTable.tsx
    ├── CatalogFilters.tsx
    ├── CatalogRowActions.tsx
    └── CatalogEditDialog.tsx

src/pages/admin-sql-catalog/ui/
└── AdminSqlCatalogPage.tsx                                 [novo]

src/shared/hooks/
└── useSqlCatalog.ts                                        [novo]

src/shared/lib/auth/
└── require-admin.ts                                        [novo ou editado]

docs/observability/
└── sql-catalog-metrics.md                                  [novo]
```

---

## Convenções

- **TDD obrigatório**: cada produto novo começa por teste vermelho. Sub-skill `superpowers:test-driven-development`.
- **Zod 4 strict**: `.nullable()` em vez de `.optional()`. Vertex Gemini valida estrito.
- **SQL dinâmico**: sempre `safeIdentifier`/`quoteTableRef`. Nunca interpolação direta.
- **Multi-tenant**: toda query no catálogo carrega `clientId`. Toda leitura filtra por `clientId` do `ToolContext`. Adversarial test obrigatório.
- **Logs**: `fire-and-forget` para telemetria. Nunca bloquear caminho principal.
- **PT-BR** em `description` de tools e copy de UI (consistência).
- **Auth admin**: toda rota `/api/admin/*` passa por `requireAdmin(req)` que valida Firebase ID token + custom claim `role === 'admin'`.

---

## Task 0 — Leitura das ADRs aceitas

**Objetivo:** alinhar implementação às ADRs **já aceitas** que esta sprint implementa.

- [ ] Ler integralmente `adrs/decisions/0006-multi-tenancy-strict-isolation.md` (`clientId` server-bound, jamais aceito como input do modelo; filtro obrigatório; fail-closed; gate adversarial).
- [ ] Ler integralmente `adrs/decisions/0009-sql-reuse-hierarchy-catalog-recall-fresh.md` (hierarquia `curated > recall > fresh`; gates `quality_score ≥ 0.7` + `dry_run` mandatório antes de approve; drift detection; bootstrap; hook `useCount`).
- [ ] Confirmar que escolhas de schema, gates e tools deste plano batem com ambas. Se divergir, abrir ADR de superseção em PR separado **antes** de codar — não sobrescrever ADR-0006/0009.
- [ ] **Não criar ADR nova** nesta sprint — esta spec implementa as duas ADRs já aceitas.

---

## Task 1 — Migration `liquid_meta.sql_catalog`

**Objetivo:** criar tabela BigQuery + script idempotente de migração.

- [ ] Criar `src/shared/lib/bigquery/migrations/2026-05-04-sql-catalog.sql`:
  ```sql
  CREATE TABLE IF NOT EXISTS `${project}.liquid_meta.sql_catalog` (
    id              STRING NOT NULL,                    -- uuid v4
    intent          STRING NOT NULL,                    -- texto livre que descreve a pergunta
    sql             STRING NOT NULL,
    sql_hash        STRING NOT NULL,                    -- sha256 do SQL canonicalizado
    schema_snapshot JSON,                               -- { tables: [{name, columns:[...]}], glossaryVersion, regulatoryPackVersion }
    client_id       STRING NOT NULL,                    -- OM | BRZ | CONX | IMCASA
    persona_id      STRING,                             -- nullable: query genérica vs especializada
    tags            ARRAY<STRING>,
    quality_score   FLOAT64,                            -- 0..1
    curated_by      STRING,                             -- uid Firebase do admin (NULL para drafts)
    curated_at      TIMESTAMP,
    glossary_version       STRING,
    regulatory_pack_version STRING,
    status          STRING NOT NULL,                    -- draft | approved | deprecated | needs_revalidation
    use_count       INT64    NOT NULL DEFAULT 0,
    last_used_at    TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP()
  )
  PARTITION BY DATE(created_at)
  CLUSTER BY client_id, status, persona_id;
  ```
- [ ] Criar runner idempotente em `scripts/migrations/run-sql-catalog.ts` (reuso de pattern Sprint 1.C):
  - Detecta se tabela existe via `INFORMATION_SCHEMA.TABLES`.
  - Cria se ausente.
- [ ] Test `src/features/sql-catalog/__tests__/migration.test.ts` (mock client) garantindo idempotência (segunda chamada não throwa).
- [ ] Commit: `feat(sql-catalog): create liquid_meta.sql_catalog table + idempotent migration`.

**Critério de aceite:** Tabela criada em dev BQ, migrações repetidas no-op.

---

## Task 2 — Canonical Hash + Repository (TDD)

**Objetivo:** módulo de hash determinístico + CRUD do catálogo.

- [ ] `src/features/sql-catalog/hash.test.ts`:
  - [ ] Test: SQLs equivalentes (whitespace/case differ) produzem mesmo hash.
  - [ ] Test: SQLs com aliases ou comentários distintos mas semântica igual produzem mesmo hash (canonicalize via lowercase + strip comments + collapse whitespace; aceitar limitação: aliases não normalizados — documentar).
  - [ ] Test: SQLs distintos produzem hashes diferentes.
- [ ] `src/features/sql-catalog/hash.ts`: `canonicalSqlHash(sql: string): string` (sha256 hex). Documentar limitações em JSDoc.
- [ ] `src/features/sql-catalog/repository.test.ts` (mock BQ client):
  - [ ] `insertDraft({intent, sql, clientId, personaId, schemaSnapshot, tags})` → cria row `status='draft'`, `use_count=0`.
  - [ ] `listByClient({clientId, status?, personaId?, limit, offset})` filtra corretamente.
  - [ ] `approve({id, curatedBy, qualityScore, glossaryVersion, regulatoryPackVersion})` muda `status='approved'`, popula `curated_by`/`curated_at`/`glossary_version`/`regulatory_pack_version`. Rejeita se `qualityScore < 0.7` (gate ADR-0009).
  - [ ] `reject({id})` → `status='deprecated'`.
  - [ ] `incrementUse({sqlHash, clientId})` → `use_count += 1`, `last_used_at = NOW()` (escopo por `clientId` para evitar colisão cross-tenant).
  - [ ] `markNeedsRevalidation({affectedIds})` → bulk update `status='needs_revalidation'`.
  - [ ] **Adversarial**: `listByClient({clientId: 'A'})` nunca retorna rows de cliente `B`.
- [ ] `src/features/sql-catalog/repository.ts`: implementar CRUD usando `safeIdentifier`/`quoteTableRef`. Use parameterized queries (`@clientId`, etc.).
- [ ] Commit: `feat(sql-catalog): add canonical hash + repository with multi-tenant isolation`.

**Critério de aceite:** Cobertura ≥85%. Adversarial test falha se `clientId` filtro for removido.

---

## Task 3 — Bootstrap Script `seed-catalog-from-logs.ts`

**Objetivo:** popular drafts a partir de `liquid_meta.sql_generations`.

- [ ] `scripts/seed-catalog-from-logs.ts`:
  - Args CLI: `--days=30 --top=100 --client=OM --dry-run`.
  - Query (alinhada a ADR-0009 §Bootstrap): `SELECT final_sql, intent, client_id, persona_id, COUNT(*) as reuse, AVG(latency_ms) as avg_latency, ANY_VALUE(schema_snapshot) FROM liquid_meta.sql_generations WHERE success=true AND rows>0 AND latency_ms<10000 AND repair_attempts<=1 AND bytes_billed<2147483648 AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY) GROUP BY final_sql, intent, client_id, persona_id ORDER BY reuse DESC, avg_latency ASC LIMIT @top`.
  - Para cada row: dedup por `canonicalSqlHash(final_sql)`. Se já existe no `sql_catalog`, pula. Caso contrário, `repository.insertDraft({...})`.
  - `--dry-run` apenas imprime contagem.
- [ ] Test `scripts/__tests__/seed-catalog-from-logs.test.ts`: mock BQ retorna 50 rows; verifica `insertDraft` chamado N vezes (N = únicas após dedup), e que com flag `--dry-run` não chama.
- [ ] Doc no header sobre como rodar: `pnpm tsx scripts/seed-catalog-from-logs.ts --days=30 --top=100 --client=OM`.
- [ ] Commit: `feat(sql-catalog): seed script mining sql_generations into drafts`.

**Critério de aceite:** Em ambiente com 30 dias de logs, popula ≥30 drafts (verificado via query manual).

---

## Task 4 — Tool `bq.list_validated_queries` (TDD)

**Objetivo:** tool primária do flow agentic.

- [ ] `src/features/ai-agents/tools/__tests__/bq-list-validated-queries.test.ts`:
  - [ ] Schema input strict: `{ intent: string, personaId: string|null, tags: string[]|null, topK: number (default 5, max 20) }`. **`clientId` NÃO entra como input do modelo (ADR-0006: server-bound via `ToolContext.clientId`).** Extra keys rejeitadas. Zod 4 strict, `.nullable()` em vez de `.optional()`.
  - [ ] **Ordenação curated→recall→empty**: quando catálogo retorna 3 entries `approved` + `quality_score>=0.7`, output traz essas 3 com `source: 'curated'`. Quando catálogo retorna < topK, complementa via `embeddings_sql`/`recallSimilarSql` (Sprint 3.A) com `source: 'recall'`.
  - [ ] **Multi-tenant (ADR-0006)**: tool chamado com `ctx.clientId='A'` jamais retorna entries de `B`. Adversarial: tentativa de injetar `clientId` no input do modelo é ignorada — apenas `ctx.clientId` (server-bound) decide o filtro. Mock repository confirma filtro.
  - [ ] **Status filter**: queries `draft|deprecated|needs_revalidation` nunca aparecem no resultado.
  - [ ] **Quality gate (ADR-0009)**: `approved` com `quality_score < 0.7` cai para tier secundário (após recall).
  - [ ] Quando ambos catálogo e recall vazios → `[]`. Não throw.
  - [ ] Output shape: `{ items: [{ id?, sql, intent, score, source: 'curated'|'recall', tags?, qualityScore? }], curatedHits: number, recallHits: number }`.
- [ ] `src/features/ai-agents/tools/bq-list-validated-queries.ts`:
  - Factory `createBqListValidatedQueriesTool(ctx: ToolContext)`. `clientId` lido **somente** de `ctx.clientId`.
  - Implementação chama `repository.listByClient({clientId: ctx.clientId, status:'approved', personaId, limit: topK})`. Filtra `quality_score >= 0.7`.
  - Se sobra slot, chama `recallSimilarSql({intent, clientId: ctx.clientId, topK: topK - curated.length})` (Sprint 3.A).
  - Description PT-BR: "Retorna queries SQL validadas (catálogo curado humano > recall semântico) para o intent dado, filtradas por cliente e persona. Use ANTES de gerar SQL novo."
- [ ] Commit: `feat(ai-agents): add bq.list_validated_queries tool with curated > recall hierarchy`.

**Critério de aceite:** TDD verde. Adversarial multi-tenant passa.

---

## Task 4b — Tool `bq.save_validated_query` com `needsApproval` (TDD)

**Objetivo:** permitir ao agente sugerir entrada de catálogo a partir de SQL bem-sucedido (plano-fonte §3, ADR-0009 §Implementação).

- [ ] `src/features/ai-agents/tools/__tests__/bq-save-validated-query.test.ts`:
  - [ ] Schema input strict: `{ intent: string, sql: string, tags: string[]|null, schemaSnapshot: object|null }`. **`clientId`/`personaId` server-bound (ADR-0006)** via `ToolContext`. Zod 4 strict, `.nullable()`.
  - [ ] **`needsApproval: true` sempre** (vide plano §3 e ADR-0009 — gate humano via UI admin).
  - [ ] **Pré-validação**: chama `bq.dry_run_sql` (Sprint 1.C) antes de criar draft. Falha → retorna `{saved: false, reason: 'dry_run_failed', error}`.
  - [ ] **Dedup**: se `canonicalSqlHash(sql)` já existe para `clientId`, retorna `{saved: false, reason: 'duplicate', existingId}`.
  - [ ] Path feliz: insere row `status='draft'`, retorna `{saved: true, id}`.
  - [ ] Multi-tenant: `clientId` injetado no row vem **somente** de `ctx.clientId`.
- [ ] `src/features/ai-agents/tools/bq-save-validated-query.ts`:
  - Factory `createBqSaveValidatedQueryTool(ctx)`. Reusa `bq.dry_run_sql` da Sprint 1.C; reusa `repository.insertDraft`.
  - `needsApproval: true`. Description PT-BR: "Sugere SQL bem-sucedido para o catálogo curado. Requer aprovação humana via UI admin (gate ADR-0009)."
- [ ] Wire no orchestrator (Task 7) com `needsApproval` propagado para o consumer.
- [ ] Commit: `feat(ai-agents): add bq.save_validated_query with needsApproval gate`.

**Critério de aceite:** TDD verde. `needsApproval` flag respeitada pelo runtime.

---

## Task 5 — Hook `useCount` Increment em `query_data`

**Objetivo:** carimbar uso real quando SQL casa entrada do catálogo.

- [ ] Editar `src/features/canvas-orchestrator/tools/query-data.ts`:
  - Após `success=true` e `rowCount>0`, computar `hash = canonicalSqlHash(sql)` e disparar `repository.incrementUse({sqlHash: hash, clientId: ctx.clientId})` em **fire-and-forget** (`void p.catch(logErr)`). Nunca bloquear nem propagar erro.
- [ ] Test em `query-data.test.ts` (extensão da suite Sprint 1.C): mockar repository, validar chamada com hash correto + `clientId` correto.
- [ ] Commit: `feat(query-data): increment sql_catalog use_count on successful SQL match`.

**Critério de aceite:** Increment não atrasa response do tool (assert duration < 50ms acima do baseline).

---

## Task 6 — Cron de Revalidação

**Objetivo:** quando `glossaryVersion` ou `regulatoryPackVersion` muda, marcar entries afetadas.

- [ ] `src/features/sql-catalog/revalidation.test.ts`:
  - [ ] Test: dado `currentGlossaryVersion='v3'` e `currentRegulatoryPackVersion='r2'`, todas rows com `glossary_version != 'v3' OR regulatory_pack_version != 'r2'` são marcadas `needs_revalidation`.
  - [ ] Test: idempotência — segunda execução não muda nada.
  - [ ] Test perf: bulk update de 1000 rows completa <5s (mock relógio + assert sobre operação BQ batch única, não 1000 updates).
- [ ] `src/features/sql-catalog/revalidation.ts`:
  - Função `revalidateCatalog({glossaryVersion, regulatoryPackVersion}): Promise<{affected: number}>`.
  - Implementação: single `UPDATE liquid_meta.sql_catalog SET status='needs_revalidation', updated_at=CURRENT_TIMESTAMP() WHERE status='approved' AND (glossary_version != @gv OR regulatory_pack_version != @rv)`.
- [ ] `scripts/cron/revalidate-catalog.ts`: lê versões correntes de `src/shared/config/`, chama função. Documentar agendamento via Cloud Scheduler (`*/30 * * * *` ou daily — TBD ops).
- [ ] Commit: `feat(sql-catalog): add revalidation job for version drift detection`.

**Critério de aceite:** Bulk update 1000 rows <5s; idempotente.

---

## Task 7 — Wire no Orchestrator + sql-agent

**Objetivo:** preferir `bq.list_validated_queries` antes de `dry_run_sql`/`query_data`.

- [ ] Editar `src/features/canvas-orchestrator/orchestrator.ts`:
  - Adicionar `list_validated_queries: createBqListValidatedQueriesTool(ctx)` e `save_validated_query: createBqSaveValidatedQueryTool(ctx)` (com `needsApproval`) ao toolset.
  - Em `prepareStep`/`activeTools`: nova ordem **Step 0 (novo): `list_validated_queries`** → Step 1 schema → Step 2 dry_run → Step 3 query_data. Step 0 não é `required` — modelo decide se reusar.
  - System prompt update em `src/shared/config/agents/canvas-orchestrator.ts`: adicionar bloco "Reuso de SQL: SEMPRE chame `list_validated_queries` antes de gerar SQL novo. Se `items.length>0` e `score>=0.8` (ou `source==='curated'`), reuse o SQL com adaptação mínima de filtros. Caso contrário, prossiga com geração."
- [ ] Editar `src/features/ai-agents/agents/sql-agent.ts` (e similares analíticos): mesmo wire.
- [ ] Smoke test em `src/features/canvas-orchestrator/__tests__/orchestrator-tools.test.ts` valida presença e shape.
- [ ] Commit: `feat(orchestrator): prefer validated queries before generating fresh SQL`.

**Critério de aceite:** `pnpm build` sem warnings novos. Smoke test passa.

---

## Task 8 — API Routes Admin (auth + CRUD)

**Objetivo:** backend para UI de curadoria.

- [ ] `src/shared/lib/auth/require-admin.ts`:
  - Verifica Firebase ID token (header `Authorization: Bearer <token>`) via `firebase-admin`.
  - Confere custom claim `role === 'admin'`. Caso falhe → 401/403.
  - Test: `require-admin.test.ts` cobre token ausente (401), token inválido (401), claim ausente (403), claim ok (passa retornando `uid`).
- [ ] `app/api/admin/sql-catalog/route.ts`:
  - `GET`: query params `clientId, status?, personaId?, page, pageSize`. Chama `repository.listByClient`. Retorna `{items, total, page, pageSize}`.
  - `POST`: cria draft manual `{intent, sql, clientId, personaId?, schemaSnapshot?, tags?}`. **Antes de inserir, valida via `bq.dry_run_sql`** (reusa Sprint 1.C); rejeita se `valid===false`.
- [ ] `app/api/admin/sql-catalog/[id]/route.ts`:
  - `GET`: detalhe.
  - `PATCH`: edita `intent, sql, tags, qualityScore, schemaSnapshot`. Se SQL muda, dry_run obrigatório.
  - `DELETE`: hard delete (ou soft via `status='deprecated'` — preferir soft).
- [ ] `app/api/admin/sql-catalog/[id]/approve/route.ts` POST:
  - Body: `{qualityScore: number}`.
  - **Gates (ADR-0009)**:
    1. `qualityScore >= 0.7` — reject 422 `{error: 'quality_score below threshold'}` se inferior.
    2. `bq.dry_run_sql` mandatório (re-executa); falha → 422 `{error: 'dry_run failed'}`.
    3. `dry_run.bytes_processed <= 5GB` — reject 422 `{error: 'bytes_processed exceeds budget'}` se acima (alinhado a ADR-0009 §Gates).
    4. `clientId` da entrada bate cliente do approver/SA.
  - Carimba `glossaryVersion` e `regulatoryPackVersion` correntes (Sprint 1.D).
  - Chama `repository.approve({id, curatedBy: uid, qualityScore, glossaryVersion, regulatoryPackVersion})`.
- [ ] `app/api/admin/sql-catalog/[id]/reject/route.ts` POST: `repository.reject({id})`.
- [ ] `app/api/admin/sql-catalog/[id]/revalidate/route.ts` POST: força re-dry_run; se passa, marca `status='approved'` mantendo `curated_by`/`curated_at`; popula versões correntes.
- [ ] Tests para cada rota em `app/api/admin/sql-catalog/__tests__/*.test.ts` (mockar `requireAdmin` + `repository`):
  - 401 sem token; 403 sem role; 200 happy path; 422 dry_run fail no approve.
  - **Adversarial multi-tenant (ADR-0006)**: filtro `clientId` no GET é mandatory query param; admin global escolhe qual cliente ver, mas nunca recebe rows de outro `clientId` simultaneamente. Omitir `clientId` retorna 400 (fail-closed), não dump global silencioso.
- [ ] Commit: `feat(api): admin sql-catalog CRUD routes with Firebase admin gate`.

**Critério de aceite:** Todas rotas protegidas. Approve sem dry_run válido falha.

---

## Task 9 — UI `/admin/sql-catalog` (TDD componentes React)

**Objetivo:** página de curadoria.

- [ ] `app/(dashboard)/admin/sql-catalog/page.tsx`: renderiza `<AdminSqlCatalogPage/>` de `src/pages/admin-sql-catalog/ui/`.
- [ ] `src/pages/admin-sql-catalog/ui/AdminSqlCatalogPage.tsx`:
  - Header com título "Catálogo de SQL Validado".
  - `<CatalogFilters>` (status, clientId, personaId, busca por intent).
  - `<CatalogTable>` paginada (50/pg) com colunas: intent (truncado), client, persona, status (Badge), useCount, qualityScore, curatedBy, updatedAt, ações.
  - `<CatalogRowActions>`: botões Approve, Reject, Edit, Revalidate (conforme status).
  - `<CatalogEditDialog>`: editor de SQL com syntax highlight (reusar componente existente se disponível) + botão "Run dry-run" antes de salvar.
- [ ] Hook `src/shared/hooks/useSqlCatalog.ts`: usa o `useQuery` custom (mesmo pattern do `useDashboardSummary`). Endpoints `/api/admin/sql-catalog/*`.
- [ ] Tests em `src/pages/admin-sql-catalog/__tests__/*.test.tsx` (RTL):
  - [ ] `<CatalogTable>` renderiza N rows; ações disabled por status (ex.: `approved` esconde "Approve").
  - [ ] `<CatalogRowActions>` Approve dispara mutation com `qualityScore` do prompt; em erro 422 mostra toast "dry_run falhou".
  - [ ] `<CatalogFilters>` controlados — mudança chama `onFilterChange`.
  - [ ] `<CatalogEditDialog>`: salvar sem dry-run prévio bloqueado; após dry-run sucesso, botão Save habilita.
- [ ] Auth gate: `app/(dashboard)/admin/sql-catalog/page.tsx` redireciona via `redirect('/login')` se token ausente; client-side em `useSqlCatalog` trata 403 mostrando estado "Acesso negado".
- [ ] Commit: `feat(admin-ui): sql catalog curation page with approve/reject/edit`.

**Critério de aceite:** Aprovar/rejeitar persiste e refetcha. Dry-run pre-approve obrigatório na UI.

---

## Task 10 — Métricas + Observabilidade

**Objetivo:** instrumentar `catalog_hit_rate`, `time_to_curate`, `revalidation_rate`.

- [ ] Em `bq.list_validated_queries`: log fire-and-forget para `liquid_meta.sql_catalog_events` com `{ts, clientId, intent_hash, curatedHits, recallHits, totalHits}`.
- [ ] Migration adicional para `liquid_meta.sql_catalog_events`.
- [ ] `docs/observability/sql-catalog-metrics.md` com queries SQL para:
  - `catalog_hit_rate = curatedHits / totalCalls` (últimos 7d).
  - `time_to_curate = AVG(curated_at - created_at)` para drafts → approved.
  - `revalidation_rate = COUNT(needs_revalidation) / COUNT(approved)`.
- [ ] Commit: `feat(observability): add sql-catalog hit/curate/revalidation metrics`.

---

## Task 11 — Smoke E2E

**Objetivo:** validar hierarquia em fluxo real.

- [ ] `src/features/sql-catalog/__tests__/e2e-hierarchy.smoke.test.ts`:
  - Setup: 10 briefings sintéticos cobrindo intents diversos.
  - Catálogo seedado com 4 entries `approved` matching 4 desses briefings.
  - Vector store (mock 3.A) retorna match para outros 4.
  - Restantes 2 não tem match.
  - Asserts:
    - 4 chamadas retornam `source='curated'`.
    - 4 retornam `source='recall'`.
    - 2 retornam `items.length===0` (modelo prossegue para geração nova — não testado aqui).
    - `catalog_hit_rate + recall_hit_rate >= 0.55` no batch.
- [ ] Commit: `test(sql-catalog): e2e smoke validates curated > recall > empty hierarchy`.

**Critério de aceite:** Cache hit total ≥55% no dataset gold.

---

## Acceptance Criteria (sprint-level)

- [ ] Bootstrap script popula ≥30 drafts em ambiente com 30 dias de logs.
- [ ] `bq.list_validated_queries` ordena `curated > recall > empty` (TDD verifica determinismo).
- [ ] UI admin permite approve/reject/edit; status persiste e revalidação detecta drift.
- [ ] Cache hit total (catálogo + recall) ≥55% em smoke E2E gold.
- [ ] Cron de revalidação processa 1000 rows em <5s (single bulk UPDATE).
- [ ] **Multi-tenancy**: query do cliente A invisível para cliente B (adversarial test verde).
- [ ] Repair budget cumulativo respeitado: sessão não excede 2 retries (reusa cap Sprint 1.C; sem regressão).
- [ ] Approve sempre exige dry_run válido (UI + API).
- [ ] Auth admin gate funciona em todas rotas `/api/admin/*` (401/403/200 cobertos).
- [ ] Métricas `catalog_hit_rate`, `time_to_curate`, `revalidation_rate` consultáveis em BQ.

---

## Riscos e Mitigações

| Risco | Mitigação |
|---|---|
| Drafts ruins promovidos por humano | `dry_run_sql` mandatório antes de approve (API + UI). Quality score com gate ≥0.7 para entrar em recall primário. |
| Catálogo desatualizado vs schema BQ | Cron de revalidação detecta drift de `glossaryVersion`/`regulatoryPackVersion`. Schema snapshot armazenado para comparação futura. UI mostra badge "needs_revalidation" visível. |
| UI admin sem auth correta | `requireAdmin` em toda rota `/api/admin/*`. Custom claim `role='admin'` no Firebase. Tests cobrem 401/403. |
| Hash colide ou normaliza pouco | `canonicalSqlHash` documenta limitações (aliases não normalizados); colisões de hash reais (sha256) são desprezíveis. |
| Recall do 3.A indisponível | Tool degrada graciosamente: retorna apenas `curated`. Smoke valida fallback vazio. |
| Aprovação de SQL caro | Dry-run reporta `bytesProcessed`; UI exibe estimativa de custo antes de approve (TBD: bloquear se `bytes > 5GB`). |
| Carga no BQ por listagem | Cluster por `client_id, status, persona_id`. Paginação obrigatória na API. |
| Cross-tenant leak via admin global | Filtro `clientId` mandatory em GET (ADR-0006: server-bound). Adversarial test em `repository.test.ts`. |

---

## Engenharia de Contexto

- **ADRs**: ler `adrs/decisions/0006-multi-tenancy-strict-isolation.md` e `adrs/decisions/0009-sql-reuse-hierarchy-catalog-recall-fresh.md` antes da Task 1 (Task 0). **Não criar ADR nova** — esta sprint implementa as duas já aceitas.
- **Skills**: aplicar `superpowers:test-driven-development` em todas tasks com produto novo; `superpowers:verification-before-completion` antes de cada commit; `superpowers:systematic-debugging` em falhas de smoke.
- **Agentes auxiliares**:
  - `credit-risk-analyst` para revisar quais SQLs minerados são adequados a virar drafts (revisão de Task 3 output).
  - `ux-dashboard-analyst` para validar UI `/admin/sql-catalog` (Task 9) — fluxo de approve/reject, hierarquia visual de status.
  - `Explore` para mapear callers de `query_data` antes da Task 5 (garantir hook não regride paths existentes).

---

## Self-Review

Antes de declarar sprint completo, executar checklist:

1. [ ] `pnpm test:run` passa em todos arquivos novos/editados.
2. [ ] `pnpm lint` zero errors novos.
3. [ ] `pnpm build` zero warnings novos.
4. [ ] Migration aplicada em ambiente dev BQ; verificada via `INFORMATION_SCHEMA.TABLES`.
5. [ ] Bootstrap rodado em dev: ≥30 drafts populados.
6. [ ] UI admin acessada por user com role admin: list/approve/reject/edit funcionam end-to-end.
7. [ ] User sem role admin recebe 403 em rotas `/api/admin/*` (curl manual verifica).
8. [ ] Adversarial multi-tenant test verde (cliente B invisible para A).
9. [ ] Smoke E2E reporta `catalog_hit_rate + recall_hit_rate ≥ 0.55`.
10. [ ] Cron de revalidação executado manualmente em dev; queries afetadas marcadas em <5s.
11. [ ] ADR-0006 e ADR-0009 referenciadas no PR (não recriadas; ambas já em `Accepted/Proposed`).
12. [ ] Métricas consultáveis: rodar 3 queries do `docs/observability/sql-catalog-metrics.md` e anexar resultado em PR description.
13. [ ] Repair budget cap não regrediu: rodar suite Sprint 1.C — todos passam.
14. [ ] Sem secrets em commits (revisar diff).
15. [ ] PR description inclui resumo + screenshots da UI + métricas atuais.

---

## Resumo (≤100 palavras)

Sprint 3.C constrói catálogo curado de SQL validado em `liquid_meta.sql_catalog`, complementar ao recall automático do 3.A. Bootstrap minera `sql_generations` (30d) extraindo top-N SQLs bem-sucedidos como drafts. UI admin `/admin/sql-catalog` permite approve/reject/edit com dry-run obrigatório e auth Firebase role-gated. Tool `bq.list_validated_queries` aplica hierarquia **curated > recall > fresh**, multi-tenant estrito. Hook em `query_data` carimba `useCount`. Cron de revalidação detecta drift de `glossaryVersion`/`regulatoryPackVersion` e marca queries afetadas em bulk update <5s. Smoke E2E valida ≥55% cache hit. Implementa ADR-0006 (multi-tenancy strict) e ADR-0009 (hierarquia curated > recall > fresh) — ambas já aceitas, sem ADR nova.
