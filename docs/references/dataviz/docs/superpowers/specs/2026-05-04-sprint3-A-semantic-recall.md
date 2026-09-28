# Sprint 3.A — Semantic Recall (SQLs/Blocks) + Cross-Agent Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar memória longa por reuso (semantic recall de SQLs validados e blocos de Canvas) com PII scrubbing, TTL/eviction, telemetria e propagação cross-agent readOnly. Permitir que orchestrators consultem padrões já validados antes de gerar do zero, reduzindo latência e custo BQ.

**Architecture:** Postgres + pgvector (provisionados em Sprint 1.A; pipeline RAG `RagService` (`upsertDoc`/`queryDocs`) em Sprint 2.A). Duas novas tabelas vetoriais (`embeddings_sql`, `embeddings_blocks`) com **helpers locais** `upsertSqlEmbedding`/`querySqlEmbeddings`/`bumpReuse` (raw `getPool()` queries; Sprint 2.A não exporta API genérica multi-tabela) + dois pipelines de persistência (hooks em `query_data` e Canvas commit) + duas tools de recall + integração no orchestrator analítico (`descriptive_agent`) e Canvas (`fillBlock`). Cross-agent memory: cada sub-agente recebe `ReadOnlyMemoryService` (wrapper sobre o `memory-service` da Sprint 1.A); orchestrator é único escritor via tool `updateWorkingMemory` (Sprint 1.A). Cron de eviction TTL >90d sem reuso. PII scrubber compartilhado com Sprint 2.A (`scrubPii` em `src/shared/lib/rag/pii-scrubber.ts`).

**Tech Stack:** pgvector (HNSW + `vector_cosine_ops`, alinhado com Sprint 2.A), AI SDK v6 (`embedMany`/`embed`), `@ai-sdk/google-vertex` (Gemini Flash + `gemini-embedding-001`), Vitest 4.x, Zod 4, Next.js 16 App Router, pg 8.x.

**Sprint dependencies:**
- Sprint 1.A — Cloud SQL + working memory + `memory-service` (`getWorkingMemory`, `setWorkingMemory`, `patchWorkingMemory`, `getMessages`) + `getPool()` (`src/shared/lib/memory/pool.ts`) + `recordMemoryMetric` (`src/shared/lib/memory/metrics.ts`) + tool `updateWorkingMemory`.
- Sprint 1.C — `liquid_meta.sql_generations` populada com `{intent, sql, schemaSnapshot, success}`.
- Sprint 2.A — `RagService` (`upsertDoc`/`queryDocs`), tool `vector_query`, `embeddings_docs`, PII scrubber (`scrubPii` em `src/shared/lib/rag/pii-scrubber.ts`), Vertex `gemini-embedding-001`.

**ADRs aceitas relevantes:**
- ADR-0004 (`adrs/decisions/0004-cloud-sql-pgvector-storage-unico.md`): Postgres+pgvector como storage único.
- ADR-0006 (`adrs/decisions/0006-multi-tenancy-strict-isolation.md`): `clientId` server-bound, jamais aceito como input do modelo; filtro hard em toda query vector.
- ADR-0009 (`adrs/decisions/0009-sql-reuse-hierarchy-catalog-recall-fresh.md`): hierarquia de reuso (catálogo > recall > geração fresh).

---

## File Structure

```
liquid-play-dataviz/
├── src/
│   ├── shared/
│   │   └── lib/
│   │       ├── memory/
│   │       │   ├── migrations/
│   │       │   │   └── 003_semantic_recall.sql            # NEW — embeddings_sql + embeddings_blocks + HNSW
│   │       │   ├── recall-store.ts                        # NEW — helpers locais upsertSqlEmbedding/queryX/bumpReuse + types RecallResult/EmbeddedSql/EmbeddedBlock
│   │       │   ├── recall-store.test.ts                   # NEW
│   │       │   ├── persist-sql.ts                         # NEW — pipeline persistSqlGeneration
│   │       │   ├── persist-sql.test.ts                    # NEW
│   │       │   ├── persist-block.ts                       # NEW — pipeline persistBlockSpec
│   │       │   ├── persist-block.test.ts                  # NEW
│   │       │   ├── readonly-guard.ts                      # NEW — wraps memory-service for sub-agents
│   │       │   ├── readonly-guard.test.ts                 # NEW
│   │       │   ├── eviction.ts                            # NEW — TTL cron implementation
│   │       │   └── eviction.test.ts                       # NEW
│   │       └── rag/
│   │           └── pii-scrubber.ts                        # REUSE (Sprint 2.A, `scrubPii`) — extended adversarial fixtures
│   ├── features/
│   │   ├── ai-agents/
│   │   │   ├── tools/
│   │   │   │   ├── recall-similar-sql.ts                  # NEW
│   │   │   │   ├── recall-similar-sql.test.ts             # NEW
│   │   │   │   ├── query-data.ts                          # MODIFY — invoke persistSqlGeneration on success
│   │   │   │   └── query-data.test.ts                     # MODIFY
│   │   │   ├── sub-agents/
│   │   │   │   ├── descriptive.ts                         # MODIFY — recall_similar_sql + readOnly memory
│   │   │   │   ├── diagnostic.ts                          # MODIFY — readOnly memory
│   │   │   │   ├── predictive.ts                          # MODIFY — readOnly memory
│   │   │   │   └── prescriptive.ts                        # MODIFY — readOnly memory
│   │   │   └── orchestrator.ts                            # MODIFY — pass readOnly MemoryService to sub-agents
│   │   └── canvas-orchestrator/
│   │       ├── tools/
│   │       │   ├── recall-similar-block.ts                # NEW
│   │       │   ├── recall-similar-block.test.ts           # NEW
│   │       │   ├── fill-block.ts                          # MODIFY — consult recall_similar_block as draft hint
│   │       │   └── fill-block.test.ts                     # MODIFY
│   │       ├── commit-block.ts                            # MODIFY — invoke persistBlockSpec on accepted commit
│   │       └── commit-block.test.ts                       # MODIFY
│   └── shared/
│       └── lib/
│           └── telemetry/
│               ├── recall-metrics.ts                      # NEW — recall_hit_rate, tokens_saved
│               └── recall-metrics.test.ts                 # NEW
├── scripts/
│   ├── eviction-cron.ts                                   # NEW — invoked by Cloud Scheduler/cron
│   └── eval-semantic-recall.ts                            # NEW — gold dataset (50 reuses) + adversarial PII (30 SQLs)
├── adrs/
│   └── decisions/
│       └── 0011-semantic-recall-ttl-pii.md                # NEW
├── docs/
│   ├── superpowers/specs/
│   │   └── 2026-05-04-sprint3-A-acceptance.md             # NEW — smoke E2E + adversarial regression
│   └── eval/
│       ├── gold-sql-reuses.json                           # NEW — 50 pairs (intent, expected match)
│       └── adversarial-sql-pii.json                       # NEW — 30 SQLs com CPF/CNPJ/email
└── package.json                                           # MODIFY — scripts: eval:semantic-recall, cron:eviction
```

---

## Task 1 — ADR-0011: Semantic Recall TTL + PII Scrubbing

**Goal:** Documentar decisões de design (TTL=90d, PII scrub obrigatório, draft-as-hint não-final, schemaSnapshot em metadata) antes de codar. Numeração 0011 (próximo livre; 0006 = multi-tenancy, 0009 = sql-reuse-hierarchy já aceitos).

- [ ] **Step 1.1** — Criar `adrs/decisions/0011-semantic-recall-ttl-pii.md` com seções: Context, Decision, Consequences, Alternatives.
  - Conteúdo cobre: por que 90d (custo storage vs valor de reuso), por que PII scrub é hard requirement (LGPD; reusa scrubber de Sprint 2.A — `scrubPii`), por que draft é hint e não final (evitar enviesamento), schemaSnapshot em metadata para detectar drift (revalidação se schema BQ muda), respeito a ADR-0006 (clientId server-bound) e ADR-0009 (recall posicionado entre catálogo e fresh-gen).

- [ ] **Step 1.2** — Listar referências cruzadas: Sprint 1.A (working memory readOnly), Sprint 2.A (pgvector + PII scrubber), Sprint 1.C (`sql_generations`), ADR-0004/0006/0009, plano-fonte §5 Fase 3.

- [ ] **Step 1.3** — Commit.
  - `docs(adr): ADR-0011 semantic recall ttl + pii scrubbing`

---

## Task 2 — Migration: tabelas `embeddings_sql` e `embeddings_blocks` com HNSW

**Goal:** Schema vetorial com índices HNSW + filtros multi-tenant (clientId).

