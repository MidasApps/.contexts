# Sprint 2.A — RAG Ingest Pipeline (docs/benchmarking + glossário + schemas BQ) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar este plano task-by-task. Steps usam checkbox (`- [ ]`) para tracking. TDD obrigatório (`superpowers:test-driven-development`) e verificação antes de finalizar (`superpowers:verification-before-completion`).

**Goal:** Construir pipeline de ingestão RAG sobre `docs/benchmarking/` (31 arquivos markdown), `src/shared/config/glossary.ts` (após Sprint 1.D) e schemas BigQuery (~50 tabelas via `INFORMATION_SCHEMA`). Persistir em três índices pgvector: `embeddings_docs`, `embeddings_glossary`, `embeddings_schemas`. Expor tool `vector_query({query, filters})` para os dois orchestrators (canvas + analítico) com isolamento `clientId` mandatório, reranking topK 20→5 via Gemini Flash, hash de conteúdo para re-ingest incremental, PII scrubbing antes de embedar, e cron mensal de drift.

**Architecture:** Vertex `gemini-embedding-001` (3072d) via `@ai-sdk/google-vertex@^4.0.80` como embedding model padrão (ADR-0005); fallback OpenAI `text-embedding-3-small` (1536d) atrás de feature flag `RAG_EMBEDDING_PROVIDER` — coluna `embedding_model` em cada tabela permite coexistência (tabela 1536d futura caso fallback ativado em produção). **Decisão lib vs custom (Mastra-as-library, ADR-0002):** implementação leve com `pg` + helpers próprios (`MDocument`-like wrapper local em `src/shared/lib/rag/chunker.ts`), reusando `getPool()` da Sprint 1.A. Importar primitives `@mastra/rag` (`MDocument`, `chunk`, `rerank`) é alternativa permitida pela ADR-0002, mas o plano-fonte §6 favorece wrapper fino para evitar superfície adicional; opção custom mantém zero dependência transitiva nova. Reranking via `generateObject` (Gemini Flash) recebendo top-20 chunks e retornando top-5 com scores. Cron diário leve (apenas hash diff) + mensal completo via `scripts/refresh-rag.ts`. PII scrubber antes de qualquer chamada `embedMany` (ADR-0006 multi-tenancy hard).

**Tech Stack:** `@ai-sdk/google-vertex@^4.0.80`, `ai@^6.x` (`embedMany`, `generateObject`), `@ai-sdk/openai` (fallback opcional), `pg@^8` (já no Sprint 1.A), `pgvector` extensão (já provisionada), Zod 4, Vitest 4.x, `tsx` para scripts.

---

## Contexto pré-leitura obrigatória

Antes de qualquer task, leia integralmente:

**Plano-fonte e dependências:**
- `docs/superpowers/plans/2026-05-04-mastra-memory-rag.md` — §3 (RAG corpus, embedding, vector store, metadata filters, reranking, runtime, custo, TTL, multi-tenancy/LGPD).
- `docs/superpowers/plans/2026-05-04-sprint1-A-cloud-sql-working-memory.md` — header, File Structure (entender `src/shared/lib/memory/pool.ts`, `migrations/`), Acceptance (Postgres + pgvector ext já disponível, `MemoryService` base, vitest configurado, `runtime = 'nodejs'` já enforçado).
- `docs/superpowers/plans/2026-05-04-sprint1-D-dynamic-instructions-glossary.md` — entender shape final de `glossary.ts` (cada termo vira 1 chunk).
- `docs/superpowers/plans/2026-05-04-sprint1-C-bq-dry-run-repair.md` — pattern de `liquid_meta` dataset, `safeIdentifier`, fire-and-forget logger.

**Codebase:**
- `src/shared/lib/memory/pool.ts` — reusar `getPool()`.
- `src/shared/lib/memory/migrations/001_init.sql` — modelo de migration (sufixo `00X_*.sql`).
- `src/shared/lib/bigquery/client.ts` — `getBigQueryClient()`, `parseDatasetRef`, `TABLES`.
- `src/shared/lib/bigquery/identifier.ts` — `safeIdentifier`, `quoteTableRef`.
- `src/features/canvas-orchestrator/orchestrator.ts` — wire de tools.
- `src/features/ai-agents/orchestrator.ts` — wire de tools no analítico.
- `src/shared/config/agents/canvas-orchestrator.ts` — system prompt builder.
- `src/shared/config/glossary.ts` — fonte do índice de glossário.
- `docs/benchmarking/` — 31 arquivos `.md` (validados em `ls`).

**ADRs já aceitas (referenciar; não duplicar):**
- `adrs/decisions/0002-mastra-as-library-sobre-ai-sdk.md` — Mastra-as-library: AI SDK v6 mantido como runtime, primitives Mastra opcionais.
- `adrs/decisions/0004-cloud-sql-pgvector-storage-unico.md` — pgvector em Cloud SQL como vector store único (memory + RAG).
- `adrs/decisions/0005-embedding-vertex-com-fallback-openai.md` — Vertex `gemini-embedding-001` (3072d) default, OpenAI `text-embedding-3-small` (1536d) fallback via `RAG_EMBEDDING_PROVIDER`.
- `adrs/decisions/0006-multi-tenancy-strict-isolation.md` — `clientId` server-bound, jamais aceito como input do modelo.

**ADR a criar (apenas para reranking, decisão nova desta sprint):**
- `adrs/decisions/0011-reranking-gemini-flash.md` — rerank via Gemini Flash structured output vs Cohere Rerank. Critério: zero novo provider, custo controlado, fallback gracioso para ordem original.

**Skills do superpowers a invocar durante execução:**
- `superpowers:test-driven-development` (cada task com produto novo).
- `superpowers:verification-before-completion` (antes de cada commit; rodar `pnpm test:run` + `pnpm lint` + `pnpm build` antes de declarar completo).
- `superpowers:subagent-driven-development` (delegar tasks independentes em paralelo).

**Agentes do projeto úteis:**
- `Explore` (busca read-only por SQL/queries existentes em `docs/benchmarking/` para validar relevância).
- `credit-risk-analyst` (validar manualmente que chunks regulatórios — CVM 60, BACEN PDD, CRI/CRA — não foram fragmentados de forma a quebrar contexto regulatório; sample 5 chunks por doc pós-ingestão).

---

## Convenções

- TDD obrigatório. Cada task com produto novo começa por teste vermelho (RED), depois implementação (GREEN).
- Zod schemas: `.nullable()` em vez de `.optional()` (Vertex Gemini strict mode).
- Imports absolutos com `@/`.
- Mocks: `vi.mock('pg', ...)`, `vi.mock('ai', ...)`, `vi.mock('@ai-sdk/google-vertex', ...)`.
- Logs: `console.log(JSON.stringify({severity:'INFO', component:'rag-ingest', ...}))` (Cloud Logging-friendly), seguindo pattern de `src/shared/lib/memory/metrics.ts`.
- Toda nova tool tem `description` em PT-BR.
- Multi-tenancy hard: **toda** query vector inclui filtro `clientId` aplicado em `RagService` (não no caller).

---

## File Structure

```
liquid-play-dataviz/
├── src/
│   ├── shared/
│   │   └── lib/
│   │       ├── memory/
│   │       │   └── migrations/
│   │       │       └── 002_rag_indices.sql            # NEW — pgvector tables
│   │       └── rag/                                    # NEW DIR
│   │           ├── chunker.ts                          # NEW — markdown/json chunkers
│   │           ├── chunker.test.ts                     # NEW
│   │           ├── hash.ts                             # NEW — sha256 contentHash
│   │           ├── hash.test.ts                        # NEW
│   │           ├── pii-scrubber.ts                     # NEW — CPF/CNPJ/email regex
│   │           ├── pii-scrubber.test.ts                # NEW
│   │           ├── embeddings.ts                       # NEW — embedMany wrapper + retry
│   │           ├── embeddings.test.ts                  # NEW
│   │           ├── metadata-extractor.ts               # NEW — Gemini structured output
│   │           ├── metadata-extractor.test.ts          # NEW
│   │           ├── rag-service.ts                      # NEW — query/upsert/delete
│   │           ├── rag-service.test.ts                 # NEW
│   │           ├── reranker.ts                         # NEW — Gemini Flash rerank
│   │           ├── reranker.test.ts                    # NEW
│   │           └── metrics.ts                          # NEW — telemetry
│   └── features/
│       └── ai-agents/
│           └── tools/
│               ├── vector-query.ts                     # NEW — tool exposed to orchestrators
│               └── vector-query.test.ts                # NEW
├── scripts/
│   ├── ingest-rag.ts                                   # NEW — full ingest CLI
│   ├── refresh-rag.ts                                  # NEW — incremental hash drift
│   ├── ingest-rag.test.ts                              # NEW (integration, mocked BQ/Vertex)
│   └── rag-smoke.ts                                    # NEW — 3 manual queries
├── docs/
│   ├── benchmarking/                                   # READ-ONLY (corpus)
│   └── superpowers/specs/
│       └── 2026-05-04-sprint2-A-acceptance.md          # NEW — manual smoke test doc
├── .env.example                                        # MODIFY
└── package.json                                        # MODIFY — scripts + deps
```

