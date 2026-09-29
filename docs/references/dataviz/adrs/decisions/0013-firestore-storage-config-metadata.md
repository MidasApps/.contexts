---
id: 0013
title: Firestore como storage único para configuração + metadados + memória de IA
status: Accepted
date: 2026-05-04
deciders: [giulliano.soares]
consulted: [time-data, time-infra]
informed: [time-eng]
tags: [infra, firestore, memory, rag, semantic-recall, evals, multi-tenancy]
supersedes: [0004]
related: [0002, 0005, 0006, 0009, 0010, 0011, 0012]
---

# ADR-0013 — Firestore como storage único para configuração, metadados e memória de IA

## Status

`Accepted` — desde 2026-05-04. Supersede [ADR-0004](0004-cloud-sql-pgvector-storage-unico.md).

Histórico:
- 2026-05-04 — aceita ao consolidar a convenção do projeto (BigQuery exclusivamente
  para datasets de cliente; Firestore para tudo o que é configuração, metadados internos
  ou memória de IA). Sprint 1.A foi a primeira implementação a ser migrada de
  Postgres+pgvector para Firestore.

## Contexto

A convenção do projeto, estabelecida no início da iniciativa Mastra/AI e reafirmada
durante a revisão de Sprint 1.A, define dois substratos de storage com responsabilidades
disjuntas:

1. **BigQuery** — exclusivamente datasets de cliente (carteira, contratos, pagamentos,
   safras). Multi-dataset por tenant (ADR-0007).
2. **Firestore** — todo o resto: configuração de aplicação, metadados internos,
   working memory, mensagens, threads, embeddings (RAG, semantic recall), catálogo
   de SQL validado, eval runs e judge drift.

[ADR-0004](0004-cloud-sql-pgvector-storage-unico.md) propôs Cloud SQL Postgres +
pgvector como storage único para memória/RAG. A decisão **violava a convenção** acima:
Postgres seria um terceiro substrato, com custo idle não-trivial ($50–100/mês de
instância mínima), conta-gota de IAM/networking, e duplicaria mecanismos já
disponíveis no Firestore (multi-tenancy via security rules, scale-to-zero, free tier
generoso para o piloto).

Como **nenhum dado de produção foi gravado em Postgres** durante Sprint 1.A
(infra estava provisionada mas migrações nunca rodaram em prod), o custo de pivotar
agora é mínimo — toda a refactor está concentrada em código (memory-service,
recall-store, rag-service, repository de catálogo, persist de evals).

## Decisão

**Firestore é o storage único** para:

- **Sprint 1.A — memória conversacional**: `workingMemory/{threadId}` (doc) +
  `workingMemory/{threadId}/messages` (subcoleção, doc id sequencial ou auto).
  Threads viram campos no doc raiz com `createdAt`/`updatedAt` server-timestamps.
- **Sprint 2.A — RAG**: coleção `embeddingsDocs` com vetor inline (3072-dim). Filtro
  por `clientId`/`docType`/`product`/`persona` server-side; ranqueamento brute-force
  cosine em JS sobre o subset filtrado.
- **Sprint 3.A — semantic recall**: coleções `embeddingsSql` e `embeddingsBlocks`,
  mesmo padrão de filtro+brute-force.
- **Sprint 3.C — catálogo de SQL validado**: coleção `sqlCatalog` por tenant.
- **Sprint 3.D — eval runs / judge drift**: coleções `evalRuns` e `judgeDrift`.

**BigQuery permanece exclusivamente para datasets de cliente.** Não migra.

**Postgres + pgvector é descontinuado.** Cloud SQL não é provisionado. Dependência
`pg` é removida. Migrations SQL e scripts (`scripts/migrate.ts`, `db-up.sh`,
`db-down.sh`) são deletados.

### Por que brute-force cosine em JS é trivialmente aceitável aqui

O volume esperado para o piloto é:

- ~31 docs `docs/benchmarking/*.md` × ~10 chunks ≈ 300 vetores;
- ~50 termos do glossário × 1 ≈ 50 vetores;
- ~50 schemas BQ × 1 ≈ 50 vetores;
- ~500 SQLs validados crescendo até ~5k em 12 meses;
- ~200 blocos reusáveis crescendo até ~2k em 12 meses.

