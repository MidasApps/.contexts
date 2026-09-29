---
title: Convenções de modelagem para pgvector
type: contracts
scope: schemas com embeddings em PostgreSQL + pgvector
status: active
last_updated: 2026-05-20
related:
  - "@stacks/database/pgvector"
  - "@stacks/database/postgres"
  - "@contracts/postgres"
  - "@stacks/ai/vercel-ai-sdk"
  - "@stacks/ai/mastra-sdk"
  - "@rules/migration"
  - "@rules/security"
  - "@rules/observability"
  - "@rules/governance"
---

# Convenções de modelagem para pgvector

Doutrina que governa **como desenhar fronteiras de dados que envolvem embeddings vetoriais** em PostgreSQL com a extensão pgvector. Cobre layout de schema, naming, versionamento, indexação ANN, multi-tenancy, particionamento, ciclo de re-embedding e anti-patterns.

Este documento **não cobre**:

- Capacidades brutas da extensão (operadores, tipos, parâmetros de índice) — ver `@stacks/database/pgvector`.
- Convenções gerais de Postgres (snake_case, timestamps, soft delete, etc.) — ver `@contracts/postgres`.
- Regras imperativas de modelagem transversal — ver `@rules/data-modeling`.

As convenções aqui são **aditivas** às de `@contracts/postgres`. Em conflito, vence a convenção mais específica documentada neste arquivo.

---

## 1. Posicionamento e schema

### Regra: tabelas de embeddings vivem em schema próprio

Toda tabela que armazena vetores, chunks ou metadata de retrieval **deve** residir no schema `ai` (ou equivalente nomeado pelo domínio: `rag`, `search`). **Nunca** misturar com schema `public` ou com tabelas OLTP de domínio.

```sql
CREATE SCHEMA IF NOT EXISTS ai;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;  -- extensão em public, tabelas em ai
```

**Razão:** isolamento de ciclo de vida (embeddings são recomputados, OLTP não), políticas de retenção distintas, RLS independente e clareza de ownership operacional.

### Naming canônico de tabelas

| Propósito | Nome |
|---|---|
| Documento fonte | `ai.documents` |
| Chunks com vetor versionado | `ai.chunks_v1`, `ai.chunks_v2` |
| Jobs de embedding | `ai.embedding_jobs` |
| Logs de retrieval | `ai.retrieval_logs` |
| Feedback humano sobre retrieval | `ai.retrieval_feedback` |

---

## 2. Tabela padrão de documentos

`ai.documents` representa a **unidade fonte** antes do chunking. Imutável em relação ao conteúdo bruto; mutável apenas em metadata controlada.

```sql
CREATE TABLE ai.documents (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),         -- alinhado a @contracts/postgres
  tenant_id    uuid NOT NULL,
  source       text NOT NULL,                             -- 'gdrive' | 'notion' | 'upload' | ...
  source_ref   text NOT NULL,                             -- ID externo idempotente
  title        text,
  metadata     jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source, source_ref)
);
```

**Convenções obrigatórias:**

- `id`: **`uuid` + `uuidv7()`** (default Postgres 18). Ver `@contracts/postgres`. Não misturar ULID TEXT neste schema sem ADR.
- `tenant_id`: sempre presente, mesmo em single-tenant atual (futuro-proofing).
- `(tenant_id, source, source_ref)`: chave natural de idempotência. Ingest **deve** ser UPSERT por essa tupla.
- `metadata`: campos não-queriáveis com alta frequência. Promova a coluna quando filtragem virar caso comum.

---

## 3. Tabela padrão de chunks

`ai.chunks_v1` representa a **unidade de retrieval** com embedding atrelado. Versionada via sufixo no nome.