---

## Task 1 — Migration `002_rag_indices.sql` (pgvector tables)

**Goal:** Provisionar `embeddings_docs`, `embeddings_glossary`, `embeddings_schemas` com índices HNSW e indexação `clientId`.

- [ ] **Step 1.1** — Criar `src/shared/lib/memory/migrations/002_rag_indices.sql`:
    ```sql
    -- Sprint 2.A: RAG indices (pgvector). Extensão `vector` já criada em 001_init.sql.
    -- Dimensão 3072 = gemini-embedding-001. Fallback OpenAI 1536d em coluna separada (futuro).

    CREATE TABLE IF NOT EXISTS embeddings_docs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_path TEXT NOT NULL,
      chunk_index INT NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      embedding vector(3072) NOT NULL,
      embedding_model TEXT NOT NULL DEFAULT 'gemini-embedding-001',
      client_id TEXT NOT NULL,
      doc_type TEXT,
      product TEXT,
      persona TEXT,
      regulatory_area TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (source_path, chunk_index, embedding_model)
    );
    CREATE INDEX IF NOT EXISTS idx_embeddings_docs_client ON embeddings_docs(client_id);
    CREATE INDEX IF NOT EXISTS idx_embeddings_docs_hash ON embeddings_docs(content_hash);
    CREATE INDEX IF NOT EXISTS idx_embeddings_docs_hnsw
      ON embeddings_docs USING hnsw (embedding vector_cosine_ops);

    CREATE TABLE IF NOT EXISTS embeddings_glossary (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      term TEXT NOT NULL,
      definition TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      embedding vector(3072) NOT NULL,
      embedding_model TEXT NOT NULL DEFAULT 'gemini-embedding-001',
      client_id TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (term, client_id, embedding_model)
    );
    CREATE INDEX IF NOT EXISTS idx_embeddings_glossary_client ON embeddings_glossary(client_id);
    CREATE INDEX IF NOT EXISTS idx_embeddings_glossary_hnsw
      ON embeddings_glossary USING hnsw (embedding vector_cosine_ops);

    CREATE TABLE IF NOT EXISTS embeddings_schemas (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      dataset TEXT NOT NULL,
      table_name TEXT NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      embedding vector(3072) NOT NULL,
      embedding_model TEXT NOT NULL DEFAULT 'gemini-embedding-001',
      client_id TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (dataset, table_name, client_id, embedding_model)
    );
    CREATE INDEX IF NOT EXISTS idx_embeddings_schemas_client ON embeddings_schemas(client_id);
    CREATE INDEX IF NOT EXISTS idx_embeddings_schemas_hnsw
      ON embeddings_schemas USING hnsw (embedding vector_cosine_ops);
    ```

- [ ] **Step 1.2** — Aplicar.
  - Comando: `DATABASE_URL=postgresql://liquid:liquid@localhost:5433/liquid_memory pnpm migrate`
  - Output esperado: `Applying 002_rag_indices.sql...` + `Tables: embeddings_docs, embeddings_glossary, embeddings_schemas, messages, threads, working_memory`.

- [ ] **Step 1.3** — Verificar HNSW.
  - Comando: `docker exec liquid-pg psql -U liquid -d liquid_memory -c "\\di idx_embeddings_*"`
  - Output esperado: 6 índices listados (3 client + 3 hnsw).

- [ ] **Step 1.4** — Commit.
  - `feat(rag): pgvector tables for docs/glossary/schemas with HNSW`

---

## Task 2 — Dependências + ADR de reranking

**Goal:** Instalar deps mínimas para wrapper custom de RAG e registrar ADR de reranking. ADR-0002 já cobre Mastra-as-library; não há ADR de "lib vs custom" a duplicar.

- [ ] **Step 2.1** — Criar `adrs/decisions/0011-reranking-gemini-flash.md` (formato ADR curto):
    ```markdown
    # ADR-0011 — Reranking via Gemini Flash structured output

    **Status:** Accepted (2026-05-04)
    **Decisão:** Reranking topK=20 → topK=5 via `generateObject` (Vertex Gemini 2.5 Flash) com schema Zod `{ranked: [{index, score}]}`.
    **Razão:** Reaproveita provider Vertex já configurado (zero novo SDK), custo Flash controlado, fallback gracioso para ordem original em caso de erro/timeout. Alternativa Cohere Rerank exigiria novo provider/billing.
    **Consequências:** Latência adicional ~300-700ms por query; mitigado por cache de embeddings de query e topK=20 hardcoded. Reavaliar se p95 > 1.5s.
    ```

- [ ] **Step 2.2** — Instalar runtime deps.
  - Comando: `pnpm add gray-matter` (markdown frontmatter parsing — leve, ~5KB).
  - Verificar `@ai-sdk/google-vertex@^4.0.80` e `ai@^6.0.116` já presentes (são, instalados na Sprint 1.A / pré-existente).
  - Para o fallback OpenAI (não default, somente se `RAG_EMBEDDING_PROVIDER=openai`): `pnpm add @ai-sdk/openai` somente quando ativar; código usa `require()` dinâmico.

- [ ] **Step 2.3** — Validar suporte a embeddings em `@ai-sdk/google-vertex@^4.0.80`.
  - Comando:
    ```bash
    node -e "const v = require('@ai-sdk/google-vertex'); console.log(typeof v.vertex?.textEmbeddingModel)"
    ```
  - Output esperado: `function`. Se `undefined`, ativar fallback OpenAI conforme ADR-0005.

- [ ] **Step 2.4** — Apender `.env.example`:
    ```
    # RAG / Embeddings (ADR-0005)
    RAG_EMBEDDING_PROVIDER=vertex            # vertex | openai
    RAG_EMBEDDING_MODEL=gemini-embedding-001 # vertex default; openai fallback usa text-embedding-3-small
    RAG_RERANK_MODEL=gemini-2.5-flash
    RAG_TOPK_RETRIEVE=20
    RAG_TOPK_RERANK=5
    RAG_INGEST_BATCH_SIZE=20
    OPENAI_API_KEY=                          # fallback only (ADR-0005)
    ```

- [ ] **Step 2.5** — Commit.
  - `chore(rag): ADR-0011 reranking + deps for RAG pipeline`

---

## Task 3 — `chunker.ts` (markdown + json)

**Goal:** Helpers determinísticos de chunking. Estratégia markdown por header (H1/H2) + size cap; estratégia json para glossário/schemas.

- [ ] **Step 3.1 (RED)** — Criar `src/shared/lib/rag/chunker.test.ts`:
    ```ts
    import { describe, it, expect } from 'vitest';
    import { chunkMarkdown, chunkJson } from './chunker';

    describe('chunkMarkdown', () => {
      it('splits by H1/H2 headers', () => {
        const md = '# Title\n\npara1\n\n## Section A\n\npara A\n\n## Section B\n\npara B';
        const chunks = chunkMarkdown(md, { maxChars: 1000 });
        expect(chunks).toHaveLength(3);
        expect(chunks[0].metadata.headingPath).toEqual(['Title']);
        expect(chunks[1].metadata.headingPath).toEqual(['Title', 'Section A']);
        expect(chunks[2].metadata.headingPath).toEqual(['Title', 'Section B']);
      });

      it('respects maxChars by splitting big sections', () => {
        const big = '# T\n\n' + 'x'.repeat(2500);
        const chunks = chunkMarkdown(big, { maxChars: 1000 });
        expect(chunks.length).toBeGreaterThanOrEqual(3);
        for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(1000);
      });

      it('is deterministic for same input', () => {
        const md = '# A\n\nbody\n\n## B\n\nbody2';
        const a = chunkMarkdown(md, { maxChars: 500 });
        const b = chunkMarkdown(md, { maxChars: 500 });
        expect(a).toEqual(b);
      });

      it('extracts frontmatter when present', () => {
        const md = '---\ntitle: X\n---\n# Title\n\nbody';
        const [c] = chunkMarkdown(md, { maxChars: 500 });
        expect(c.metadata.frontmatter).toEqual({ title: 'X' });
      });
    });

    describe('chunkJson', () => {
      it('produces 1 chunk per top-level key', () => {
        const obj = { LTV: 'Loan-to-value...', DSCR: 'Debt service...' };
        const chunks = chunkJson(obj, { keyField: 'term', valueField: 'definition' });
        expect(chunks).toHaveLength(2);
        expect(chunks[0].text).toContain('LTV');
        expect(chunks[1].text).toContain('DSCR');
      });
    });
    ```
  - Comando: `pnpm test:run src/shared/lib/rag/chunker.test.ts` → FAIL (módulo ausente).

