# Sprint 2.A — Acceptance smoke + gold dataset

## Pré-requisitos

```bash
# Sprint 1.A heritage
./scripts/db-up.sh
pnpm migrate                            # aplica 001_init.sql + 002_rag_indices.sql

# Vertex auth + RAG env
gcloud auth application-default login
echo "RAG_EMBEDDING_PROVIDER=vertex" >> .env.local
echo "RAG_EMBEDDING_MODEL=gemini-embedding-001" >> .env.local
echo "RAG_TOPK_RETRIEVE=20" >> .env.local
echo "RAG_TOPK_RERANK=5" >> .env.local
echo "RAG_INGEST_BATCH_SIZE=20" >> .env.local
echo "RAG_RERANK_MODEL=gemini-2.5-flash" >> .env.local
```

## Passos

1. **Aplicar migrations**:
   ```bash
   pnpm migrate
   ```
   Esperado: `Tables: embeddings_docs, embeddings_glossary, embeddings_schemas, messages, threads, working_memory`.

2. **Conferir índices HNSW**:
   ```bash
   docker exec liquid-pg psql -U liquid -d liquid_memory -c '\di idx_embeddings_*'
   ```
   Esperado: 7 índices (3 client + 3 hnsw + 1 hash).

3. **Ingestão dev (1ª execução)**:
   ```bash
   RAG_CLIENT_ID=OM pnpm rag:ingest docs/benchmarking
   ```
   Esperado: log final com `inserted > 0`, `skipped == 0`.

4. **Re-execução (idempotência)**:
   ```bash
   RAG_CLIENT_ID=OM pnpm rag:ingest docs/benchmarking
   ```
   Esperado: `inserted == 0`, `skipped > 0`.

5. **Repetir 3 e 4 para BRZ, CONX, IMCASA**:
   ```bash
   for c in BRZ CONX IMCASA; do RAG_CLIENT_ID=$c pnpm rag:ingest docs/benchmarking; done
   ```

6. **Smoke gold**:
   ```bash
   pnpm rag:smoke
   ```
   Esperado: exit 0; `recallAt5 >= 0.8`; `adversarialFails == 0`.

7. **Manual chat**: `pnpm dev` → AI Sidebar → perguntar "Como funciona CVM 60 para CRIs?". Resposta deve citar `docs/benchmarking/1 6 CVM 60 ...md` via `vector_query`.

## Cron deploy

- Cloud Scheduler: `0 3 1 * *` chamando Cloud Run job `rag-refresh` que executa `pnpm rag:refresh`.
- ADR-0011 menciona TTL 90d em semantic recall — não afeta esta task (apenas `embeddings_docs`).

## PII guard manual

```bash
docker exec liquid-pg psql -U liquid -d liquid_memory -c \
  "SELECT content FROM embeddings_docs LIMIT 100" \
  | grep -E '\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}' \
  || echo "OK: no PII detected in sample"
```

## Critérios de aprovação

- [ ] `pnpm migrate` aplica 002_rag_indices.sql sem erro
- [ ] `pnpm test:run` verde (≥ 175 tests)
- [ ] `pnpm tsc --noEmit` clean
- [ ] `pnpm rag:ingest` em corpus completo (31 docs × 4 clientes) finaliza em **< 15min** wall-clock
- [ ] Re-ingest com 0 mudanças: `inserted == 0` (hash incremental)
- [ ] `pnpm rag:smoke` reporta `recallAt5 >= 0.8` e `adversarialFails == 0`
- [ ] PII guard manual: 0 ocorrências em amostra de 100 rows
- [ ] `vector_query` aparece em `tools` de canvas + analytic orchestrators
- [ ] Prompt do canvas + analítico contém bloco "Recuperação contextual"
- [ ] `pnpm build` sem warnings novos

## Encerrar

```bash
./scripts/db-down.sh
```

## Referências

- ADR-0004: [Cloud SQL + pgvector storage único](../../adrs/decisions/0004-cloud-sql-pgvector-storage-unico.md)
- ADR-0005: [Embedding Vertex + fallback OpenAI](../../adrs/decisions/0005-embedding-vertex-com-fallback-openai.md)
- ADR-0006: [Multi-tenancy strict isolation](../../adrs/decisions/0006-multi-tenancy-strict-isolation.md)
- ADR-0012: [Reranking Gemini Flash](../../adrs/decisions/0012-reranking-gemini-flash.md)
- Plano-fonte: `docs/superpowers/plans/2026-05-04-mastra-memory-rag.md` §3
- Spec sprint: `2026-05-04-sprint2-A-rag-ingest.md`
