---
id: 0004
title: Cloud SQL Postgres + pgvector como storage único (memory + RAG)
status: Superseded by 0013
date: 2026-05-04
deciders: [giulliano.soares]
consulted: [time-data, time-infra]
informed: [time-eng]
tags: [infra, memory, rag, postgres, pgvector, cloud-sql, superseded]
supersedes: []
superseded_by: 0013
related: [0002, 0005, 0006, 0013]
---

# ADR-0004 — Cloud SQL Postgres + pgvector como storage único

## Status

`Superseded by` [ADR-0013](0013-firestore-storage-config-metadata.md) — desde 2026-05-04.

> **Deprecação:** esta ADR foi superada no mesmo dia da sua aceitação após revisão da
> convenção do projeto (BigQuery exclusivamente para datasets de cliente; Firestore
> para configuração/metadados/memória de IA). Como nenhum dado de Postgres foi para
> produção, o code path foi deletado em vez de migrado. Detalhes em
> [ADR-0013](0013-firestore-storage-config-metadata.md). PRs #4/#5/#6 ficam fechados
> sem merge.

Histórico:
- 2026-05-04 — aceita ao consolidar plano de memória/RAG; provisionamento parte do
  Sprint 1.A.
- 2026-05-04 — superseded por ADR-0013 antes que dados fossem para produção.

## Contexto

Os planos macro `2026-05-04-mastra-memory-rag.md` e
`2026-05-04-business-context-personas-evals.md` exigem dois substratos de persistência:

1. **Memória conversacional** — threads, mensagens, working memory por sessão e por
   resource (`${clientId}:${userId}`). Requisito Mastra: schema mínimo
   `threads(id, resource_id, client_id, metadata jsonb)`,
   `messages(id, thread_id, role, parts jsonb, created_at)`,
   `working_memory(resource_id, scope, payload jsonb)`.

2. **Vector store para RAG** — embeddings de:
   - `docs/benchmarking/*.md` (~31 docs ≈ 800KB);
   - `src/shared/config/glossary.ts` (~50 termos após Sprint 1.D);
   - schemas BQ (~50 tabelas via `INFORMATION_SCHEMA`);
   - SQLs validados (Sprint 3.A) e blocos reusáveis (Sprint 3.A) — corpus crescente.

Forças:

- **Stack GCP**: BigQuery + Vertex Gemini + Firebase já estão no Google Cloud. Manter
  o storage transacional/vector no GCP minimiza network egress, simplifica IAM e
  unifica auth via SA.
- **Mastra-as-library** (ADR-0002): `@mastra/pg` expõe `PgVector` (HNSW + dotproduct) e
  Postgres store no mesmo driver `pg`. Uma única conexão serve threads/working memory
  e vector store.
- **Next.js 16 App Router + serverless**: routes que tocam memory/RAG precisam
  `runtime: 'nodejs'` (driver `pg` é Node-only, não Edge). Cold start + connection pool
  esgotamento são riscos reais em ambiente serverless.
- **Multi-tenancy** (ADR-0006): `client_id` indexado em todas as tabelas; row-level
  security opcional.
- **Custo**: Cloud SQL `db-g1-small` ou similar resolve volume previsto; HNSW em
  pgvector sustenta latência sub-100ms para topK=20 sobre ~1500 vetores iniciais.
- **Volume estimado**: 31 docs × ~30 chunks/doc + ~50 schemas BQ + glossário ≈
  **~1500 embeddings** iniciais. Em 3072d ≈ 12KB/vetor → ~18MB para corpus inicial.

A doc Mastra alterna entre `PgStore` (memory-class.mdx:182-189) e `PostgresStore`
(pg.mdx:669-679). Confirmar nome do export real em `@mastra/pg` antes de codificar.

## Decisão

**Adotamos Cloud SQL Postgres com extensão `pgvector` como storage único para
threads/messages/working memory e para vector store. Acesso via `pg` driver com
Cloud SQL Auth Proxy (dev) e Cloud SQL Node.js Connector (prod), pool externo
configurado conservadoramente.**

Especificações:

- **Provisionamento** (Sprint 1.A): instâncias `liquid-pg-dev` e `liquid-pg-prod`
  com extensão `pgvector` instalada (`CREATE EXTENSION vector;`).
