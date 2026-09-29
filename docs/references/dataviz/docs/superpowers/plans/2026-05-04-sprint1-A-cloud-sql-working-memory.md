# Sprint 1.A — Cloud SQL + Working Memory + Test Infra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estabelecer infraestrutura de teste (vitest), persistência Cloud SQL Postgres, e working memory por sessão para o Canvas Orchestrator e Orchestrator analítico, sem RAG ainda.

**Architecture:** Vitest como runner (sprint todo depende). Cloud SQL Postgres + extensão pgvector instalada (apenas tabelas de threads/messages/working_memory na Fase 1; vetores ficam para Sprint 2). MemoryService em `src/shared/lib/memory/` com interface mínima Mastra-like (createThread, recall, updateWorkingMemory). Routes `/api/canvas-chat` e `/api/chat` declaram `runtime = 'nodejs'` e recebem `threadId` no body.

**Tech Stack:** Vitest 4.x (já instalado), pg 8.x (driver Postgres node), Cloud SQL Auth Proxy (sidecar/local) ou Cloud SQL Node.js Connector, Zod 4, Next.js 16 App Router, AI SDK v6.

---

## File Structure

```
liquid-play-dataviz/
├── vitest.config.ts                                            # NEW — Vitest config (alias @, @app)
├── src/
│   ├── test-setup.ts                                           # NEW — jest-dom matchers
│   ├── shared/
│   │   ├── lib/
│   │   │   └── memory/                                         # NEW DIR
│   │   │       ├── schema.ts                                   # NEW — Zod WorkingMemory
│   │   │       ├── schema.test.ts                              # NEW
│   │   │       ├── pool.ts                                     # NEW — pg.Pool singleton
│   │   │       ├── pool.test.ts                                # NEW
│   │   │       ├── memory-service.ts                           # NEW — createThread/get/setWorkingMemory/messages
│   │   │       ├── memory-service.test.ts                      # NEW
│   │   │       ├── metrics.ts                                  # NEW — structured logging
│   │   │       ├── metrics.test.ts                             # NEW
│   │   │       └── migrations/
│   │   │           └── 001_init.sql                            # NEW
│   │   └── stores/
│   │       └── app-store.ts                                    # MODIFY — add currentThreadId
│   │   └── stores/
│   │       └── app-store.test.ts                               # NEW
│   ├── features/
│   │   ├── ai-agents/
│   │   │   ├── orchestrator.ts                                 # MODIFY — accept threadId
│   │   │   └── tools/
│   │   │       ├── update-working-memory.ts                    # NEW
│   │   │       └── update-working-memory.test.ts               # NEW
│   │   └── canvas-orchestrator/
│   │       └── orchestrator.ts                                 # MODIFY — accept threadId, expose tool
│   └── widgets/
│       └── ai-sidebar/ui/AISidebar.tsx                         # MODIFY — send threadId in body
├── app/
│   └── api/
│       ├── canvas-chat/route.ts                                # MODIFY — runtime=nodejs, accept threadId
│       ├── canvas-chat/route.test.ts                           # NEW
│       └── chat/route.ts                                       # MODIFY — runtime=nodejs, accept threadId
├── scripts/
│   ├── db-up.sh                                                # NEW — docker run pgvector
│   └── migrate.ts                                              # NEW — apply migrations/*.sql
├── docs/
│   ├── local-dev.md                                            # NEW — local DB setup
│   └── superpowers/plans/
│       └── 2026-05-04-sprint1-A-acceptance.md                  # NEW — smoke test script
├── .env.example                                                # MODIFY — add DATABASE_URL etc.
└── package.json                                                # MODIFY — scripts + deps
```

---

## Task 1 — Garantir Vitest + happy-dom + plugin React

**Goal:** Sprint todo depende de um runner de teste. Vitest 4.x e happy-dom já estão em `devDependencies`; falta apenas o plugin React e o config.

- [ ] **Step 1.1** — Instalar plugin React do Vite (única dep faltante).
  - Comando:
    ```bash
    pnpm add -D @vitejs/plugin-react
    ```
  - Output esperado: `@vitejs/plugin-react` adicionado em `devDependencies`. As demais (`vitest@^4.1.5`, `happy-dom@^20.9.0`, `@testing-library/react@^16.3.2`, `@testing-library/jest-dom@^6.9.1`, `@vitest/ui@^4`) já estão presentes — confirmar via `pnpm ls vitest happy-dom @testing-library/react`.

- [ ] **Step 1.2** — Criar `vitest.config.ts` no root.
  - File: `vitest.config.ts`
  - Conteúdo completo:
    ```ts
    import { defineConfig } from 'vitest/config';
    import react from '@vitejs/plugin-react';
    import path from 'node:path';

    export default defineConfig({
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
          '@app': path.resolve(__dirname, './app'),
        },
      },
      test: {
        environment: 'happy-dom',
        globals: true,
        setupFiles: ['./src/test-setup.ts'],
        coverage: {
          provider: 'v8',
          reporter: ['text', 'html'],
          include: ['src/shared/lib/memory/**/*.ts'],
          exclude: ['**/*.test.ts', '**/migrations/**'],
        },
      },
    });
    ```

- [ ] **Step 1.3** — Criar `src/test-setup.ts`.
  - File: `src/test-setup.ts`
  - Conteúdo:
    ```ts
    import '@testing-library/jest-dom/vitest';
    ```

- [ ] **Step 1.4** — Adicionar scripts em `package.json` (na chave `scripts`):
    ```json
    "test": "vitest",
    "test:watch": "vitest watch",
    "test:run": "vitest run"
    ```

- [ ] **Step 1.5** — Sanity check.
  - File: `src/test-setup.test.ts` (temporário, removido no fim da Task 1)
    ```ts
    import { describe, it, expect } from 'vitest';
    describe('vitest infra', () => {
      it('runs a trivial assertion', () => {
        expect(1 + 1).toBe(2);
      });
    });
    ```
  - Comando: `pnpm test:run src/test-setup.test.ts -t 'runs a trivial assertion'`
  - Output esperado: `1 passed` (linhas tipo `Test Files  1 passed (1)` e `Tests  1 passed (1)`).
  - Após verde, deletar `src/test-setup.test.ts`.

- [ ] **Step 1.6** — Commit.
  - `chore(test): install vitest + happy-dom + testing-library`

---

## Task 2 — Configurar conexão Cloud SQL local (dev)

**Goal:** Dev local roda Postgres com pgvector via Docker, espelhando schema do Cloud SQL.

- [ ] **Step 2.1** — Apender em `.env.example`:
    ```
    # Cloud SQL Postgres (memory + RAG storage)
    DATABASE_URL=postgresql://liquid:liquid@localhost:5433/liquid_memory
    CLOUD_SQL_INSTANCE=liquid-micro-apps:us-central1:liquid-memory
    CLOUD_SQL_USER=liquid
    CLOUD_SQL_PASSWORD=liquid
    CLOUD_SQL_DATABASE=liquid_memory
    MEMORY_SERVICE_ENABLED=true
    ```

