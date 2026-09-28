---
id: 0005
title: Embedding model — Vertex `gemini-embedding-001` com fallback OpenAI `text-embedding-3-small`
status: Accepted
date: 2026-05-04
deciders: [giulliano.soares]
consulted: [time-ai, time-data]
informed: [time-eng]
tags: [ai, rag, embeddings, vertex, openai, multi-tenancy]
supersedes: []
related: [0004, 0006]
---

# ADR-0005 — Embedding model: Vertex `gemini-embedding-001` (default) com fallback OpenAI

## Status

`Accepted` — desde 2026-05-04.

Histórico:
- 2026-05-04 — proposta.
- 2026-05-04 — aceita após revisão cruzada com planos macro, specs Sprint 1-3 e ADRs relacionadas.
  `gemini-embedding-001` na versão instalada de `@ai-sdk/google-vertex@^4.0.80`.

## Contexto

O pipeline RAG (ADR-0004 + Sprint 2.A) ingere ~1500 embeddings iniciais sobre
`docs/benchmarking/*.md`, `glossary.ts` e schemas BQ. Adicionalmente, Sprint 3.A
introduz `embeddings_sql` e `embeddings_blocks` com volume crescente. A escolha do
modelo de embedding afeta:

- **Qualidade do recall** sobre corpus regulatório/financeiro em PT-BR (CVM 60, CMN
  2.682, MCMV, distratos, IFRS 9 etc.) — vocabulário jurídico+técnico+financeiro+PT-BR.
- **Dimensionalidade** — afeta storage (3072d ≈ 12KB/vetor; 1536d ≈ 6KB/vetor) e custo
  de cálculo de distância.
- **Custo**: Vertex e OpenAI cobram por token de input.
- **Conta GCP unificada**: Vertex Gemini já é o LLM principal via
  `@ai-sdk/google-vertex` e `customProvider`. Manter embeddings na mesma conta
  simplifica IAM, billing e monitoramento.
- **Multi-tenancy**: ADR-0006 exige isolamento por `clientId`. Modelo de embedding não
  influi nisso, mas mudança de modelo invalida embeddings antigos — coexistência
  por coluna `embedding_model` evita migração big-bang.
- **Risco de indisponibilidade**: dependência única (Vertex) sem fallback expõe a
  outages. Fallback OpenAI mitiga.

`@ai-sdk/google-vertex@^4.0.80` (versão instalada) suporta embeddings via
`vertex.textEmbeddingModel('gemini-embedding-001')`. **Validação dimensional** é
necessária no Sprint 2.A — modelo retorna 3072d em alguns SDKs e 768d em outros
caminhos legacy.

## Decisão

**Adotamos Vertex `gemini-embedding-001` (3072d) como embedding model padrão para
todo o corpus RAG, com fallback OpenAI `text-embedding-3-small` (1536d) atrás de
feature flag `RAG_EMBEDDING_PROVIDER`. Coexistência via coluna `embedding_model` em
cada tabela vetorial, permitindo trocar provider sem migração big-bang.**

Especificações:

- **Default provider**: Vertex `gemini-embedding-001`, dimensão 3072.
- **Fallback provider**: OpenAI `text-embedding-3-small`, dimensão 1536.
  Habilitado via env var `RAG_EMBEDDING_PROVIDER=openai`.
- **Schema das tabelas vetoriais** (ADR-0004 atualizado):
  ```sql
  ALTER TABLE embeddings_docs ADD COLUMN embedding_model text NOT NULL DEFAULT 'gemini-embedding-001';
  ```
  Idem para `embeddings_glossary`, `embeddings_schemas`, `embeddings_sql`,
  `embeddings_blocks`.
- **Tabelas separadas por dimensão** quando provider muda (estratégia explícita):
  - `embeddings_docs` (3072d, Vertex)
  - `embeddings_docs_openai` (1536d, OpenAI) — só criada se fallback ativado.
  Razão: pgvector exige dimensão fixa por coluna. Não convertemos vetores.
- **Query routing**: `pgVectorQuery(table, query)` resolve a tabela conforme
  `RAG_EMBEDDING_PROVIDER` ativo na requisição. Tools como `vector_query` ficam
  agnósticas.
- **Helper `embedTexts(texts, { provider })`** em `src/shared/lib/rag/embeddings.ts`:
  ```ts
  if (provider === 'vertex') {
    return embedMany({ model: vertex.textEmbeddingModel('gemini-embedding-001'),
                       values: texts });
  }
  return embedMany({ model: openai.embedding('text-embedding-3-small'),
                     values: texts });
  ```
- **PII scrubbing antes de embedar** (ADR-0006 + Sprint 2.A): regex CPF/CNPJ/RG/email
  substitui por placeholder antes de qualquer chamada `embedMany`. Aplica-se
  independentemente do provider.
- **Hash de conteúdo** (`content_hash sha256`) determina re-ingest incremental: só
  re-embedda chunks com hash diferente. Combinado com `embedding_model`, suporta
  re-embedding total seletivo quando trocamos provider.
- **Custo estimado** (corpus inicial ~1500 chunks × ~500 tokens):
  - Vertex `gemini-embedding-001`: ordem de centavos para ingest completo.
  - Reranking (Gemini Flash) domina o OPEX recorrente — não esta decisão.