- [ ] **Step 2.1** — Criar `src/shared/lib/memory/migrations/003_semantic_recall.sql`:
    ```sql
    CREATE EXTENSION IF NOT EXISTS vector;

    CREATE TABLE IF NOT EXISTS embeddings_sql (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      content TEXT NOT NULL,                     -- "intent\n-- sql comentado"
      embedding VECTOR(3072) NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      client_id TEXT NOT NULL,
      persona_id TEXT NOT NULL,
      intent TEXT NOT NULL,
      sql_text TEXT NOT NULL,                    -- PII scrubbed
      schema_snapshot JSONB NOT NULL,
      row_count INTEGER NOT NULL,
      latency_ms INTEGER NOT NULL,
      glossary_version TEXT,
      regulatory_pack_version TEXT,
      reuse_count INTEGER NOT NULL DEFAULT 0,
      last_reused_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_embsql_client ON embeddings_sql(client_id);
    CREATE INDEX IF NOT EXISTS idx_embsql_persona ON embeddings_sql(persona_id);
    CREATE INDEX IF NOT EXISTS idx_embsql_last_reused ON embeddings_sql(last_reused_at);
    CREATE INDEX IF NOT EXISTS idx_embsql_hnsw
      ON embeddings_sql USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);

    CREATE TABLE IF NOT EXISTS embeddings_blocks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      content TEXT NOT NULL,                     -- descrição NL + spec serializada
      embedding VECTOR(3072) NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      client_id TEXT NOT NULL,
      block_type TEXT NOT NULL,                  -- KPI | chart | table
      block_spec JSONB NOT NULL,
      template_id UUID,                          -- versionamento (variações apontam pro template original)
      reuse_count INTEGER NOT NULL DEFAULT 0,
      last_reused_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_embblk_client ON embeddings_blocks(client_id);
    CREATE INDEX IF NOT EXISTS idx_embblk_type ON embeddings_blocks(block_type);
    CREATE INDEX IF NOT EXISTS idx_embblk_template ON embeddings_blocks(template_id);
    CREATE INDEX IF NOT EXISTS idx_embblk_hnsw
      ON embeddings_blocks USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);
    ```

- [ ] **Step 2.2** — Aplicar migration.
  - Comando: `DATABASE_URL=postgresql://liquid:liquid@localhost:5433/liquid_memory pnpm migrate`
  - Output esperado: `Applying 003_semantic_recall.sql...` e tabelas listadas em `\dt`.

- [ ] **Step 2.3** — Verificar HNSW.
  - Comando: `docker exec liquid-pg psql -U liquid -d liquid_memory -c "\\di idx_embsql_hnsw"`
  - Output esperado: index com `hnsw` access method.

- [ ] **Step 2.4** — Commit.
  - `feat(memory): embeddings_sql + embeddings_blocks tables with HNSW indices`

---

## Task 2.5 — Helpers locais `recall-store.ts` + tipos compartilhados (TDD)

**Goal:** Sprint 2.A não exporta uma API genérica multi-tabela (`upsertDoc`/`queryDocs` são específicos de `embeddings_docs`). Centralizar aqui os helpers para `embeddings_sql`/`embeddings_blocks` evitando duplicação nos pipelines/tools. Define os tipos `RecallResult`, `EmbeddedSql`, `EmbeddedBlock` cross-task.

- [ ] **Step 2.5.1 (failing test)** — Criar `src/shared/lib/memory/recall-store.test.ts`:
    ```ts
    import { describe, it, expect, vi, beforeEach } from 'vitest';

    const queryMock = vi.fn();
    vi.mock('./pool', () => ({ getPool: () => ({ query: queryMock }) }));

    describe('recall-store', () => {
      beforeEach(() => queryMock.mockReset());

      it('upsertSqlEmbedding inserts with vector literal + scrubbed sql', async () => {
        queryMock.mockResolvedValueOnce({ rowCount: 1 });
        const { upsertSqlEmbedding } = await import('./recall-store');
        await upsertSqlEmbedding({
          embedding: [0.1, 0.2],
          clientId: 'OM', personaId: 'originador', intent: 'safra',
          sqlText: 'SELECT 1', schemaSnapshot: { t: 1 },
          rowCount: 10, latencyMs: 100,
          glossaryVersion: 'v3', regulatoryPackVersion: 'cvm60-2026-04',
        });
        const [sql, params] = queryMock.mock.calls[0];
        expect(sql).toMatch(/INSERT INTO embeddings_sql/i);
        expect(params).toContain('OM');
        expect(params).toContain('originador');
      });

      it('querySqlEmbeddings filters by client_id + persona_id (cosine)', async () => {
        queryMock.mockResolvedValueOnce({
          rows: [{ id: 'r1', sql_text: 'SELECT 1', intent: 'safra', score: 0.9, metadata: {}, schema_snapshot: {} }],
        });
        const { querySqlEmbeddings } = await import('./recall-store');
        const out = await querySqlEmbeddings({
          embedding: [0.1], clientId: 'OM', personaId: 'originador', topK: 3,
        });
        const [sql, params] = queryMock.mock.calls[0];
        expect(sql).toMatch(/embedding <=> /);
        expect(sql).toMatch(/client_id = \$/);
        expect(sql).toMatch(/persona_id = \$/);
        expect(params).toContain('OM');
        expect(params).toContain('originador');
        expect(out[0]).toMatchObject({ id: 'r1', sqlText: 'SELECT 1' });
      });

      it('queryBlockEmbeddings filters by client_id + block_type', async () => {
        queryMock.mockResolvedValueOnce({ rows: [] });
        const { queryBlockEmbeddings } = await import('./recall-store');
        await queryBlockEmbeddings({ embedding: [0.1], clientId: 'OM', blockType: 'kpi', topK: 3 });
        const [sql] = queryMock.mock.calls[0];
        expect(sql).toMatch(/block_type = \$/);
      });

      it('bumpReuse updates reuse_count + last_reused_at', async () => {
        queryMock.mockResolvedValueOnce({ rowCount: 2 });
        const { bumpReuse } = await import('./recall-store');
        await bumpReuse('embeddings_sql', ['r1', 'r2']);
        const [sql, params] = queryMock.mock.calls[0];
        expect(sql).toMatch(/UPDATE embeddings_sql/i);
        expect(sql).toMatch(/reuse_count = reuse_count \+ 1/i);
        expect(sql).toMatch(/last_reused_at = now\(\)/i);
        expect(params[0]).toEqual(['r1', 'r2']);
      });

      it('bumpReuse rejects table names not in allowlist', async () => {
        const { bumpReuse } = await import('./recall-store');
        await expect(bumpReuse('arbitrary_table' as never, ['x'])).rejects.toThrow(/table/i);
      });
    });
    ```
  - Comando: `pnpm test:run src/shared/lib/memory/recall-store.test.ts`
  - Output esperado: FAIL.