- [ ] **Step 2.2** — Criar `scripts/db-up.sh`:
    ```bash
    #!/usr/bin/env bash
    # Local Postgres (pgvector) for liquid-play-dataviz memory service.
    # Usage: ./scripts/db-up.sh
    # Stop: docker stop liquid-pg && docker rm liquid-pg
    set -euo pipefail

    NAME=liquid-pg
    PORT=5433
    USER=liquid
    PASS=liquid
    DB=liquid_memory

    if docker ps -a --format '{{.Names}}' | grep -q "^${NAME}$"; then
      echo "Container ${NAME} already exists. Starting..."
      docker start "${NAME}"
    else
      docker run -d \
        --name "${NAME}" \
        -e POSTGRES_USER="${USER}" \
        -e POSTGRES_PASSWORD="${PASS}" \
        -e POSTGRES_DB="${DB}" \
        -p "${PORT}:5432" \
        pgvector/pgvector:pg16
    fi

    echo "Waiting for Postgres to accept connections..."
    until docker exec "${NAME}" pg_isready -U "${USER}" -d "${DB}" >/dev/null 2>&1; do
      sleep 1
    done
    echo "Ready: postgresql://${USER}:${PASS}@localhost:${PORT}/${DB}"
    ```
  - Comando: `chmod +x scripts/db-up.sh && ./scripts/db-up.sh`
  - Output esperado: linha final `Ready: postgresql://liquid:liquid@localhost:5433/liquid_memory`.

- [ ] **Step 2.3** — Criar `docs/local-dev.md`:
    ```markdown
    # Local Dev — Memory Service

    ## Pré-requisitos
    - Docker
    - pnpm 10.32.1

    ## Subir Postgres local
    ```
    ./scripts/db-up.sh
    ```
    Conexão: `postgresql://liquid:liquid@localhost:5433/liquid_memory`.

    ## Rodar migrations
    ```
    pnpm migrate
    ```

    ## Encerrar
    ```
    docker stop liquid-pg && docker rm liquid-pg
    ```
    ```

- [ ] **Step 2.4** — Commit.
  - `chore(db): docker-based local postgres + env scaffolding`

---

## Task 3 — Criar migrations SQL e runner

**Goal:** Schema mínimo Fase 1 aplicável idempotentemente.

- [ ] **Step 3.1** — Instalar deps runtime/dev.
  - Comando:
    ```bash
    pnpm add pg
    pnpm add -D @types/pg tsx
    ```

- [ ] **Step 3.2** — Criar `src/shared/lib/memory/migrations/001_init.sql`:
    ```sql
    CREATE EXTENSION IF NOT EXISTS vector;

    CREATE TABLE IF NOT EXISTS threads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      resource_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_threads_resource ON threads(resource_id);
    CREATE INDEX IF NOT EXISTS idx_threads_client ON threads(client_id);

    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      parts JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_messages_thread_created
      ON messages(thread_id, created_at);

    CREATE TABLE IF NOT EXISTS working_memory (
      resource_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (resource_id, scope)
    );
    ```

- [ ] **Step 3.3** — Criar `scripts/migrate.ts`:
    ```ts
    import { readdirSync, readFileSync } from 'node:fs';
    import { join } from 'node:path';
    import { Pool } from 'pg';

    async function main() {
      const url = process.env.DATABASE_URL;
      if (!url) throw new Error('DATABASE_URL not set');
      const pool = new Pool({ connectionString: url, max: 2 });
      const dir = join(process.cwd(), 'src/shared/lib/memory/migrations');
      const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
      for (const f of files) {
        const sql = readFileSync(join(dir, f), 'utf8');
        console.log(`Applying ${f}...`);
        await pool.query(sql);
      }
      const { rows } = await pool.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
      );
      console.log('Tables:', rows.map((r) => r.table_name).join(', '));
      await pool.end();
    }

    main().catch((e) => {
      console.error(e);
      process.exit(1);
    });
    ```

- [ ] **Step 3.4** — Adicionar script em `package.json`:
    ```json
    "migrate": "tsx scripts/migrate.ts"
    ```

- [ ] **Step 3.5** — Aplicar migrations.
  - Comando: `DATABASE_URL=postgresql://liquid:liquid@localhost:5433/liquid_memory pnpm migrate`
  - Output esperado:
    ```
    Applying 001_init.sql...
    Tables: messages, threads, working_memory
    ```

- [ ] **Step 3.6** — Verificar manualmente.
  - Comando: `docker exec liquid-pg psql -U liquid -d liquid_memory -c '\dt'`
  - Output esperado: lista contendo `threads`, `messages`, `working_memory`.

- [ ] **Step 3.7** — Commit.
  - `feat(memory): initial schema + migration runner`

---

## Task 4 — Schema Zod do WorkingMemory

**Goal:** Tipo canônico validado, com limites de eviction explícitos.

- [ ] **Step 4.1 (failing test)** — Criar `src/shared/lib/memory/schema.test.ts`:
    ```ts
    import { describe, it, expect } from 'vitest';
    import { WorkingMemorySchema, type WorkingMemory } from './schema';

    const valid: WorkingMemory = {
      clientId: 'OM',
      personaId: 'originador',
      icpId: 'icp-1',
      productType: 'MCMV',
      briefing: 'Análise de inadimplência por safra',
      activeDashboardId: 'dash-123',
      pages: [],
      blocks: [],
      decisions: [],
      pendingQuestions: [],
    };

    describe('WorkingMemorySchema', () => {
      it('accepts a minimal valid payload', () => {
        expect(() => WorkingMemorySchema.parse(valid)).not.toThrow();
      });

      it('rejects more than 10 pages', () => {
        const tooMany = {
          ...valid,
          pages: Array.from({ length: 11 }, (_, i) => ({ id: `p${i}`, title: `P${i}` })),
        };
        expect(() => WorkingMemorySchema.parse(tooMany)).toThrow();
      });

      it('rejects more than 50 decisions', () => {
        const tooMany = {
          ...valid,
          decisions: Array.from({ length: 51 }, (_, i) => ({
            ts: new Date().toISOString(),
            kind: 'layout',
            rationale: `r${i}`,
          })),
        };
        expect(() => WorkingMemorySchema.parse(tooMany)).toThrow();
      });

      it('rejects missing clientId', () => {
        const { clientId, ...rest } = valid;
        expect(() => WorkingMemorySchema.parse(rest)).toThrow();
      });

      it('rejects non-string personaId', () => {
        expect(() =>
          WorkingMemorySchema.parse({ ...valid, personaId: 42 as unknown as string })
        ).toThrow();
      });
    });
    ```
  - Comando: `pnpm test:run src/shared/lib/memory/schema.test.ts`
  - Output esperado: `FAIL` (módulo `./schema` ainda não existe).

