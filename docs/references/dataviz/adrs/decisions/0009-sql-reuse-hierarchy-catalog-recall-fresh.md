---
id: 0009
title: SQL reuse hierarchy — catalog curated > recall semântico > geração from-scratch
status: Accepted
date: 2026-05-04
deciders: [giulliano.soares]
consulted: [time-data, time-ai]
informed: [time-eng]
tags: [sql, rag, catalog, bigquery, reuse]
supersedes: []
related: [0006]
---

# ADR-0009 — SQL reuse hierarchy: catalog curated > recall > fresh

## Status

`Accepted` — desde 2026-05-04.

Histórico:
- 2026-05-04 — proposta.
- 2026-05-04 — aceita após revisão cruzada com planos macro, specs Sprint 1-3 e ADRs relacionadas.

## Contexto

`query_data` (`src/features/ai-agents/tools/query-data.ts`) regenera SQL do zero a
cada pergunta similar (plano `2026-05-04-mastra-tools-sql-bqml.md` §1). Resultado:

- Custo BQ recorrente em queries quase idênticas.
- Variação inconsistente do SQL gerado para mesma intenção (mesmo cliente, mesma
  pergunta, dois SQLs diferentes em duas sessões).
- Sem feedback humano (curadoria) sobre o que é uma "boa query" para um cliente.

Sprint 3.A introduz **semantic recall automático**: persiste `(intent, sql,
schemaSnapshot, success=true, clientId)` em `embeddings_sql` após `query_data` bem-
sucedido com PII scrub. Tool `recall_similar_sql` recupera top-K via embedding.
Útil — mas:

- Sem curadoria humana, recall pode trazer SQL com bug sutil que passou na execução
  (ex: filtro errado que retornou linhas mas nas categorias erradas).
- Sem `quality_score` humano, todos os SQLs do recall têm peso igual.
- Sem `dry_run` obrigatório antes de `approve`, o catálogo pode acumular SQLs com
  scan absurdo.

A spec `2026-05-04-sprint3-C-validated-queries-catalog.md` introduz o **catálogo
curado**: tabela BQ `liquid_meta.sql_catalog` com versionamento, status
(`draft|approved|deprecated|needs_revalidation`), `qualityScore`, `tags[]`,
`useCount`, populada por (a) bootstrap minerando `liquid_meta.sql_generations` (top-N
SQLs com `success=true, rowCount>0, latency<10s`); (b) UI admin
`/admin/sql-catalog`.

A pergunta arquitetural: **como combinamos os 3 caminhos de SQL — catálogo curado,
recall semântico automático, geração from-scratch — sem que o modelo escolha errado?**

Forças:

- Curadoria humana > recall automático em qualidade, mas menor cobertura
  (catálogo cresce devagar).
- Recall automático tem cobertura alta mas qualidade variável.
- Geração from-scratch é fallback mandatório.
- Multi-tenancy estrito (ADR-0006) — todo SQL recuperado/gerado deve ter `clientId`
  alinhado.
- Drift de glossário/regulatório (Sprint 1.D) invalida queries antigas — precisa
  flag `needs_revalidation` quando `glossaryVersion`/`regulatoryPackVersion` muda.

## Decisão

**Adotamos hierarquia de reuso de SQL em três níveis, sempre tentados em ordem:**

```
1. bq.list_validated_queries (catálogo curado, status='approved', mesmo clientId)
   ├── hit (≥1 query qualityScore ≥ 0.7) → ofereça ao modelo como referência forte;
   │                                       modelo pode usar diretamente ou adaptar.
   └── miss → continua para 2.

2. recall_similar_sql (Sprint 3.A, embeddings_sql, mesmo clientId)
   ├── hit (top-3, score ≥ threshold) → ofereça como referência fraca; modelo deve
   │                                    sempre rodar bq.dry_run_sql antes de execute.
   └── miss → continua para 3.

3. Geração from-scratch (fluxo atual: schema → draft → dry_run → query_data).
```

**Gates obrigatórios para approve no catálogo curado:**

1. `bq.dry_run_sql` deve retornar valid sem `bytes_processed > 5GB`.
2. `qualityScore ≥ 0.7` (input humano via UI admin).
3. `clientId` válido e batendo com SA do approver.
4. `glossaryVersion` e `regulatoryPackVersion` carimbados.

**Drift detection**: cron diário compara versões do glossário/regulatório com as
carimbadas em cada entrada `approved`. Mismatch → status muda para
`needs_revalidation`, `bq.list_validated_queries` deixa de retornar a entrada.

**Tool `bq.list_validated_queries`** (Sprint 3.C):

```
Input: { intent: string, clientId: string (server-bound), tags?: string[] }
Output: { queries: Array<{ sql, qualityScore, useCount, tags, lastUsedAt }> }
Routing:
  - SELECT FROM liquid_meta.sql_catalog
    WHERE client_id = $clientId
      AND status = 'approved'
      AND (intent_match OR tags && $tags)
    ORDER BY qualityScore DESC, useCount DESC
    LIMIT 5;
  - Se LIMIT 5 retornar < 3:
      complementa com recall_similar_sql (Sprint 3.A) marcando origin='recall'.
```

**Hook em `query_data`** (Sprint 1.C + 3.C):
- Quando hash do SQL final bate uma entrada `approved` do catálogo, incrementa
  `useCount` e atualiza `lastUsedAt`. Sinal de que a curadoria está pagando.