- [ ] **Step 2.5.2** — Criar `src/shared/lib/memory/recall-store.ts`:
    ```ts
    import { getPool } from './pool';

    export interface EmbeddedSql {
      id: string;
      clientId: string;
      personaId: string;
      intent: string;
      sqlText: string;
      schemaSnapshot: Record<string, unknown>;
      rowCount: number;
      latencyMs: number;
      glossaryVersion: string | null;
      regulatoryPackVersion: string | null;
      reuseCount: number;
      score?: number;
    }

    export interface EmbeddedBlock {
      id: string;
      clientId: string;
      blockType: 'kpi' | 'chart' | 'table';
      blockSpec: Record<string, unknown>;
      templateId: string | null;
      reuseCount: number;
      score?: number;
    }

    export interface RecallResult<T> {
      matches: T[];
      topScore: number | null;
    }

    const ALLOWED_TABLES = new Set(['embeddings_sql', 'embeddings_blocks']);

    function vecLiteral(v: number[]): string { return `[${v.join(',')}]`; }

    export interface UpsertSqlInput {
      embedding: number[];
      clientId: string;
      personaId: string;
      intent: string;
      sqlText: string;            // PII-scrubbed
      schemaSnapshot: Record<string, unknown>;
      rowCount: number;
      latencyMs: number;
      glossaryVersion?: string | null;
      regulatoryPackVersion?: string | null;
    }

    export async function upsertSqlEmbedding(i: UpsertSqlInput): Promise<void> {
      // multi-tenancy hard: ADR-0006
      if (!i.clientId || !i.personaId) throw new Error('upsertSqlEmbedding requires clientId+personaId');
      const content = `${i.intent}\n-- ${i.sqlText}`;
      const metadata = {
        intent: i.intent,
        schemaSnapshot: i.schemaSnapshot,
        rowCount: i.rowCount,
        latencyMs: i.latencyMs,
        clientId: i.clientId,
        personaId: i.personaId,
        glossaryVersion: i.glossaryVersion ?? null,
        regulatoryPackVersion: i.regulatoryPackVersion ?? null,
      };
      await getPool().query(
        `INSERT INTO embeddings_sql
           (content, embedding, metadata, client_id, persona_id, intent, sql_text,
            schema_snapshot, row_count, latency_ms, glossary_version, regulatory_pack_version)
         VALUES ($1, $2::vector, $3::jsonb, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12)`,
        [content, vecLiteral(i.embedding), metadata, i.clientId, i.personaId,
         i.intent, i.sqlText, i.schemaSnapshot, i.rowCount, i.latencyMs,
         i.glossaryVersion ?? null, i.regulatoryPackVersion ?? null]
      );
    }

    export interface UpsertBlockInput {
      embedding: number[];
      clientId: string;
      blockType: 'kpi' | 'chart' | 'table';
      content: string;
      blockSpec: Record<string, unknown>;
      templateId?: string | null;
    }

    export async function upsertBlockEmbedding(i: UpsertBlockInput): Promise<void> {
      if (!i.clientId) throw new Error('upsertBlockEmbedding requires clientId');
      await getPool().query(
        `INSERT INTO embeddings_blocks
           (content, embedding, metadata, client_id, block_type, block_spec, template_id)
         VALUES ($1, $2::vector, $3::jsonb, $4, $5, $6::jsonb, $7)`,
        [i.content, vecLiteral(i.embedding),
         { clientId: i.clientId, blockType: i.blockType, templateId: i.templateId ?? null },
         i.clientId, i.blockType, i.blockSpec, i.templateId ?? null]
      );
    }

    export interface QuerySqlInput {
      embedding: number[];
      clientId: string;        // hard requirement (ADR-0006)
      personaId: string;       // hard requirement
      topK: number;
    }

    export async function querySqlEmbeddings(i: QuerySqlInput): Promise<EmbeddedSql[]> {
      if (!i.clientId) throw new Error('querySqlEmbeddings requires clientId (ADR-0006)');
      if (!i.personaId) throw new Error('querySqlEmbeddings requires personaId');
      const sql = `
        SELECT id, client_id, persona_id, intent, sql_text, schema_snapshot,
               row_count, latency_ms, glossary_version, regulatory_pack_version,
               reuse_count,
               1 - (embedding <=> $1::vector) AS score
        FROM embeddings_sql
        WHERE client_id = $2 AND persona_id = $3
        ORDER BY embedding <=> $1::vector
        LIMIT $4
      `;
      const { rows } = await getPool().query(sql, [vecLiteral(i.embedding), i.clientId, i.personaId, i.topK]);
      return rows.map((r) => ({
        id: r.id, clientId: r.client_id, personaId: r.persona_id,
        intent: r.intent, sqlText: r.sql_text,
        schemaSnapshot: r.schema_snapshot ?? {},
        rowCount: r.row_count, latencyMs: r.latency_ms,
        glossaryVersion: r.glossary_version, regulatoryPackVersion: r.regulatory_pack_version,
        reuseCount: r.reuse_count, score: Number(r.score),
      }));
    }

    export interface QueryBlockInput {
      embedding: number[];
      clientId: string;
      blockType: 'kpi' | 'chart' | 'table';
      topK: number;
    }

    export async function queryBlockEmbeddings(i: QueryBlockInput): Promise<EmbeddedBlock[]> {
      if (!i.clientId) throw new Error('queryBlockEmbeddings requires clientId (ADR-0006)');
      const sql = `
        SELECT id, client_id, block_type, block_spec, template_id, reuse_count,
               1 - (embedding <=> $1::vector) AS score
        FROM embeddings_blocks
        WHERE client_id = $2 AND block_type = $3
        ORDER BY embedding <=> $1::vector
        LIMIT $4
      `;
      const { rows } = await getPool().query(sql, [vecLiteral(i.embedding), i.clientId, i.blockType, i.topK]);
      return rows.map((r) => ({
        id: r.id, clientId: r.client_id, blockType: r.block_type,
        blockSpec: r.block_spec ?? {}, templateId: r.template_id,
        reuseCount: r.reuse_count, score: Number(r.score),
      }));
    }

    export async function bumpReuse(table: 'embeddings_sql' | 'embeddings_blocks', ids: string[]): Promise<void> {
      if (!ALLOWED_TABLES.has(table)) throw new Error(`bumpReuse: table '${table}' not allowed`);
      if (ids.length === 0) return;
      await getPool().query(
        `UPDATE ${table} SET reuse_count = reuse_count + 1, last_reused_at = now() WHERE id = ANY($1::uuid[])`,
        [ids]
      );
    }
    ```

- [ ] **Step 2.5.3** — Re-rodar.
  - Comando: `pnpm test:run src/shared/lib/memory/recall-store.test.ts`
  - Output esperado: `5 passed`.

- [ ] **Step 2.5.4** — Commit.
  - `feat(memory): recall-store helpers + shared types (RecallResult/EmbeddedSql/EmbeddedBlock)`

---

## Task 3 — Pipeline `persistSqlGeneration` (TDD)

**Goal:** Hook após `query_data` bem-sucedido (rowCount>0, success). PII scrub → embed → upsert. Idempotente por hash de `(clientId, intent, sql_scrubbed)`.

- [ ] **Step 3.1 (failing test)** — Criar `src/shared/lib/memory/persist-sql.test.ts`:
    ```ts
    import { describe, it, expect, vi, beforeEach } from 'vitest';

    const upsertMock = vi.fn();
    const embedManyMock = vi.fn().mockResolvedValue({ embeddings: [Array(3072).fill(0.01)] });
    const scrubMock = vi.fn((s: string) => s.replace(/\d{11}/g, '***CPF***'));

    vi.mock('./recall-store', () => ({
      upsertSqlEmbedding: (...a: unknown[]) => upsertMock(...a),
    }));
    vi.mock('ai', () => ({ embedMany: (...a: unknown[]) => embedManyMock(...a) }));
    vi.mock('@/shared/lib/rag/pii-scrubber', () => ({ scrubPii: (s: string) => scrubMock(s) }));

    describe('persistSqlGeneration', () => {
      beforeEach(() => {
        upsertMock.mockReset();
        embedManyMock.mockClear();
        scrubMock.mockClear();
      });

      it('skips persistence when rowCount=0', async () => {
        const { persistSqlGeneration } = await import('./persist-sql');
        await persistSqlGeneration({
          clientId: 'OM', personaId: 'originador', intent: 'inadimplencia safra',
          sql: 'SELECT 1', schemaSnapshot: {}, rowCount: 0, latencyMs: 100,
        });
        expect(upsertMock).not.toHaveBeenCalled();
      });

      it('skips persistence on error result', async () => {
        const { persistSqlGeneration } = await import('./persist-sql');
        await persistSqlGeneration({
          clientId: 'OM', personaId: 'originador', intent: 'x',
          sql: 'BAD SQL', schemaSnapshot: {}, rowCount: 0, latencyMs: 50,
          error: 'syntax',
        });
        expect(upsertMock).not.toHaveBeenCalled();
      });

      it('scrubs PII before embedding and upsert', async () => {
        const { persistSqlGeneration } = await import('./persist-sql');
        await persistSqlGeneration({
          clientId: 'OM', personaId: 'originador', intent: 'cpf 12345678901',
          sql: "SELECT * FROM x WHERE cpf = '12345678901'",
          schemaSnapshot: { table: 'x' }, rowCount: 5, latencyMs: 200,
        });
        expect(scrubMock).toHaveBeenCalled();
        const arg = upsertMock.mock.calls[0][0];
        expect(arg.sqlText).not.toMatch(/12345678901/);
        expect(arg.sqlText).toMatch(/\*\*\*CPF\*\*\*/);
      });

      it('persists with required metadata fields', async () => {
        const { persistSqlGeneration } = await import('./persist-sql');
        await persistSqlGeneration({
          clientId: 'OM', personaId: 'originador', intent: 'safra',
          sql: 'SELECT 1', schemaSnapshot: { table: 't' }, rowCount: 10, latencyMs: 150,
          glossaryVersion: 'v3', regulatoryPackVersion: 'cvm60-2026-04',
        });
        const arg = upsertMock.mock.calls[0][0];
        expect(arg).toMatchObject({
          clientId: 'OM', personaId: 'originador',
          glossaryVersion: 'v3', regulatoryPackVersion: 'cvm60-2026-04',
          rowCount: 10, latencyMs: 150,
        });
      });
    });
    ```
  - Comando: `pnpm test:run src/shared/lib/memory/persist-sql.test.ts`
  - Output esperado: FAIL.

- [ ] **Step 3.2** — Criar `src/shared/lib/memory/persist-sql.ts`:
    ```ts
    import { embedMany } from 'ai';
    import { vertex } from '@ai-sdk/google-vertex';
    import { upsertSqlEmbedding } from './recall-store';
    import { scrubPii } from '@/shared/lib/rag/pii-scrubber';

    export interface PersistSqlInput {
      clientId: string;
      personaId: string;
      intent: string;
      sql: string;
      schemaSnapshot: Record<string, unknown>;
      rowCount: number;
      latencyMs: number;
      glossaryVersion?: string;
      regulatoryPackVersion?: string;
      error?: string;
    }

    export async function persistSqlGeneration(input: PersistSqlInput): Promise<void> {
      if (input.error || input.rowCount <= 0) return;
      // Multi-tenancy hard (ADR-0006): clientId server-bound; rejeita ausência.
      if (!input.clientId || !input.personaId) return;
      const sqlScrubbed = scrubPii(input.sql);
      const intentScrubbed = scrubPii(input.intent);
      const content = `${intentScrubbed}\n-- ${sqlScrubbed}`;
      const { embeddings } = await embedMany({
        model: vertex.textEmbeddingModel('gemini-embedding-001'),
        values: [content],
      });
      await upsertSqlEmbedding({
        embedding: embeddings[0],
        clientId: input.clientId,
        personaId: input.personaId,
        intent: intentScrubbed,
        sqlText: sqlScrubbed,
        schemaSnapshot: input.schemaSnapshot,
        rowCount: input.rowCount,
        latencyMs: input.latencyMs,
        glossaryVersion: input.glossaryVersion ?? null,
        regulatoryPackVersion: input.regulatoryPackVersion ?? null,
      });
    }
    ```