- [ ] **Step 4.2** — Criar `src/shared/lib/memory/schema.ts`:
    ```ts
    import { z } from 'zod';

    export const PageSchema = z.object({
      id: z.string(),
      title: z.string(),
      summary: z.string().optional(),
    });

    export const BlockSchema = z.object({
      id: z.string(),
      pageId: z.string(),
      kind: z.string(),
      spec: z.record(z.string(), z.unknown()).optional(),
    });

    export const DecisionSchema = z.object({
      ts: z.string(),
      kind: z.string(),
      rationale: z.string(),
    });

    export const WorkingMemorySchema = z.object({
      clientId: z.string().min(1),
      personaId: z.string().min(1),
      icpId: z.string().min(1),
      productType: z.string().min(1),
      briefing: z.string().default(''),
      activeDashboardId: z.string().nullable().default(null),
      pages: z.array(PageSchema).max(10).default([]),
      blocks: z.array(BlockSchema).max(40).default([]),
      decisions: z.array(DecisionSchema).max(50).default([]),
      pendingQuestions: z.array(z.string()).max(10).default([]),
    });

    export type WorkingMemory = z.infer<typeof WorkingMemorySchema>;

    export const WorkingMemoryPatchSchema = WorkingMemorySchema.partial();
    export type WorkingMemoryPatch = z.infer<typeof WorkingMemoryPatchSchema>;
    ```

- [ ] **Step 4.3** — Re-rodar testes.
  - Comando: `pnpm test:run src/shared/lib/memory/schema.test.ts`
  - Output esperado: `5 passed`.

- [ ] **Step 4.4** — Commit.
  - `feat(memory): zod schema for working memory with eviction limits`

---

## Task 5 — Pool singleton (pg)

**Goal:** Reuso de conexões em ambiente Next.js (route handlers).

- [ ] **Step 5.1 (failing test)** — Criar `src/shared/lib/memory/pool.test.ts`:
    ```ts
    import { describe, it, expect, vi, beforeEach } from 'vitest';

    const ctorSpy = vi.fn();
    vi.mock('pg', () => ({
      Pool: class {
        constructor(opts: unknown) {
          ctorSpy(opts);
        }
      },
    }));

    describe('getPool', () => {
      beforeEach(() => {
        vi.resetModules();
        ctorSpy.mockReset();
        process.env.DATABASE_URL = 'postgresql://x:y@localhost:5433/z';
      });

      it('is a singleton', async () => {
        const { getPool } = await import('./pool');
        const a = getPool();
        const b = getPool();
        expect(a).toBe(b);
        expect(ctorSpy).toHaveBeenCalledTimes(1);
      });

      it('passes connectionString and max=5', async () => {
        const { getPool } = await import('./pool');
        getPool();
        expect(ctorSpy).toHaveBeenCalledWith({
          connectionString: 'postgresql://x:y@localhost:5433/z',
          max: 5,
        });
      });

      it('throws if DATABASE_URL missing', async () => {
        delete process.env.DATABASE_URL;
        const { getPool } = await import('./pool');
        expect(() => getPool()).toThrow(/DATABASE_URL/);
      });
    });
    ```
  - Comando: `pnpm test:run src/shared/lib/memory/pool.test.ts`
  - Output esperado: FAIL (módulo ausente).

- [ ] **Step 5.2** — Criar `src/shared/lib/memory/pool.ts`:
    ```ts
    import { Pool } from 'pg';

    let cached: Pool | null = null;

    export function getPool(): Pool {
      if (cached) return cached;
      const url = process.env.DATABASE_URL;
      if (!url) throw new Error('DATABASE_URL is not set');
      cached = new Pool({ connectionString: url, max: 5 });
      return cached;
    }

    export function __resetPoolForTests(): void {
      cached = null;
    }
    ```

- [ ] **Step 5.3** — Re-rodar.
  - Comando: `pnpm test:run src/shared/lib/memory/pool.test.ts`
  - Output esperado: `3 passed`.

- [ ] **Step 5.4** — Commit.
  - `feat(memory): pg pool singleton`

---

## Task 6 — MemoryService.createThread

**Goal:** Criar threads referenciados por `resourceId = ${clientId}:${userId}`.

- [ ] **Step 6.1 (failing test)** — Criar `src/shared/lib/memory/memory-service.test.ts`:
    ```ts
    import { describe, it, expect, vi, beforeEach } from 'vitest';

    const queryMock = vi.fn();
    vi.mock('./pool', () => ({
      getPool: () => ({ query: queryMock }),
    }));

    describe('MemoryService.createThread', () => {
      beforeEach(() => queryMock.mockReset());

      it('inserts a thread row and returns it', async () => {
        const now = new Date();
        queryMock.mockResolvedValueOnce({
          rows: [
            {
              id: '11111111-1111-1111-1111-111111111111',
              resource_id: 'OM:user@example.com',
              client_id: 'OM',
              created_at: now,
            },
          ],
        });

        const { createThread } = await import('./memory-service');
        const t = await createThread({ resourceId: 'OM:user@example.com', clientId: 'OM' });

        expect(t).toEqual({
          id: '11111111-1111-1111-1111-111111111111',
          resourceId: 'OM:user@example.com',
          clientId: 'OM',
          createdAt: now,
        });
        expect(queryMock).toHaveBeenCalledOnce();
        const [sql, params] = queryMock.mock.calls[0];
        expect(sql).toMatch(/INSERT INTO threads/i);
        expect(params).toEqual(['OM:user@example.com', 'OM', {}]);
      });
    });
    ```
  - Comando: `pnpm test:run src/shared/lib/memory/memory-service.test.ts -t 'createThread'`
  - Output esperado: FAIL.

- [ ] **Step 6.2** — Criar `src/shared/lib/memory/memory-service.ts`:
    ```ts
    import { getPool } from './pool';
    import {
      WorkingMemorySchema,
      WorkingMemoryPatchSchema,
      type WorkingMemory,
      type WorkingMemoryPatch,
    } from './schema';

    export interface Thread {
      id: string;
      resourceId: string;
      clientId: string;
      createdAt: Date;
    }

    export async function createThread(input: {
      resourceId: string;
      clientId: string;
      metadata?: Record<string, unknown>;
    }): Promise<Thread> {
      const pool = getPool();
      const { rows } = await pool.query(
        `INSERT INTO threads(resource_id, client_id, metadata)
         VALUES ($1, $2, $3)
         RETURNING id, resource_id, client_id, created_at`,
        [input.resourceId, input.clientId, input.metadata ?? {}]
      );
      const r = rows[0];
      return {
        id: r.id,
        resourceId: r.resource_id,
        clientId: r.client_id,
        createdAt: r.created_at,
      };
    }
    ```