- **Schema lógico**:
  ```sql
  threads(id uuid PK, resource_id text, client_id text, metadata jsonb,
          created_at timestamptz, updated_at timestamptz)
  messages(id uuid PK, thread_id uuid FK, role text, parts jsonb, created_at timestamptz)
  working_memory(resource_id text, scope text, payload jsonb,
                 PRIMARY KEY(resource_id, scope))
  embeddings_docs(id uuid PK, content text, embedding vector(3072),
                  metadata jsonb, content_hash text, created_at timestamptz)
  embeddings_glossary(id uuid PK, term text, embedding vector(3072), metadata jsonb)
  embeddings_schemas(id uuid PK, content text, embedding vector(3072), metadata jsonb)
  embeddings_sql(id uuid PK, sql_text text, embedding vector(3072),
                 metadata jsonb, last_used_at timestamptz)
  embeddings_blocks(id uuid PK, block_spec jsonb, embedding vector(3072), metadata jsonb)
  ```
- **Indexação**:
  - HNSW + `vector_ip_ops` (dotproduct) em todas as colunas `embedding`.
  - B-tree em `client_id` para isolamento (ADR-0006).
  - B-tree em `(resource_id, scope)` para working memory.
  - B-tree em `content_hash` (ingestão incremental).
- **Conexão**:
  - Dev: **Cloud SQL Auth Proxy** local.
  - Prod: **Cloud SQL Node.js Connector** ou Auth Proxy sidecar.
  - Pool `pg.Pool` com `max` conservador (ex: 5-10 por instância serverless), reuso
    entre invocações via singleton em escopo de módulo.
  - Considerar **pgbouncer** se observarmos esgotamento de pool em prod.
- **Runtime obrigatório**: toda route Next.js que toca o pool **declara**
  `export const runtime = 'nodejs';` no topo. Edge Runtime é incompatível com `pg`.
- **Wrapper único**: `MemoryService` em `src/shared/lib/memory/memory-service.ts`
  expõe `getPool()` reutilizado por código RAG (`src/shared/lib/rag/pgvector.ts`),
  evitando dois pools concorrentes.
- **Embedding dimension**: 3072d alinhado a Vertex `gemini-embedding-001` (ADR-0005).
  Se ADR-0005 mudar para fallback OpenAI 1536d, criar tabela paralela
  `embeddings_docs_1536` em vez de migrar (coexistência via coluna `embedding_model`).
- **Retention**:
  - Working memory: 30 dias (cron de purga).
  - SQLs validados: TTL 90 dias sem reuso (Sprint 3.A).
  - Docs: re-ingest mensal por `content_hash` diff (Sprint 2.A).

## Consequências

### Positivas
- **Storage único**: uma instância Postgres serve memory + RAG. Menos infra para
  monitorar, menos contas IAM, network local.
- **Transações**: gravar `messages` + `working_memory` + `embeddings_sql` em uma
  transação é trivial.
- **Mastra-compat**: `@mastra/pg` `PgVector` funciona out-of-the-box; porte futuro
  para Mastra full (ADR-0002 reavaliação) é trivial.
- **HNSW + dotproduct**: latência sub-100ms para topK típico, escalável até dezenas
  de milhares de vetores sem reindex.
- **GCP-nativo**: IAM via SA, observabilidade via Cloud Monitoring, backups
  automáticos, point-in-time recovery.

### Negativas / Trade-offs
- **Single point of failure**: queda do Cloud SQL derruba memory **e** RAG.
  Mitigação: HA configurável (failover replica) + degradação graciosa (Sprint 2.D
  fallback estático quando `vector_query` falha).
- **Edge Runtime indisponível** para routes que tocam o pool. Aceitável: nossas
  routes `/api/ai`, `/api/canvas`, `/api/bigquery` já são Node.
- **Connection pool em serverless**: cold start abre conexões; sob burst, risco de
  esgotamento. Mitigação: pool externo (pgbouncer) em prod se necessário.
- **Custo Cloud SQL**: ~USD 50-100/mês para `db-g1-small` HA + storage. Aceitável vs
  benefício; menor que Vertex Vector Search dedicado para volume atual.
- **3072d ocupa storage**: aceitável até dezenas de milhares de vetores; revisitar
  se ultrapassarmos 100k.

### Neutras
- Vector store separado (Pinecone, Vertex Vector Search) deixa de ser opção até
  superseção desta ADR.
- LibSQL/Turso, mencionados no ecossistema Mastra, não são considerados — fora do
  GCP, exigem network egress.