- [ ] **Step 3.3** — Re-rodar.
  - Comando: `pnpm test:run src/shared/lib/memory/persist-sql.test.ts`
  - Output esperado: `4 passed`.

- [ ] **Step 3.4** — Commit.
  - `feat(memory): persistSqlGeneration pipeline with PII scrub`

---

## Task 4 — Pipeline `persistBlockSpec` (TDD)

**Goal:** Hook após Canvas commit (bloco aceito). Embedda descrição NL + spec serializada. Versionamento via `template_id`.

- [ ] **Step 4.1 (failing test)** — Criar `src/shared/lib/memory/persist-block.test.ts`:
    ```ts
    import { describe, it, expect, vi, beforeEach } from 'vitest';

    const upsertMock = vi.fn();
    const embedManyMock = vi.fn().mockResolvedValue({ embeddings: [Array(3072).fill(0.02)] });
    vi.mock('./recall-store', () => ({ upsertBlockEmbedding: (...a: unknown[]) => upsertMock(...a) }));
    vi.mock('ai', () => ({ embedMany: (...a: unknown[]) => embedManyMock(...a) }));

    describe('persistBlockSpec', () => {
      beforeEach(() => upsertMock.mockReset());

      it('persists KPI block with description + serialized spec', async () => {
        const { persistBlockSpec } = await import('./persist-block');
        await persistBlockSpec({
          clientId: 'OM', blockType: 'kpi',
          spec: { metric: 'inadimplencia_30d', format: 'percent' },
          description: 'Indicador inadimplência 30d para OM',
        });
        const arg = upsertMock.mock.calls[0][0];
        expect(arg).toMatchObject({ clientId: 'OM', blockType: 'kpi' });
        expect(arg.content).toContain('Indicador inadimplência 30d');
        expect(arg.content).toContain('inadimplencia_30d');
      });

      it('links variation to template_id when provided', async () => {
        const { persistBlockSpec } = await import('./persist-block');
        await persistBlockSpec({
          clientId: 'BRZ', blockType: 'chart', spec: {}, description: 'd',
          templateId: 't-orig-1',
        });
        expect(upsertMock.mock.calls[0][0].templateId).toBe('t-orig-1');
      });
    });
    ```
  - Comando: `pnpm test:run src/shared/lib/memory/persist-block.test.ts`
  - Output esperado: FAIL.

- [ ] **Step 4.2** — Criar `src/shared/lib/memory/persist-block.ts`:
    ```ts
    import { embedMany } from 'ai';
    import { vertex } from '@ai-sdk/google-vertex';
    import { upsertBlockEmbedding } from './recall-store';

    export interface PersistBlockInput {
      clientId: string;
      blockType: 'kpi' | 'chart' | 'table';
      spec: Record<string, unknown>;
      description: string;
      templateId?: string;
    }

    export async function persistBlockSpec(input: PersistBlockInput): Promise<void> {
      if (!input.clientId) return; // ADR-0006
      const content = `${input.description}\n\n${JSON.stringify(input.spec)}`;
      const { embeddings } = await embedMany({
        model: vertex.textEmbeddingModel('gemini-embedding-001'),
        values: [content],
      });
      await upsertBlockEmbedding({
        embedding: embeddings[0],
        clientId: input.clientId,
        blockType: input.blockType,
        content,
        blockSpec: input.spec,
        templateId: input.templateId ?? null,
      });
    }
    ```

- [ ] **Step 4.3** — Re-rodar.
  - Comando: `pnpm test:run src/shared/lib/memory/persist-block.test.ts`
  - Output esperado: `2 passed`.

- [ ] **Step 4.4** — Commit.
  - `feat(memory): persistBlockSpec pipeline with template versioning`

---

## Task 5 — Tool `recall_similar_sql` (TDD)

**Goal:** Recall semântico filtrado por `clientId+personaId` (obrigatórios). Atualiza `reuse_count` + `last_reused_at` em hit.

- [ ] **Step 5.1 (failing test)** — Criar `src/features/ai-agents/tools/recall-similar-sql.test.ts`:
    ```ts
    import { describe, it, expect, vi, beforeEach } from 'vitest';

    const queryMock = vi.fn();
    const updateMock = vi.fn();
    vi.mock('@/shared/lib/memory/recall-store', () => ({
      querySqlEmbeddings: (...a: unknown[]) => queryMock(...a),
      bumpReuse: (...a: unknown[]) => updateMock(...a),
    }));
    vi.mock('ai', async () => {
      const actual = await vi.importActual<typeof import('ai')>('ai');
      return {
        ...actual,
        embed: vi.fn().mockResolvedValue({ embedding: Array(3072).fill(0.01) }),
      };
    });

    describe('recall_similar_sql tool', () => {
      beforeEach(() => { queryMock.mockReset(); updateMock.mockReset(); });

      it('requires clientId + personaId filters (server-bound, ADR-0006)', async () => {
        // clientId é server-bound — o factory recebe clientId, não o modelo via inputSchema
        const { createRecallSimilarSqlTool } = await import('./recall-similar-sql');
        expect(() => createRecallSimilarSqlTool({ clientId: '', personaId: 'p' })).toThrow(/clientId/);
        expect(() => createRecallSimilarSqlTool({ clientId: 'OM', personaId: '' })).toThrow(/personaId/);
      });

      it('returns topK matches and bumps reuse counters', async () => {
        queryMock.mockResolvedValueOnce([
          { id: 'r1', score: 0.92, sqlText: 'SELECT 1', intent: 'safra', schemaSnapshot: {} },
          { id: 'r2', score: 0.87, sqlText: 'SELECT 2', intent: 'safra2', schemaSnapshot: {} },
        ]);
        const { createRecallSimilarSqlTool } = await import('./recall-similar-sql');
        const tool = createRecallSimilarSqlTool({ clientId: 'OM', personaId: 'originador' });
        const out = await tool.execute(
          { intent: 'inadimplencia safra', topK: 2 } as never,
          { toolCallId: 't', messages: [] } as never
        );
        expect(out.matches).toHaveLength(2);
        expect(queryMock).toHaveBeenCalledWith(expect.objectContaining({
          clientId: 'OM', personaId: 'originador', topK: 2,
        }));
        expect(updateMock).toHaveBeenCalledWith('embeddings_sql', ['r1', 'r2']);
      });
    });
    ```
  - Comando: `pnpm test:run src/features/ai-agents/tools/recall-similar-sql.test.ts`
  - Output esperado: FAIL.

- [ ] **Step 5.2** — Criar `src/features/ai-agents/tools/recall-similar-sql.ts`:
    ```ts
    import { tool, embed } from 'ai';
    import { z } from 'zod';
    import { vertex } from '@ai-sdk/google-vertex';
    import { querySqlEmbeddings, bumpReuse } from '@/shared/lib/memory/recall-store';
    import { recordRecallMetric, estimateTokensSaved } from '@/shared/lib/telemetry/recall-metrics';

    /**
     * ADR-0006: clientId/personaId são SERVER-BOUND.
     * O factory exige binding em build-time (closure); inputSchema do tool NÃO expõe.
     */
    export function createRecallSimilarSqlTool(ctx: { clientId: string; personaId: string }) {
      if (!ctx.clientId) throw new Error('createRecallSimilarSqlTool: clientId obrigatório (ADR-0006)');
      if (!ctx.personaId) throw new Error('createRecallSimilarSqlTool: personaId obrigatório');
      return tool({
        description: 'Recupera SQLs validados anteriormente similares à intent. Use ANTES de gerar SQL do zero.',
        inputSchema: z.object({
          intent: z.string().min(1),
          topK: z.number().int().min(1).max(10).default(5),
        }),
        execute: async ({ intent, topK }) => {
          const { embedding } = await embed({
            model: vertex.textEmbeddingModel('gemini-embedding-001'),
            value: intent,
          });
          const matches = await querySqlEmbeddings({
            embedding,
            clientId: ctx.clientId,
            personaId: ctx.personaId,
            topK,
          });
          if (matches.length > 0) await bumpReuse('embeddings_sql', matches.map(m => m.id));
          const topScore = matches[0]?.score ?? null;
          recordRecallMetric({ kind: 'sql', clientId: ctx.clientId, hit: matches.length > 0, topScore, topK });
          return {
            matches: matches.map(m => ({
              id: m.id, score: m.score, sql: m.sqlText, intent: m.intent,
              schemaSnapshot: m.schemaSnapshot,
            })),
            tokensSaved: estimateTokensSaved({ reused: matches.length > 0, sqlLength: matches[0]?.sqlText.length ?? 0 }),
          };
        },
      });
    }
    ```

- [ ] **Step 5.3** — Re-rodar.
  - Comando: `pnpm test:run src/features/ai-agents/tools/recall-similar-sql.test.ts`
  - Output esperado: `2 passed`.

- [ ] **Step 5.4** — Commit.
  - `feat(ai-agents): recall_similar_sql tool with multi-tenant filter`

---

## Task 6 — Tool `recall_similar_block` (TDD)

