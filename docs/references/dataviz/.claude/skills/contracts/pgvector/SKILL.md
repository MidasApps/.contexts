---
name: contracts-pgvector
description: Use ao definir contratos para coleções vetoriais — dimensão, métrica, metadata. Keywords: pgvector contract, vector schema.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Contracts: pgvector Schema Conventions

Convenções de modelagem para tabelas com embeddings em pgvector: dimensão, métrica de distância, metadata, índice, particionamento por tenant.

## Essência
- **Dimensão fixa** por coleção: declare `vector(N)` baseado no modelo de embedding (`text-embedding-3-small` → 1536; `-large` → 3072; gemini-embedding-001 → 768/3072 configurable). Misturar dimensões na mesma coluna é impossível.
- **Modelo de embedding** documentado em metadata da tabela (comment ou coluna `embedding_model text`).
- **Métrica única por índice:** cosine (`vector_cosine_ops`), L2 (`vector_l2_ops`) ou inner product (`vector_ip_ops`). Cosine é default para RAG.
- **Index type:** HNSW para uso geral (build incremental, alta recall); IVFFlat só com dataset estável e grande.
- **Metadata estável:**
  - `id` (PK)
  - `tenant_id` / `workspace_id` (multi-tenant — partial index ou composto)
  - `source_type`, `source_id` — referência ao documento original
  - `chunk_index`, `chunk_total` — quando documento é fatiado
  - `content text` — texto original do chunk (para citation)
  - `metadata jsonb` — atributos para filtragem (categoria, autor, data)
  - `embedding vector(N)`
  - `created_at`, `updated_at`, `embedding_model`, `model_version`
- **Re-embedding:** trocar modelo = nova coluna `embedding_v2 vector(M)` + backfill + dual-read durante transição (ver rule `migration`).
- **Filtros pré-vector:** queries filtram por tenant/source ANTES do top-k. Índices em `tenant_id`, `source_type` essenciais.
- **Particionamento** por tenant grande quando volume cresce — partition por hash/list.
- **Normalização:** se usar `<#>` (inner product), normalize embeddings na ingestão.
- **Chunk size & overlap** documentados (ex.: 512 tokens, 50 overlap).

## Procedimento mínimo
1. Decidir modelo de embedding + dimensão; documentar.
2. Tabela com `embedding vector(N)`, metadata acima, FKs adequadas.
3. Índice HNSW com `vector_cosine_ops` (ou métrica escolhida).
4. Índice em `tenant_id` (+ outros filtros frequentes) — partial onde aplicável.
5. Pipeline de ingestão registra `embedding_model` + `model_version`.
6. Re-embedding: nova coluna, backfill, switch leitura, drop antiga (ver migration).

## Anti-patterns
- Mudar modelo sem versionar coluna → dimensões batem por sorte, qualidade despenca.
- Sem `tenant_id` indexado → seq scan no top-k.
- Guardar embedding sem o texto original → impossível citar/inspecionar.
- IVFFlat em tabela com escrita contínua → recall degrada.

## Mini-exemplo
```sql
CREATE TABLE doc_chunks (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  source_type text NOT NULL,           -- 'gdrive', 'notion', 'web'
  source_id text NOT NULL,
  chunk_index int NOT NULL,
  chunk_total int NOT NULL,
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  embedding vector(1536) NOT NULL,
  embedding_model text NOT NULL,       -- 'text-embedding-3-small'
  model_version text NOT NULL,         -- '2024-01'
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_type, source_id, chunk_index)
);
CREATE INDEX ON doc_chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX ON doc_chunks(tenant_id, source_type);
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/contracts/pgvector.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
