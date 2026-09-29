---
name: database-pgvector
description: Use para pgvector — embeddings, similarity search, índices ivfflat/hnsw. Keywords: pgvector, embeddings, vector db.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# pgvector (Postgres extension)

Extensão do Postgres para armazenar e fazer similarity search em embeddings. Suporta L2, inner product e cosine; índices IVFFlat e HNSW.

## Essência
- **Setup:** `CREATE EXTENSION vector;`.
- **Tipo:** `vector(N)` — dimensão fixa (ex.: `vector(1536)` para OpenAI text-embedding-3-small, `vector(3072)` para large).
- **Operadores de distância:** `<->` (L2/euclidean), `<=>` (cosine), `<#>` (negative inner product). Cosine é o mais comum em RAG.
- **Índices:**
  - **HNSW** (default recomendado): build mais lento, query rápido, alta recall, indexa incrementalmente. `USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)`.
  - **IVFFlat**: build rápido, query ok, requer treino com dados (`lists = sqrt(N)` rule of thumb). Não bom para escrita contínua.
- **Tuning de query:** HNSW → `SET hnsw.ef_search = 100`; IVFFlat → `SET ivfflat.probes = 10`. Maior = mais recall, mais lento.
- **Filtros:** WHERE + ORDER BY distância → use index condition; **partial index** quando query sempre filtra por tenant.
- **Halfvec/bit:** v0.7+ tem `halfvec(N)` (metade da memória) e `bit(N)` para Hamming — útil em escala.
- **Normalizar embeddings** antes de inserir para usar `<#>` (inner product) — mais rápido que cosine.

## Procedimento mínimo
1. `CREATE EXTENSION vector;` e definir dimensão conforme modelo de embedding.
2. Tabela com `embedding vector(N)` + metadata (texto, source_id, tenant_id, created_at).
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

CREATE TABLE docs (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  content text NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX ON docs USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX ON docs(tenant_id);

-- query
SET hnsw.ef_search = 100;
SELECT id, content, 1 - (embedding <=> $1) AS similarity
FROM docs
WHERE tenant_id = $2
ORDER BY embedding <=> $1
LIMIT 10;
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/database/pgvector.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