**Goal:** Recall de blocos por `clientId + blockType`. Reutiliza `queryBlockEmbeddings`/`bumpReuse` de `recall-store.ts`.

- [ ] **Step 6.1 (failing test)** — Criar `src/features/canvas-orchestrator/tools/recall-similar-block.test.ts`:
    ```ts
    import { describe, it, expect, vi, beforeEach } from 'vitest';

    const queryMock = vi.fn();
    const updateMock = vi.fn();
    vi.mock('@/shared/lib/memory/recall-store', () => ({
      queryBlockEmbeddings: (...a: unknown[]) => queryMock(...a),
      bumpReuse: (...a: unknown[]) => updateMock(...a),
    }));
    vi.mock('ai', async () => {
      const actual = await vi.importActual<typeof import('ai')>('ai');
      return { ...actual, embed: vi.fn().mockResolvedValue({ embedding: Array(3072).fill(0.03) }) };
    });

    describe('recall_similar_block tool', () => {
      beforeEach(() => { queryMock.mockReset(); updateMock.mockReset(); });

      it('filters by clientId (server-bound) + blockType (input)', async () => {
        queryMock.mockResolvedValueOnce([
          { id: 'b1', score: 0.9, blockSpec: { metric: 'm1' }, blockType: 'kpi' },
        ]);
        const { createRecallSimilarBlockTool } = await import('./recall-similar-block');
        const tool = createRecallSimilarBlockTool({ clientId: 'OM' });
        const out = await tool.execute(
          { intent: 'kpi inadimplencia', blockType: 'kpi', topK: 3 } as never,
          { toolCallId: 't', messages: [] } as never
        );
        expect(queryMock).toHaveBeenCalledWith(expect.objectContaining({
          clientId: 'OM', blockType: 'kpi', topK: 3,
        }));
        expect(out.matches[0].spec).toEqual({ metric: 'm1' });
      });

      it('rejects creation without clientId (ADR-0006)', async () => {
        const { createRecallSimilarBlockTool } = await import('./recall-similar-block');
        expect(() => createRecallSimilarBlockTool({ clientId: '' })).toThrow(/clientId/);
      });
    });
    ```
  - Comando: `pnpm test:run src/features/canvas-orchestrator/tools/recall-similar-block.test.ts`
  - Output esperado: FAIL.

- [ ] **Step 6.2** — Criar `src/features/canvas-orchestrator/tools/recall-similar-block.ts`:
    ```ts
    import { tool, embed } from 'ai';
    import { z } from 'zod';
    import { vertex } from '@ai-sdk/google-vertex';
    import { queryBlockEmbeddings, bumpReuse } from '@/shared/lib/memory/recall-store';
    import { recordRecallMetric } from '@/shared/lib/telemetry/recall-metrics';

    export function createRecallSimilarBlockTool(ctx: { clientId: string }) {
      if (!ctx.clientId) throw new Error('createRecallSimilarBlockTool: clientId obrigatório (ADR-0006)');
      return tool({
        description: 'Recupera blocos de Canvas similares já aceitos. Use como DRAFT/HINT antes de gerar do zero — não substitui geração.',
        inputSchema: z.object({
          intent: z.string().min(1),
          blockType: z.enum(['kpi', 'chart', 'table']),
          topK: z.number().int().min(1).max(10).default(3),
        }),
        execute: async ({ intent, blockType, topK }) => {
          const { embedding } = await embed({
            model: vertex.textEmbeddingModel('gemini-embedding-001'),
            value: intent,
          });
          const matches = await queryBlockEmbeddings({
            embedding, clientId: ctx.clientId, blockType, topK,
          });
          if (matches.length > 0) await bumpReuse('embeddings_blocks', matches.map(m => m.id));
          recordRecallMetric({
            kind: 'block', clientId: ctx.clientId, hit: matches.length > 0,
            topScore: matches[0]?.score ?? null, topK,
          });
          return { matches: matches.map(m => ({ id: m.id, score: m.score, spec: m.blockSpec })) };
        },
      });
    }
    ```

- [ ] **Step 6.3** — Re-rodar.
  - Comando: `pnpm test:run src/features/canvas-orchestrator/tools/recall-similar-block.test.ts`
  - Output esperado: `1 passed`.

- [ ] **Step 6.4** — Commit.
  - `feat(canvas-orchestrator): recall_similar_block tool as draft hint`

---

## Task 7 — Integração: `query_data` invoca `persistSqlGeneration`

**Goal:** Hook fire-and-forget após `query_data` retornar sucesso. Não bloqueia resposta ao agente.

- [ ] **Step 7.1 (failing test)** — Apender em `src/features/ai-agents/tools/query-data.test.ts`:
    ```ts
    const persistSqlMock = vi.fn();
    vi.mock('@/shared/lib/memory/persist-sql', () => ({
      persistSqlGeneration: (...a: unknown[]) => persistSqlMock(...a),
    }));

    describe('query_data persistence hook', () => {
      it('invokes persistSqlGeneration on successful result', async () => {
        // setup: query_data returns rowCount=10
        // assert: persistSqlMock called with {clientId, intent, sql, schemaSnapshot, rowCount, latencyMs}
      });

      it('does not invoke on error', async () => {
        // setup: query_data throws
        // assert: persistSqlMock not called
      });

      it('does not block response on persistence failure', async () => {
        persistSqlMock.mockRejectedValueOnce(new Error('pgvector down'));
        // assert: query_data still resolves
      });
    });
    ```
  - Comando: `pnpm test:run src/features/ai-agents/tools/query-data.test.ts -t 'persistence hook'`
  - Output esperado: FAIL.

- [ ] **Step 7.2** — Modificar `query-data.ts`: após `result = await runBigQuery(...)` bem-sucedido, fire-and-forget. `clientId` e `personaId` vêm do contexto server-bound (`ctx`/`toolCallOptions`), nunca do input do modelo (ADR-0006):
    ```ts
    import { persistSqlGeneration } from '@/shared/lib/memory/persist-sql';
    import { recordMemoryMetric } from '@/shared/lib/memory/metrics';

    void persistSqlGeneration({
      clientId: ctx.clientId,           // server-bound
      personaId: ctx.personaId,         // server-bound
      intent: input.intent ?? input.question,
      sql: result.sql,
      schemaSnapshot: result.schema,
      rowCount: result.rows.length,
      latencyMs: result.latencyMs,
      glossaryVersion: ctx.glossaryVersion,
      regulatoryPackVersion: ctx.regulatoryPackVersion,
    }).catch((e: unknown) => recordMemoryMetric({
      event: 'persistSql.failed', durationMs: 0, ok: false, error: String(e),
    }));
    ```

- [ ] **Step 7.3** — Re-rodar.
  - Comando: `pnpm test:run src/features/ai-agents/tools/query-data.test.ts -t 'persistence hook'`
  - Output esperado: `3 passed`.

- [ ] **Step 7.4** — Commit.
  - `feat(ai-agents): persist successful sql generations for semantic recall`

---

## Task 8 — Integração: Canvas commit invoca `persistBlockSpec`

**Goal:** Após bloco aceito (commit no Canvas state), persiste spec + descrição NL gerada por Gemini Flash.

- [ ] **Step 8.1 (failing test)** — Apender em `src/features/canvas-orchestrator/commit-block.test.ts`:
    ```ts
    const persistBlockMock = vi.fn();
    vi.mock('@/shared/lib/memory/persist-block', () => ({
      persistBlockSpec: (...a: unknown[]) => persistBlockMock(...a),
    }));

    describe('commit-block persistence hook', () => {
      it('persists block spec with NL description on accepted commit', async () => {
        // setup: commit({ blockId, spec, accepted: true })
        // assert: persistBlockMock called with {clientId, blockType, spec, description}
      });

      it('does not persist on reject', async () => {
        // setup: commit({ accepted: false })
        // assert: persistBlockMock not called
      });
    });
    ```
  - Comando: `pnpm test:run src/features/canvas-orchestrator/commit-block.test.ts -t 'persistence hook'`
  - Output esperado: FAIL.

- [ ] **Step 8.2** — Modificar `commit-block.ts`: após `if (input.accepted)`, gerar descrição NL via Gemini Flash (`generateText({ model: vertex('gemini-2.5-flash'), prompt: 'Descreva este bloco em uma frase: ${JSON.stringify(spec)}' })`) e chamar `persistBlockSpec`. Fire-and-forget com `.catch`.

- [ ] **Step 8.3** — Re-rodar.
  - Comando: `pnpm test:run src/features/canvas-orchestrator/commit-block.test.ts -t 'persistence hook'`
  - Output esperado: `2 passed`.

- [ ] **Step 8.4** — Commit.
  - `feat(canvas-orchestrator): persist accepted blocks for semantic recall`

---

## Task 9 — Integração: `fillBlock` consulta `recall_similar_block` como DRAFT

**Goal:** Antes de gerar bloco do zero, consulta recall e injeta top-1 spec como **hint no system prompt** (não como output direto).