**Bootstrap do catálogo** (Sprint 3.C, 30 dias após Sprint 1.C populando logs):
- `scripts/seed-catalog-from-logs.ts` minera `liquid_meta.sql_generations` com:
  `success=true, rowCount>0, latency<10s, repair_attempts<=1, bytes_billed<2GB`.
- Top-100 SQLs por intent/cliente vão para revisão humana via UI
  `/admin/sql-catalog` em status `draft`. Após aprovação humana → `approved`.
- Até bootstrap completar, `bq.list_validated_queries` retorna **vazio**: sistema
  cai para recall (3.A) e geração — sem prejuízo.

## Consequências

### Positivas
- **Qualidade**: queries críticas (regulatório, business-sensitive) curadas por SME.
- **Custo**: hit no catálogo evita scan de dry_run + execute (cache implícito por
  reuso de SQL idêntico).
- **Consistência**: mesma pergunta produz mesmo SQL em sessões distintas (do
  catálogo), reduzindo "respostas que variam".
- **Drift gerenciado**: mudança de glossário/regulatório dispara revalidação
  automática.
- **Cobertura sem sacrificar qualidade**: fallback para recall + geração mantém
  cobertura ampla.

### Negativas / Trade-offs
- **Catálogo cresce devagar**: curadoria humana é gargalo. Mitigação: bootstrap
  por mineração + UI admin tornam o trabalho de curadoria leve (aprovar > escrever).
- **Risco de over-fitting ao catálogo**: modelo pode ignorar nuances do briefing
  para reusar query do catálogo. Mitigação: hint no system prompt orienta "use o
  catálogo como ponto de partida; adapte se o briefing exigir granularidade
  diferente".
- **Manutenção de UI admin**: `/admin/sql-catalog` precisa role gate
  (Firebase Admin) e UX para diff entre versões. Sprint 3.C cobre.
- **Custo de revalidação**: drift detection roda cron diário — query barata.

### Neutras
- Recall semântico (Sprint 3.A) continua valioso mesmo com catálogo: cobre o long
  tail.
- `liquid_meta.sql_generations` permanece como log primário; catálogo é projeção
  curada.

## Alternativas consideradas

### Alternativa A — Apenas recall semântico automático (sem catálogo curado)
**Pros**: zero curadoria humana; cobertura alta.
**Cons**: qualidade variável; risco de propagar SQL com bug sutil; sem ranking
humano.
**Por que rejeitada**: para queries regulatórias/financeiras, qualidade > cobertura.

### Alternativa B — Apenas catálogo curado (sem recall automático)
**Pros**: qualidade máxima.
**Cons**: cobertura baixa; cada nova intenção exige SME aprovar antes de qualquer
recall; ROI baixo no início.
**Por que rejeitada**: long tail é grande demais.

### Alternativa C — Geração from-scratch sempre (status quo)
**Pros**: simplicidade.
**Cons**: custo, inconsistência, sem aprendizado entre sessões.
**Por que rejeitada**: status quo identificado como problema no plano §1.

### Alternativa D — LLM-as-curator (sem humano aprovador)
**Pros**: escala.
**Cons**: judge LLM é a mesma classe do gerador; aprova suas próprias falhas.
**Por que rejeitada**: SME humano é gate inegociável para queries
regulatório-críticas.

## Implementação

- **Plano macro**: `docs/superpowers/plans/2026-05-04-mastra-tools-sql-bqml.md` §6
  Fase 3, §7, §8.
- **Specs sprint**:
  - `2026-05-04-sprint3-A-semantic-recall.md` — `embeddings_sql`,
    `recall_similar_sql`.
  - `2026-05-04-sprint3-C-validated-queries-catalog.md` — `liquid_meta.sql_catalog`,
    `bq.list_validated_queries`, UI admin, bootstrap, drift cron.
- **Arquivos a criar**:
  - Schema: `liquid_meta.sql_catalog` (BigQuery DDL).
  - Tool: `src/features/ai-agents/tools/list-validated-queries.ts`.
  - Tool: `src/features/ai-agents/tools/save-validated-query.ts` com
    `needsApproval: true`.
  - Script: `scripts/seed-catalog-from-logs.ts`.
  - Cron: `scripts/check-catalog-drift.ts`.
  - UI: `app/(dashboard)/admin/sql-catalog/page.tsx`.
- **Reuso**: `recall_similar_sql` (Sprint 3.A), `bq.dry_run_sql` (Sprint 1.C),
  `embeddings_sql` (Sprint 3.A), `liquid_meta.sql_generations` (Sprint 1.C).
- **Quality score**: input humano 0-1 via UI admin; rubric documentada em
  `app/(dashboard)/admin/sql-catalog/RUBRIC.md`.
- **IAM**: role `liquid-sql-catalog-admin` (Firebase custom claim) requerida para
  `approve/deprecate`.
- **Versionamento de glossário/regulatório** (Sprint 1.D): cada entrada `approved`
  carimba `glossaryVersion` e `regulatoryPackVersion` correntes.

## Referências

- `docs/superpowers/plans/2026-05-04-mastra-tools-sql-bqml.md` §6 Fase 3,
  §7 (schema-aware SQL generation), §8 (`liquid_meta.sql_generations`).
- `docs/superpowers/specs/2026-05-04-sprint3-A-semantic-recall.md` —
  `embeddings_sql`.
- `docs/superpowers/specs/2026-05-04-sprint3-C-validated-queries-catalog.md`.
- `adrs/vercel-ai-sdk.md` §4.3 — `needsApproval`, `experimental_repairToolCall`.
- ADR-0006 (multi-tenancy strict isolation) — `clientId` server-bound em todo
  caminho de SQL.
