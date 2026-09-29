---
name: database-pgvector
description: Use para pgvector — embeddings, similarity search, índices ivfflat/hnsw. Keywords: pgvector, embeddings, vector db.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# pgvector (Postgres extension)

Extensão do Postgres para armazenar e fazer similarity search em embeddings. Suporta L2, inner product e cosine; índices IVFFlat e HNSW. Versão pinada: 0.8.6 (imagem `pgvector/pgvector:0.8.6-pg18`).

## Essência
- **Setup:** `CREATE EXTENSION vector;`.
- **Tipo:** `vector(N)` — dimensão fixa (ex.: `vector(1536)` para OpenAI text-embedding-3-small, `vector(3072)` para large).
- **Operadores de distância:** `<->` (L2/euclidean), `<=>` (cosine), `<#>` (negative inner product). Cosine é o mais comum em RAG.
- **Índices:**
  - **HNSW** (default recomendado): build mais lento, query rápido, alta recall, indexa incrementalmente. `USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)`.
  - **IVFFlat**: build rápido, query ok, requer treino com dados (`lists = sqrt(N)` rule of thumb). Não bom para escrita contínua.
- **Tuning de query:** HNSW → `SET hnsw.ef_search = 100`; IVFFlat → `SET ivfflat.probes = 10`. Maior = mais recall, mais lento.
- **Filtros:** WHERE + ORDER BY distância → use index condition; **partial index** quando query sempre filtra por tenant.
- **Halfvec/bit:** índice sobre `vector` vai até 2.000 dims; `halfvec(N)` (metade da memória) indexa até 4.000 — obrigatório para `gemini-embedding-001`/`text-embedding-3-large` em 3072. `bit(N)` para Hamming em pre-filter.
- **Normalizar embeddings** antes de inserir para usar `<#>` (inner product) — mais rápido que cosine.

## Procedimento mínimo
1. `CREATE EXTENSION vector;` e definir dimensão conforme modelo de embedding.
2. Tabela no padrão do contrato (`ai.chunks_v1`: `document_id`, `tenant_id`, `chunk_index`, `text`, `embedding`, `embedding_model`, `embedding_version`, `created_at`) — ver skill `contracts-pgvector`.
3. Índice HNSW com `vector_cosine_ops` (ou _l2/_ip conforme distância escolhida).
4. Inserir em batch (`COPY` ou multi-row `INSERT`); índice HNSW atualiza incremental.
5. Query: `ORDER BY embedding <=> $1 LIMIT k`. Para filtrar por tenant, partial index ou composite.
6. Pré-filtrar fortemente (tenant, source) antes do top-k — vector search em milhões fica caro sem filtro.

## Anti-patterns
- Dimensão errada → `ERROR: expected N dimensions, got M`.
- Sem índice → seq scan O(N) a cada query.
- IVFFlat criado em tabela vazia → cluster degenerado; popule antes ou use HNSW.
- Embedding não-normalizado usando `<#>` esperando cosine → resultados errados.
- Misturar dimensões diferentes na mesma coluna → impossível.

## Mini-exemplo
```sql
CREATE EXTENSION IF NOT EXISTS vector;
-- tabela ai.chunks_v1: DDL completo na skill contracts-pgvector
CREATE INDEX CONCURRENTLY chunks_v1_embedding_hnsw
  ON ai.chunks_v1 USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- query (SET LOCAL dentro da transação)
SET LOCAL hnsw.ef_search = 100;
SELECT id, text, 1 - (embedding <=> $1) AS similarity
FROM ai.chunks_v1
WHERE tenant_id = $2
ORDER BY embedding <=> $1
LIMIT 10;
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/database/pgvector.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