- [ ] **Step 9.1 (failing test)** — Apender em `src/features/canvas-orchestrator/tools/fill-block.test.ts`:
    ```ts
    describe('fill-block draft hint', () => {
      it('injects recall_similar_block result as system hint, not as final output', async () => {
        // mock recall returns [{spec: {metric:'m1'}}]
        // assert: streamText called with system prompt containing 'spec sugerida (rascunho)' and JSON of m1
        // assert: streamText output is NOT identical to recall result (model still generates)
      });

      it('proceeds normally when recall returns empty', async () => {
        // mock recall returns []
        // assert: no hint section in system prompt
      });
    });
    ```
  - Comando: `pnpm test:run src/features/canvas-orchestrator/tools/fill-block.test.ts -t 'draft hint'`
  - Output esperado: FAIL.

- [ ] **Step 9.2** — Modificar `fill-block.ts`: dentro de `execute`, antes de `streamText`, chamar **diretamente** os helpers do `recall-store` (não a tool, para não consumir tool-call slot do LLM). Construir hint:
    ```ts
    import { embed } from 'ai';
    import { vertex } from '@ai-sdk/google-vertex';
    import { queryBlockEmbeddings, bumpReuse } from '@/shared/lib/memory/recall-store';

    let draftHint = '';
    try {
      const { embedding } = await embed({
        model: vertex.textEmbeddingModel('gemini-embedding-001'),
        value: intent,
      });
      const matches = await queryBlockEmbeddings({
        embedding, clientId: ctx.clientId, blockType, topK: 1,
      });
      if (matches.length > 0) {
        await bumpReuse('embeddings_blocks', [matches[0].id]);
        draftHint = `\n\n## Rascunho disponível (use como referência, NÃO como cópia)\n\`\`\`json\n${JSON.stringify(matches[0].blockSpec, null, 2)}\n\`\`\`\nGere uma versão adaptada ao contexto atual.`;
      }
    } catch (e) {
      // recall failures não bloqueiam fill-block
      console.warn('recall draft hint failed', e);
    }
    // append draftHint to system prompt
    ```

- [ ] **Step 9.3** — Re-rodar.
  - Comando: `pnpm test:run src/features/canvas-orchestrator/tools/fill-block.test.ts -t 'draft hint'`
  - Output esperado: `2 passed`.

- [ ] **Step 9.4** — Commit.
  - `feat(canvas-orchestrator): use recall_similar_block as draft hint in fill-block`

---

## Task 10 — Integração: `descriptive_agent` consulta `recall_similar_sql`

**Goal:** Sub-agente descritivo expõe `recall_similar_sql` como tool. Padrão: tenta recall primeiro; se score top-1 ≥ 0.85, sugere reuso ao orchestrator.

- [ ] **Step 10.1** — Modificar `src/features/ai-agents/sub-agents/descriptive.ts`:
  - A factory do sub-agente recebe `ctx: { clientId, personaId }` server-bound (ADR-0006). Adicionar `recall_similar_sql: createRecallSimilarSqlTool({ clientId: ctx.clientId, personaId: ctx.personaId })` ao mapa `tools`.
  - Atualizar system prompt: "Antes de chamar `query_data`, SEMPRE chame `recall_similar_sql` com a intent. Se houver match com score ≥0.85 e schema_snapshot compatível com schema atual, reuse o SQL."

- [ ] **Step 10.2 (failing test)** — `src/features/ai-agents/sub-agents/descriptive.test.ts`:
    ```ts
    it('exposes recall_similar_sql tool', async () => {
      // assert: tools map contains recall_similar_sql
    });
    ```
  - Comando: `pnpm test:run src/features/ai-agents/sub-agents/descriptive.test.ts`

- [ ] **Step 10.3** — Implementar e re-rodar.
  - Output esperado: passing.

- [ ] **Step 10.4** — Commit.
  - `feat(ai-agents): descriptive sub-agent consults recall_similar_sql before query_data`

---

## Task 11 — Cross-agent memory readOnly (TDD)

**Goal:** Sub-agentes recebem `MemoryService` com flag `readOnly: true`. Tentativa de chamar `setWorkingMemory`/`patchWorkingMemory`/tool `updateWorkingMemory` lança `ReadOnlyMemoryError`. Orchestrator é único escritor.

- [ ] **Step 11.1 (failing test)** — Criar `src/shared/lib/memory/readonly-guard.test.ts`:
    ```ts
    import { describe, it, expect, vi } from 'vitest';

    describe('createReadOnlyMemoryService', () => {
      it('allows getWorkingMemory + getMessages', async () => {
        const { createReadOnlyMemoryService } = await import('./readonly-guard');
        const svc = createReadOnlyMemoryService({ threadId: 't-1' });
        expect(typeof svc.getWorkingMemory).toBe('function');
        expect(typeof svc.getMessages).toBe('function');
      });

      it('throws ReadOnlyMemoryError on setWorkingMemory', async () => {
        const { createReadOnlyMemoryService, ReadOnlyMemoryError } = await import('./readonly-guard');
        const svc = createReadOnlyMemoryService({ threadId: 't-1' });
        await expect(svc.setWorkingMemory({} as never)).rejects.toBeInstanceOf(ReadOnlyMemoryError);
      });

      it('throws on patchWorkingMemory', async () => {
        const { createReadOnlyMemoryService, ReadOnlyMemoryError } = await import('./readonly-guard');
        const svc = createReadOnlyMemoryService({ threadId: 't-1' });
        await expect(svc.patchWorkingMemory({} as never)).rejects.toBeInstanceOf(ReadOnlyMemoryError);
      });

      it('updateWorkingMemory tool, when wrapped readOnly, throws', async () => {
        const { wrapToolReadOnly, ReadOnlyMemoryError } = await import('./readonly-guard');
        const fakeTool = { execute: vi.fn().mockResolvedValue({ ok: true }) };
        const wrapped = wrapToolReadOnly(fakeTool, 'updateWorkingMemory');
        await expect(wrapped.execute({}, {} as never)).rejects.toBeInstanceOf(ReadOnlyMemoryError);
      });
    });
    ```
  - Comando: `pnpm test:run src/shared/lib/memory/readonly-guard.test.ts`
  - Output esperado: FAIL.

- [ ] **Step 11.2** — Criar `src/shared/lib/memory/readonly-guard.ts`:
    ```ts
    import { getWorkingMemory, getMessages, type StoredMessage } from './memory-service';
    import type { WorkingMemory, WorkingMemoryPatch } from './schema';

    export class ReadOnlyMemoryError extends Error {
      constructor(operation: string) {
        super(`Memory operation '${operation}' not allowed on readOnly service (sub-agents cannot write working memory)`);
        this.name = 'ReadOnlyMemoryError';
      }
    }

    export interface ReadOnlyMemoryService {
      getWorkingMemory(): Promise<WorkingMemory | null>;
      getMessages(opts?: { limit?: number }): Promise<StoredMessage[]>;
      setWorkingMemory(_: WorkingMemory): Promise<never>;
      patchWorkingMemory(_: WorkingMemoryPatch): Promise<never>;
    }

    export function createReadOnlyMemoryService(opts: { threadId: string }): ReadOnlyMemoryService {
      return {
        getWorkingMemory: () => getWorkingMemory(opts.threadId),
        getMessages: (o = {}) => getMessages(opts.threadId, { limit: o.limit ?? 50 }),
        setWorkingMemory: () => Promise.reject(new ReadOnlyMemoryError('setWorkingMemory')),
        patchWorkingMemory: () => Promise.reject(new ReadOnlyMemoryError('patchWorkingMemory')),
      };
    }

    /**
     * Wrap any AI SDK tool to refuse execution. Useful for ensuring the
     * `updateWorkingMemory` tool from Sprint 1.A is never invocable by sub-agents.
     */
    export function wrapToolReadOnly<T extends { execute: (...a: unknown[]) => Promise<unknown> }>(
      _tool: T, name: string
    ): T {
      return {
        ..._tool,
        execute: () => Promise.reject(new ReadOnlyMemoryError(name)),
      } as T;
    }
    ```

- [ ] **Step 11.3** — Modificar `src/features/ai-agents/orchestrator.ts`: ao instanciar sub-agentes (descriptive/diagnostic/predictive/prescriptive), passar `readOnlyMemory = createReadOnlyMemoryService({threadId})` em vez do serviço completo. NÃO incluir tool `updateWorkingMemory` no map de tools dos sub-agentes.

- [ ] **Step 11.4** — Modificar cada sub-agente (`descriptive.ts`, etc): assinatura aceita `memory: ReadOnlyMemoryService`. Lê `getWorkingMemory()` no system prompt. Não tem tool de escrita.

- [ ] **Step 11.5 (failing test)** — `src/features/ai-agents/orchestrator.test.ts` apender:
    ```ts
    it('passes readOnly memory service to sub-agents', async () => {
      // mock createOrchestrator with threadId, sub-agent invoked
      // assert: sub-agent received readOnlyMemory; calling setWorkingMemory throws ReadOnlyMemoryError
    });

    it('orchestrator itself retains write access via updateWorkingMemory tool', async () => {
      // assert: orchestrator tools map contains updateWorkingMemory
    });
    ```
  - Comando: `pnpm test:run src/features/ai-agents/orchestrator.test.ts -t 'readOnly'`
  - Output esperado: passing após implementação.

- [ ] **Step 11.6** — Commit.
  - `feat(memory): cross-agent readOnly memory + sub-agent write guard`

---

## Task 12 — TTL/eviction cron

**Goal:** Cron diário deleta entries de `embeddings_sql` sem reuso por >90d. `embeddings_blocks` mantém versionamento (delete só quando `template_id` órfão e sem reuso).

- [ ] **Step 12.1 (failing test)** — Criar `src/shared/lib/memory/eviction.test.ts`:
    ```ts
    import { describe, it, expect, vi, beforeEach } from 'vitest';

    const queryMock = vi.fn();
    vi.mock('./pool', () => ({ getPool: () => ({ query: queryMock }) }));

    describe('runEviction', () => {
      beforeEach(() => queryMock.mockReset());

      it('deletes embeddings_sql older than 90d without reuse', async () => {
        queryMock.mockResolvedValue({ rowCount: 7 });
        const { runEviction } = await import('./eviction');
        const out = await runEviction({ now: new Date('2026-08-01T00:00:00.000Z') });
        const [sql, params] = queryMock.mock.calls[0];
        expect(sql).toMatch(/DELETE FROM embeddings_sql/i);
        expect(sql).toMatch(/last_reused_at IS NULL OR last_reused_at < \$1/);
        expect(params[0]).toEqual(new Date('2026-05-03T00:00:00.000Z'));
        expect(out.sqlDeleted).toBe(7);
      });

      it('respects injected date for testing', async () => {
        queryMock.mockResolvedValue({ rowCount: 0 });
        const { runEviction } = await import('./eviction');
        await runEviction({ now: new Date('2026-12-31T00:00:00.000Z') });
        expect(queryMock.mock.calls[0][1][0]).toEqual(new Date('2026-10-02T00:00:00.000Z'));
      });
    });
    ```
  - Comando: `pnpm test:run src/shared/lib/memory/eviction.test.ts`
  - Output esperado: FAIL.

- [ ] **Step 12.2** — Criar `src/shared/lib/memory/eviction.ts`:
    ```ts
    import { getPool } from './pool';
    import { recordMemoryMetric } from './metrics';

    export interface EvictionResult { sqlDeleted: number; blocksDeleted: number }

    export async function runEviction(opts: { now?: Date } = {}): Promise<EvictionResult> {
      const now = opts.now ?? new Date();
      const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const pool = getPool();
      const sqlRes = await pool.query(
        `DELETE FROM embeddings_sql
         WHERE created_at < $1 AND (last_reused_at IS NULL OR last_reused_at < $1)`,
        [cutoff]
      );
      const blockRes = await pool.query(
        `DELETE FROM embeddings_blocks
         WHERE created_at < $1 AND template_id IS NULL AND (last_reused_at IS NULL OR last_reused_at < $1)`,
        [cutoff]
      );
      recordMemoryMetric({ event: 'eviction.run', durationMs: 0, ok: true });
      return {
        sqlDeleted: sqlRes.rowCount ?? 0,
        blocksDeleted: blockRes.rowCount ?? 0,
      };
    }
    ```

- [ ] **Step 12.3** — Criar `scripts/eviction-cron.ts`:
    ```ts
    import { runEviction } from '@/shared/lib/memory/eviction';
    runEviction().then(r => { console.log(JSON.stringify({ severity: 'INFO', event: 'eviction.done', ...r })); process.exit(0); })
                  .catch(e => { console.error(e); process.exit(1); });
    ```
  - Adicionar script em `package.json`: `"cron:eviction": "tsx scripts/eviction-cron.ts"`.

- [ ] **Step 12.4** — Re-rodar.
  - Comando: `pnpm test:run src/shared/lib/memory/eviction.test.ts`
  - Output esperado: `2 passed`.

- [ ] **Step 12.5** — Commit.
  - `feat(memory): TTL eviction (90d unused) for embeddings_sql/blocks`

---

## Task 13 — PII regression suite (30 SQLs adversariais)

**Goal:** Dataset adversarial garante que PII scrubber bloqueia CPF/CNPJ/email mesmo em variações (com pontuação, sem pontuação, em strings, em hints).

- [ ] **Step 13.1** — Criar `docs/eval/adversarial-sql-pii.json` com 30 entries cobrindo:
  - CPF formatado (`123.456.789-01`) e cru (`12345678901`)
  - CNPJ formatado e cru
  - Email em string literal e em comentário
  - CPF em `JSON_EXTRACT` path
  - CPF em `LIKE '%12345678901%'`
  - CPF em UNION / subquery
  - Variações com case sensitivity, espaços, encoding

- [ ] **Step 13.2 (failing test)** — Criar `src/shared/lib/memory/persist-sql.regression.test.ts`:
    ```ts
    import { describe, it, expect } from 'vitest';
    import { readFileSync } from 'node:fs';
    import { scrubPii } from '@/shared/lib/rag/pii-scrubber';

    const fixtures = JSON.parse(readFileSync('docs/eval/adversarial-sql-pii.json', 'utf8')) as Array<{ id: string; sql: string; pii: string[] }>;

    describe('PII regression suite', () => {
      for (const f of fixtures) {
        it(`scrubs all PII in fixture ${f.id}`, () => {
          const out = scrubPii(f.sql);
          for (const literal of f.pii) {
            expect(out).not.toContain(literal);
          }
        });
      }
    });
    ```
  - Comando: `pnpm test:run src/shared/lib/memory/persist-sql.regression.test.ts`
  - Output esperado: 30 testes; falham se scrubber atual (Sprint 2.A) não cobre todos os casos.

- [ ] **Step 13.3** — Estender `scrubPii` em `src/shared/lib/rag/pii-scrubber.ts` (módulo de Sprint 2.A) conforme falhas (regex adicionais para casos perdidos). Iterar até 30/30 verde.

- [ ] **Step 13.4** — Commit.
  - `test(memory): adversarial PII regression suite (30 SQLs) + scrubber hardening`

---

## Task 14 — Telemetria de recall

**Goal:** Métricas estruturadas: `recall_hit_rate` por tipo, `tokens_saved` (estimativa).

- [ ] **Step 14.1 (failing test)** — Criar `src/shared/lib/telemetry/recall-metrics.test.ts`:
    ```ts
    import { describe, it, expect, vi, afterEach } from 'vitest';
    import { recordRecallMetric, estimateTokensSaved } from './recall-metrics';

    describe('recall-metrics', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      afterEach(() => spy.mockClear());

      it('emits structured log with kind+hit+score', () => {
        recordRecallMetric({ kind: 'sql', clientId: 'OM', hit: true, topScore: 0.91, topK: 5 });
        const line = JSON.parse(spy.mock.calls[0][0] as string);
        expect(line).toMatchObject({ component: 'recall', kind: 'sql', hit: true, topScore: 0.91 });
      });

      it('estimateTokensSaved returns positive when reused', () => {
        const out = estimateTokensSaved({ reused: true, sqlLength: 400 });
        expect(out).toBeGreaterThan(0);
      });

      it('estimateTokensSaved returns 0 when not reused', () => {
        expect(estimateTokensSaved({ reused: false, sqlLength: 400 })).toBe(0);
      });
    });
    ```
  - Comando: `pnpm test:run src/shared/lib/telemetry/recall-metrics.test.ts`
  - Output esperado: FAIL.

- [ ] **Step 14.2** — Criar `src/shared/lib/telemetry/recall-metrics.ts`:
    ```ts
    export interface RecallMetric {
      kind: 'sql' | 'block';
      clientId: string;
      hit: boolean;
      topScore: number | null;
      topK: number;
    }

    export function recordRecallMetric(m: RecallMetric): void {
      console.log(JSON.stringify({
        severity: 'INFO',
        component: 'recall',
        timestamp: new Date().toISOString(),
        ...m,
      }));
    }

    export function estimateTokensSaved(opts: { reused: boolean; sqlLength: number }): number {
      if (!opts.reused) return 0;
      // Crude heuristic: chars/4 ~= tokens; saved = generation prompt + reasoning
      return Math.round(opts.sqlLength / 4) + 200;
    }
    ```

- [ ] **Step 14.3** — Instrumentação já cabeada nas tools criadas em Tasks 5/6 (`recordRecallMetric` + `estimateTokensSaved`). Verificar via teste que o log estruturado é emitido em runtime real (smoke).

- [ ] **Step 14.4** — Re-rodar.
  - Comando: `pnpm test:run src/shared/lib/telemetry/recall-metrics.test.ts`
  - Output esperado: `3 passed`.

- [ ] **Step 14.5** — Commit.
  - `feat(telemetry): recall_hit_rate + tokens_saved metrics`

---

## Task 15 — Eval gold dataset (50 reuses) + smoke E2E

**Goal:** Dataset gold de 50 pares `(intent, expected SQL/block id)` para medir cache hit ≥40%. Smoke E2E roda 10 sessões repetidas.

- [ ] **Step 15.1** — Criar `docs/eval/gold-sql-reuses.json`:
    ```json
    [
      { "id": "g1", "clientId": "OM", "personaId": "originador",
        "seed_intent": "inadimplência por safra MCMV",
        "seed_sql": "SELECT safra, ... FROM ...",
        "test_intents": ["inadimplencia mensal por safra", "default rate por safra produto MCMV", "..."] }
      // ... 50 entradas
    ]
    ```

- [ ] **Step 15.2** — Criar `scripts/eval-semantic-recall.ts`:
    ```ts
    // 1. Para cada gold, persiste seed_sql via persistSqlGeneration.
    // 2. Para cada test_intent, chama recall_similar_sql.
    // 3. Conta hit (top-1 id == seed) / miss.
    // 4. Imprime { totalIntents, hits, hitRate }. Falha (exit 1) se hitRate < 0.40.
    ```
  - Adicionar script: `"eval:semantic-recall": "tsx scripts/eval-semantic-recall.ts"`.

- [ ] **Step 15.3** — Criar `docs/superpowers/specs/2026-05-04-sprint3-A-acceptance.md` com smoke E2E:
    ```markdown
    # Sprint 3.A — Acceptance smoke test

    ## Pre-req
    - Sprint 2.A concluído (pgvector + embeddings_docs + scrubber).
    - Postgres local rodando + migration 003 aplicada.

    ## Passos

    1. Seed: `pnpm migrate && pnpm eval:semantic-recall --mode=seed`
       Esperado: 50 entries em `embeddings_sql`, 0 PII na coluna `sql_text` (verificado por adversarial regex).
    2. Recall pass: `pnpm eval:semantic-recall --mode=test`
       Esperado: hit_rate ≥ 0.40.
    3. Cross-agent readOnly: rodar Canvas Builder com `descriptive_agent`; tentar via debugging/test injetar chamada a `setWorkingMemory` no sub-agente.
       Esperado: erro `ReadOnlyMemoryError`.
    4. TTL: rodar `pnpm cron:eviction` com data injetada >90d.
       Esperado: rows antigas deletadas; novas mantidas.
    5. Smoke E2E (10 sessões): roteiro de 10 briefings repetidos no Canvas → contar hits via `recall.hit=true` em logs.
       Esperado: cache hit ≥ 40%.

    ## Critérios de aprovação
    - [ ] hit_rate ≥ 0.40 (gold dataset)
    - [ ] PII regression 30/30 verde
    - [ ] ReadOnlyMemoryError lançado em tentativa de escrita por sub-agente
    - [ ] TTL deleta entries >90d sem reuso
    - [ ] Block draft NÃO substitui geração (output do model difere do recall)
    ```

- [ ] **Step 15.4** — Commit.
  - `test(memory): gold dataset + acceptance smoke for semantic recall`

---

## Acceptance Criteria

- `pnpm test:run src/shared/lib/memory src/features/ai-agents/tools/recall-similar-sql src/features/canvas-orchestrator/tools/recall-similar-block src/shared/lib/telemetry` verde com cobertura ≥80%.
- `pnpm eval:semantic-recall` retorna `hit_rate ≥ 0.40` no gold dataset (50 reusos).
- `pnpm test:run src/shared/lib/memory/persist-sql.regression.test.ts` 30/30 verde — zero literais de PII em embeddings.
- Cross-agent readOnly: tentativa de escrita por sub-agente lança `ReadOnlyMemoryError` (teste verifica).
- `pnpm cron:eviction` com data injetada >90d deleta entries sem reuso; entries com `last_reused_at` recente são mantidas.
- Bloco draft é injetado como hint no system prompt; output gerado difere textualmente do recall (verificado em `fill-block.test.ts`).
- `pnpm build` passa sem warnings novos.
- Smoke E2E (10 sessões repetidas no Canvas): cache hit ≥ 40% via logs `component=recall hit=true`.

---

## Riscos e rollback

- **PII vaza em SQL não coberto pelo scrubber**: regression suite de 30 fixtures + cron mensal de auditoria que samplea 100 rows e regex-checa contra catálogo de PII; rollback = feature flag `SEMANTIC_RECALL_ENABLED=false` desliga `persistSqlGeneration` e `recall_similar_sql`.
- **Drift de schema BQ invalida embeddings antigos**: `schema_snapshot` em metadata; tool de recall pode rejeitar match se schema_snapshot.tables ⊄ schema atual. Em última instância, re-ingest após mudança regulatória.
- **Bloco draft enviesa modelo a copiar literal**: prompt explicitamente marca como "rascunho, não copie". Teste E2E compara output vs recall e rejeita se idêntico.
- **HNSW index degrada com volume alto**: monitorar `pg_stat_user_indexes`; reconstruir index trimestralmente. `m=16, ef_construction=64` é baseline para ~10k vetores; revisitar em Sprint 4 se >100k.
- **Cold start Cloud Run + pgvector query**: pool reuse (Sprint 1.A) + p95 medido via `recall-metrics`; se >500ms, considerar cache LRU em memória do orchestrator (TTL 60s).
- **Eviction agressivo apaga padrões raros mas valiosos**: `last_reused_at` é bumped em todo recall, mesmo low-score; apenas entries verdadeiramente nunca reusadas em 90d são candidatas. Operacional: cron emite log antes de deletar; humano pode reverter via Cloud SQL backup nas primeiras 7d.

## Time de execução

- Tasks 1-2 (ADR + migration): agente `general-purpose` revisando ADR com `credit-risk-analyst`.
- Tasks 3-6 (pipelines + tools): agente `general-purpose` com TDD; `Explore` mapeia callers atuais de `query_data` antes da Task 7.
- Tasks 7-10 (integração): agente `general-purpose`.
- Task 11 (cross-agent readOnly): agente `general-purpose` — alta atenção a tipos.
- Tasks 12-14 (eviction + telemetria): agente `general-purpose`.
- Task 15 (eval + acceptance): agente `general-purpose` + revisão `credit-risk-analyst` para sanidade dos 50 pares gold.

---

## Self-Review

- **Spec coverage**: header literal preservado; 16 tasks (Task 2.5 adicionada para helpers locais; range 12-18); cada task tem 3-6 steps com checkbox `- [ ]`; código completo em todos os steps de implementação principais; comandos `pnpm test:run` com path e `-t` em todos os steps de teste; placeholders ausentes (paths absolutos/explícitos); type consistency (`RecallResult`/`EmbeddedSql`/`EmbeddedBlock` em `recall-store.ts`; `ReadOnlyMemoryService` interface separada).
- **Mismatches conhecidos**: Tasks 7/8 usam fire-and-forget `void promise.catch(...)` para não bloquear UX — registrado explicitamente. Task 9 chama helpers `queryBlockEmbeddings`/`bumpReuse` diretamente (não a tool exposta) para evitar dois turnos de tool calls; é um trade-off design. Task 10 expõe `recall_similar_sql` ao sub-agente como tool LLM-visível — pattern oposto a 9 e justificado: descritivo precisa do controle agentic de quando reusar. `clientId`/`personaId` são server-bound via factory closure em **todas** as tools (ADR-0006); inputSchema do tool nunca expõe esses campos.
- **Cobertura de plano-fonte (§5 Fase 3)**: `embeddings_sql` com `{intent, sql, schemaSnapshot, rowCount, latencyMs, clientId, personaId, glossaryVersion, regulatoryPackVersion}` (colunas dedicadas + jsonb metadata espelho) ✓; `embeddings_blocks` com spec serializada + descrição NL + `template_id` para versionamento ✓; tools `recall_similar_sql`/`recall_similar_block` com filtros multi-tenant obrigatórios server-bound ✓; integração `fillBlock` (hint, não final) ✓; integração `descriptive_agent` ✓; cross-agent readOnly via `ReadOnlyMemoryService` + `wrapToolReadOnly` + erro tipado ✓; TTL 90d com cron ✓; PII regression 30 fixtures ✓; telemetria `recall_hit_rate`+`tokens_saved` ✓; smoke E2E 10 sessões ≥40% ✓.
- **ADRs honradas**: ADR-0004 (pgvector único storage) — usa `getPool()` da Sprint 1.A; ADR-0006 (multi-tenancy strict) — `clientId`/`personaId` server-bound via factory closure, jamais em inputSchema; helpers `querySqlEmbeddings`/`queryBlockEmbeddings` rejeitam ausência; ADR-0009 (sql-reuse hierarchy) — recall posicionado entre catálogo e fresh-gen.
- **Sprint dependencies honradas**: Sprint 1.A (`memory-service`, `getPool`, `recordMemoryMetric`, `updateWorkingMemory` tool, schema Zod) consumida em Tasks 2.5, 11, 12; Sprint 1.C (`liquid_meta.sql_generations`) consumida implicitamente em Task 7 (hook após `query_data`); Sprint 2.A (`scrubPii` em `pii-scrubber.ts`, Vertex `gemini-embedding-001`, HNSW cosine) reutilizada em Tasks 3, 4, 13. Helpers `upsertSqlEmbedding`/`querySqlEmbeddings`/`upsertBlockEmbedding`/`queryBlockEmbeddings`/`bumpReuse` definidos localmente em Task 2.5 porque Sprint 2.A só expõe APIs específicas para `embeddings_docs`.
- **Pendente para sprints futuros (intencional)**: rerank por feedback (não cobre upvote/downvote do usuário); promoção de SQLs validados ao catálogo gerenciado por humanos (`credit-risk-analyst`); observational memory (deferido conforme plano-fonte §2.4); cross-client knowledge sharing (multi-tenant prevê isolamento estrito agora).