```sql
CREATE TABLE ai.chunks_v1 (
  id                uuid PRIMARY KEY DEFAULT uuidv7(),
  document_id       uuid NOT NULL REFERENCES ai.documents(id) ON DELETE CASCADE,
  tenant_id         uuid NOT NULL,
  chunk_index       INT NOT NULL,
  text              TEXT NOT NULL,
  token_count       INT,
  embedding         vector(1536) NOT NULL,
  embedding_model   TEXT NOT NULL,                                   -- 'text-embedding-3-small'
  embedding_version TEXT NOT NULL,                                   -- 'v1-2026-05'
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX chunks_v1_document_idx ON ai.chunks_v1 (document_id);
CREATE INDEX chunks_v1_tenant_idx   ON ai.chunks_v1 (tenant_id);
```

**Convenções obrigatórias:**

- `chunk_index`: ordinal dentro do documento, 0-based, monotônico.
- `embedding_model` e `embedding_version`: **ambos** sempre populados. Auditáveis e usados em filtros de retrieval.
- `(document_id, chunk_index)`: chave natural — reprocessamento substitui chunks do mesmo documento atomicamente em transaction.
- `ON DELETE CASCADE`: deleção de documento limpa chunks. Auditoria fica em tabela separada se LGPD/GDPR exigir (ver `@rules/governance`).

---

## 4. Versionamento de embeddings (crítico)

### Regra dura: nunca misturar dimensões ou modelos na mesma coluna `embedding`

Toda mudança de modelo de embedding ou de dimensionalidade **exige** uma nova tabela com sufixo de versão (`_v2`) ou, no mínimo, separação por `embedding_version` com índices distintos por partição.

**Por que tabela nova em vez de coluna nova:**

- Índices HNSW são fixos em dimensão e operator class — não comportam mistura.
- Backfill é assíncrono; queries em transição precisam discriminar versão sem fragmentar plano.
- Drop da versão antiga vira `DROP TABLE` limpo, não `ALTER TABLE ... DROP COLUMN` lento.

### Workflow expand-and-contract (referencie `@rules/migration`)

1. **Expand:** criar `ai.chunks_v2` com novo `embedding_model` / dimensão / modelo.
2. **Backfill:** job batched lê `ai.chunks_v1`, recomputa embedding, escreve `ai.chunks_v2`. Idempotente por `(document_id, chunk_index)`.
3. **Dual-read:** feature flag controla qual versão alimenta retrieval. Logs em `ai.retrieval_logs` registram versão usada.
4. **Switch:** flag default vira `v2` após validação de recall.
5. **Contract:** `DROP TABLE ai.chunks_v1` apenas quando nenhum consumidor lê mais.

**Nunca** rodar `UPDATE chunks SET embedding = ... ` in-place para trocar de modelo.

---

## 5. Dimensões padrão por modelo

Matriz de referência. Documente no projeto qual é o **default ativo** e mantenha no frontmatter de `@stacks/ai/*` do modelo escolhido.

| Modelo | Dimensão nativa | Truncável? |
|---|---|---|
| OpenAI `text-embedding-3-small` | 1536 | sim (256, 512, 1024 via `dimensions`) |
| OpenAI `text-embedding-3-large` | 3072 | sim |
| Google `text-embedding-004` | 768 | não |
| Google `gemini-embedding-001` | até 3072 | sim (Matryoshka) |
| Cohere `embed-multilingual-v3.0` | 1024 | não |
| Voyage `voyage-3` | 1024 | não |

**Default do projeto:** declarar explicitamente em `@stacks/ai/vercel-ai-sdk` ou `@stacks/ai/mastra-sdk`. Trocar de default é **decisão arquitetural** — gera ADR e re-embedding via workflow acima.

### Escolha de tipo de coluna

| Tipo | Quando usar |
|---|---|
| `vector(N)` | Default. Qualidade máxima de distance computation. |
| `halfvec(N)` | N >= 2048 e storage/perf prioritários. Aceita perda marginal de recall. |
| `bit(N)` | Apenas em estágio de pre-filter de quantization binária. Nunca como fonte de verdade. |

---

## 6. Naming de colunas