Total **<10k vetores** por cliente nos primeiros 12 meses. Cada query semantic recall
filtra por `clientId` (ADR-0006), reduzindo para tipicamente <2k vetores. Cosine
brute-force em 2k vetores 3072-dim é ~6M flops, completa em <50ms em V8 sem qualquer
otimização (~0,4ms com `Float32Array`). HNSW só seria justificado >100k vetores —
**não vamos chegar lá no piloto**, e quando chegarmos a discussão é Vertex Vector
Search ou pgvector novamente, não premature optimization agora.

### Multi-tenancy

Mantido conforme [ADR-0006](0006-multi-tenancy-strict-isolation.md). Toda query
Firestore inclui `where('clientId', '==', clientId)` server-side antes do brute-force.
Security rules complementam (Firestore as defense-in-depth).

## Consequências

### Positivas

- **Custo idle = $0** — Firestore scale-to-zero, free tier (1GB storage, 50k reads/dia)
  cobre o piloto inteiro. Cloud SQL custaria $50–100/mês mesmo idle.
- **Convenção do projeto preservada** — BQ apenas para client data, Firestore para
  todo o resto. Onboarding de devs novos é mais simples.
- **Auth já resolvido** — Firestore Admin SDK reaproveita `getDb()` em
  `src/shared/lib/firebase/admin.ts`. Sem segredos novos, sem networking custom.
- **HNSW indexes não são mais necessários** — sem migrations SQL, sem `CREATE INDEX
  CONCURRENTLY`, sem rebuild quando adicionamos campos. Schema do Firestore é
  schemaless por design.
- **PRs anteriores #4/#5/#6** (Sprint 1.A Cloud SQL infra) ficam **superseded** —
  fechados sem merge. O code path de Postgres é deletado, não refatorado.

### Negativas

- **Brute-force cosine** tem floor de latência mais alto que HNSW em volumes >50k
  (não-issue até 2027 dado o forecast).
- **Sem JOINs nativos** — agregações que cruzam coleções (ex: `sqlCatalog` × `evalRuns`)
  precisam ser feitas em código. Aceitável: o volume é baixo e as agregações são offline
  (batch jobs noturnos), não no caminho hot do agente.
- **Custo por write** — Firestore cobra $0,18 / 100k writes. Para o volume esperado
  (~10k writes/dia no piloto) custo é desprezível (<$0.50/mês), mas precisa ser
  monitorado quando escalar.

### Migração

Como **nenhum dado existe em produção**, a migração é puramente de código:

- Bulk F1 — Sprint 1.A memory-service (este bulk).
- Bulk F2 — Sprint 2.A rag-service.
- Bulk F3 — Sprint 3.A recall-store + eviction.
- Bulk F4 — Sprint 3.C repository de catálogo.
- Bulk F5 — Sprint 3.D persist de eval runs + judge drift.

Cada bulk preserva a API pública dos services; só os internals mudam de pg para
Firestore. Zero impacto em consumers (orchestrator, tools, UI).

## Alternativas descartadas

### Manter Postgres + pgvector (ADR-0004)

- Custo idle $50–100/mês violando o princípio de scale-to-zero do piloto.
- Viola a convenção do projeto (BQ ↔ Firestore exclusivamente).
- Operacional adicional: migrations, backups, network/IAM, segredo de connection string.

### Vertex Vector Search

- Endpoint mínimo $150+/mês mesmo sem queries.
- Overkill para o volume esperado (<10k vetores por tenant nos primeiros 12 meses).
- Sem benefício até passarmos de ~100k vetores.

### Brute-force só em memória (sem persistência)

- Perde durabilidade — embeddings precisam sobreviver a restart do server.
- Bootstrap caro — recomputar embeddings em cada deploy custa quotas Vertex.

### Hybrid (Firestore para metadados, BQ para embeddings)

- Quebra a convenção (BQ deve ser apenas client data).
- BQ tem cosine via `ML.DISTANCE` mas com cobrança por bytes scanned — fica caro em
  recall que roda toda turn do agente.
- Latência BQ (~1-2s para query bem feita) é ruim para semantic recall no caminho hot.

## Referências

- [ADR-0004](0004-cloud-sql-pgvector-storage-unico.md) — superseded por esta.
- [ADR-0005](0005-embedding-vertex-com-fallback-openai.md) — modelo de embedding (mantido).
- [ADR-0006](0006-multi-tenancy-strict-isolation.md) — isolamento por `clientId` (mantido).
- [ADR-0011](0011-semantic-recall-ttl-pii-scrubbing.md) — TTL/PII (mantido).
- `src/shared/lib/firebase/admin.ts` — Firestore Admin bootstrap reaproveitado.