- [ ] **Step 3.2 (GREEN)** — Criar `src/shared/lib/rag/chunker.ts`:
    ```ts
    import matter from 'gray-matter';

    export interface Chunk {
      text: string;
      metadata: Record<string, unknown>;
    }

    export function chunkMarkdown(
      raw: string,
      opts: { maxChars?: number } = {}
    ): Chunk[] {
      const maxChars = opts.maxChars ?? 1500;
      const { content, data: frontmatter } = matter(raw);
      const lines = content.split('\n');
      const sections: { headingPath: string[]; body: string[] }[] = [];
      let current: { headingPath: string[]; body: string[] } | null = null;
      const stack: string[] = [];

      for (const line of lines) {
        const m = line.match(/^(#{1,2})\s+(.*)$/);
        if (m) {
          const depth = m[1].length;
          stack.length = depth - 1;
          stack[depth - 1] = m[2].trim();
          current = { headingPath: [...stack].filter(Boolean), body: [] };
          sections.push(current);
        } else {
          if (!current) {
            current = { headingPath: [], body: [] };
            sections.push(current);
          }
          current.body.push(line);
        }
      }

      const out: Chunk[] = [];
      for (const s of sections) {
        const body = s.body.join('\n').trim();
        if (!body) continue;
        const header = s.headingPath.length
          ? `${'#'.repeat(s.headingPath.length)} ${s.headingPath.at(-1)}\n\n`
          : '';
        const fullText = header + body;
        if (fullText.length <= maxChars) {
          out.push({
            text: fullText,
            metadata: {
              headingPath: s.headingPath,
              ...(Object.keys(frontmatter).length ? { frontmatter } : {}),
            },
          });
        } else {
          // overflow: split body in fixed windows preserving header on each
          for (let i = 0; i < body.length; i += maxChars - header.length) {
            const slice = body.slice(i, i + (maxChars - header.length));
            out.push({
              text: header + slice,
              metadata: {
                headingPath: s.headingPath,
                splitOf: i === 0 ? 'first' : 'overflow',
                ...(Object.keys(frontmatter).length ? { frontmatter } : {}),
              },
            });
          }
        }
      }
      return out;
    }

    export function chunkJson(
      obj: Record<string, string>,
      opts: { keyField: string; valueField: string }
    ): Chunk[] {
      return Object.entries(obj).map(([k, v]) => ({
        text: `${opts.keyField}: ${k}\n${opts.valueField}: ${v}`,
        metadata: { [opts.keyField]: k },
      }));
    }
    ```

- [ ] **Step 3.3** — Re-rodar.
  - Comando: `pnpm test:run src/shared/lib/rag/chunker.test.ts` → 5 passed.

- [ ] **Step 3.4** — Commit. `feat(rag): deterministic markdown + json chunkers`

---

## Task 4 — `hash.ts` + `pii-scrubber.ts`

**Goal:** sha256 helper + regex CPF/CNPJ/email para scrub antes de embedar.

- [ ] **Step 4.1 (RED)** — Criar `src/shared/lib/rag/hash.test.ts`:
    ```ts
    import { describe, it, expect } from 'vitest';
    import { contentHash } from './hash';
    describe('contentHash', () => {
      it('produces stable sha256 hex of length 64', () => {
        const h = contentHash('hello');
        expect(h).toMatch(/^[a-f0-9]{64}$/);
        expect(contentHash('hello')).toBe(h);
      });
      it('differs for different inputs', () => {
        expect(contentHash('a')).not.toBe(contentHash('b'));
      });
    });
    ```
- [ ] **Step 4.2 (GREEN)** — Criar `src/shared/lib/rag/hash.ts`:
    ```ts
    import { createHash } from 'node:crypto';
    export function contentHash(text: string): string {
      return createHash('sha256').update(text, 'utf8').digest('hex');
    }
    ```

- [ ] **Step 4.3 (RED)** — Criar `src/shared/lib/rag/pii-scrubber.test.ts`:
    ```ts
    import { describe, it, expect } from 'vitest';
    import { scrubPii } from './pii-scrubber';

    describe('scrubPii', () => {
      it('masks CPF (###.###.###-##)', () => {
        expect(scrubPii('CPF 123.456.789-09 do mutuário')).toBe('CPF [CPF_REDACTED] do mutuário');
      });
      it('masks CPF without separators (11 digits standalone)', () => {
        expect(scrubPii('id 12345678909 fim')).toBe('id [CPF_REDACTED] fim');
      });
      it('masks CNPJ', () => {
        expect(scrubPii('CNPJ 12.345.678/0001-90')).toBe('CNPJ [CNPJ_REDACTED]');
      });
      it('masks emails', () => {
        expect(scrubPii('contato user@dominio.com.br aqui')).toBe('contato [EMAIL_REDACTED] aqui');
      });
      it('preserves non-PII numeric content', () => {
        expect(scrubPii('o LTV foi 75% em 2025')).toBe('o LTV foi 75% em 2025');
      });
      it('chains multiple PII items', () => {
        const out = scrubPii('a@b.com 123.456.789-09 e 12.345.678/0001-90');
        expect(out).toBe('[EMAIL_REDACTED] [CPF_REDACTED] e [CNPJ_REDACTED]');
      });
    });
    ```
- [ ] **Step 4.4 (GREEN)** — Criar `src/shared/lib/rag/pii-scrubber.ts`:
    ```ts
    const CPF_FORMATTED = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
    const CPF_RAW = /(?<![\d.-])\d{11}(?![\d.-])/g;
    const CNPJ = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;
    const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

    export function scrubPii(text: string): string {
      return text
        .replace(EMAIL, '[EMAIL_REDACTED]')
        .replace(CNPJ, '[CNPJ_REDACTED]')
        .replace(CPF_FORMATTED, '[CPF_REDACTED]')
        .replace(CPF_RAW, '[CPF_REDACTED]');
    }
    ```

- [ ] **Step 4.5** — Re-rodar testes.
  - Comando: `pnpm test:run src/shared/lib/rag/hash.test.ts src/shared/lib/rag/pii-scrubber.test.ts` → 8 passed.

- [ ] **Step 4.6** — Commit. `feat(rag): contentHash + PII scrubber (CPF/CNPJ/email)`

---

## Task 5 — `embeddings.ts` (Vertex + fallback OpenAI, retry, batch)

**Goal:** Wrapper de `embedMany` com retry exponencial e batching configurável.

- [ ] **Step 5.1 (RED)** — Criar `src/shared/lib/rag/embeddings.test.ts`:
    ```ts
    import { describe, it, expect, vi, beforeEach } from 'vitest';

    const embedManyMock = vi.fn();
    vi.mock('ai', () => ({ embedMany: (...a: unknown[]) => embedManyMock(...a) }));

    const textEmbeddingModelMock = vi.fn(() => ({ provider: 'vertex' }));
    vi.mock('@ai-sdk/google-vertex', () => ({
      vertex: { textEmbeddingModel: textEmbeddingModelMock },
    }));

    describe('embedTexts', () => {
      beforeEach(() => {
        embedManyMock.mockReset();
        textEmbeddingModelMock.mockClear();
        process.env.RAG_EMBEDDING_PROVIDER = 'vertex';
        process.env.RAG_EMBEDDING_MODEL = 'gemini-embedding-001';
        process.env.RAG_INGEST_BATCH_SIZE = '2';
      });

      it('batches inputs and concatenates embeddings', async () => {
        embedManyMock
          .mockResolvedValueOnce({ embeddings: [[0.1], [0.2]] })
          .mockResolvedValueOnce({ embeddings: [[0.3]] });
        const { embedTexts } = await import('./embeddings');
        const out = await embedTexts(['a', 'b', 'c']);
        expect(out).toEqual([[0.1], [0.2], [0.3]]);
        expect(embedManyMock).toHaveBeenCalledTimes(2);
      });

      it('retries on transient error and succeeds', async () => {
        embedManyMock
          .mockRejectedValueOnce(new Error('429 rate limit'))
          .mockResolvedValueOnce({ embeddings: [[0.5]] });
        const { embedTexts } = await import('./embeddings');
        const out = await embedTexts(['x']);
        expect(out).toEqual([[0.5]]);
      });

      it('throws after maxRetries', async () => {
        embedManyMock.mockRejectedValue(new Error('500'));
        const { embedTexts } = await import('./embeddings');
        await expect(embedTexts(['x'], { maxRetries: 2 })).rejects.toThrow(/500/);
      });
    });
    ```

- [ ] **Step 5.2 (GREEN)** — Criar `src/shared/lib/rag/embeddings.ts`:
    ```ts
    import { embedMany } from 'ai';
    import { vertex } from '@ai-sdk/google-vertex';

    export interface EmbedOptions {
      maxRetries?: number;
      batchSize?: number;
    }

    function getModel() {
      const provider = process.env.RAG_EMBEDDING_PROVIDER ?? 'vertex';
      const modelId = process.env.RAG_EMBEDDING_MODEL ?? 'gemini-embedding-001';
      if (provider === 'vertex') return vertex.textEmbeddingModel(modelId);
      if (provider === 'openai') {
        // dynamic import to avoid hard dep when unused (ADR-0005)
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { openai } = require('@ai-sdk/openai');
        // OpenAI fallback fixed at text-embedding-3-small (1536d) — ignores RAG_EMBEDDING_MODEL
        return openai.embedding('text-embedding-3-small');
      }
      throw new Error(`Unknown RAG_EMBEDDING_PROVIDER=${provider}`);
    }

    async function withRetry<T>(fn: () => Promise<T>, max = 3): Promise<T> {
      let last: unknown;
      for (let i = 0; i < max; i++) {
        try {
          return await fn();
        } catch (e) {
          last = e;
          await new Promise((r) => setTimeout(r, 250 * 2 ** i));
        }
      }
      throw last instanceof Error ? last : new Error(String(last));
    }

    export async function embedTexts(
      values: string[],
      opts: EmbedOptions = {}
    ): Promise<number[][]> {
      const batchSize = opts.batchSize ?? Number(process.env.RAG_INGEST_BATCH_SIZE ?? 20);
      const model = getModel();
      const out: number[][] = [];
      for (let i = 0; i < values.length; i += batchSize) {
        const slice = values.slice(i, i + batchSize);
        const { embeddings } = await withRetry(
          () => embedMany({ model, values: slice }),
          opts.maxRetries ?? 3
        );
        out.push(...embeddings);
      }
      return out;
    }
    ```