| Caso | Convenção |
|---|---|
| Vetor único principal | `embedding` |
| Múltiplos vetores por linha | `embedding_<purpose>`: `embedding_text`, `embedding_image`, `embedding_title` |
| Modelo gerador | `embedding_model` (string canônica do provider) |
| Versão semântica do pipeline | `embedding_version` (formato `v<N>-<YYYY-MM>`) |
| Contador de tokens | `token_count` |
| Ordinal de chunk | `chunk_index` |

**Proibido:**

- `vec`, `vector_data`, `emb` — sempre `embedding`.
- `model_name` sem prefixo — sempre `embedding_model`.
- Armazenar embedding em `FLOAT[]` ou `JSONB` — perde índice ANN e operadores.

---

## 7. IDs e foreign keys

- PKs e FKs em `ai.*`: **`uuid` com `DEFAULT uuidv7()`**, alinhado a `@contracts/postgres`.
- Não usar `BIGSERIAL` nem ULID em `TEXT` neste schema (exceto se ADR justificar BC legado).
- `ON DELETE CASCADE` em `chunks → documents`. Audit de deleção fora-banda se exigido por compliance.

---

## 8. Tenant isolation

Toda tabela em `ai.*` que contém dados de cliente **deve** carregar `tenant_id uuid NOT NULL`.

**Estratégias por volume:**

| Volume | Estratégia |
|---|---|
| < 10M chunks total | `tenant_id` em coluna + index, sem particionamento |
| 10M–100M chunks | Particionamento HASH por `tenant_id` |
| Multi-tenant SaaS regulado | RLS + particionamento + índice HNSW por partição |

**Partial index** com `WHERE tenant_id = 'literal'` só funciona para tenants conhecidos em build time. Para multi-tenancy dinâmica, prefira particionamento.

Ver `@rules/security` para RLS e `@rules/governance` para isolamento exigido.

---

## 9. Metadata e filtragem

`metadata JSONB` carrega campos não-queriáveis com frequência. **Regra de promoção:** se um campo é usado em `WHERE` de retrieval em mais de 20% das queries, promova a coluna física com índice apropriado.

Campos comuns que **devem** ser colunas físicas desde o início:

- `tenant_id`
- `document_id`
- `embedding_model`
- `embedding_version`
- `chunk_index`
- `created_at`

Campos típicos em `metadata`:

- Tags de classificação variáveis
- Atributos específicos da source (autor, departamento, sensibilidade)
- Snippets de contexto não-queriáveis

---

## 10. Indexação ANN

### HNSW como default

```sql
CREATE INDEX CONCURRENTLY chunks_v1_embedding_hnsw
  ON ai.chunks_v1
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

**Regras imperativas:**

- `CREATE INDEX CONCURRENTLY` sempre em produção. Nunca bloquear writes.
- Criar HNSW **após** bulk insert inicial. Construir índice incremental durante seed é dramaticamente mais lento.
- Operator class **deve** casar com o operador usado nas queries:
  - `vector_cosine_ops` ↔ `<=>`
  - `vector_l2_ops`     ↔ `<->`
  - `vector_ip_ops`     ↔ `<#>`
  - Mismatch = índice não é usado, query degrada para sequential scan.

### Parâmetros HNSW

| Param | Default sugerido | Quando ajustar |
|---|---|---|
| `m` | 16 | Subir para 24–32 se recall alvo > 95% |
| `ef_construction` | 64 | Subir para 128–200 se qualidade > tempo de build |
| `ef_search` (query) | 40 | Ajustar por query via `SET LOCAL hnsw.ef_search` |

### IVFFlat apenas se justificado

IVFFlat só quando: dataset > 100M vetores e build time de HNSW for proibitivo. Requer `ANALYZE` antes do `CREATE INDEX` e re-construção quando distribuição muda. Padrão = HNSW.

---

## 11. Particionamento

Para multi-tenant de alto volume:

