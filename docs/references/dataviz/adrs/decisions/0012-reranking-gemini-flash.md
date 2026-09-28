---
id: 0012
title: Reranking RAG via Gemini Flash com structured output
status: Accepted
date: 2026-05-04
deciders: [time-ai]
consulted: [time-data]
informed: [time-ai, time-data]
tags: [rag, reranking, vertex, ai-sdk]
supersedes: []
related: [0002, 0004, 0005, 0006, 0011]
---

# ADR-0012 — Reranking RAG via Gemini Flash com structured output

## Status

`Accepted` — desde 2026-05-04.

Histórico:
- 2026-05-04 — proposta junto com a Sprint 2.A (RAG ingest pipeline).
- 2026-05-04 — aceita após revisão das alternativas Cohere Rerank, cross-encoder local e ordem original.

## Contexto

A Sprint 2.A (`docs/superpowers/specs/2026-05-04-sprint2-A-rag-ingest.md`) introduz o pipeline RAG sobre `docs/benchmarking/`, glossário e schemas BigQuery. O retrieval inicial via similaridade vetorial (HNSW+cosine) recupera **topK=20** candidatos. Para reduzir o ruído antes de injetar no system prompt do agente, precisamos reranquear para **topK=5** considerando relevância semântica completa — algo que embedding similarity sozinho perde quando há muitas variações lexicais (e.g., "DSCR" vs "razão de cobertura").

Forças:
- **Custo recorrente**: cada query do orchestrator faz reranking → multiplica custo por interação.
- **Latência adicional**: rerank entra no caminho crítico (system prompt depende dele).
- **Sem novos providers**: ADR-0002 mandata Mastra-as-library; ADR-0005 fixa Vertex como provider primário. Adicionar Cohere ou outro provider para rerank conflita.
- **Qualidade**: rerank trivial (nenhum) deixa modelo gastar tokens com chunks pouco relevantes.

## Decisão

**Adotamos Gemini 2.5 Flash via `generateObject` (AI SDK v6) como reranker padrão**, com schema Zod `{ ranked: [{index: number, score: number}] }`. Configuração:

- Modelo: `vertex('gemini-2.5-flash')` (env `RAG_RERANK_MODEL` permite override)
- topK retrieval: **20** (env `RAG_TOPK_RETRIEVE`)
- topK rerank: **5** (env `RAG_TOPK_RERANK`)
- Temperature: 0 (determinístico)
- Timeout: 5s (fallback para ordem original)
- Cache de queries idênticas: dedupe pelo hash do `query + clientId + topK`

Fallback gracioso: em caso de erro, timeout ou JSON inválido, retorna os topK=5 primeiros do retrieval original (não bloqueia UX). Erro registrado via `recordSpan` com `status: 'error'`.

## Consequências

### Positivas
- Zero novos providers/SDKs (reaproveita `@ai-sdk/google-vertex` e `vertex('gemini-2.5-flash')` já configurados em `model-registry.ts`).
- Custo Flash é ~10× menor que Pro; viável em alta cardinalidade.
- Determinístico (temperature 0) → resultados reprodutíveis para evals.
- Schema Zod via `generateObject` evita parsing frágil.

### Negativas / Trade-offs
- Latência de **300-700ms por query** somada ao retrieval (~50ms) e à composição do system prompt.
- Reavaliar quando p95 do `recordSpan` `rag.rerank` ultrapassar 1.5s ou custo Flash mensal > meta.
- Reranker LLM-based pode "alucinar" rankings em queries muito ambíguas; mitigado por temperature=0 e prompt de instrução conservadora.

### Neutras
- Reranker não é ADR estrutural — pode ser trocado por Cohere Rerank ou cross-encoder local (e.g., `bge-reranker`) sem afetar o resto do pipeline (interface `Reranker.rerank(query, candidates) → ranked`).

## Alternativas consideradas

### Alternativa A — Cohere Rerank API
**Pros**: especialista em rerank, latência baixa (~100ms), barato em volume.
**Cons**: novo provider/billing/secret. Conflita com ADR-0005 (Vertex primário). Lock-in regional (Cohere não tem região BR).
**Por que rejeitada**: custo de adoção (novo SDK, billing, IAM) supera ganho de latência neste estágio.

### Alternativa B — Cross-encoder local (`bge-reranker-v2-m3`)
**Pros**: zero custo recorrente (após download), latência baixa, offline.
**Cons**: requer modelo local em runtime Next.js (Node-only, ~600MB), deploy/cold-start; não serverless-friendly.
**Por que rejeitada**: incompatível com runtime de Cloud Run típico de `/api/*`. Reavaliar se migrarmos para infra dedicada.

### Alternativa C — Sem reranker (ordem do retrieval)
**Pros**: zero latência adicional.
**Cons**: chunks irrelevantes consomem tokens do system prompt, reduzindo qualidade do agente.
**Por que rejeitada**: degradação mensurável em queries com terminologia heterogênea (e.g., "DSCR" / "índice de cobertura" / "razão de pagamento").

## Implementação

- **Spec sprint**: `docs/superpowers/specs/2026-05-04-sprint2-A-rag-ingest.md` Task 8 (`reranker.ts`)
- **Código a criar**: `src/shared/lib/rag/reranker.ts` + test colocado.
- **Env vars**: `RAG_RERANK_MODEL`, `RAG_TOPK_RETRIEVE`, `RAG_TOPK_RERANK` em `.env.example` (Task 2).
- **Telemetria**: span `rag.rerank` com `{queryHash, candidateCount, kept, durationMs, status}` (Task 12).
- **Caller**: `src/shared/lib/rag/rag-service.ts` `query(...)` orquestra retrieve → rerank.

## Referências

- ADR-0002 — Mastra-as-library sobre AI SDK v6
- ADR-0005 — Embedding model: Vertex `gemini-embedding-001` com fallback OpenAI
- ADR-0006 — Multi-tenancy strict isolation
- AI SDK v6 `generateObject`: `adrs/vercel-ai-sdk.md` §4.2 Geração de Dados Estruturados
- Cohere Rerank (alternativa B avaliada): <https://docs.cohere.com/reference/rerank>
- BGE reranker (alternativa C avaliada): <https://huggingface.co/BAAI/bge-reranker-v2-m3>