- [ ] **Step 5.3** — Re-rodar.
  - Comando: `pnpm test:run src/shared/lib/rag/embeddings.test.ts` → 3 passed.

- [ ] **Step 5.4** — Commit. `feat(rag): embedTexts with batch + exponential retry`

---

## Task 6 — `metadata-extractor.ts` (Gemini structured output)

**Goal:** Para cada chunk de docs/benchmarking, extrair `{docType, product, persona, regulatoryArea}` via `generateObject`.

- [ ] **Step 6.1 (RED)** — Criar `src/shared/lib/rag/metadata-extractor.test.ts`:
    ```ts
    import { describe, it, expect, vi, beforeEach } from 'vitest';

    const generateObjectMock = vi.fn();
    vi.mock('ai', async (orig) => ({
      ...(await orig<typeof import('ai')>()),
      generateObject: (...a: unknown[]) => generateObjectMock(...a),
    }));
    vi.mock('@ai-sdk/google-vertex', () => ({
      vertex: (id: string) => ({ provider: 'vertex', modelId: id }),
    }));

    describe('extractChunkMetadata', () => {
      beforeEach(() => generateObjectMock.mockReset());

      it('returns structured metadata', async () => {
        generateObjectMock.mockResolvedValue({
          object: { docType: 'regulatory', product: 'CRI', persona: 'securitizadora', regulatoryArea: 'CVM-60' },
        });
        const { extractChunkMetadata } = await import('./metadata-extractor');
        const m = await extractChunkMetadata('CRI sob CVM 60 ...', { sourcePath: 'docs/benchmarking/2 1.md' });
        expect(m.docType).toBe('regulatory');
        expect(m.product).toBe('CRI');
      });

      it('returns nulls when extractor cannot classify', async () => {
        generateObjectMock.mockResolvedValue({
          object: { docType: null, product: null, persona: null, regulatoryArea: null },
        });
        const { extractChunkMetadata } = await import('./metadata-extractor');
        const m = await extractChunkMetadata('texto genérico', { sourcePath: 'x.md' });
        expect(m.docType).toBeNull();
      });

      it('falls back to nulls on extractor error', async () => {
        generateObjectMock.mockRejectedValue(new Error('quota'));
        const { extractChunkMetadata } = await import('./metadata-extractor');
        const m = await extractChunkMetadata('t', { sourcePath: 'x.md' });
        expect(m).toEqual({ docType: null, product: null, persona: null, regulatoryArea: null });
      });
    });
    ```

- [ ] **Step 6.2 (GREEN)** — Criar `src/shared/lib/rag/metadata-extractor.ts`:
    ```ts
    import { generateObject } from 'ai';
    import { vertex } from '@ai-sdk/google-vertex';
    import { z } from 'zod';

    export const ChunkMetadataSchema = z.object({
      docType: z.enum(['regulatory', 'market', 'persona', 'methodology', 'benchmark']).nullable(),
      product: z.enum(['MCMV', 'SBPE', 'LCI', 'CRI', 'CRA', 'SPE', 'BQML', 'OTHER']).nullable(),
      persona: z.enum(['originador', 'securitizadora', 'gestor_fundo', 'incorporadora', 'analista']).nullable(),
      regulatoryArea: z.string().nullable(),
    });
    export type ChunkMetadata = z.infer<typeof ChunkMetadataSchema>;

    export async function extractChunkMetadata(
      text: string,
      ctx: { sourcePath: string }
    ): Promise<ChunkMetadata> {
      try {
        const { object } = await generateObject({
          model: vertex(process.env.RAG_EXTRACTOR_MODEL ?? 'gemini-2.5-flash'),
          schema: ChunkMetadataSchema,
          temperature: 0,
          prompt: `Classifique este chunk de documento de benchmark de crédito imobiliário.\n\nArquivo: ${ctx.sourcePath}\n\nConteúdo:\n${text.slice(0, 2000)}\n\nRetorne null nos campos sem evidência clara.`,
        });
        return object;
      } catch {
        return { docType: null, product: null, persona: null, regulatoryArea: null };
      }
    }
    ```

- [ ] **Step 6.3** — Re-rodar.
  - Comando: `pnpm test:run src/shared/lib/rag/metadata-extractor.test.ts` → 3 passed.

- [ ] **Step 6.4** — Commit. `feat(rag): metadata extractor via Gemini structured output`

---

## Task 7 — `rag-service.ts` (upsert + query com filtro `clientId` mandatório)

**Goal:** API única para upsert e query nos 3 índices, sempre injetando `clientId` no WHERE.

- [ ] **Step 7.1 (RED)** — Criar `src/shared/lib/rag/rag-service.test.ts`:
    ```ts
    import { describe, it, expect, vi, beforeEach } from 'vitest';

    const queryMock = vi.fn();
    vi.mock('@/shared/lib/memory/pool', () => ({ getPool: () => ({ query: queryMock }) }));

    describe('RagService.upsertDoc', () => {
      beforeEach(() => queryMock.mockReset());

      it('inserts with all metadata fields and embedding', async () => {
        queryMock.mockResolvedValueOnce({ rows: [{ id: 'u1' }] });
        const { upsertDoc } = await import('./rag-service');
        await upsertDoc({
          sourcePath: 'docs/benchmarking/x.md',
          chunkIndex: 0,
          content: 'body',
          contentHash: 'h',
          embedding: [0.1, 0.2],
          embeddingModel: 'gemini-embedding-001',
          clientId: 'OM',
          docType: 'regulatory',
          product: 'CRI',
          persona: 'securitizadora',
          regulatoryArea: 'CVM-60',
          metadata: { headingPath: ['Title'] },
        });
        expect(queryMock).toHaveBeenCalledOnce();
        const [sql, params] = queryMock.mock.calls[0];
        expect(sql).toMatch(/INSERT INTO embeddings_docs/i);
        expect(sql).toMatch(/ON CONFLICT/i);
        expect(params[0]).toBe('docs/benchmarking/x.md');
      });
    });

    describe('RagService.queryDocs', () => {
      beforeEach(() => queryMock.mockReset());

      it('REQUIRES clientId filter', async () => {
        const { queryDocs } = await import('./rag-service');
        // @ts-expect-error testing runtime guard
        await expect(queryDocs({ embedding: [0.1], topK: 5 })).rejects.toThrow(/clientId/);
      });

      it('builds SQL with cosine distance and clientId filter', async () => {
        queryMock.mockResolvedValueOnce({
          rows: [{ id: 'a', content: 'c', metadata: {}, similarity: 0.9 }],
        });
        const { queryDocs } = await import('./rag-service');
        const out = await queryDocs({ embedding: [0.1, 0.2], topK: 5, clientId: 'OM' });
        expect(out).toHaveLength(1);
        const [sql, params] = queryMock.mock.calls[0];
        expect(sql).toMatch(/embedding <=> /);
        expect(sql).toMatch(/client_id = \$/);
        expect(params).toContain('OM');
      });

      it('applies optional product/persona filters', async () => {
        queryMock.mockResolvedValueOnce({ rows: [] });
        const { queryDocs } = await import('./rag-service');
        await queryDocs({
          embedding: [0.1],
          topK: 5,
          clientId: 'OM',
          filters: { product: 'CRI', persona: 'securitizadora' },
        });
        const [sql, params] = queryMock.mock.calls[0];
        expect(sql).toMatch(/AND product = /);
        expect(sql).toMatch(/AND persona = /);
        expect(params).toContain('CRI');
        expect(params).toContain('securitizadora');
      });
    });
    ```