- [ ] **Step 6.3** — Re-rodar.
  - Comando: `pnpm test:run src/shared/lib/memory/memory-service.test.ts -t 'createThread'`
  - Output esperado: `1 passed`.

- [ ] **Step 6.4** — Commit.
  - `feat(memory): createThread`

---

## Task 7 — getWorkingMemory / setWorkingMemory

**Goal:** Upsert por `(resource_id, scope)`; leitura validada por Zod.

- [ ] **Step 7.1 (failing test)** — Apender em `memory-service.test.ts`:
    ```ts
    describe('MemoryService working memory', () => {
      beforeEach(() => queryMock.mockReset());

      const baseWM = {
        clientId: 'OM',
        personaId: 'originador',
        icpId: 'icp-1',
        productType: 'MCMV',
        briefing: 'b',
        activeDashboardId: null,
        pages: [],
        blocks: [],
        decisions: [],
        pendingQuestions: [],
      };

      it('setWorkingMemory upserts and returns parsed payload', async () => {
        queryMock.mockResolvedValueOnce({ rows: [{ payload: baseWM }] });
        const { setWorkingMemory } = await import('./memory-service');
        const out = await setWorkingMemory('thread-1', baseWM);
        expect(out.clientId).toBe('OM');
        const [sql, params] = queryMock.mock.calls[0];
        expect(sql).toMatch(/INSERT INTO working_memory/i);
        expect(sql).toMatch(/ON CONFLICT/i);
        expect(params[0]).toBe('thread-1');
        expect(params[1]).toBe('thread');
      });

      it('getWorkingMemory returns null when row missing', async () => {
        queryMock.mockResolvedValueOnce({ rows: [] });
        const { getWorkingMemory } = await import('./memory-service');
        const out = await getWorkingMemory('missing');
        expect(out).toBeNull();
      });

      it('getWorkingMemory throws on invalid payload', async () => {
        queryMock.mockResolvedValueOnce({ rows: [{ payload: { clientId: 1 } }] });
        const { getWorkingMemory } = await import('./memory-service');
        await expect(getWorkingMemory('bad')).rejects.toThrow();
      });
    });
    ```
  - Comando: `pnpm test:run src/shared/lib/memory/memory-service.test.ts -t 'working memory'`
  - Output esperado: FAIL.