- **Validação obrigatória no Sprint 2.A**: confirmar dimensão real (3072 esperado) e
  performance de latência. Se falhar, ativar fallback OpenAI como default temporário
  e abrir ADR de superseção.

## Consequências

### Positivas
- **Conta unificada GCP**: billing e IAM em um lugar (alinhado a stack do projeto).
- **Multilinguidade**: `gemini-embedding-001` é multilíngue, alinhado com corpus
  PT-BR e inglês técnico que coexistem em `docs/benchmarking/`.
- **Fallback determinístico**: se Vertex degradar, troca de env var ativa OpenAI sem
  redeploy de código.
- **Coexistência por `embedding_model`**: troca de provider não exige migração
  big-bang; ingest novo grava no schema/tabela do provider novo, leitura roteia.
- **Storage previsível**: ~18MB para corpus inicial em 3072d — ordem de grandeza
  aceitável.

### Negativas / Trade-offs
- **3072d é alto**: storage 2× maior que OpenAI 1536d; cálculo de distância
  proporcionalmente mais caro. Aceitável para corpus atual (≤100k vetores).
- **Tabelas paralelas se ativarmos fallback**: duplica esforço de ingestão e custo
  de storage durante coexistência. Mitigação: fallback é exceção, não default.
- **Lock-in fraco com Vertex**: trocar para OpenAI exige re-ingest do corpus inteiro
  (não convertemos vetores entre dimensões). Aceitável dado o volume.
- **Risco residual de incompatibilidade SDK**: `@ai-sdk/google-vertex@^4.0.80` pode
  ter bugs com `gemini-embedding-001`. Sprint 2.A inclui teste integrado com 10
  embeddings reais como gate.

### Neutras
- Mudança futura para `gemini-embedding-002` (quando lançado) é mecânica: bump
  string + re-ingest com flag `embedding_model`.
- `topK=20 → rerank Gemini Flash → topK=5` (Sprint 2.A) compensa pequenas falhas de
  recall do embedding base.

## Alternativas consideradas

### Alternativa A — OpenAI `text-embedding-3-small` (1536d) como default
**Pros**: storage menor, custo ligeiramente menor, ecossistema maduro, latência
estável.
**Cons**: conta separada (OpenAI), key management adicional, network egress fora do
GCP, billing fragmentado.
**Por que rejeitada**: alinhamento GCP é prioridade arquitetural; benefício marginal
de dimensão menor não compensa.

### Alternativa B — Cohere `embed-multilingual-v3.0`
**Pros**: forte em multilíngue.
**Cons**: terceira conta, sem ganho claro sobre Vertex, custo similar.
**Por que rejeitada**: complexidade de provider extra sem benefício mensurável.

### Alternativa C — Modelos open-source self-hosted (BGE-M3, e5-mistral)
**Pros**: zero custo de inferência por token, controle total.
**Cons**: precisamos provisionar GPU/CPU dedicado; latência variável; ops adicional;
qualidade comparável apenas em benchmarks específicos.
**Por que rejeitada**: ROI insuficiente para corpus pequeno (~1500 vetores).

### Alternativa D — Vertex `text-embedding-005` ou `textembedding-gecko`
**Pros**: variantes Vertex menores (768d), latência menor.
**Cons**: qualidade mais baixa em benchmarks recentes; risco de descontinuação à
medida que `gemini-embedding-*` consolida.
**Por que rejeitada**: convergência da família Gemini é a aposta natural.

## Implementação

- **Plano macro**: `docs/superpowers/plans/2026-05-04-mastra-memory-rag.md` §3.2.
- **Spec sprint**: `docs/superpowers/specs/2026-05-04-sprint2-A-rag-ingest.md` —
  `embedTexts` helper, validação dimensional, ingest pipeline.
- **Arquivos a criar**:
  - `src/shared/lib/rag/embeddings.ts` — `embedTexts`, `getEmbeddingProvider()`.
  - `src/shared/lib/rag/pgvector.ts` — `pgVectorUpsert`, `pgVectorQuery` com routing
    por `embedding_model`.
- **Variáveis de ambiente** (`.env.example`):
  - `RAG_EMBEDDING_PROVIDER=vertex` (default) | `openai`
  - `OPENAI_API_KEY` (apenas se fallback ativado)
- **Migration SQL** (Sprint 2.A): `ALTER TABLE embeddings_*` adicionando coluna
  `embedding_model`.
- **Validação obrigatória (gate Fase 2.A)**:
  - Embedding de "Selic é a taxa básica de juros" retorna vetor 3072d.
  - Latência p95 `embedMany([10 chunks])` < 2s.
  - Test integrado em `src/shared/lib/rag/embeddings.test.ts`.
- **Sem feature flag de produto** — apenas env var de operação.

## Referências

- `docs/superpowers/plans/2026-05-04-mastra-memory-rag.md` §3.2.
- `docs/superpowers/specs/2026-05-04-sprint2-A-rag-ingest.md`
- `adrs/mastra/rag/embeddings.mdx` — `embed`, `embedMany` via AI SDK.
- AI SDK docs — `@ai-sdk/google-vertex` text embeddings.
- Vertex docs: Generative AI — Embeddings — `gemini-embedding-001`.
- ADR-0004 (Postgres+pgvector storage), ADR-0006 (multi-tenancy + PII).