## Alternativas consideradas

### Alternativa A — pgvector em Cloud SQL **+ Vertex Vector Search separado** para RAG
**Pros**: Vertex Vector Search é gerenciado, escala automática, sem connection pool.
**Cons**: dois sistemas, duas SAs, network egress entre eles, sincronização de
metadata, custo ≥USD 200/mês para corpus inicial; sem transações cross-store.
**Por que rejeitada**: complexidade desproporcional ao volume.

### Alternativa B — LibSQL / Turso (replicado)
**Pros**: edge-friendly, latência baixa, usado pela comunidade Mastra como exemplo.
**Cons**: fora do GCP (network egress), `@mastra/pg` PgVector não cobre, SQLite
sintaxe com restrições, vector indexing nativo é recente e menos maduro que pgvector.
**Por que rejeitada**: ecossistema GCP é não-negociável; pgvector é mais maduro.

### Alternativa C — Pinecone / Weaviate
**Pros**: vector stores especializados, recursos avançados (hybrid search nativo,
filters complexos).
**Cons**: SaaS terceirizado, custo USD ≥70/mês mínimo, network egress, IAM separado,
LGPD com data residency complica.
**Por que rejeitada**: sai do perímetro GCP; não há funcionalidade que pgvector +
nosso rerank custom não cubra para volume atual.

### Alternativa D — Vertex Vector Search puro (substitui também o Postgres)
**Pros**: gerenciado, sem connection pool.
**Cons**: não cobre threads/messages/working memory (precisaríamos Firestore ou
Postgres mesmo assim), não suporta transações.
**Por que rejeitada**: não substitui o Postgres transacional, então é stack a mais.

### Alternativa E — Firestore (já temos para auth)
**Pros**: já no projeto via `firebase-admin`.
**Cons**: sem vector index nativo (até momento), latência de scan alta, custo de
read alto para RAG, modelo NoSQL inadequado para joins de memory.
**Por que rejeitada**: ferramenta errada para o problema.

## Implementação

- **Plano macro**: `docs/superpowers/plans/2026-05-04-mastra-memory-rag.md` §3.3, §3.6.
- **Specs sprint**:
  - `2026-05-04-sprint1-A-cloud-sql-working-memory.md` — provisionamento + schema
    inicial + `MemoryService.getPool()`.
  - `2026-05-04-sprint2-A-rag-ingest.md` — `embeddings_docs/glossary/schemas` +
    `vector_query` tool + `pgVectorUpsert` helper.
  - `2026-05-04-sprint3-A-semantic-recall.md` — `embeddings_sql` e
    `embeddings_blocks`.
- **Wrappers a criar**:
  - `src/shared/lib/memory/memory-service.ts` — pool + `createThread`, `recall`, etc.
  - `src/shared/lib/rag/pgvector.ts` — `pgVectorUpsert`, `pgVectorQuery`.
- **Routes afetadas**: todas em `app/api/ai/`, `app/api/canvas/`, `app/api/rag/` —
  `export const runtime = 'nodejs';`.
- **IAM**: SA `liquid-app-sa@<project>.iam` com role `roles/cloudsql.client` no
  projeto Cloud SQL.
- **Variáveis de ambiente** (`.env.example` a atualizar):
  - `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
  - `CLOUD_SQL_INSTANCE` (formato `<project>:<region>:<instance>`)
  - `DB_POOL_MAX` (default 10)

## Referências

- `docs/superpowers/plans/2026-05-04-mastra-memory-rag.md` §3 (RAG), §6 (decisão
  Mastra-as-lib).
- `docs/superpowers/specs/2026-05-04-sprint1-A-cloud-sql-working-memory.md`
- `docs/superpowers/specs/2026-05-04-sprint2-A-rag-ingest.md`
- `docs/superpowers/specs/2026-05-04-sprint3-A-semantic-recall.md`
- `adrs/mastra/vectors/pg.mdx` — `PgVector`, HNSW, `PostgresStore`.
- `adrs/mastra/memory/memory-class.mdx:182-189` — exemplo `PgStore`.
- pgvector docs: https://github.com/pgvector/pgvector
- Cloud SQL Node.js Connector:
  https://github.com/GoogleCloudPlatform/cloud-sql-nodejs-connector
- ADR-0002 (Mastra-as-library), ADR-0005 (embedding model), ADR-0006 (multi-tenancy).