```sql
CREATE TABLE ai.chunks_v1 (...) PARTITION BY HASH (tenant_id);

CREATE TABLE ai.chunks_v1_p0 PARTITION OF ai.chunks_v1 FOR VALUES WITH (MODULUS 8, REMAINDER 0);
-- ... p1..p7

-- Índice HNSW em cada partição:
CREATE INDEX CONCURRENTLY chunks_v1_p0_embedding_hnsw
  ON ai.chunks_v1_p0 USING hnsw (embedding vector_cosine_ops);
```

Particionamento por dimensão de filtro frequente (`tenant_id`) elimina vetores fora do tenant antes da busca ANN, multiplicando seletividade.

---

## 12. Chunking conventions

| Convenção | Valor |
|---|---|
| Tamanho típico | 200–800 tokens |
| Overlap | 10–20% do chunk size |
| `chunk_index` | 0-based, monotônico, único por `document_id` |
| `token_count` | Sempre populado — viabiliza budget de contexto em retrieval |

Tamanho default do projeto **deve** ser documentado em `@stacks/ai/mastra-sdk` ou no pipeline de ingest. Mudança de chunking = re-embedding (nova versão da tabela).

---

## 13. Hybrid search (lexical + semântico)

Adicionar coluna `tsvector` paralela ao embedding quando retrieval lexical for útil:

```sql
ALTER TABLE ai.chunks_v1
  ADD COLUMN text_search tsvector
  GENERATED ALWAYS AS (to_tsvector('portuguese', text)) STORED;

CREATE INDEX chunks_v1_text_search_gin ON ai.chunks_v1 USING gin (text_search);
```

Fusão de resultados via **Reciprocal Rank Fusion (RRF)** na camada de aplicação, não no banco. Banco devolve top-K de cada modalidade; aplicação aplica RRF.

Idioma do `to_tsvector` é decisão do projeto e deve ser declarada como constante de configuração — nunca espalhada literalmente.

---

## 14. Filtered ANN

Estratégias por seletividade do filtro:

| Seletividade do filtro | Estratégia |
|---|---|
| Baixa (filtra > 90%) | Pre-filter explícito + busca brute-force no subset |
| Média | Particionamento físico pela dimensão de filtro |
| Alta (filtra < 10%) | Iterative scans do pgvector 0.8+ (`SET hnsw.iterative_scan = on`) |

Filtrar por `tenant_id` via particionamento sempre vence filtro post-hoc.

---

## 15. Imutabilidade

**Embeddings e chunks são imutáveis.** Nunca:

```sql
UPDATE ai.chunks_v1 SET embedding = $1 WHERE id = $2;  -- PROIBIDO
```

Mudança de conteúdo ou modelo = nova linha, novo `chunk_index` ou nova versão da tabela. Auditabilidade exige imutabilidade.

Campos mutáveis permitidos em chunks: nenhum. Em documents: `title`, `metadata`, `updated_at`.

---

## 16. Audit fields

- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` obrigatório em toda tabela.
- `created_by TEXT` opcional, populado quando origem humana relevante.
- `updated_at` apenas em tabelas com colunas mutáveis (`ai.documents`).
- `ai.chunks_v*` não tem `updated_at` — chunks não são atualizados.

---

## 17. Quality monitoring

Tabela canônica para observabilidade de retrieval (referencie `@rules/observability`):

```sql
CREATE TABLE ai.retrieval_logs (
  id                uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id         uuid NOT NULL,
  query_text        text NOT NULL,
  top_k             int NOT NULL,
  result_chunk_ids  uuid[] NOT NULL,
  scores            double precision[] NOT NULL,
  embedding_model   text NOT NULL,
  embedding_version text NOT NULL,
  latency_ms        int NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
```

Recall sampling vs. brute-force periódico **deve** rodar em job dedicado e gravar métricas. Drop de qualidade ativa alerta antes de degradação visível.

---

## 18. PII e governance

Embeddings carregam informação suficiente para reconstrução parcial de texto. **Tratar como dado sensível** (ver `@rules/security` e `@rules/governance`):

- Retention policy idêntica à do texto-fonte.
- Access control via RLS quando aplicável.
- Deleção sob LGPD/GDPR via `DELETE FROM ai.documents WHERE ...` propaga por CASCADE para chunks.
- Logs em `ai.retrieval_logs` que contenham `query_text` também precisam de política de retenção.

---

## 19. Exemplos: certo vs. errado

### Modelagem de embeddings com versionamento

Errado — múltiplos modelos na mesma coluna:

```sql
CREATE TABLE ai.chunks (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  embedding vector(1536) NOT NULL,
  model text  -- 'text-embedding-3-small' ou 'embed-multilingual-v3.0'? Quebra ANN.
);
```

Certo — versão na tabela, dimensão fixa:

```sql
CREATE TABLE ai.chunks_v1 (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  embedding vector(1536) NOT NULL,
  embedding_model text NOT NULL,
  embedding_version text NOT NULL
);
```

### Índice ANN

Errado — operator class não casa com operador da query:

```sql
CREATE INDEX ... USING hnsw (embedding vector_l2_ops);
-- Mas a query usa <=> (cosine). Índice ignorado.
```

Certo:

```sql
CREATE INDEX CONCURRENTLY ... USING hnsw (embedding vector_cosine_ops);
-- Query: SELECT ... ORDER BY embedding <=> $1 LIMIT 10;
```

### Update de embedding

Errado:

```sql
UPDATE ai.chunks_v1 SET embedding = $1 WHERE id = $2;
```

Certo:

```sql
-- Re-embedding via nova tabela ai.chunks_v2 + backfill + swap (workflow do §4).
```

### Storage de vetor

Errado:

```sql
CREATE TABLE ai.chunks (embedding FLOAT[] NOT NULL);  -- sem índice ANN possível
```

Certo:

```sql
CREATE TABLE ai.chunks_v1 (embedding vector(1536) NOT NULL);
```

---

## 20. Anti-patterns

Lista exaustiva. Qualquer ocorrência em PR **deve** bloquear merge.

- Múltiplos modelos ou dimensões na mesma coluna `embedding`.
- Tabela de chunks sem `embedding_model` e `embedding_version` como colunas.
- `UPDATE` in-place na coluna `embedding`.
- Operator class do índice HNSW não casando com operador usado nas queries.
- HNSW criado antes do bulk insert inicial.
- `CREATE INDEX` sem `CONCURRENTLY` em produção.
- Falta de `tenant_id` em projetos multi-tenant.
- Uso de `vector(3072)` quando dimensão menor (768/1024/1536) atende ao recall alvo.
- Pipeline crítico confiando 100% em ANN sem re-ranking subsequente.
- `CREATE EXTENSION vector;` ausente de migrations de CI/CD ou de provisionamento fresh.
- Tabelas de embedding em schema `public` ou misturadas com OLTP de domínio.
- `embedding` armazenado como `FLOAT[]` ou `JSONB` em vez de `vector(N)`.
- Re-embedding via mutação in-place em vez de expand-and-contract.
- `ai.retrieval_logs` sem `embedding_model` / `embedding_version` — impossibilita debug post-mortem de drift.
- Chunking sem `chunk_index` ou sem `token_count` populados.
- Idioma de `to_tsvector` hardcoded espalhado por queries em vez de constante.

---

## Referências cruzadas

- Capacidades da extensão e operadores: `@stacks/database/pgvector`.
- Convenções gerais Postgres (snake_case, uuidv7 PKs, timestamps, soft delete): `@contracts/postgres`.
- Postgres como stack (versão, configuração, extensions): `@stacks/database/postgres`.
- Geração de embeddings via SDK: `@stacks/ai/vercel-ai-sdk`, `@stacks/ai/mastra-sdk`.
- Workflow expand-and-contract e zero-downtime migrations: `@rules/migration`.
- Tratamento de PII em embeddings, RLS, deleção: `@rules/security`, `@rules/governance`.
- Logs de retrieval, recall sampling, alertas: `@rules/observability`.