- [ ] **Step 7.2 (GREEN)** — Criar `src/shared/lib/rag/rag-service.ts`:
    ```ts
    import { getPool } from '@/shared/lib/memory/pool';

    export interface UpsertDocInput {
      sourcePath: string;
      chunkIndex: number;
      content: string;
      contentHash: string;
      embedding: number[];
      embeddingModel: string;
      clientId: string;
      docType: string | null;
      product: string | null;
      persona: string | null;
      regulatoryArea: string | null;
      metadata: Record<string, unknown>;
    }

    function vecLiteral(v: number[]): string {
      return `[${v.join(',')}]`;
    }

    export async function upsertDoc(i: UpsertDocInput): Promise<void> {
      const pool = getPool();
      await pool.query(
        `INSERT INTO embeddings_docs (
           source_path, chunk_index, content, content_hash, embedding, embedding_model,
           client_id, doc_type, product, persona, regulatory_area, metadata
         ) VALUES ($1,$2,$3,$4,$5::vector,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (source_path, chunk_index, embedding_model)
         DO UPDATE SET content = EXCLUDED.content,
                       content_hash = EXCLUDED.content_hash,
                       embedding = EXCLUDED.embedding,
                       client_id = EXCLUDED.client_id,
                       doc_type = EXCLUDED.doc_type,
                       product = EXCLUDED.product,
                       persona = EXCLUDED.persona,
                       regulatory_area = EXCLUDED.regulatory_area,
                       metadata = EXCLUDED.metadata`,
        [
          i.sourcePath, i.chunkIndex, i.content, i.contentHash,
          vecLiteral(i.embedding), i.embeddingModel,
          i.clientId, i.docType, i.product, i.persona, i.regulatoryArea, i.metadata,
        ]
      );
    }

    export interface QueryDocsInput {
      embedding: number[];
      topK: number;
      clientId: string; // REQUIRED — multi-tenancy hard
      filters?: { product?: string; persona?: string; docType?: string };
    }

    export interface QueryDocsHit {
      id: string;
      sourcePath: string;
      content: string;
      metadata: Record<string, unknown>;
      similarity: number;
    }

    export async function queryDocs(input: QueryDocsInput): Promise<QueryDocsHit[]> {
      if (!input.clientId) {
        throw new Error('queryDocs requires clientId (multi-tenancy hard requirement)');
      }
      const params: unknown[] = [vecLiteral(input.embedding), input.clientId];
      let where = `client_id = $2`;
      if (input.filters?.product) {
        params.push(input.filters.product);
        where += ` AND product = $${params.length}`;
      }
      if (input.filters?.persona) {
        params.push(input.filters.persona);
        where += ` AND persona = $${params.length}`;
      }
      if (input.filters?.docType) {
        params.push(input.filters.docType);
        where += ` AND doc_type = $${params.length}`;
      }
      params.push(input.topK);
      const sql = `SELECT id, source_path, content, metadata,
                          1 - (embedding <=> $1::vector) AS similarity
                   FROM embeddings_docs
                   WHERE ${where}
                   ORDER BY embedding <=> $1::vector
                   LIMIT $${params.length}`;
      const { rows } = await getPool().query(sql, params);
      return rows.map((r) => ({
        id: r.id,
        sourcePath: r.source_path,
        content: r.content,
        metadata: r.metadata,
        similarity: Number(r.similarity),
      }));
    }

    export async function getExistingHashes(
      sourcePath: string
    ): Promise<Map<number, string>> {
      const { rows } = await getPool().query(
        `SELECT chunk_index, content_hash FROM embeddings_docs WHERE source_path = $1`,
        [sourcePath]
      );
      return new Map(rows.map((r) => [r.chunk_index as number, r.content_hash as string]));
    }
    ```

- [ ] **Step 7.3** — Re-rodar.
  - Comando: `pnpm test:run src/shared/lib/rag/rag-service.test.ts` → 4 passed.

- [ ] **Step 7.4** — Commit. `feat(rag): RagService upsert/query with clientId enforcement`

---

## Task 8 — `reranker.ts` (Gemini Flash, 20→5)

**Goal:** Reordenar topK=20 candidatos para topK=5 finais via structured output.

- [ ] **Step 8.1 (RED)** — Criar `src/shared/lib/rag/reranker.test.ts`:
    ```ts
    import { describe, it, expect, vi, beforeEach } from 'vitest';

    const generateObjectMock = vi.fn();
    vi.mock('ai', async (orig) => ({
      ...(await orig<typeof import('ai')>()),
      generateObject: (...a: unknown[]) => generateObjectMock(...a),
    }));
    vi.mock('@ai-sdk/google-vertex', () => ({ vertex: (id: string) => ({ id }) }));

    describe('rerank', () => {
      beforeEach(() => generateObjectMock.mockReset());

      it('returns topN in score order', async () => {
        generateObjectMock.mockResolvedValue({
          object: { ranked: [
            { index: 2, score: 0.95 },
            { index: 0, score: 0.7 },
            { index: 1, score: 0.4 },
          ] },
        });
        const { rerank } = await import('./reranker');
        const docs = [{ content: 'a' }, { content: 'b' }, { content: 'c' }] as never;
        const out = await rerank({ query: 'q', candidates: docs, topN: 2 });
        expect(out.map((d) => d.content)).toEqual(['c', 'a']);
      });

      it('falls back to original order on rerank failure', async () => {
        generateObjectMock.mockRejectedValue(new Error('boom'));
        const { rerank } = await import('./reranker');
        const docs = [{ content: 'a' }, { content: 'b' }] as never;
        const out = await rerank({ query: 'q', candidates: docs, topN: 5 });
        expect(out).toEqual(docs);
      });
    });
    ```

- [ ] **Step 8.2 (GREEN)** — Criar `src/shared/lib/rag/reranker.ts`:
    ```ts
    import { generateObject } from 'ai';
    import { vertex } from '@ai-sdk/google-vertex';
    import { z } from 'zod';

    const RankSchema = z.object({
      ranked: z.array(z.object({ index: z.number().int(), score: z.number() })),
    });

    export interface Candidate {
      content: string;
      similarity: number;
      [k: string]: unknown;
    }

    export async function rerank<T extends Candidate>(input: {
      query: string;
      candidates: T[];
      topN: number;
    }): Promise<T[]> {
      if (input.candidates.length <= input.topN) return input.candidates;
      const docs = input.candidates
        .map((c, i) => `[${i}] ${c.content.slice(0, 800)}`)
        .join('\n\n---\n\n');
      try {
        const { object } = await generateObject({
          model: vertex(process.env.RAG_RERANK_MODEL ?? 'gemini-2.5-flash'),
          schema: RankSchema,
          temperature: 0,
          prompt: `Reordene os documentos por relevância à query.\nQuery: ${input.query}\n\nDocumentos:\n${docs}\n\nRetorne ranked com index original e score 0..1.`,
        });
        const sorted = [...object.ranked].sort((a, b) => b.score - a.score).slice(0, input.topN);
        return sorted.map((r) => input.candidates[r.index]).filter(Boolean);
      } catch {
        return input.candidates.slice(0, input.topN);
      }
    }
    ```

- [ ] **Step 8.3** — Re-rodar.
  - Comando: `pnpm test:run src/shared/lib/rag/reranker.test.ts` → 2 passed.

- [ ] **Step 8.4** — Commit. `feat(rag): Gemini Flash reranker with fallback`

---

## Task 9 — Script `scripts/ingest-rag.ts`

**Goal:** CLI idempotente: lê `docs/benchmarking/`, glossário e schemas BQ; chunk → scrub → hash → embed → upsert. Pula chunks com hash idêntico.

- [ ] **Step 9.1 (RED)** — Criar `scripts/ingest-rag.test.ts`:
    ```ts
    import { describe, it, expect, vi, beforeEach } from 'vitest';
    import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
    import { tmpdir } from 'node:os';
    import { join } from 'node:path';

    const upsertDocMock = vi.fn();
    const getExistingHashesMock = vi.fn();
    const embedTextsMock = vi.fn();
    const extractChunkMetadataMock = vi.fn();

    vi.mock('@/shared/lib/rag/rag-service', () => ({
      upsertDoc: (...a: unknown[]) => upsertDocMock(...a),
      getExistingHashes: (...a: unknown[]) => getExistingHashesMock(...a),
    }));
    vi.mock('@/shared/lib/rag/embeddings', () => ({
      embedTexts: (...a: unknown[]) => embedTextsMock(...a),
    }));
    vi.mock('@/shared/lib/rag/metadata-extractor', () => ({
      extractChunkMetadata: (...a: unknown[]) => extractChunkMetadataMock(...a),
    }));

    describe('ingestDocs (script)', () => {
      let dir: string;
      beforeEach(() => {
        upsertDocMock.mockReset();
        getExistingHashesMock.mockReset().mockResolvedValue(new Map());
        embedTextsMock.mockReset();
        extractChunkMetadataMock.mockReset().mockResolvedValue({
          docType: null, product: null, persona: null, regulatoryArea: null,
        });
        dir = mkdtempSync(join(tmpdir(), 'rag-'));
        mkdirSync(join(dir, 'sub'), { recursive: true });
        writeFileSync(join(dir, 'a.md'), '# A\n\nbody A');
        writeFileSync(join(dir, 'b.md'), '# B\n\nbody B');
      });

      it('chunks, embeds and upserts each file', async () => {
        embedTextsMock.mockResolvedValue([[0.1], [0.2]]);
        const { ingestDocs } = await import('./ingest-rag');
        await ingestDocs({ docsDir: dir, clientId: 'OM' });
        expect(upsertDocMock).toHaveBeenCalledTimes(2);
      });

      it('skips chunks whose hash matches existing', async () => {
        const { contentHash } = await import('@/shared/lib/rag/hash');
        const { chunkMarkdown } = await import('@/shared/lib/rag/chunker');
        const text = '# A\n\nbody A';
        const [c] = chunkMarkdown(text, { maxChars: 1500 });
        getExistingHashesMock.mockImplementation(async (sp: string) =>
          sp.endsWith('a.md') ? new Map([[0, contentHash(c.text)]]) : new Map()
        );
        embedTextsMock.mockResolvedValue([[0.9]]);
        const { ingestDocs } = await import('./ingest-rag');
        await ingestDocs({ docsDir: dir, clientId: 'OM' });
        // a.md skipped, b.md inserted
        expect(upsertDocMock).toHaveBeenCalledTimes(1);
        expect(upsertDocMock.mock.calls[0][0].sourcePath).toContain('b.md');
      });
    });
    ```

- [ ] **Step 9.2 (GREEN)** — Criar `scripts/ingest-rag.ts`:
    ```ts
    import { readdirSync, readFileSync, statSync } from 'node:fs';
    import { join } from 'node:path';
    import { chunkMarkdown } from '@/shared/lib/rag/chunker';
    import { contentHash } from '@/shared/lib/rag/hash';
    import { scrubPii } from '@/shared/lib/rag/pii-scrubber';
    import { embedTexts } from '@/shared/lib/rag/embeddings';
    import { extractChunkMetadata } from '@/shared/lib/rag/metadata-extractor';
    import { upsertDoc, getExistingHashes } from '@/shared/lib/rag/rag-service';

    function walkMd(dir: string): string[] {
      const out: string[] = [];
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) out.push(...walkMd(p));
        else if (entry.endsWith('.md')) out.push(p);
      }
      return out;
    }

    export async function ingestDocs(opts: { docsDir: string; clientId: string }) {
      const t0 = Date.now();
      const files = walkMd(opts.docsDir);
      const model = process.env.RAG_EMBEDDING_MODEL ?? 'gemini-embedding-001';
      let inserted = 0,
        skipped = 0;
      for (const file of files) {
        const raw = readFileSync(file, 'utf8');
        const chunks = chunkMarkdown(raw);
        const existing = await getExistingHashes(file);
        const newOnes: { idx: number; text: string; hash: string; metadata: Record<string, unknown> }[] = [];
        for (let i = 0; i < chunks.length; i++) {
          const scrubbed = scrubPii(chunks[i].text);
          const h = contentHash(scrubbed);
          if (existing.get(i) === h) {
            skipped++;
            continue;
          }
          newOnes.push({ idx: i, text: scrubbed, hash: h, metadata: chunks[i].metadata });
        }
        if (newOnes.length === 0) continue;
        const embeddings = await embedTexts(newOnes.map((n) => n.text));
        for (let k = 0; k < newOnes.length; k++) {
          const n = newOnes[k];
          const md = await extractChunkMetadata(n.text, { sourcePath: file });
          await upsertDoc({
            sourcePath: file,
            chunkIndex: n.idx,
            content: n.text,
            contentHash: n.hash,
            embedding: embeddings[k],
            embeddingModel: model,
            clientId: opts.clientId,
            docType: md.docType,
            product: md.product,
            persona: md.persona,
            regulatoryArea: md.regulatoryArea,
            metadata: n.metadata,
          });
          inserted++;
        }
      }
      console.log(JSON.stringify({
        component: 'rag-ingest', event: 'docs.done',
        files: files.length, inserted, skipped, durationMs: Date.now() - t0,
      }));
    }

    if (require.main === module) {
      const docsDir = process.argv[2] ?? 'docs/benchmarking';
      const clientId = process.env.RAG_CLIENT_ID ?? 'OM';
      ingestDocs({ docsDir, clientId }).catch((e) => {
        console.error(e);
        process.exit(1);
      });
    }
    ```

- [ ] **Step 9.3** — Adicionar scripts em `package.json`:
    ```json
    "rag:ingest": "tsx scripts/ingest-rag.ts",
    "rag:refresh": "tsx scripts/refresh-rag.ts",
    "rag:smoke": "tsx scripts/rag-smoke.ts"
    ```

- [ ] **Step 9.4** — Re-rodar.
  - Comando: `pnpm test:run scripts/ingest-rag.test.ts` → 2 passed.

- [ ] **Step 9.5** — Commit. `feat(rag): ingest-rag script with hash incremental + PII scrub`

---

## Task 10 — Tool `vector_query` (canvas + analítico)

**Goal:** Tool exposta aos orchestrators. Filtro `clientId` derivado de `dataset` do request, jamais aceito como input do modelo.

- [ ] **Step 10.1 (RED)** — Criar `src/features/ai-agents/tools/vector-query.test.ts`:
    ```ts
    import { describe, it, expect, vi, beforeEach } from 'vitest';

    const queryDocsMock = vi.fn();
    const embedTextsMock = vi.fn();
    const rerankMock = vi.fn();

    vi.mock('@/shared/lib/rag/rag-service', () => ({ queryDocs: queryDocsMock }));
    vi.mock('@/shared/lib/rag/embeddings', () => ({ embedTexts: embedTextsMock }));
    vi.mock('@/shared/lib/rag/reranker', () => ({ rerank: rerankMock }));

    describe('createVectorQueryTool', () => {
      beforeEach(() => {
        queryDocsMock.mockReset();
        embedTextsMock.mockReset().mockResolvedValue([[0.1, 0.2]]);
        rerankMock.mockReset().mockImplementation(async ({ candidates, topN }) => candidates.slice(0, topN));
      });

      it('binds clientId from context, not from input', async () => {
        queryDocsMock.mockResolvedValue([
          { id: '1', sourcePath: 'x.md', content: 'a', metadata: {}, similarity: 0.9 },
        ]);
        const { createVectorQueryTool } = await import('./vector-query');
        const tool = createVectorQueryTool({ clientId: 'OM' });
        const r = await tool.execute(
          { query: 'CRI CVM 60', filters: { product: 'CRI' } },
          { toolCallId: 't', messages: [] } as never
        );
        expect(queryDocsMock).toHaveBeenCalledOnce();
        const call = queryDocsMock.mock.calls[0][0];
        expect(call.clientId).toBe('OM');
        expect(r.hits).toHaveLength(1);
      });

      it('rejects input attempting clientId override at runtime', async () => {
        const { createVectorQueryTool } = await import('./vector-query');
        const tool = createVectorQueryTool({ clientId: 'OM' });
        // @ts-expect-error
        await tool.execute({ query: 'q', filters: { clientId: 'BRZ' } }, { toolCallId: 't', messages: [] } as never);
        // ensure context wins
        expect(queryDocsMock.mock.calls[0][0].clientId).toBe('OM');
      });

      it('reranks topK=20 → topK=5', async () => {
        queryDocsMock.mockResolvedValue(
          Array.from({ length: 20 }, (_, i) => ({
            id: `${i}`, sourcePath: 'x.md', content: `c${i}`, metadata: {}, similarity: 1 - i * 0.01,
          }))
        );
        const { createVectorQueryTool } = await import('./vector-query');
        const tool = createVectorQueryTool({ clientId: 'OM' });
        const r = await tool.execute({ query: 'q' }, { toolCallId: 't', messages: [] } as never);
        expect(r.hits).toHaveLength(5);
        expect(rerankMock).toHaveBeenCalledOnce();
      });
    });
    ```

- [ ] **Step 10.2 (GREEN)** — Criar `src/features/ai-agents/tools/vector-query.ts`:
    ```ts
    import { tool } from 'ai';
    import { z } from 'zod';
    import { embedTexts } from '@/shared/lib/rag/embeddings';
    import { queryDocs } from '@/shared/lib/rag/rag-service';
    import { rerank } from '@/shared/lib/rag/reranker';

    const InputSchema = z.object({
      query: z.string().min(1),
      filters: z
        .object({
          product: z.string().nullable(),
          persona: z.string().nullable(),
          docType: z.string().nullable(),
        })
        .partial()
        .nullable(),
    });

    export function createVectorQueryTool(ctx: { clientId: string }) {
      return tool({
        description:
          'Busca semântica no corpus de docs/benchmarking, glossário e schemas BQ. Filtro multi-tenant aplicado automaticamente. Use SEMPRE que precisar de contexto regulatório (CVM 60, BACEN, SBPE, MCMV, CRI/CRA), definições de métricas (LTV, DSCR, PDD), ou esquema de tabela BQ.',
        inputSchema: InputSchema,
        execute: async (input) => {
          const topKRetrieve = Number(process.env.RAG_TOPK_RETRIEVE ?? 20);
          const topKRerank = Number(process.env.RAG_TOPK_RERANK ?? 5);
          const [embedding] = await embedTexts([input.query]);
          const candidates = await queryDocs({
            embedding,
            topK: topKRetrieve,
            clientId: ctx.clientId, // hard binding from server context
            filters: {
              product: input.filters?.product ?? undefined,
              persona: input.filters?.persona ?? undefined,
              docType: input.filters?.docType ?? undefined,
            },
          });
          const reranked = await rerank({
            query: input.query,
            candidates,
            topN: topKRerank,
          });
          return {
            hits: reranked.map((h) => ({
              sourcePath: h.sourcePath,
              content: h.content,
              similarity: h.similarity,
              metadata: h.metadata,
            })),
          };
        },
      });
    }
    ```

- [ ] **Step 10.3 (wire canvas)** — Modificar `src/features/canvas-orchestrator/orchestrator.ts`:
  - Importar `createVectorQueryTool`.
  - Adicionar em `tools`: `vector_query: createVectorQueryTool({ clientId: input.dataset })`.

- [ ] **Step 10.4 (wire analítico)** — Modificar `src/features/ai-agents/orchestrator.ts`:
  - Importar e adicionar `vector_query: createVectorQueryTool({ clientId: input.dataset })`.

- [ ] **Step 10.5** — Atualizar prompts em `src/shared/config/agents/canvas-orchestrator.ts` e equivalente analítico:
  - Acrescentar bloco "Recuperação contextual": "Antes de gerar SQL ou block, considere chamar `vector_query` para puxar contexto regulatório / definições / schemas. Filtro `clientId` é automático."

- [ ] **Step 10.6** — Re-rodar.
  - Comando: `pnpm test:run src/features/ai-agents/tools/vector-query.test.ts` → 3 passed.

- [ ] **Step 10.7** — Commit. `feat(ai-agents): vector_query tool with hard clientId binding`

---

## Task 11 — Cron mensal `scripts/refresh-rag.ts`

**Goal:** Detecta drift via hash; reembeda apenas chunks alterados; também revalida schemas BQ semanalmente.

- [ ] **Step 11.1** — Criar `scripts/refresh-rag.ts`:
    ```ts
    import { ingestDocs } from './ingest-rag';

    async function main() {
      const docsDir = process.env.RAG_DOCS_DIR ?? 'docs/benchmarking';
      const clientId = process.env.RAG_CLIENT_ID ?? 'OM';
      // ingest-rag is already incremental via hash diff; refresh = invocar de novo.
      await ingestDocs({ docsDir, clientId });
      // TODO Sprint 2.B: revalidar schemas BQ via INFORMATION_SCHEMA diff
      console.log(JSON.stringify({ component: 'rag-refresh', event: 'done' }));
    }

    if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
    ```

- [ ] **Step 11.2** — Documentar uso de Cloud Scheduler em `docs/superpowers/specs/2026-05-04-sprint2-A-acceptance.md` (Task 13). Cron sugerido: `0 3 1 * *` (mensal, 03h UTC dia 1).

- [ ] **Step 11.3** — Commit. `feat(rag): monthly refresh script (hash drift)`

---

## Task 12 — Telemetria

**Goal:** Métricas estruturadas por etapa: latência ingestão por arquivo, recall@k em smoke, custo aproximado de embeddings.

- [ ] **Step 12.1 (RED)** — Criar `src/shared/lib/rag/metrics.test.ts`:
    ```ts
    import { describe, it, expect, vi, afterEach } from 'vitest';
    import { recordRagMetric } from './metrics';

    describe('recordRagMetric', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      afterEach(() => spy.mockClear());

      it('emits structured JSON with required fields', () => {
        recordRagMetric({ event: 'embed.batch', durationMs: 120, count: 20 });
        const line = spy.mock.calls[0][0] as string;
        const parsed = JSON.parse(line);
        expect(parsed).toMatchObject({
          severity: 'INFO', component: 'rag', event: 'embed.batch', durationMs: 120, count: 20,
        });
      });
    });
    ```

- [ ] **Step 12.2 (GREEN)** — Criar `src/shared/lib/rag/metrics.ts`:
    ```ts
    export interface RagMetric {
      event: string;
      durationMs?: number;
      count?: number;
      sourcePath?: string;
      ok?: boolean;
      error?: string;
      [k: string]: unknown;
    }

    export function recordRagMetric(m: RagMetric): void {
      console.log(JSON.stringify({
        severity: 'INFO',
        component: 'rag',
        timestamp: new Date().toISOString(),
        ...m,
      }));
    }
    ```

- [ ] **Step 12.3** — Instrumentar `embedTexts`, `ingestDocs` (por arquivo) e `vector_query.execute` (latência total).

- [ ] **Step 12.4** — Re-rodar testes.
  - Comando: `pnpm test:run src/shared/lib/rag` → todas suites passam.

- [ ] **Step 12.5** — Commit. `feat(rag): structured telemetry across pipeline`

---

## Task 13 — Smoke E2E (gold dataset 20 queries + cross-tenant test)

**Goal:** Roteiro reproduzível de aceite. Inclui dataset "gold" de 20 queries cobrindo OM/BRZ/CONX/IMCASA com gabarito esperado (sourcePath top-1).

- [ ] **Step 13.1** — Criar `scripts/rag-smoke.ts`:
    ```ts
    import { embedTexts } from '@/shared/lib/rag/embeddings';
    import { queryDocs } from '@/shared/lib/rag/rag-service';
    import { rerank } from '@/shared/lib/rag/reranker';

    interface GoldRow {
      query: string;
      clientId: string;
      expectedSourceContains: string;
    }

    const GOLD: GoldRow[] = [
      { query: 'O que define LTV em crédito imobiliário?', clientId: 'OM', expectedSourceContains: 'LTV, DSCR' },
      { query: 'Como funciona PDD BACEN vs PDD projetada?', clientId: 'OM', expectedSourceContains: 'PDD' },
      { query: 'Regras de distrato pela Lei 13.786/2018', clientId: 'BRZ', expectedSourceContains: 'Distratos' },
      { query: 'Estrutura de CRI sob CVM 60', clientId: 'BRZ', expectedSourceContains: 'CRI' },
      { query: 'SBPE poupança aplicações imobiliárias', clientId: 'CONX', expectedSourceContains: 'SBPE' },
      { query: 'Patrimônio de afetação SPE RET', clientId: 'CONX', expectedSourceContains: 'SPE' },
      { query: 'Curva-S de venda no plano empresário', clientId: 'IMCASA', expectedSourceContains: 'Curvas' },
      { query: 'INCC IPCA correção monetária', clientId: 'IMCASA', expectedSourceContains: 'Correção' },
      // ... completar 20 totalizando todos os clientes
      { query: 'Open Finance crédito imobiliário', clientId: 'OM', expectedSourceContains: 'Open Finance' },
      { query: 'Personas mercado crédito imobiliário', clientId: 'BRZ', expectedSourceContains: 'Personas' },
      { query: 'Indicadores ABRAINC CBIC FipeZap', clientId: 'CONX', expectedSourceContains: 'Benchmarks' },
      { query: 'Dados abertos MCMV', clientId: 'IMCASA', expectedSourceContains: 'MCMV' },
      { query: 'LCI funding bancário', clientId: 'OM', expectedSourceContains: 'LCI' },
      { query: 'Selic curva juros impacto', clientId: 'BRZ', expectedSourceContains: 'Selic' },
      { query: 'SINAPI insumos construção', clientId: 'CONX', expectedSourceContains: 'SINAPI' },
      { query: 'Registro imobiliário processos', clientId: 'IMCASA', expectedSourceContains: 'Registro' },
      { query: 'HIS HMP certificação renda', clientId: 'OM', expectedSourceContains: 'Certificação' },
      { query: 'Repasse bancário processo obra', clientId: 'BRZ', expectedSourceContains: 'Repasse' },
      { query: 'Indicadores BACEN', clientId: 'CONX', expectedSourceContains: 'Banco Central' },
      { query: 'Cenário macro real estate Brasil', clientId: 'IMCASA', expectedSourceContains: 'Cenário Macro' },
    ];

    async function main() {
      let hits = 0;
      const adversarial: { row: GoldRow; ok: boolean }[] = [];
      for (const row of GOLD) {
        const [emb] = await embedTexts([row.query]);
        const cands = await queryDocs({ embedding: emb, topK: 20, clientId: row.clientId });
        const top5 = await rerank({ query: row.query, candidates: cands, topN: 5 });
        const matched = top5.some((h) => h.sourcePath.includes(row.expectedSourceContains));
        if (matched) hits++;
        // adversarial: same query but with WRONG clientId — must NOT recall
        const otherClient = row.clientId === 'OM' ? 'BRZ' : 'OM';
        const advCands = await queryDocs({ embedding: emb, topK: 5, clientId: otherClient });
        // we permit recall if the same content was ingested for that client; only flag
        // if the SPECIFIC chunk metadata indicates leak (sourcePath identical AND no shared corpus).
        const leaked = advCands.some(
          (c) => c.sourcePath.includes(row.expectedSourceContains)
        );
        adversarial.push({ row, ok: !leaked });
      }
      const recall = hits / GOLD.length;
      const advFails = adversarial.filter((a) => !a.ok).length;
      console.log(JSON.stringify({
        component: 'rag-smoke', recallAt5: recall, totalQueries: GOLD.length, adversarialFails: advFails,
      }));
      if (recall < 0.8) {
        console.error(`FAIL: recall@5 ${recall} < 0.8`);
        process.exit(2);
      }
      if (advFails > 0) {
        console.error(`FAIL: cross-tenant leak in ${advFails} queries`);
        process.exit(3);
      }
    }

    if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
    ```

- [ ] **Step 13.2** — Criar `docs/superpowers/specs/2026-05-04-sprint2-A-acceptance.md`:
    ```markdown
    # Sprint 2.A — Acceptance smoke test

    ## Pré-requisitos
    - Sprint 1.A aplicado (Postgres local rodando, vitest configurado).
    - `.env.local` com `DATABASE_URL`, `GOOGLE_APPLICATION_CREDENTIALS` (Vertex), `RAG_EMBEDDING_PROVIDER=vertex`.

    ## Passos
    1. Aplicar migration: `pnpm migrate` → confirmar tabelas `embeddings_*`.
    2. Ingestão dev: `RAG_CLIENT_ID=OM pnpm rag:ingest docs/benchmarking` → log final mostra `inserted > 0`, `skipped == 0` na primeira execução.
    3. Re-execução: `pnpm rag:ingest` → `inserted == 0`, `skipped > 0` (idempotência).
    4. Repetir passos 2-3 para `RAG_CLIENT_ID=BRZ`, `CONX`, `IMCASA`.
    5. Smoke gold: `pnpm rag:smoke` → exit code 0; `recallAt5 ≥ 0.8`; `adversarialFails == 0`.
    6. Manual chat: `pnpm dev` → abrir AI Sidebar → perguntar "Como funciona CVM 60 para CRIs?" → resposta deve citar `docs/benchmarking/1 6 CVM 60 ...md`.

    ## Cron deploy
    - Cloud Scheduler: `0 3 1 * *` chamando Cloud Run job `rag-refresh` que executa `pnpm rag:refresh`.

    ## Critérios de aprovação
    - [ ] recall@5 ≥ 0.8 em 20 queries gold
    - [ ] zero leak cross-tenant
    - [ ] ingestão completa <15min (medido em `rag-ingest` log final)
    - [ ] `pnpm test:run` verde, cobertura ≥80% em `src/shared/lib/rag/`
    - [ ] `pnpm build` sem warnings
    ```

- [ ] **Step 13.3** — Commit. `docs(rag): sprint 2.A acceptance + gold dataset smoke`

---

## Acceptance Criteria

- [ ] `pnpm test:run` verde, cobertura ≥80% em `src/shared/lib/rag/` e `src/features/ai-agents/tools/vector-query.ts`.
- [ ] `pnpm rag:ingest` em corpus completo (31 docs × 4 clientes) finaliza em **<15min** wall-clock no dev local.
- [ ] `pnpm rag:smoke` reporta **recall@5 ≥ 0.8** em 20 queries gold.
- [ ] `pnpm rag:smoke` reporta **0 leaks cross-tenant** no teste adversarial.
- [ ] Re-execução do `rag:ingest` em corpus inalterado: 0 chamadas a `embedMany` (validar via log `embed.batch.count == 0`).
- [ ] PII: rodar `grep -E '\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}|\\d{2}\\.\\d{3}\\.\\d{3}/\\d{4}-\\d{2}' <(psql -c "SELECT content FROM embeddings_docs")` retorna 0 linhas.
- [ ] `vector_query` tool aparece em `tools` de ambos orchestrators e prompt menciona retrieval.
- [ ] `pnpm build` sem warnings novos. `pnpm lint` clean.
- [ ] ADR-0011 (reranking) criado em `adrs/decisions/`; ADR-0002/0004/0005/0006 referenciados (já aceitas).

---

## Riscos e rollback

| Risco | Mitigação | Rollback |
|---|---|---|
| Custo embedding maior que estimado (Vertex `gemini-embedding-001` cobra por 1k chars) | Batch 20, hash incremental, scrub antes (reduz texto) | Trocar para OpenAI `text-embedding-3-small` via env (1536d, ~5× mais barato), nova tabela `embeddings_docs_1536` futura |
| Drift de schema BQ (DDL externa) quebra `embeddings_schemas` | `refresh-rag` mensal + alerta se diff >20% colunas | Rerun manual; tabela tem `embedding_model` para evolução |
| Vazamento cross-tenant | `clientId` enforçado em `RagService` (throw se ausente); tool não aceita `clientId` no input | Teste adversarial em `rag:smoke` é gate de PR |
| Vertex `gemini-embedding-001` não disponível em `@ai-sdk/google-vertex@^4.0.80` | Probe na Task 2.3; fallback OpenAI `text-embedding-3-small` (1536d) atrás de `RAG_EMBEDDING_PROVIDER=openai` (ADR-0005). Tabela 1536d separada exigida ao ativar fallback. | Trocar provider via env + criar tabela `embeddings_docs_1536` |
| HNSW build muito lento em corpus grande | Inicialmente sem `WITH (m=16, ef_construction=64)`; tunar se p95 search > 500ms | Drop index e recriar com tuning |
| Reranker (Gemini Flash) cai/atrasa | `rerank()` faz fallback para original order; smoke ainda passa | desligar via env `RAG_TOPK_RERANK=20` (no-op rerank) |
| `pgvector` 3072d storage (~12KB/vetor × 6000 = 72MB OK) | Monitorar `pg_relation_size` | Mudar para 1536d se necessário |
| PII regex falso negativo | Cobertura ≥6 casos no test; manual sample 50 chunks pós-ingest | Adicionar regex extra em hotfix |

**Rollback geral:** cada commit reversível. Para desativar runtime sem rollback: `unset` `vector_query` dos tools dos orchestrators (1 linha em cada). Para zerar dados: `TRUNCATE embeddings_docs, embeddings_glossary, embeddings_schemas;` — não afeta `threads`/`messages`/`working_memory` do Sprint 1.A.

---

## Time de execução

- **Tasks 1, 2** (infra + ADRs): general-purpose, sequencial.
- **Tasks 3, 4, 5, 6, 8** (libs puras com TDD): paralelizável via `superpowers:dispatching-parallel-agents` (5 subagentes).
- **Task 7** (RagService): general-purpose, depende de 1.
- **Task 9** (script ingest): general-purpose, depende de 3-7.
- **Task 10** (tool wiring): general-purpose, depende de 5, 7, 8.
- **Tasks 11, 12, 13**: general-purpose, depende de 9, 10.
- **Validação manual final**: agente `credit-risk-analyst` revisa 5 chunks por doc regulatório (CVM 60, CRI/CRA, BACEN PDD, distratos) confirmando integridade contextual.

**Ordem de execução recomendada (com paralelismo):**

```
Task 1, Task 2 ─→ [Task 3 ‖ Task 4 ‖ Task 5 ‖ Task 6 ‖ Task 8] ─→ Task 7 ─→ Task 9 ─→ Task 10 ─→ Task 11, Task 12 ─→ Task 13
```

---

## Self-Review

- **Spec coverage**: header literal preservado; 13 tasks (range 12-16 ok); cada task com produto novo segue RED→GREEN→commit; comandos `pnpm test:run` com path explícito; código completo sem TODO; paths absolutos.
- **Cobertura do plano-fonte (§3)**: corpus 3 fontes (docs/benchmarking, glossary, schemas) com tabelas distintas ✓; embedding `gemini-embedding-001` com fallback OpenAI ✓; pgvector HNSW ✓; metadata filters MongoDB-like simplificada para `{product, persona, docType}` ✓; reranking 20→5 Gemini Flash ✓; hash incremental ✓; PII scrub ✓; multi-tenancy hard via `RagService.clientId` throw ✓; cron mensal ✓.
- **Decisões-chave registradas**: reusa ADR-0002 (Mastra-as-library), ADR-0004 (pgvector storage único), ADR-0005 (Vertex `gemini-embedding-001` + fallback OpenAI), ADR-0006 (multi-tenancy strict). Apenas ADR-0011 (reranking Gemini Flash) é criado nesta sprint na Task 2.
- **Mismatches/limitações**: glossário e schemas BQ recebem upsert via mesmo pipeline mas testes específicos (Tasks de glossário/schema) foram concentrados em `chunkJson` da Task 3 + `RagService` da Task 7; ingest específico de glossário/schema é responsabilidade de iteração Sprint 2.B (extender `ingestDocs` para `ingestGlossary`/`ingestSchemas`). Documentado aqui como conhecido.
- **Pendências intencionais para sprints futuros**: ingest específico de glossário e schemas BQ via `INFORMATION_SCHEMA` (estende infra atual); semantic recall de SQLs validados (Sprint 3.A); semantic recall de blocos (Sprint 3.A); observability dashboard de RAG (Sprint 2.B).
- **Multi-tenancy verificado**: tabelas têm `client_id NOT NULL` + index; `RagService.queryDocs` lança se `clientId` ausente; `vector_query` recebe `clientId` apenas via context (server-derived); teste adversarial bloqueia PR se houver leak.
- **Métricas mensuráveis**: recall@5 ≥0.8 em 20 queries gold (gate); ingestão <15min wall-clock; 0 leaks adversarial; cobertura ≥80%.
