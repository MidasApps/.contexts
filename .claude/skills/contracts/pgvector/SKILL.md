---
name: contracts-pgvector
description: Use ao definir contratos para coleções vetoriais — dimensão, métrica, metadata. Keywords: pgvector contract, vector schema.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Contracts: pgvector Schema Conventions

Convenções de modelagem para tabelas com embeddings em pgvector: dimensão, métrica de distância, metadata, índice, particionamento por tenant.

## Essência
- **Dimensão fixa** por coleção: declare `vector(N)` baseado no modelo de embedding (`text-embedding-3-small` → 1536; `-large` → 3072; `gemini-embedding-001` → até 3072, configurável (Matryoshka)). Misturar dimensões na mesma coluna é impossível.
- **Modelo de embedding** documentado em metadata da tabela (comment ou coluna `embedding_model text`).
- **Métrica única por índice:** cosine (`vector_cosine_ops`), L2 (`vector_l2_ops`) ou inner product (`vector_ip_ops`). Cosine é default para RAG.
- **Index type:** HNSW é o default (build incremental, alto recall); IVFFlat só com dataset estável e grande. Versão pinada: pgvector 0.8.6 (imagem `pgvector/pgvector:0.8.6-pg18`). Índice sobre `vector` vai até 2.000 dimensões; acima disso, `halfvec(N)` (até 4.000).
- **Tabelas** no schema `ai`: `ai.documents` (fonte, mutável) e `ai.chunks_v1` (unidade de retrieval, imutável, versionada pelo sufixo).
- **Colunas de `ai.chunks_v1`:** `id uuid DEFAULT uuidv7()`, `document_id` (FK `ON DELETE CASCADE`), `tenant_id`, `chunk_index` (0-based), `text`, `token_count`, `embedding vector(N)`, `embedding_model`, `embedding_version`, `metadata jsonb`, `created_at`. Sem `updated_at`: chunk não é atualizado. Chave natural `(document_id, chunk_index)`.
- **Re-embedding:** trocar modelo/dimensão = nova tabela `ai.chunks_v2` + backfill idempotente + switch de leitura + `DROP` da v1 (expand/contract, ver rule `migration`). Nunca `UPDATE` de `embedding`.
- **Filtros pré-vector:** queries filtram por tenant/source ANTES do top-k. Índices em `tenant_id`, `source_type` essenciais.
- **Particionamento** por tenant grande quando volume cresce — partition por hash/list.
- **Normalização:** se usar `<#>` (inner product), normalize embeddings na ingestão.
- **Chunk size & overlap** documentados (ex.: 512 tokens, 50 overlap).

## Procedimento mínimo
1. Decidir modelo de embedding + dimensão; documentar.
2. Tabela com `embedding vector(N)`, metadata acima, FKs adequadas.
3. Índice HNSW com `vector_cosine_ops` (ou métrica escolhida).
4. Índice em `tenant_id` (+ outros filtros frequentes) — partial onde aplicável.
5. Pipeline de ingestão registra `embedding_model` + `embedding_version`.
6. Re-embedding: `ai.chunks_v2`, backfill, switch leitura, drop da v1 (ver migration).

## Anti-patterns
- Mudar modelo sem versionar a tabela → dimensões batem por sorte, qualidade despenca.
- Sem `tenant_id` indexado → seq scan no top-k.
- Guardar embedding sem o texto original → impossível citar/inspecionar.
- IVFFlat em tabela com escrita contínua → recall degrada.

## Mini-exemplo
```sql
CREATE TABLE ai.chunks_v1 (
  id                uuid PRIMARY KEY DEFAULT uuidv7(),
  document_id       uuid NOT NULL REFERENCES ai.documents(id) ON DELETE CASCADE,
  tenant_id         uuid NOT NULL,
  chunk_index       int NOT NULL,
  text              text NOT NULL,
  token_count       int,
  embedding         vector(1536) NOT NULL,
  embedding_model   text NOT NULL,       -- 'text-embedding-3-small'
  embedding_version text NOT NULL,       -- 'v1-2026-05'
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);
CREATE INDEX chunks_v1_document_idx ON ai.chunks_v1 (document_id);
CREATE INDEX chunks_v1_tenant_idx ON ai.chunks_v1 (tenant_id);
CREATE INDEX CONCURRENTLY chunks_v1_embedding_hnsw
  ON ai.chunks_v1 USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/contracts/pgvector.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