- [ ] **Step 7.2** — Apender em `memory-service.ts`:
    ```ts
    export async function setWorkingMemory(
      threadId: string,
      payload: WorkingMemory
    ): Promise<WorkingMemory> {
      const validated = WorkingMemorySchema.parse(payload);
      const pool = getPool();
      const { rows } = await pool.query(
        `INSERT INTO working_memory(resource_id, scope, payload)
         VALUES ($1, $2, $3)
         ON CONFLICT (resource_id, scope)
         DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()
         RETURNING payload`,
        [threadId, 'thread', validated]
      );
      return WorkingMemorySchema.parse(rows[0].payload);
    }

    export async function getWorkingMemory(threadId: string): Promise<WorkingMemory | null> {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT payload FROM working_memory WHERE resource_id = $1 AND scope = 'thread'`,
        [threadId]
      );
      if (rows.length === 0) return null;
      return WorkingMemorySchema.parse(rows[0].payload);
    }

    export async function patchWorkingMemory(
      threadId: string,
      patch: WorkingMemoryPatch
    ): Promise<WorkingMemory> {
      const validatedPatch = WorkingMemoryPatchSchema.parse(patch);
      const current = (await getWorkingMemory(threadId)) ?? null;
      const merged: WorkingMemory = WorkingMemorySchema.parse({
        ...(current ?? {}),
        ...validatedPatch,
      });
      return setWorkingMemory(threadId, merged);
    }
    ```

- [ ] **Step 7.3** — Re-rodar.
  - Comando: `pnpm test:run src/shared/lib/memory/memory-service.test.ts -t 'working memory'`
  - Output esperado: `3 passed`.

- [ ] **Step 7.4** — Commit.
  - `feat(memory): get/set/patch working memory with zod validation`

---

## Task 8 — appendMessage / getMessages

**Goal:** Persistência de UIMessages (AI SDK v6).

- [ ] **Step 8.1 (failing test)** — Apender em `memory-service.test.ts`:
    ```ts
    describe('MemoryService messages', () => {
      beforeEach(() => queryMock.mockReset());

      it('appendMessage inserts row', async () => {
        queryMock.mockResolvedValueOnce({
          rows: [{ id: 'm-1', thread_id: 't-1', role: 'user', parts: [{ type: 'text', text: 'oi' }], created_at: new Date() }],
        });
        const { appendMessage } = await import('./memory-service');
        const out = await appendMessage('t-1', { role: 'user', parts: [{ type: 'text', text: 'oi' }] });
        expect(out.role).toBe('user');
        const [sql, params] = queryMock.mock.calls[0];
        expect(sql).toMatch(/INSERT INTO messages/i);
        expect(params).toEqual(['t-1', 'user', [{ type: 'text', text: 'oi' }]]);
      });

      it('getMessages returns latest first with limit', async () => {
        queryMock.mockResolvedValueOnce({
          rows: [
            { id: 'b', thread_id: 't', role: 'assistant', parts: [], created_at: new Date(2) },
            { id: 'a', thread_id: 't', role: 'user', parts: [], created_at: new Date(1) },
          ],
        });
        const { getMessages } = await import('./memory-service');
        const out = await getMessages('t', { limit: 50 });
        expect(out).toHaveLength(2);
        const [sql, params] = queryMock.mock.calls[0];
        expect(sql).toMatch(/SELECT.*FROM messages/i);
        expect(params).toEqual(['t', 50]);
      });
    });
    ```
  - Comando: `pnpm test:run src/shared/lib/memory/memory-service.test.ts -t 'messages'`
  - Output esperado: FAIL.

- [ ] **Step 8.2** — Apender em `memory-service.ts`:
    ```ts
    export interface StoredMessage {
      id: string;
      threadId: string;
      role: 'user' | 'assistant' | 'system' | 'tool';
      parts: unknown[];
      createdAt: Date;
    }

    export async function appendMessage(
      threadId: string,
      input: { role: StoredMessage['role']; parts: unknown[] }
    ): Promise<StoredMessage> {
      const pool = getPool();
      const { rows } = await pool.query(
        `INSERT INTO messages(thread_id, role, parts)
         VALUES ($1, $2, $3)
         RETURNING id, thread_id, role, parts, created_at`,
        [threadId, input.role, input.parts]
      );
      const r = rows[0];
      return {
        id: r.id,
        threadId: r.thread_id,
        role: r.role,
        parts: r.parts,
        createdAt: r.created_at,
      };
    }

    export async function getMessages(
      threadId: string,
      opts: { limit?: number } = {}
    ): Promise<StoredMessage[]> {
      const pool = getPool();
      const limit = opts.limit ?? 50;
      const { rows } = await pool.query(
        `SELECT id, thread_id, role, parts, created_at
         FROM messages
         WHERE thread_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [threadId, limit]
      );
      return rows.map((r) => ({
        id: r.id,
        threadId: r.thread_id,
        role: r.role,
        parts: r.parts,
        createdAt: r.created_at,
      }));
    }
    ```

- [ ] **Step 8.3** — Re-rodar.
  - Comando: `pnpm test:run src/shared/lib/memory/memory-service.test.ts -t 'messages'`
  - Output esperado: `2 passed`.

- [ ] **Step 8.4** — Commit.
  - `feat(memory): appendMessage/getMessages`

---

## Task 9 — Tool `updateWorkingMemory` (AI SDK v6)

**Goal:** Tool exposta a agentes para mutar working memory por patch parcial.

- [ ] **Step 9.1 (failing test)** — Criar `src/features/ai-agents/tools/update-working-memory.test.ts`:
    ```ts
    import { describe, it, expect, vi, beforeEach } from 'vitest';

    const getWMMock = vi.fn();
    const setWMMock = vi.fn();
    vi.mock('@/shared/lib/memory/memory-service', () => ({
      getWorkingMemory: getWMMock,
      setWorkingMemory: setWMMock,
    }));

    const baseWM = {
      clientId: 'OM',
      personaId: 'originador',
      icpId: 'icp-1',
      productType: 'MCMV',
      briefing: 'b',
      activeDashboardId: null,
      pages: [],
      blocks: [],
      decisions: [],
      pendingQuestions: [],
    };

    describe('updateWorkingMemory tool', () => {
      beforeEach(() => {
        getWMMock.mockReset();
        setWMMock.mockReset();
      });

      it('merges patch with current and persists', async () => {
        getWMMock.mockResolvedValueOnce(baseWM);
        setWMMock.mockImplementation(async (_t, p) => p);

        const { createUpdateWorkingMemoryTool } = await import('./update-working-memory');
        const tool = createUpdateWorkingMemoryTool({ threadId: 't-1' });

        const result = await tool.execute(
          { patch: { briefing: 'novo brief', pendingQuestions: ['q1'] } },
          { toolCallId: 'tc-1', messages: [] } as never
        );

        expect(setWMMock).toHaveBeenCalledOnce();
        const [, payload] = setWMMock.mock.calls[0];
        expect(payload.briefing).toBe('novo brief');
        expect(payload.pendingQuestions).toEqual(['q1']);
        expect(payload.clientId).toBe('OM');
        expect(result.ok).toBe(true);
      });

      it('rejects patches that violate eviction limits', async () => {
        getWMMock.mockResolvedValueOnce(baseWM);
        const { createUpdateWorkingMemoryTool } = await import('./update-working-memory');
        const tool = createUpdateWorkingMemoryTool({ threadId: 't-1' });

        const tooMany = Array.from({ length: 11 }, (_, i) => ({ id: `p${i}`, title: `P${i}` }));
        await expect(
          tool.execute({ patch: { pages: tooMany } }, { toolCallId: 'tc', messages: [] } as never)
        ).rejects.toThrow();
      });
    });
    ```
  - Comando: `pnpm test:run src/features/ai-agents/tools/update-working-memory.test.ts`
  - Output esperado: FAIL.

- [ ] **Step 9.2** — Criar `src/features/ai-agents/tools/update-working-memory.ts`:
    ```ts
    import { tool } from 'ai';
    import { z } from 'zod';
    import {
      getWorkingMemory,
      setWorkingMemory,
    } from '@/shared/lib/memory/memory-service';
    import {
      WorkingMemorySchema,
      WorkingMemoryPatchSchema,
    } from '@/shared/lib/memory/schema';

    export function createUpdateWorkingMemoryTool(opts: { threadId: string }) {
      return tool({
        description:
          'Atualiza a working memory da sessão (clientId, briefing, decisões, blocos, pendências). Use SEMPRE que decisões importantes forem tomadas.',
        inputSchema: z.object({ patch: WorkingMemoryPatchSchema }),
        execute: async ({ patch }) => {
          const current = await getWorkingMemory(opts.threadId);
          const merged = WorkingMemorySchema.parse({
            ...(current ?? {}),
            ...patch,
          });
          await setWorkingMemory(opts.threadId, merged);
          return { ok: true as const, persisted: true };
        },
      });
    }
    ```

- [ ] **Step 9.3** — Re-rodar.
  - Comando: `pnpm test:run src/features/ai-agents/tools/update-working-memory.test.ts`
  - Output esperado: `2 passed`.

- [ ] **Step 9.4** — Commit.
  - `feat(ai-agents): updateWorkingMemory tool`

---

## Task 10 — `runtime = 'nodejs'` nas routes

**Goal:** `pg` é Node-only; routes precisam declarar runtime explicitamente.

- [ ] **Step 10.1** — Modificar `app/api/canvas-chat/route.ts`: adicionar no topo (antes dos `import`s) `export const runtime = 'nodejs';`. A linha existente `export const maxDuration = 600;` (linha 6) é mantida — Cloud Run permite até 3600s e o builder pode encadear muitos steps; não reduzir nesta sprint.

- [ ] **Step 10.2** — Modificar `app/api/chat/route.ts`: adicionar `export const runtime = 'nodejs';` no topo. `export const maxDuration = 300;` (linha 6) é mantido inalterado.

- [ ] **Step 10.3** — Verificar.
  - Comando: `pnpm lint`
  - Output esperado: zero errors novos relativos a essas duas rotas.

- [ ] **Step 10.4** — Commit.
  - `chore(api): force nodejs runtime on chat routes`

---

## Task 11 — Aceitar `threadId` no body

**Goal:** Front envia `threadId`; route cria thread novo se ausente.

- [ ] **Step 11.1 (failing test)** — Criar `app/api/canvas-chat/route.test.ts`:
    ```ts
    import { describe, it, expect, vi, beforeEach } from 'vitest';

    const verifyAuthMock = vi.fn();
    const verifyAccessMock = vi.fn();
    const createThreadMock = vi.fn();
    const orchestratorMock = vi.fn();

    vi.mock('@/shared/lib/api-auth', () => ({
      verifyAuthToken: (...a: unknown[]) => verifyAuthMock(...a),
      verifyDatasetAccess: (...a: unknown[]) => verifyAccessMock(...a),
    }));
    vi.mock('@/shared/lib/memory/memory-service', () => ({
      createThread: (...a: unknown[]) => createThreadMock(...a),
    }));
    vi.mock('@/features/canvas-orchestrator/orchestrator', () => ({
      createCanvasOrchestrator: (...a: unknown[]) => orchestratorMock(...a),
    }));

    function makeReq(body: unknown) {
      return new Request('http://localhost/api/canvas-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    const baseBody = {
      messages: [],
      dataset: 'OM',
      filters: { dateRange: { start: '2026-01-01', end: '2026-02-01' } },
      pagesContext: [],
    };

    describe('POST /api/canvas-chat', () => {
      beforeEach(() => {
        verifyAuthMock.mockReset();
        verifyAccessMock.mockReset();
        createThreadMock.mockReset();
        orchestratorMock.mockReset();

        verifyAuthMock.mockResolvedValue('user@example.com');
        verifyAccessMock.mockResolvedValue({ allowed: true });
        orchestratorMock.mockResolvedValue({
          toUIMessageStreamResponse: () => new Response('ok'),
        });
      });

      it('creates a new thread when threadId is missing', async () => {
        createThreadMock.mockResolvedValue({
          id: 'new-thread',
          resourceId: 'OM:user@example.com',
          clientId: 'OM',
          createdAt: new Date(),
        });
        const { POST } = await import('./route');
        await POST(makeReq(baseBody));
        expect(createThreadMock).toHaveBeenCalledOnce();
        const callArg = orchestratorMock.mock.calls[0][0];
        expect(callArg.threadId).toBe('new-thread');
      });

      it('reuses provided threadId', async () => {
        const { POST } = await import('./route');
        await POST(makeReq({ ...baseBody, threadId: 'existing-thread' }));
        expect(createThreadMock).not.toHaveBeenCalled();
        expect(orchestratorMock.mock.calls[0][0].threadId).toBe('existing-thread');
      });
    });
    ```
  - Comando: `pnpm test:run app/api/canvas-chat/route.test.ts`
  - Output esperado: FAIL.

- [ ] **Step 11.2** — Modificar `app/api/canvas-chat/route.ts` (versão final):
    ```ts
    export const runtime = 'nodejs';
    export const maxDuration = 600;

    import type { UIMessage } from 'ai';
    import type { ChatRequestFilters, CanvasPageContext } from '@/shared/config/agents/types';
    import { createCanvasOrchestrator } from '@/features/canvas-orchestrator/orchestrator';
    import { verifyAuthToken, verifyDatasetAccess } from '@/shared/lib/api-auth';
    import { createThread } from '@/shared/lib/memory/memory-service';

    export async function POST(req: Request) {
      const email = await verifyAuthToken(req);
      if (!email) {
        return new Response(JSON.stringify({ error: 'Nao autenticado' }), { status: 401 });
      }

      let body: {
        messages: UIMessage[];
        dataset: string;
        filters: ChatRequestFilters;
        pagesContext: CanvasPageContext[];
        bqmlEnabled?: boolean;
        selectedBlockIds?: string[];
        dashboardState?: string;
        page?: string;
        threadId?: string;
      };

      try {
        body = await req.json();
      } catch {
        return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400 });
      }

      if (!body.dataset || !body.messages) {
        return new Response(JSON.stringify({ error: 'Campos obrigatórios: dataset, messages' }), { status: 400 });
      }

      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (
        !body.filters ||
        !body.filters.dateRange ||
        !dateRegex.test(body.filters.dateRange.start) ||
        !dateRegex.test(body.filters.dateRange.end)
      ) {
        return new Response(
          JSON.stringify({ error: 'filters.dateRange com start e end (YYYY-MM-DD) é obrigatório' }),
          { status: 400 }
        );
      }

      const access = await verifyDatasetAccess(email, body.dataset);
      if (!access.allowed) {
        return new Response(JSON.stringify({ error: access.error }), { status: access.status });
      }

      let threadId = body.threadId;
      if (!threadId) {
        const t = await createThread({
          resourceId: `${body.dataset}:${email}`,
          clientId: body.dataset,
        });
        threadId = t.id;
      }

      const result = await createCanvasOrchestrator({
        messages: body.messages,
        dataset: body.dataset,
        filters: body.filters,
        pagesContext: body.pagesContext ?? [],
        bqmlEnabled: body.bqmlEnabled ?? false,
        selectedBlockIds: body.selectedBlockIds ?? [],
        dashboardState: body.dashboardState,
        page: body.page,
        threadId,
      });

      const res = result.toUIMessageStreamResponse();
      res.headers.set('x-thread-id', threadId);
      return res;
    }
    ```

- [ ] **Step 11.3** — Replicar mudança equivalente em `app/api/chat/route.ts` (extrair `threadId`, criar via `createThread` se ausente, passar ao orchestrator analítico, expor header `x-thread-id`).

- [ ] **Step 11.4** — Re-rodar.
  - Comando: `pnpm test:run app/api/canvas-chat/route.test.ts`
  - Output esperado: `2 passed`.

- [ ] **Step 11.5** — Commit.
  - `feat(api): accept threadId in chat routes; auto-create when absent`

---

## Task 12 — Integrar MemoryService no orchestrator analítico

**Goal:** Orchestrator lê working memory e injeta no system prompt.

- [ ] **Step 12.1** — Modificar `src/features/ai-agents/orchestrator.ts:26` (assinatura `createOrchestrator`).
  - Acrescentar campo `threadId?: string` no objeto de input.
  - Antes do `streamText`, adicionar:
    ```ts
    let workingMemoryContext = '';
    if (input.threadId) {
      const { getWorkingMemory } = await import('@/shared/lib/memory/memory-service');
      const wm = await getWorkingMemory(input.threadId).catch(() => null);
      if (wm) {
        workingMemoryContext = [
          '\n\n## Working memory (sessão atual)',
          `- clientId: ${wm.clientId}`,
          `- personaId: ${wm.personaId}`,
          `- icpId: ${wm.icpId}`,
          `- productType: ${wm.productType}`,
          `- briefing: ${wm.briefing || '(vazio)'}`,
          `- activeDashboardId: ${wm.activeDashboardId ?? '(nenhum)'}`,
          `- decisions: ${wm.decisions.length}`,
          `- pendingQuestions: ${wm.pendingQuestions.join(' | ') || '(nenhuma)'}`,
        ].join('\n');
      }
    }
    ```
  - Concatenar `workingMemoryContext` ao system prompt existente (variável já definida em `createOrchestrator`).

- [ ] **Step 12.2** — Garantir que `compactMessages` não é alterado (Fase 1 mantém histórico do front). Adicionar comentário:
    ```ts
    // Phase 1: messages still come from the client. Persistence of messages
    // happens out-of-band and does not affect compaction.
    ```

- [ ] **Step 12.3** — Verificação.
  - Comando: `pnpm lint && pnpm test:run`
  - Output esperado: lint zero erros novos; testes existentes passam.

- [ ] **Step 12.4** — Commit.
  - `feat(ai-agents): inject working memory in analytic orchestrator system prompt`

---

## Task 13 — Integrar no Canvas Orchestrator + expor tool

**Goal:** Builder lê working memory e pode atualizar via tool.

- [ ] **Step 13.1 (failing test)** — Criar `src/features/canvas-orchestrator/orchestrator.test.ts`:
    ```ts
    import { describe, it, expect, vi, beforeEach } from 'vitest';

    const streamTextMock = vi.fn(() => ({
      toUIMessageStreamResponse: () => new Response('ok'),
    }));
    vi.mock('ai', async (orig) => {
      const mod = await orig<typeof import('ai')>();
      return { ...mod, streamText: streamTextMock };
    });

    vi.mock('@/shared/lib/memory/memory-service', () => ({
      getWorkingMemory: vi.fn().mockResolvedValue(null),
    }));

    describe('createCanvasOrchestrator', () => {
      beforeEach(() => streamTextMock.mockClear());

      it('exposes updateWorkingMemory tool when threadId provided', async () => {
        const { createCanvasOrchestrator } = await import('./orchestrator');
        await createCanvasOrchestrator({
          messages: [],
          dataset: 'OM',
          filters: { dateRange: { start: '2026-01-01', end: '2026-02-01' } },
          pagesContext: [],
          threadId: 't-1',
        } as never);
        const cfg = streamTextMock.mock.calls[0][0];
        expect(cfg.tools).toHaveProperty('updateWorkingMemory');
      });

      it('does not expose updateWorkingMemory without threadId', async () => {
        const { createCanvasOrchestrator } = await import('./orchestrator');
        await createCanvasOrchestrator({
          messages: [],
          dataset: 'OM',
          filters: { dateRange: { start: '2026-01-01', end: '2026-02-01' } },
          pagesContext: [],
        } as never);
        const cfg = streamTextMock.mock.calls[0][0];
        expect(cfg.tools).not.toHaveProperty('updateWorkingMemory');
      });
    });
    ```
  - Comando: `pnpm test:run src/features/canvas-orchestrator/orchestrator.test.ts`
  - Output esperado: FAIL.

- [ ] **Step 13.2** — Modificar `src/features/canvas-orchestrator/orchestrator.ts:33`:
  - Acrescentar `threadId?: string` na assinatura.
  - Antes de `streamText`, ler working memory (mesmo padrão da Task 12) e construir `extraSystem`.
  - Construir `tools` final como:
    ```ts
    const tools: Record<string, unknown> = { ...existingTools };
    if (input.threadId) {
      const { createUpdateWorkingMemoryTool } = await import(
        '@/features/ai-agents/tools/update-working-memory'
      );
      tools.updateWorkingMemory = createUpdateWorkingMemoryTool({ threadId: input.threadId });
    }
    ```
  - Passar `tools` para `streamText`.

- [ ] **Step 13.3** — Re-rodar.
  - Comando: `pnpm test:run src/features/canvas-orchestrator/orchestrator.test.ts`
  - Output esperado: `2 passed`.

- [ ] **Step 13.4** — Commit.
  - `feat(canvas-orchestrator): wire working memory + updateWorkingMemory tool`

---

## Task 14 — Frontend: Zustand persiste threadId

**Goal:** Mesma sessão = mesma thread por client.

- [ ] **Step 14.1 (failing test)** — Criar `src/shared/stores/app-store.test.ts`:
    ```ts
    import { describe, it, expect, beforeEach } from 'vitest';
    import { useAppStore } from './app-store';

    describe('app-store currentThreadId', () => {
      beforeEach(() => {
        useAppStore.setState({ currentThreadId: null });
      });

      it('starts as null', () => {
        expect(useAppStore.getState().currentThreadId).toBeNull();
      });

      it('setCurrentThreadId updates the value', () => {
        useAppStore.getState().setCurrentThreadId('t-1');
        expect(useAppStore.getState().currentThreadId).toBe('t-1');
      });

      it('setCurrentThreadId(null) clears', () => {
        useAppStore.getState().setCurrentThreadId('t-1');
        useAppStore.getState().setCurrentThreadId(null);
        expect(useAppStore.getState().currentThreadId).toBeNull();
      });
    });
    ```
  - Comando: `pnpm test:run src/shared/stores/app-store.test.ts`
  - Output esperado: FAIL (campo não existe).

- [ ] **Step 14.2** — Modificar `src/shared/stores/app-store.ts`:
  - Adicionar à interface do store:
    ```ts
    currentThreadId: string | null;
    setCurrentThreadId: (id: string | null) => void;
    ```
  - Na implementação `create<...>(...)`:
    ```ts
    currentThreadId: null,
    setCurrentThreadId: (id) => set({ currentThreadId: id }),
    ```
  - Se a store já usa `persist`, adicionar `currentThreadId` na lista de chaves persistidas (`partialize`). Caso contrário, manter apenas em memória (Fase 1 aceita).

- [ ] **Step 14.3** — Modificar `src/widgets/ai-sidebar/ui/AISidebar.tsx`:
  - Importar `useAppStore`.
  - No body de cada chamada para `/api/canvas-chat` e `/api/chat`, incluir `threadId: useAppStore.getState().currentThreadId ?? undefined`.
  - Após receber a resposta, ler `res.headers.get('x-thread-id')`; se diferente do atual, chamar `setCurrentThreadId(...)`.

- [ ] **Step 14.4** — Re-rodar.
  - Comando: `pnpm test:run src/shared/stores/app-store.test.ts`
  - Output esperado: `3 passed`.

- [ ] **Step 14.5** — Commit.
  - `feat(ai-sidebar): persist threadId per session and round-trip via header`

---

## Task 15 — Smoke test E2E (script manual)

**Goal:** Documento operacional de aceitação.

- [ ] **Step 15.1** — Criar `docs/superpowers/plans/2026-05-04-sprint1-A-acceptance.md`:
    ```markdown
    # Sprint 1.A — Acceptance smoke test

    Pré-requisitos: Docker, pnpm, .env.local com DATABASE_URL.

    ## Passos

    1. Subir Postgres local
       ```
       ./scripts/db-up.sh
       ```
    2. Aplicar migrations
       ```
       pnpm migrate
       ```
       Esperado: `Tables: messages, threads, working_memory`.
    3. Subir o app
       ```
       pnpm dev
       ```
       Abrir http://localhost:3005, autenticar, abrir Canvas Builder.
    4. Conduzir 3 turnos no chat:
       - Turno 1: "Crie um dashboard de inadimplência por safra para OM."
       - Turno 2: "Adicione bloco de curva-S abaixo."
       - Turno 3: "Resuma as decisões tomadas até agora."
    5. Validar persistência via psql:
       ```
       docker exec liquid-pg psql -U liquid -d liquid_memory -c \
         "SELECT id, client_id, created_at FROM threads ORDER BY created_at DESC LIMIT 1;"
       docker exec liquid-pg psql -U liquid -d liquid_memory -c \
         "SELECT resource_id, payload->>'briefing' FROM working_memory ORDER BY updated_at DESC LIMIT 1;"
       ```
       Esperado: 1 thread recente; working_memory com briefing populado.

    ## Critérios de aprovação
    - [ ] Thread criada
    - [ ] working_memory escrita após Turno 2
    - [ ] Turno 3 menciona o cliente OM sem ter sido repetido pelo usuário
    - [ ] `pnpm build` passa
    ```

- [ ] **Step 15.2** — Commit.
  - `docs(memory): sprint 1.A acceptance smoke test`

---

## Task 16 — Métricas baseline

**Goal:** Logging estruturado das operações de memória para Cloud Logging.

- [ ] **Step 16.1 (failing test)** — Criar `src/shared/lib/memory/metrics.test.ts`:
    ```ts
    import { describe, it, expect, vi, afterEach } from 'vitest';
    import { recordMemoryMetric } from './metrics';

    describe('recordMemoryMetric', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      afterEach(() => spy.mockClear());

      it('emits a single JSON line with required fields', () => {
        recordMemoryMetric({
          event: 'setWorkingMemory',
          durationMs: 12,
          threadId: 't-1',
        });
        expect(spy).toHaveBeenCalledOnce();
        const line = spy.mock.calls[0][0] as string;
        const parsed = JSON.parse(line);
        expect(parsed).toMatchObject({
          severity: 'INFO',
          component: 'memory-service',
          event: 'setWorkingMemory',
          durationMs: 12,
          threadId: 't-1',
        });
        expect(typeof parsed.timestamp).toBe('string');
      });
    });
    ```
  - Comando: `pnpm test:run src/shared/lib/memory/metrics.test.ts`
  - Output esperado: FAIL.

- [ ] **Step 16.2** — Criar `src/shared/lib/memory/metrics.ts`:
    ```ts
    export interface MemoryMetric {
      event: string;
      durationMs: number;
      threadId?: string;
      ok?: boolean;
      error?: string;
    }

    export function recordMemoryMetric(m: MemoryMetric): void {
      const line = JSON.stringify({
        severity: 'INFO',
        component: 'memory-service',
        timestamp: new Date().toISOString(),
        ...m,
      });
      // Cloud Logging-friendly structured log (one JSON per line)
      console.log(line);
    }

    export async function withMetric<T>(event: string, fn: () => Promise<T>, ctx: { threadId?: string } = {}): Promise<T> {
      const start = Date.now();
      try {
        const out = await fn();
        recordMemoryMetric({ event, durationMs: Date.now() - start, threadId: ctx.threadId, ok: true });
        return out;
      } catch (e) {
        recordMemoryMetric({
          event,
          durationMs: Date.now() - start,
          threadId: ctx.threadId,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
        throw e;
      }
    }
    ```

- [ ] **Step 16.3** — Instrumentar `setWorkingMemory` e `getWorkingMemory` em `memory-service.ts`:
  - Envolver corpo de cada função com `withMetric('setWorkingMemory', ...)` / `withMetric('getWorkingMemory', ...)`.
  - Repassar `threadId` (já recebido como parâmetro).

- [ ] **Step 16.4** — Re-rodar testes.
  - Comando: `pnpm test:run src/shared/lib/memory`
  - Output esperado: todas as suites passam (schema, pool, memory-service, metrics).

- [ ] **Step 16.5** — Commit.
  - `feat(memory): structured logging metrics for working memory operations`

---

## Acceptance Criteria

- `pnpm test:run` executa todos os testes verde com cobertura ≥80% em `src/shared/lib/memory/`.
- Postgres local roda via `scripts/db-up.sh`; `pnpm migrate` aplica `001_init.sql` sem erro.
- `pnpm dev` na porta 3005, criar dashboard novo, fazer 3 turnos no Canvas Builder, verificar via `psql` que existe row em `threads` e `working_memory`.
- `pnpm build` passa sem warnings novos.
- Métrica de tokens de prompt (Task 16) reduzida ≥30% em sessões >3 turnos vs baseline; se baseline indisponível, registrar valor absoluto p50.

## Riscos e rollback

- **Cloud SQL indisponível**: feature flag `MEMORY_SERVICE_ENABLED=false` em runtime-config faz fallback para stateless (orchestrator atual sem `threadId`).
- **Schema Zod muda**: emitir migration v2 com coluna nova; `getWorkingMemory` tolera campos faltantes via `.default(...)` no schema.
- **Pool exhaustion no Cloud Run**: `max: 5` por instância + Cloud SQL Auth Proxy (sidecar) + monitoramento via `recordMemoryMetric`.
- **Latência alta de leitura**: medir p95 de `getWorkingMemory`; se > 200 ms, considerar cache em memória por TTL curto (Sprint 2).

## Time de execução

- Tasks 1-3 (infra): agente `general-purpose`.
- Tasks 4-9 (lib): agente `general-purpose` com TDD.
- Tasks 10-13 (integração): agente `general-purpose` revisando uso atual.
- Task 14 (frontend): agente `general-purpose`.
- Tasks 15-16 (acceptance + metrics): agente `general-purpose`.

---

## Self-Review

- **Spec coverage**: header literal preservado; 16 tasks (dentro do range 12-18); cada task tem 3-7 steps com checkbox; código completo em todos os steps de implementação; comandos `pnpm test:run` com path e `-t` em todos os steps de teste; placeholders ausentes (todos os paths são absolutos ou explícitos); type consistency (Zod schema → TS types via `z.infer`; `WorkingMemoryPatchSchema` derivado).
- **Mismatches conhecidos**: Task 12/13 usam `await import(...)` para evitar carregar `pg` em paths que ainda não usam memória; aceitável para Fase 1. `maxDuration` existente (600 canvas / 300 analítico) é preservado.
- **Cobertura de plano-fonte (§2 e §5 Fase 1)**: working memory schema com todos os campos do plano (clientId, personaId, icpId, productType, briefing, activeDashboardId, pages.max(10), blocks.max(40), decisions.max(50), pendingQuestions.max(10)) ✓; tabelas `threads`, `messages`, `working_memory` (sem `embeddings_*`, deferido a Sprint 2) ✓; `runtime = 'nodejs'` em ambas routes ✓; front passa `threadId` ✓; métrica de tokens registrada ✓.
- **Pendente para sprints futuros (intencional)**: pgvector embeddings, semantic recall, sub-agentes readOnly, observational memory, RAG ingestion.
