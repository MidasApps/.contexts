# AI Studio Fase 2 — KB Upload & RAG Escopado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir upload de documentos (.md/.txt/.pdf) numa Knowledge Base pela admin, ingeri-los no RAG taggeados por KB, e fazer o agente `descriptive` consultar apenas as KBs visíveis (refs ∩ {globais ∪ cliente ativo}) no chat — atrás de feature flag, sem regressão.

**Architecture:** Reusa a infra de RAG existente (chunker, PII scrubber, embeddings, vectorSearch, reranker) e adiciona um caminho de upsert/consulta **KB-scoped** ao lado do legado (intocado). Ingestão síncrona inline no POST de upload. Retrieval escopado por `knowledgeBaseId` (filtro `in`), injetado no agente atrás de flag com fallback ao `vector-query` legado.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Zod 4, Firestore (firebase-admin), `@mastra/core`, `ai` SDK, `pdf-parse` (nova dep), Vitest 4.

## Global Constraints

- **Package manager:** pnpm (v10.32.1). Nova dep via `pnpm add pdf-parse`.
- **Storage:** Firestore via `getDb()`. Coleção de chunks = `embeddingsDocs` (existente). Coleção de KBs = `knowledgeBases`. Nova coleção de fontes = `knowledgeBaseSources`.
- **NÃO alterar** `upsertDoc`/`queryDocs` em `rag-service.ts`, a tool `vector-query.ts`, nem `scripts/ingest-rag.ts` (caminho legado preservado).
- **Reusar sem alterar:** `chunkMarkdown` (`src/shared/lib/rag/chunker.ts`), `scrubPii` (`pii-scrubber.ts`), `embedTexts` (`embeddings.ts`), `rerank` (`reranker.ts`), `contentHash` (`hash.ts`), `hashId` (`pii-scrubber.ts`). `vectorSearch` é **estendido** (filtro `in`), não reescrito.
- **Chunk id KB-scoped:** `sha256(`${knowledgeBaseId}:${sourceDocId}:${chunkIndex}`)`. Source doc id: `hashId(`${knowledgeBaseId}:${filename}`)`.
- **Tenancy (fail-closed):** retrieval só enxerga KBs com `clientId=null` (global) ∪ `clientId === clienteAtivo`. KB de outro cliente é silenciosamente excluída + logada.
- **Upload (fail-loud):** ext ∉ {md,txt,pdf} ou `sizeBytes > 10*1024*1024` → HTTP 400. Falha de extração/embed por-doc (fail-soft) → `status:'error'` no doc.
- **Auth:** `requireAdmin` + `export const runtime = 'nodejs'` em toda rota nova.
- **Embedding model:** Vertex `gemini-embedding-001` (3072d) via `embedTexts` (default).
- **Flag server-side:** `process.env.AI_STUDIO_KB === 'on'` governa o wiring da tool de retrieval no agente (mesmo padrão do `AI_STUDIO_AGENTS` da Fase 1). Store flag `useAiStudioKb` adicionada para paridade/futuro painel.
- **Testes:** Vitest colocalizado (`*.test.ts`). Rotas: `/* @vitest-environment node */` + `vi.hoisted`/`vi.mock`. Firestore em testes = fake in-memory (padrão da Fase 0, ver `src/features/ai-studio/repo.test.ts`).
- **Soft vs fail-loud (memória do projeto):** refs de catálogo são soft+warning; só resolução de dados é fail-loud. Aqui: visibilidade de KB é fail-closed (segurança), upload inválido é fail-loud, ingestão por-doc é fail-soft.

---

## File Structure

```
src/shared/lib/firestore/vector-search.ts   MODIFY — filtro `in` (array) além de `==`
src/features/ai-studio/kb/
  extract.ts        CREATE — extractText(bytes, ext) → string  (.md/.txt passthrough; .pdf via pdf-parse)
  kb-upsert.ts      CREATE — upsertKbChunk(...) + deleteKbDocChunks(sourceDocId)  (id KB-scoped)
  sources-repo.ts   CREATE — KnowledgeBaseSources CRUD + recomputeKbCounters
  ingest.ts         CREATE — ingestKbFile(...) orquestra extract→chunk→scrub→embed→upsert→status
  query-kb.ts       CREATE — resolveVisibleKbs(...) + queryKbDocs(...)
src/features/ai-studio/runtime/
  kb-retrieval-tool.ts  CREATE — createKbRetrievalTool(ctx) (embed→queryKbDocs(visíveis)→rerank)
src/features/ai-agents/mastra/descriptive-agent-mastra.ts  MODIFY — injeta kb-retrieval-tool atrás de AI_STUDIO_KB
src/shared/stores/app-store.ts             MODIFY — flag useAiStudioKb (paridade)
app/api/ai-studio/kb/[id]/docs/route.ts    CREATE — GET/POST(multipart)/DELETE
src/features/ai-studio/admin/ui/
  KbDocUploader.tsx   CREATE — dropzone + validação client-side
  KbDocList.tsx       CREATE — lista de docs + status + excluir
  KnowledgeBasesTab.tsx  MODIFY — seção "Documentos" no form de KB existente
src/features/ai-studio/admin/model/api.ts  MODIFY — fns de upload/list/delete de docs
scripts/migrate-embeddings-to-kb.ts        CREATE — chunks sem knowledgeBaseId → 'default'
package.json                               MODIFY — dep pdf-parse + script migrate:embeddings-kb
```

---

### Task 1: vectorSearch — suporte a filtro `in`

**Files:**
- Modify: `src/shared/lib/firestore/vector-search.ts:61-64`
- Test: `src/shared/lib/firestore/vector-search.test.ts` (criar)

**Interfaces:**
- Produces: `vectorSearch` aceita `filters` cujos valores podem ser escalar (→ `where ==`) ou `unknown[]` (→ `where in`). Assinatura pública inalterada (`VectorSearchInput`).

- [ ] **Step 1: Escrever o teste (falhando)**

`src/shared/lib/firestore/vector-search.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { vectorSearch } from './vector-search';

// Fake Firestore collection com suporte a where('==') e where('in')
function fakeCollection(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  function makeQuery(filtered: typeof docs) {
    return {
      where(field: string, op: string, value: unknown) {
        const next = filtered.filter((d) => {
          const fv = d.data[field];
          if (op === 'in') return Array.isArray(value) && (value as unknown[]).includes(fv);
          return fv === value;
        });
        return makeQuery(next);
      },
      async get() {
        return { empty: filtered.length === 0, docs: filtered.map((d) => ({ id: d.id, data: () => d.data })) };
      },
    };
  }
  return makeQuery(docs) as never;
}

const A = [1, 0, 0];
const B = [0, 1, 0];

describe('vectorSearch in-filter', () => {
  it('aplica == para valor escalar', async () => {
    const col = fakeCollection([
      { id: '1', data: { knowledgeBaseId: 'k1', embedding: A } },
      { id: '2', data: { knowledgeBaseId: 'k2', embedding: B } },
    ]);
    const out = await vectorSearch({ collection: col, queryEmbedding: A, filters: { knowledgeBaseId: 'k1' }, topK: 5 });
    expect(out.map((m) => m.id)).toEqual(['1']);
  });

  it('aplica in para valor array', async () => {
    const col = fakeCollection([
      { id: '1', data: { knowledgeBaseId: 'k1', embedding: A } },
      { id: '2', data: { knowledgeBaseId: 'k2', embedding: B } },
      { id: '3', data: { knowledgeBaseId: 'k3', embedding: A } },
    ]);
    const out = await vectorSearch({ collection: col, queryEmbedding: A, filters: { knowledgeBaseId: ['k1', 'k3'] }, topK: 5 });
    expect(out.map((m) => m.id).sort()).toEqual(['1', '3']);
  });

  it('array vazio em in não casa nada', async () => {
    const col = fakeCollection([{ id: '1', data: { knowledgeBaseId: 'k1', embedding: A } }]);
    const out = await vectorSearch({ collection: col, queryEmbedding: A, filters: { knowledgeBaseId: [] }, topK: 5 });
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/shared/lib/firestore/vector-search.test.ts`
Expected: FAIL (o `in` filter ainda não existe; o array vira `where(k,'==',[...])` e não casa).

- [ ] **Step 3: Implementar o filtro `in`**

Em `src/shared/lib/firestore/vector-search.ts`, trocar o loop de filtros (linhas 61-64):

```typescript
  let q: Query<DocumentData> = input.collection;
  for (const [k, v] of Object.entries(input.filters)) {
    if (Array.isArray(v)) {
      if (v.length === 0) return []; // `in []` nunca casa — short-circuit
      q = q.where(k, 'in', v);
    } else {
      q = q.where(k, '==', v);
    }
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/shared/lib/firestore/vector-search.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/firestore/vector-search.ts src/shared/lib/firestore/vector-search.test.ts
git commit -m "feat(ai-studio): vectorSearch suporta filtro in (array) p/ KB scoping"
```

---

### Task 2: Extração de texto (.md/.txt/.pdf) + dep pdf-parse

**Files:**
- Create: `src/features/ai-studio/kb/extract.ts`
- Test: `src/features/ai-studio/kb/extract.test.ts`
- Modify: `package.json` (dep `pdf-parse`)

**Interfaces:**
- Produces:
  - `type KbExt = 'md' | 'txt' | 'pdf'`
  - `extFromFilename(filename: string): KbExt | null`
  - `async function extractText(bytes: Buffer, ext: KbExt): Promise<string>` — `.md`/`.txt` decodifica UTF-8; `.pdf` via `pdf-parse`; lança `Error('PDF sem texto extraível (escaneado/imagem não suportado)')` se o texto extraído for vazio/branco.

- [ ] **Step 1: Instalar a dependência**

Run: `pnpm add pdf-parse`
Expected: `pdf-parse` aparece em `package.json` dependencies.

- [ ] **Step 2: Escrever o teste (falhando)**

`src/features/ai-studio/kb/extract.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

// pdf-parse é mockado: retorna o texto que injetarmos por teste.
const { pdfParseMock } = vi.hoisted(() => ({ pdfParseMock: vi.fn() }));
vi.mock('pdf-parse', () => ({ default: pdfParseMock }));

import { extFromFilename, extractText } from './extract';

describe('extFromFilename', () => {
  it('reconhece md/txt/pdf (case-insensitive) e rejeita o resto', () => {
    expect(extFromFilename('a.md')).toBe('md');
    expect(extFromFilename('a.TXT')).toBe('txt');
    expect(extFromFilename('relatorio.pdf')).toBe('pdf');
    expect(extFromFilename('a.docx')).toBeNull();
    expect(extFromFilename('semext')).toBeNull();
  });
});

describe('extractText', () => {
  it('md/txt: decodifica UTF-8', async () => {
    const txt = await extractText(Buffer.from('# Olá\nmercado', 'utf8'), 'md');
    expect(txt).toContain('mercado');
  });

  it('pdf com texto: usa pdf-parse', async () => {
    pdfParseMock.mockResolvedValueOnce({ text: 'conteúdo do pdf' });
    const txt = await extractText(Buffer.from('%PDF-1.4 fake'), 'pdf');
    expect(txt).toBe('conteúdo do pdf');
  });

  it('pdf sem texto extraível: lança erro claro', async () => {
    pdfParseMock.mockResolvedValueOnce({ text: '   \n  ' });
    await expect(extractText(Buffer.from('%PDF fake'), 'pdf')).rejects.toThrow(/sem texto extra/i);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm test src/features/ai-studio/kb/extract.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 4: Implementar**

`src/features/ai-studio/kb/extract.ts`:

```typescript
export type KbExt = 'md' | 'txt' | 'pdf';

const ALLOWED: Record<string, KbExt> = { md: 'md', markdown: 'md', txt: 'txt', text: 'txt', pdf: 'pdf' };

export function extFromFilename(filename: string): KbExt | null {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return null;
  const raw = filename.slice(dot + 1).toLowerCase();
  return ALLOWED[raw] ?? null;
}

export async function extractText(bytes: Buffer, ext: KbExt): Promise<string> {
  if (ext === 'md' || ext === 'txt') {
    return bytes.toString('utf8');
  }
  // pdf
  const pdfParse = (await import('pdf-parse')).default;
  const parsed = await pdfParse(bytes);
  const text = (parsed?.text ?? '').trim();
  if (!text) {
    throw new Error('PDF sem texto extraível (escaneado/imagem não suportado)');
  }
  return text;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm test src/features/ai-studio/kb/extract.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/features/ai-studio/kb/extract.ts src/features/ai-studio/kb/extract.test.ts
git commit -m "feat(ai-studio): extração de texto .md/.txt/.pdf (pdf-parse) p/ KB upload"
```

---

### Task 3: kb-upsert — gravação/remoção de chunks KB-scoped

**Files:**
- Create: `src/features/ai-studio/kb/kb-upsert.ts`
- Test: `src/features/ai-studio/kb/kb-upsert.test.ts`

**Interfaces:**
- Consumes: `getDb()` (injetável p/ teste).
- Produces:
  - `interface KbChunkInput { knowledgeBaseId: string; sourceDocId: string; chunkIndex: number; content: string; embedding: number[]; embeddingModel: string; clientId: string | null; metadata: Record<string, unknown> }`
  - `kbChunkId(knowledgeBaseId, sourceDocId, chunkIndex): string` (sha256 hex)
  - `async function upsertKbChunks(chunks: KbChunkInput[], db?): Promise<void>` — grava cada chunk com id determinístico; `createdAt` server.
  - `async function pruneKbChunks(knowledgeBaseId, sourceDocId, keepCount, db?): Promise<void>` — remove chunks com `chunkIndex >= keepCount` (órfãos de re-upload menor).
  - `async function deleteKbDocChunks(sourceDocId, db?): Promise<number>` — remove todos os chunks do sourceDoc; retorna nº removido.

- [ ] **Step 1: Escrever o teste (falhando)**

`src/features/ai-studio/kb/kb-upsert.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { kbChunkId, upsertKbChunks, pruneKbChunks, deleteKbDocChunks } from './kb-upsert';

// Fake Firestore com collection().doc().set()/delete() e where().get()
function makeFakeDb() {
  const store: Record<string, Record<string, any>> = {};
  return {
    store,
    collection(name: string) {
      store[name] ??= {};
      const col = {
        doc(id: string) {
          return {
            async set(v: any) { store[name][id] = { ...(store[name][id] ?? {}), ...v }; },
            async delete() { delete store[name][id]; },
          };
        },
        _filters: [] as Array<[string, string, unknown]>,
        where(f: string, op: string, val: unknown) { const c = Object.create(col); c._filters = [...col._filters, [f, op, val]]; return c; },
        async get() {
          const entries = Object.entries(store[name]).filter(([, d]) =>
            (this._filters ?? []).every(([f, op, val]: any) => op === '==' ? d[f] === val : op === '>=' ? d[f] >= val : true),
          );
          return { docs: entries.map(([id, d]) => ({ id, data: () => d, ref: col.doc(id) })) };
        },
      };
      return col;
    },
  } as any;
}

const EMB = [1, 0, 0];
function chunk(i: number, over: Partial<any> = {}) {
  return { knowledgeBaseId: 'kb1', sourceDocId: 's1', chunkIndex: i, content: `c${i}`, embedding: EMB, embeddingModel: 'gemini-embedding-001', clientId: null, metadata: {}, ...over };
}

describe('kb-upsert', () => {
  let db: ReturnType<typeof makeFakeDb>;
  beforeEach(() => { db = makeFakeDb(); });

  it('kbChunkId é determinístico por (kb, sourceDoc, idx)', () => {
    expect(kbChunkId('kb1', 's1', 0)).toBe(kbChunkId('kb1', 's1', 0));
    expect(kbChunkId('kb1', 's1', 0)).not.toBe(kbChunkId('kb1', 's1', 1));
    expect(kbChunkId('kb1', 's1', 0)).not.toBe(kbChunkId('kb2', 's1', 0));
  });

  it('upsertKbChunks grava com id determinístico + campos KB', async () => {
    await upsertKbChunks([chunk(0), chunk(1)], db);
    const id0 = kbChunkId('kb1', 's1', 0);
    expect(db.store.embeddingsDocs[id0].knowledgeBaseId).toBe('kb1');
    expect(db.store.embeddingsDocs[id0].sourceDocId).toBe('s1');
    expect(db.store.embeddingsDocs[id0].clientId).toBeNull();
    expect(Object.keys(db.store.embeddingsDocs)).toHaveLength(2);
  });

  it('re-upload reescreve os mesmos ids (idempotente)', async () => {
    await upsertKbChunks([chunk(0, { content: 'old' })], db);
    await upsertKbChunks([chunk(0, { content: 'new' })], db);
    const id0 = kbChunkId('kb1', 's1', 0);
    expect(db.store.embeddingsDocs[id0].content).toBe('new');
    expect(Object.keys(db.store.embeddingsDocs)).toHaveLength(1);
  });

  it('pruneKbChunks remove órfãos (idx >= keepCount)', async () => {
    await upsertKbChunks([chunk(0), chunk(1), chunk(2)], db);
    await pruneKbChunks('kb1', 's1', 2, db); // mantém 0,1; remove 2
    expect(db.store.embeddingsDocs[kbChunkId('kb1', 's1', 2)]).toBeUndefined();
    expect(db.store.embeddingsDocs[kbChunkId('kb1', 's1', 1)]).toBeDefined();
  });

  it('deleteKbDocChunks remove todos do sourceDoc', async () => {
    await upsertKbChunks([chunk(0), chunk(1)], db);
    const n = await deleteKbDocChunks('s1', db);
    expect(n).toBe(2);
    expect(Object.keys(db.store.embeddingsDocs)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/features/ai-studio/kb/kb-upsert.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/features/ai-studio/kb/kb-upsert.ts`:

```typescript
import 'server-only';
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '@/shared/lib/firebase/admin';

const EMBEDDINGS_COL = 'embeddingsDocs';

export interface KbChunkInput {
  knowledgeBaseId: string;
  sourceDocId: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
  embeddingModel: string;
  clientId: string | null;
  metadata: Record<string, unknown>;
}

export function kbChunkId(knowledgeBaseId: string, sourceDocId: string, chunkIndex: number): string {
  return createHash('sha256').update(`${knowledgeBaseId}:${sourceDocId}:${chunkIndex}`).digest('hex');
}

type Db = FirebaseFirestore.Firestore;

export async function upsertKbChunks(chunks: KbChunkInput[], db?: Db): Promise<void> {
  const firestore = db ?? getDb();
  const col = firestore.collection(EMBEDDINGS_COL);
  for (const c of chunks) {
    const id = kbChunkId(c.knowledgeBaseId, c.sourceDocId, c.chunkIndex);
    await col.doc(id).set({
      knowledgeBaseId: c.knowledgeBaseId,
      sourceDocId: c.sourceDocId,
      chunkIndex: c.chunkIndex,
      content: c.content,
      embedding: c.embedding,
      embeddingModel: c.embeddingModel,
      clientId: c.clientId,
      metadata: c.metadata,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
}

export async function pruneKbChunks(
  knowledgeBaseId: string, sourceDocId: string, keepCount: number, db?: Db,
): Promise<void> {
  const firestore = db ?? getDb();
  const snap = await firestore.collection(EMBEDDINGS_COL)
    .where('sourceDocId', '==', sourceDocId)
    .where('chunkIndex', '>=', keepCount)
    .get();
  for (const doc of snap.docs) await doc.ref.delete();
}

export async function deleteKbDocChunks(sourceDocId: string, db?: Db): Promise<number> {
  const firestore = db ?? getDb();
  const snap = await firestore.collection(EMBEDDINGS_COL).where('sourceDocId', '==', sourceDocId).get();
  for (const doc of snap.docs) await doc.ref.delete();
  return snap.docs.length;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/features/ai-studio/kb/kb-upsert.test.ts`
Expected: PASS.

> Nota: `pruneKbChunks` usa um filtro composto (`==` + `>=`) que em produção exige índice composto no Firestore; se o ambiente reclamar, o índice é criado sob demanda (link no erro). O fake-db do teste cobre a lógica.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-studio/kb/kb-upsert.ts src/features/ai-studio/kb/kb-upsert.test.ts
git commit -m "feat(ai-studio): upsert/prune/delete de chunks KB-scoped (id determinístico)"
```

---

### Task 4: sources-repo — CRUD de knowledgeBaseSources + contadores

**Files:**
- Create: `src/features/ai-studio/kb/sources-repo.ts`
- Test: `src/features/ai-studio/kb/sources-repo.test.ts`

**Interfaces:**
- Consumes: `getDb()`; `hashId` de `@/shared/lib/rag/pii-scrubber`; `deleteKbDocChunks` (Task 3).
- Produces:
  - `sourceDocId(knowledgeBaseId, filename): string` = `hashId(`${knowledgeBaseId}:${filename}`)`
  - `interface KbSourceRecord { id; knowledgeBaseId; filename; mimeType; sizeBytes; status; chunkCount; error?; uploadedBy?; updatedAt? }`
  - `async function upsertSource(input: {knowledgeBaseId; filename; mimeType; sizeBytes; status; chunkCount?; error?; uploadedBy?}, db?): Promise<string>` — retorna o id; cria `createdAt` só na 1ª vez.
  - `async function listSources(knowledgeBaseId, db?): Promise<KbSourceRecord[]>`
  - `async function getSource(id, db?): Promise<KbSourceRecord | null>`
  - `async function deleteSource(id, db?): Promise<void>` — remove o source doc + seus chunks (via deleteKbDocChunks) + recomputa contadores da KB.
  - `async function recomputeKbCounters(knowledgeBaseId, db?): Promise<void>` — `docCount` = nº de sources `ready`; `chunkCount` = soma; grava em `knowledgeBases/{id}`.

- [ ] **Step 1: Escrever o teste (falhando)**

`src/features/ai-studio/kb/sources-repo.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { deleteKbDocChunksMock } = vi.hoisted(() => ({ deleteKbDocChunksMock: vi.fn() }));
vi.mock('./kb-upsert', () => ({ deleteKbDocChunks: deleteKbDocChunksMock }));

import { sourceDocId, upsertSource, listSources, getSource, deleteSource, recomputeKbCounters } from './sources-repo';

function makeFakeDb() {
  const store: Record<string, Record<string, any>> = {};
  return {
    store,
    collection(name: string) {
      store[name] ??= {};
      const col: any = {
        _f: [] as any[],
        doc(id: string) {
          return {
            async get() { const d = store[name][id]; return { exists: d !== undefined, id, data: () => d }; },
            async set(v: any, opts?: any) { store[name][id] = opts?.merge ? { ...(store[name][id] ?? {}), ...v } : v; },
            async update(v: any) { store[name][id] = { ...store[name][id], ...v }; },
            async delete() { delete store[name][id]; },
          };
        },
        where(f: string, op: string, val: unknown) { const c = Object.create(col); c._f = [...col._f, [f, op, val]]; return c; },
        async get() {
          const entries = Object.entries(store[name]).filter(([, d]) => (this._f ?? []).every(([f, op, val]: any) => d[f] === val));
          return { docs: entries.map(([id, d]) => ({ id, data: () => d })) };
        },
      };
      return col;
    },
  } as any;
}

describe('sources-repo', () => {
  let db: ReturnType<typeof makeFakeDb>;
  beforeEach(() => { db = makeFakeDb(); deleteKbDocChunksMock.mockReset().mockResolvedValue(0); });

  it('sourceDocId determinístico por (kb, filename)', () => {
    expect(sourceDocId('kb1', 'a.md')).toBe(sourceDocId('kb1', 'a.md'));
    expect(sourceDocId('kb1', 'a.md')).not.toBe(sourceDocId('kb1', 'b.md'));
  });

  it('upsertSource cria e re-upload (mesmo filename) reusa o id', async () => {
    const id1 = await upsertSource({ knowledgeBaseId: 'kb1', filename: 'a.md', mimeType: 'text/markdown', sizeBytes: 10, status: 'processing' }, db);
    const id2 = await upsertSource({ knowledgeBaseId: 'kb1', filename: 'a.md', mimeType: 'text/markdown', sizeBytes: 12, status: 'ready', chunkCount: 3 }, db);
    expect(id1).toBe(id2);
    expect(db.store.knowledgeBaseSources[id1].status).toBe('ready');
    expect(db.store.knowledgeBaseSources[id1].chunkCount).toBe(3);
  });

  it('listSources filtra por KB', async () => {
    await upsertSource({ knowledgeBaseId: 'kb1', filename: 'a.md', mimeType: 't', sizeBytes: 1, status: 'ready', chunkCount: 1 }, db);
    await upsertSource({ knowledgeBaseId: 'kb2', filename: 'b.md', mimeType: 't', sizeBytes: 1, status: 'ready', chunkCount: 1 }, db);
    const rows = await listSources('kb1', db);
    expect(rows).toHaveLength(1);
    expect(rows[0].filename).toBe('a.md');
  });

  it('recomputeKbCounters soma só os ready', async () => {
    await upsertSource({ knowledgeBaseId: 'kb1', filename: 'a.md', mimeType: 't', sizeBytes: 1, status: 'ready', chunkCount: 3 }, db);
    await upsertSource({ knowledgeBaseId: 'kb1', filename: 'b.md', mimeType: 't', sizeBytes: 1, status: 'error' }, db);
    db.store.knowledgeBases = { kb1: { name: 'KB1' } };
    await recomputeKbCounters('kb1', db);
    expect(db.store.knowledgeBases.kb1.docCount).toBe(1);
    expect(db.store.knowledgeBases.kb1.chunkCount).toBe(3);
  });

  it('deleteSource remove doc + chunks + recomputa', async () => {
    const id = await upsertSource({ knowledgeBaseId: 'kb1', filename: 'a.md', mimeType: 't', sizeBytes: 1, status: 'ready', chunkCount: 3 }, db);
    db.store.knowledgeBases = { kb1: { name: 'KB1' } };
    await deleteSource(id, db);
    expect(db.store.knowledgeBaseSources[id]).toBeUndefined();
    expect(deleteKbDocChunksMock).toHaveBeenCalledWith(id, db);
    expect(db.store.knowledgeBases.kb1.docCount).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/features/ai-studio/kb/sources-repo.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/features/ai-studio/kb/sources-repo.ts`:

```typescript
import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '@/shared/lib/firebase/admin';
import { hashId } from '@/shared/lib/rag/pii-scrubber';
import { deleteKbDocChunks } from './kb-upsert';

const SOURCES_COL = 'knowledgeBaseSources';
const KB_COL = 'knowledgeBases';

type Db = FirebaseFirestore.Firestore;
type KbStatus = 'pending' | 'processing' | 'ready' | 'error';

export interface KbSourceRecord {
  id: string;
  knowledgeBaseId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: KbStatus;
  chunkCount: number;
  error?: string;
  uploadedBy?: string;
}

export function sourceDocId(knowledgeBaseId: string, filename: string): string {
  return hashId(`${knowledgeBaseId}:${filename}`);
}

export interface UpsertSourceInput {
  knowledgeBaseId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: KbStatus;
  chunkCount?: number;
  error?: string;
  uploadedBy?: string;
}

export async function upsertSource(input: UpsertSourceInput, db?: Db): Promise<string> {
  const firestore = db ?? getDb();
  const id = sourceDocId(input.knowledgeBaseId, input.filename);
  const ref = firestore.collection(SOURCES_COL).doc(id);
  const existing = await ref.get();
  await ref.set(
    {
      knowledgeBaseId: input.knowledgeBaseId,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      status: input.status,
      chunkCount: input.chunkCount ?? 0,
      ...(input.error !== undefined ? { error: input.error } : {}),
      ...(input.uploadedBy !== undefined ? { uploadedBy: input.uploadedBy } : {}),
      updatedAt: FieldValue.serverTimestamp(),
      ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );
  return id;
}

function serialize(id: string, d: FirebaseFirestore.DocumentData): KbSourceRecord {
  return {
    id,
    knowledgeBaseId: d.knowledgeBaseId,
    filename: d.filename,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes ?? 0,
    status: (d.status as KbStatus) ?? 'pending',
    chunkCount: d.chunkCount ?? 0,
    error: d.error,
    uploadedBy: d.uploadedBy,
  };
}

export async function listSources(knowledgeBaseId: string, db?: Db): Promise<KbSourceRecord[]> {
  const firestore = db ?? getDb();
  const snap = await firestore.collection(SOURCES_COL).where('knowledgeBaseId', '==', knowledgeBaseId).get();
  return snap.docs.map((doc) => serialize(doc.id, doc.data()));
}

export async function getSource(id: string, db?: Db): Promise<KbSourceRecord | null> {
  const firestore = db ?? getDb();
  const snap = await firestore.collection(SOURCES_COL).doc(id).get();
  if (!snap.exists) return null;
  return serialize(snap.id, snap.data()!);
}

export async function recomputeKbCounters(knowledgeBaseId: string, db?: Db): Promise<void> {
  const firestore = db ?? getDb();
  const sources = await listSources(knowledgeBaseId, db);
  const ready = sources.filter((s) => s.status === 'ready');
  const docCount = ready.length;
  const chunkCount = ready.reduce((sum, s) => sum + (s.chunkCount ?? 0), 0);
  await firestore.collection(KB_COL).doc(knowledgeBaseId).set(
    { docCount, chunkCount, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

export async function deleteSource(id: string, db?: Db): Promise<void> {
  const firestore = db ?? getDb();
  const snap = await firestore.collection(SOURCES_COL).doc(id).get();
  if (!snap.exists) return;
  const knowledgeBaseId = snap.data()!.knowledgeBaseId as string;
  await deleteKbDocChunks(id, db);
  await firestore.collection(SOURCES_COL).doc(id).delete();
  await recomputeKbCounters(knowledgeBaseId, db);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/features/ai-studio/kb/sources-repo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-studio/kb/sources-repo.ts src/features/ai-studio/kb/sources-repo.test.ts
git commit -m "feat(ai-studio): repo de knowledgeBaseSources + recompute de contadores"
```

---

### Task 5: ingest — orquestra extract→chunk→scrub→embed→upsert→status

**Files:**
- Create: `src/features/ai-studio/kb/ingest.ts`
- Test: `src/features/ai-studio/kb/ingest.test.ts`

**Interfaces:**
- Consumes: `extractText`/`extFromFilename` (Task 2), `upsertKbChunks`/`pruneKbChunks` (Task 3), `upsertSource`/`recomputeKbCounters`/`sourceDocId` (Task 4), `chunkMarkdown` (`@/shared/lib/rag/chunker`), `scrubPii` (`@/shared/lib/rag/pii-scrubber`), `embedTexts` (`@/shared/lib/rag/embeddings`).
- Produces:
  - `interface IngestInput { kb: { id: string; clientId: string | null }; filename: string; mimeType: string; bytes: Buffer; uploadedBy?: string }`
  - `async function ingestKbFile(input: IngestInput, db?): Promise<KbSourceRecord>` — executa o pipeline; em sucesso retorna source `ready`; em erro de extração/embed, grava source `error` e retorna (não relança).

- [ ] **Step 1: Escrever o teste (falhando)**

`src/features/ai-studio/kb/ingest.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  extractTextMock: vi.fn(),
  chunkMarkdownMock: vi.fn(),
  scrubPiiMock: vi.fn((s: string) => s),
  embedTextsMock: vi.fn(),
  upsertKbChunksMock: vi.fn(),
  pruneKbChunksMock: vi.fn(),
}));

vi.mock('./extract', () => ({ extractText: h.extractTextMock, extFromFilename: (f: string) => (f.endsWith('.md') ? 'md' : f.endsWith('.pdf') ? 'pdf' : null) }));
vi.mock('@/shared/lib/rag/chunker', () => ({ chunkMarkdown: h.chunkMarkdownMock }));
vi.mock('@/shared/lib/rag/pii-scrubber', () => ({ scrubPii: h.scrubPiiMock, hashId: (s: string) => `h(${s})` }));
vi.mock('@/shared/lib/rag/embeddings', () => ({ embedTexts: h.embedTextsMock }));
vi.mock('./kb-upsert', () => ({ upsertKbChunks: h.upsertKbChunksMock, pruneKbChunks: h.pruneKbChunksMock, deleteKbDocChunks: vi.fn() }));

// in-memory sources via a fake db reused by sources-repo (real module)
function makeFakeDb() {
  const store: Record<string, Record<string, any>> = {};
  return { store, collection(name: string) { store[name] ??= {}; const col: any = { _f: [], doc(id: string) { return { async get() { const d = store[name][id]; return { exists: d !== undefined, id, data: () => d }; }, async set(v: any, o: any) { store[name][id] = o?.merge ? { ...(store[name][id] ?? {}), ...v } : v; }, async delete() { delete store[name][id]; } }; }, where(f: string, op: string, val: unknown) { const c = Object.create(col); c._f = [...col._f, [f, op, val]]; return c; }, async get() { const e = Object.entries(store[name]).filter(([, d]) => (this._f ?? []).every(([f, , val]: any) => d[f] === val)); return { docs: e.map(([id, d]) => ({ id, data: () => d })) }; } }; return col; } } as any;
}

import { ingestKbFile } from './ingest';

describe('ingestKbFile', () => {
  let db: ReturnType<typeof makeFakeDb>;
  beforeEach(() => {
    db = makeFakeDb();
    Object.values(h).forEach((m: any) => m.mockReset?.());
    h.scrubPiiMock.mockImplementation((s: string) => s);
  });

  it('happy path: md → chunks → ready com chunkCount', async () => {
    h.extractTextMock.mockResolvedValueOnce('# Doc\ntexto');
    h.chunkMarkdownMock.mockReturnValueOnce([{ text: 'a', metadata: {} }, { text: 'b', metadata: {} }]);
    h.embedTextsMock.mockResolvedValueOnce([[1, 0], [0, 1]]);
    const out = await ingestKbFile({ kb: { id: 'kb1', clientId: null }, filename: 'a.md', mimeType: 'text/markdown', bytes: Buffer.from('x'), uploadedBy: 'admin' }, db);
    expect(out.status).toBe('ready');
    expect(out.chunkCount).toBe(2);
    expect(h.upsertKbChunksMock).toHaveBeenCalledOnce();
    expect(h.pruneKbChunksMock).toHaveBeenCalledWith('kb1', expect.any(String), 2, db);
  });

  it('ext inválida → erro lançado ANTES de gravar (rota trata 400)', async () => {
    await expect(ingestKbFile({ kb: { id: 'kb1', clientId: null }, filename: 'a.docx', mimeType: 'x', bytes: Buffer.from('x') }, db)).rejects.toThrow(/formato/i);
  });

  it('falha de extração → source status=error (não relança)', async () => {
    h.extractTextMock.mockRejectedValueOnce(new Error('PDF sem texto extraível'));
    const out = await ingestKbFile({ kb: { id: 'kb1', clientId: null }, filename: 'a.pdf', mimeType: 'application/pdf', bytes: Buffer.from('x') }, db);
    expect(out.status).toBe('error');
    expect(out.error).toMatch(/sem texto/i);
    expect(h.upsertKbChunksMock).not.toHaveBeenCalled();
  });

  it('scrubPii aplicado a cada chunk antes de embed', async () => {
    h.extractTextMock.mockResolvedValueOnce('texto');
    h.chunkMarkdownMock.mockReturnValueOnce([{ text: 'cpf 123', metadata: {} }]);
    h.embedTextsMock.mockResolvedValueOnce([[1, 0]]);
    await ingestKbFile({ kb: { id: 'kb1', clientId: null }, filename: 'a.md', mimeType: 'text/markdown', bytes: Buffer.from('x') }, db);
    expect(h.scrubPiiMock).toHaveBeenCalledWith('cpf 123');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/features/ai-studio/kb/ingest.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/features/ai-studio/kb/ingest.ts`:

```typescript
import 'server-only';
import { chunkMarkdown } from '@/shared/lib/rag/chunker';
import { scrubPii } from '@/shared/lib/rag/pii-scrubber';
import { embedTexts } from '@/shared/lib/rag/embeddings';
import { extractText, extFromFilename } from './extract';
import { upsertKbChunks, pruneKbChunks, type KbChunkInput } from './kb-upsert';
import { upsertSource, recomputeKbCounters, sourceDocId, type KbSourceRecord, getSource } from './sources-repo';

const EMBEDDING_MODEL = process.env.RAG_EMBEDDING_MODEL ?? 'gemini-embedding-001';

type Db = FirebaseFirestore.Firestore;

export interface IngestInput {
  kb: { id: string; clientId: string | null };
  filename: string;
  mimeType: string;
  bytes: Buffer;
  uploadedBy?: string;
}

export async function ingestKbFile(input: IngestInput, db?: Db): Promise<KbSourceRecord> {
  const ext = extFromFilename(input.filename);
  if (!ext) throw new Error(`Formato não suportado: ${input.filename} (use .md, .txt ou .pdf)`);

  const sdId = sourceDocId(input.kb.id, input.filename);

  // marca processing
  await upsertSource({
    knowledgeBaseId: input.kb.id, filename: input.filename, mimeType: input.mimeType,
    sizeBytes: input.bytes.length, status: 'processing', uploadedBy: input.uploadedBy,
  }, db);

  try {
    const text = await extractText(input.bytes, ext);
    const chunks = chunkMarkdown(text);
    const scrubbed = chunks.map((c) => scrubPii(c.text));
    const embeddings = scrubbed.length > 0 ? await embedTexts(scrubbed) : [];

    const kbChunks: KbChunkInput[] = embeddings.map((embedding, i) => ({
      knowledgeBaseId: input.kb.id,
      sourceDocId: sdId,
      chunkIndex: i,
      content: scrubbed[i] ?? '',
      embedding,
      embeddingModel: EMBEDDING_MODEL,
      clientId: input.kb.clientId,
      metadata: { ...(chunks[i]?.metadata ?? {}), filename: input.filename },
    }));

    await upsertKbChunks(kbChunks, db);
    await pruneKbChunks(input.kb.id, sdId, kbChunks.length, db); // remove órfãos de re-upload menor

    await upsertSource({
      knowledgeBaseId: input.kb.id, filename: input.filename, mimeType: input.mimeType,
      sizeBytes: input.bytes.length, status: 'ready', chunkCount: kbChunks.length, uploadedBy: input.uploadedBy,
    }, db);
    await recomputeKbCounters(input.kb.id, db);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha na ingestão';
    await upsertSource({
      knowledgeBaseId: input.kb.id, filename: input.filename, mimeType: input.mimeType,
      sizeBytes: input.bytes.length, status: 'error', error: message, uploadedBy: input.uploadedBy,
    }, db);
    await recomputeKbCounters(input.kb.id, db);
  }

  const result = await getSource(sdId, db);
  if (!result) throw new Error('Source doc não encontrado após ingestão');
  return result;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/features/ai-studio/kb/ingest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-studio/kb/ingest.ts src/features/ai-studio/kb/ingest.test.ts
git commit -m "feat(ai-studio): pipeline de ingestão KB (extract→chunk→scrub→embed→upsert→status)"
```

---

### Task 6: query-kb — visibilidade + busca escopada

**Files:**
- Create: `src/features/ai-studio/kb/query-kb.ts`
- Test: `src/features/ai-studio/kb/query-kb.test.ts`

**Interfaces:**
- Consumes: `vectorSearch` (Task 1, com `in`), `AiStudioRepo` (`@/features/ai-studio/repo`), `getDb()`.
- Produces:
  - `async function resolveVisibleKbs(refs: string[], clientId: string | null, db?): Promise<string[]>` — dado os `knowledgeBaseRefs` do agente e o cliente ativo, retorna os ids das KBs visíveis: `refs ∩ { KB.status='active' E (KB.clientId=null OU KB.clientId=clientId) }`.
  - `interface KbHit { id; content: string; similarity: number; metadata: Record<string, unknown> }`
  - `async function queryKbDocs(input: { embedding: number[]; topK: number; knowledgeBaseIds: string[] }, db?): Promise<KbHit[]>` — vectorSearch em `embeddingsDocs` filtrando `knowledgeBaseId in` (lotes de 30); une e ordena por score desc; topK.

- [ ] **Step 1: Escrever o teste (falhando)**

`src/features/ai-studio/kb/query-kb.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ vectorSearchMock: vi.fn(), repoListMock: vi.fn() }));
vi.mock('@/shared/lib/firestore/vector-search', () => ({ vectorSearch: h.vectorSearchMock }));
vi.mock('@/features/ai-studio/repo', () => ({
  AiStudioRepo: vi.fn().mockImplementation(() => ({ list: h.repoListMock })),
}));

import { resolveVisibleKbs, queryKbDocs } from './query-kb';

const fakeDb = { collection: () => ({}) } as any;

beforeEach(() => { h.vectorSearchMock.mockReset(); h.repoListMock.mockReset(); });

describe('resolveVisibleKbs', () => {
  it('inclui globais e do cliente ativo; exclui outro cliente e archived; respeita refs', async () => {
    h.repoListMock.mockResolvedValueOnce([
      { id: 'g1', clientId: null, status: 'active' },
      { id: 'om1', clientId: 'OM', status: 'active' },
      { id: 'brz1', clientId: 'BRZ', status: 'active' },
      { id: 'g2', clientId: null, status: 'archived' },
    ]);
    const out = await resolveVisibleKbs(['g1', 'om1', 'brz1', 'g2'], 'OM', fakeDb);
    expect(out.sort()).toEqual(['g1', 'om1']);
  });

  it('cliente null vê só globais', async () => {
    h.repoListMock.mockResolvedValueOnce([
      { id: 'g1', clientId: null, status: 'active' },
      { id: 'om1', clientId: 'OM', status: 'active' },
    ]);
    const out = await resolveVisibleKbs(['g1', 'om1'], null, fakeDb);
    expect(out).toEqual(['g1']);
  });

  it('refs vazio → []', async () => {
    const out = await resolveVisibleKbs([], 'OM', fakeDb);
    expect(out).toEqual([]);
    expect(h.repoListMock).not.toHaveBeenCalled();
  });
});

describe('queryKbDocs', () => {
  it('knowledgeBaseIds vazio → [] sem chamar vectorSearch', async () => {
    const out = await queryKbDocs({ embedding: [1, 0], topK: 5, knowledgeBaseIds: [] }, fakeDb);
    expect(out).toEqual([]);
    expect(h.vectorSearchMock).not.toHaveBeenCalled();
  });

  it('chama vectorSearch com filtro in e mapeia hits', async () => {
    h.vectorSearchMock.mockResolvedValueOnce([
      { id: 'c1', score: 0.9, data: { content: 'x', metadata: { filename: 'a.md' } } },
    ]);
    const out = await queryKbDocs({ embedding: [1, 0], topK: 5, knowledgeBaseIds: ['k1', 'k2'] }, fakeDb);
    expect(h.vectorSearchMock).toHaveBeenCalledWith(expect.objectContaining({ filters: { knowledgeBaseId: ['k1', 'k2'] }, topK: 5 }));
    expect(out[0]).toMatchObject({ id: 'c1', content: 'x', similarity: 0.9 });
  });

  it('particiona >30 KBs em lotes e une por score', async () => {
    const ids = Array.from({ length: 31 }, (_, i) => `k${i}`);
    h.vectorSearchMock
      .mockResolvedValueOnce([{ id: 'a', score: 0.5, data: { content: 'a', metadata: {} } }])
      .mockResolvedValueOnce([{ id: 'b', score: 0.8, data: { content: 'b', metadata: {} } }]);
    const out = await queryKbDocs({ embedding: [1, 0], topK: 5, knowledgeBaseIds: ids }, fakeDb);
    expect(h.vectorSearchMock).toHaveBeenCalledTimes(2);
    expect(out.map((x) => x.id)).toEqual(['b', 'a']); // ordenado por score desc
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/features/ai-studio/kb/query-kb.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/features/ai-studio/kb/query-kb.ts`:

```typescript
import 'server-only';
import { getDb } from '@/shared/lib/firebase/admin';
import { vectorSearch } from '@/shared/lib/firestore/vector-search';
import { AiStudioRepo } from '@/features/ai-studio/repo';

const EMBEDDINGS_COL = 'embeddingsDocs';
const IN_BATCH = 30; // limite do Firestore `in`

type Db = FirebaseFirestore.Firestore;

export async function resolveVisibleKbs(
  refs: string[], clientId: string | null, _db?: Db,
): Promise<string[]> {
  if (!refs || refs.length === 0) return [];
  const all = await new AiStudioRepo('knowledgeBase').list();
  const refSet = new Set(refs);
  return all
    .filter((kb) => refSet.has(kb.id))
    .filter((kb) => kb.status === 'active')
    .filter((kb) => {
      const kbClient = (kb as { clientId?: string | null }).clientId ?? null;
      return kbClient === null || kbClient === clientId;
    })
    .map((kb) => kb.id);
}

export interface KbHit {
  id: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function queryKbDocs(
  input: { embedding: number[]; topK: number; knowledgeBaseIds: string[] }, db?: Db,
): Promise<KbHit[]> {
  if (!input.knowledgeBaseIds || input.knowledgeBaseIds.length === 0) return [];
  const firestore = db ?? getDb();
  const col = firestore.collection(EMBEDDINGS_COL);

  const batches = chunk(input.knowledgeBaseIds, IN_BATCH);
  const all: KbHit[] = [];
  for (const batch of batches) {
    const matches = await vectorSearch<{ content: string; metadata: Record<string, unknown> }>({
      collection: col as never,
      queryEmbedding: input.embedding,
      filters: { knowledgeBaseId: batch },
      topK: input.topK,
    });
    for (const m of matches) {
      all.push({ id: m.id, content: m.data.content, similarity: m.score, metadata: m.data.metadata ?? {} });
    }
  }
  all.sort((a, b) => b.similarity - a.similarity);
  return all.slice(0, input.topK);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/features/ai-studio/kb/query-kb.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-studio/kb/query-kb.ts src/features/ai-studio/kb/query-kb.test.ts
git commit -m "feat(ai-studio): resolveVisibleKbs (tenancy) + queryKbDocs escopado por KB"
```

---

### Task 7: API route — upload/list/delete de docs

**Files:**
- Create: `app/api/ai-studio/kb/[id]/docs/route.ts`
- Test: `app/api/ai-studio/kb/[id]/docs/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`/`isAdminAuthOk`; `AiStudioRepo` (carrega a KB p/ pegar clientId); `ingestKbFile` (Task 5); `listSources`/`getSource`/`deleteSource` (Task 4); `extFromFilename` (Task 2).
- Produces: handlers Next `GET`/`POST`/`DELETE` para `app/api/ai-studio/kb/[id]/docs`. Assinatura Next 16: `(req: Request, { params }: { params: Promise<{ id: string }> })`.

- [ ] **Step 1: Escrever o teste (falhando)**

`app/api/ai-studio/kb/[id]/docs/__tests__/route.test.ts`:

```typescript
/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const h = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  repoGetMock: vi.fn(),
  ingestMock: vi.fn(),
  listSourcesMock: vi.fn(),
  deleteSourceMock: vi.fn(),
}));

vi.mock('@/shared/lib/auth/require-admin', () => ({
  requireAdmin: h.requireAdminMock,
  isAdminAuthOk: (r: unknown) => typeof (r as { uid?: unknown })?.uid === 'string',
}));
vi.mock('@/features/ai-studio/repo', () => ({ AiStudioRepo: vi.fn().mockImplementation(() => ({ get: h.repoGetMock })) }));
vi.mock('@/features/ai-studio/kb/ingest', () => ({ ingestKbFile: h.ingestMock }));
vi.mock('@/features/ai-studio/kb/sources-repo', () => ({ listSources: h.listSourcesMock, getSource: vi.fn(), deleteSource: h.deleteSourceMock }));

import { GET, POST, DELETE } from '../route';

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function uploadReq(file: { name: string; type: string; content: string }) {
  const fd = new FormData();
  fd.append('file', new File([file.content], file.name, { type: file.type }));
  return new Request('http://x/api/ai-studio/kb/kb1/docs', { method: 'POST', body: fd });
}

beforeEach(() => { Object.values(h).forEach((m) => m.mockReset()); });

describe('kb docs route', () => {
  it('GET 401 sem admin', async () => {
    h.requireAdminMock.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    const res = await GET(new Request('http://x/api/ai-studio/kb/kb1/docs'), params('kb1'));
    expect(res.status).toBe(401);
  });

  it('GET lista sources da KB', async () => {
    h.requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    h.listSourcesMock.mockResolvedValueOnce([{ id: 's1', filename: 'a.md', status: 'ready' }]);
    const res = await GET(new Request('http://x/api/ai-studio/kb/kb1/docs'), params('kb1'));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toHaveLength(1);
  });

  it('POST 404 quando KB não existe', async () => {
    h.requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    h.repoGetMock.mockResolvedValueOnce(null);
    const res = await POST(uploadReq({ name: 'a.md', type: 'text/markdown', content: '# x' }), params('kb1'));
    expect(res.status).toBe(404);
  });

  it('POST 400 ext inválida', async () => {
    h.requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    h.repoGetMock.mockResolvedValueOnce({ id: 'kb1', clientId: null });
    const res = await POST(uploadReq({ name: 'a.docx', type: 'x', content: 'x' }), params('kb1'));
    expect(res.status).toBe(400);
    expect(h.ingestMock).not.toHaveBeenCalled();
  });

  it('POST 200 happy path chama ingestKbFile e retorna o source', async () => {
    h.requireAdminMock.mockResolvedValueOnce({ uid: 'admin@x' });
    h.repoGetMock.mockResolvedValueOnce({ id: 'kb1', clientId: 'OM' });
    h.ingestMock.mockResolvedValueOnce({ id: 's1', filename: 'a.md', status: 'ready', chunkCount: 3 });
    const res = await POST(uploadReq({ name: 'a.md', type: 'text/markdown', content: '# Doc' }), params('kb1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe('ready');
    expect(h.ingestMock).toHaveBeenCalledWith(expect.objectContaining({ kb: { id: 'kb1', clientId: 'OM' }, filename: 'a.md' }), undefined);
  });

  it('DELETE remove source', async () => {
    h.requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    h.deleteSourceMock.mockResolvedValueOnce(undefined);
    const res = await DELETE(new Request('http://x/api/ai-studio/kb/kb1/docs?docId=s1', { method: 'DELETE' }), params('kb1'));
    expect(res.status).toBe(200);
    expect(h.deleteSourceMock).toHaveBeenCalledWith('s1', undefined);
  });

  it('DELETE 400 sem docId', async () => {
    h.requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    const res = await DELETE(new Request('http://x/api/ai-studio/kb/kb1/docs', { method: 'DELETE' }), params('kb1'));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test "app/api/ai-studio/kb/[id]/docs/__tests__/route.test.ts"`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`app/api/ai-studio/kb/[id]/docs/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { requireAdmin, isAdminAuthOk } from '@/shared/lib/auth/require-admin';
import { AiStudioRepo } from '@/features/ai-studio/repo';
import { ingestKbFile } from '@/features/ai-studio/kb/ingest';
import { listSources, deleteSource } from '@/features/ai-studio/kb/sources-repo';
import { extFromFilename } from '@/features/ai-studio/kb/extract';

export const runtime = 'nodejs';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: RouteParams) {
  const auth = await requireAdmin(req);
  if (!isAdminAuthOk(auth)) return auth;
  try {
    const { id } = await params;
    return NextResponse.json({ data: await listSources(id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao listar docs' }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  const auth = await requireAdmin(req);
  if (!isAdminAuthOk(auth)) return auth;
  try {
    const { id } = await params;
    const kb = await new AiStudioRepo('knowledgeBase').get(id);
    if (!kb) return NextResponse.json({ error: 'KB não encontrada' }, { status: 404 });

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Arquivo ausente (campo "file")' }, { status: 400 });

    if (!extFromFilename(file.name)) {
      return NextResponse.json({ error: 'Formato não suportado (use .md, .txt ou .pdf)' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Arquivo excede 10 MB' }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const source = await ingestKbFile({
      kb: { id: kb.id, clientId: (kb as { clientId?: string | null }).clientId ?? null },
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      bytes,
      uploadedBy: auth.uid,
    });
    return NextResponse.json({ data: source });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro no upload' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const auth = await requireAdmin(req);
  if (!isAdminAuthOk(auth)) return auth;
  try {
    await params; // valida o shape; id não é necessário (docId identifica o source)
    const docId = new URL(req.url).searchParams.get('docId');
    if (!docId) return NextResponse.json({ error: 'docId é obrigatório' }, { status: 400 });
    await deleteSource(docId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao excluir doc' }, { status: 500 });
  }
}
```

> Nota: o teste injeta `db` como `undefined` (default) nas funções de repo/ingest; por isso os `expect(...).toHaveBeenCalledWith(..., undefined)`. Em produção essas funções caem no `getDb()` interno.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test "app/api/ai-studio/kb/[id]/docs/__tests__/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/api/ai-studio/kb/[id]/docs"
git commit -m "feat(ai-studio): rota de upload/list/delete de docs de KB (multipart, síncrona)"
```

---

### Task 8: kb-retrieval-tool + wiring no agente (atrás de flag) + store flag

**Files:**
- Create: `src/features/ai-studio/runtime/kb-retrieval-tool.ts`
- Test: `src/features/ai-studio/runtime/kb-retrieval-tool.test.ts`
- Modify: `src/features/ai-agents/mastra/descriptive-agent-mastra.ts`
- Modify: `src/shared/stores/app-store.ts` (flag `useAiStudioKb`, paridade com `useAiStudioAgents`)

**Interfaces:**
- Consumes: `tool` (`ai`), `embedTexts`, `rerank`, `resolveVisibleKbs`/`queryKbDocs` (Task 6).
- Produces: `createKbRetrievalTool(ctx: { clientId?: string; knowledgeBaseRefs: string[] })` — AI SDK tool; embeda a query, resolve KBs visíveis, busca, reranqueia, retorna `{ hits: [...] }`. Retorna `{ hits: [] }` se não houver KB visível.

- [ ] **Step 1: Escrever o teste (falhando)**

`src/features/ai-studio/runtime/kb-retrieval-tool.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  embedTextsMock: vi.fn(), rerankMock: vi.fn(), resolveVisibleKbsMock: vi.fn(), queryKbDocsMock: vi.fn(),
}));
vi.mock('@/shared/lib/rag/embeddings', () => ({ embedTexts: h.embedTextsMock }));
vi.mock('@/shared/lib/rag/reranker', () => ({ rerank: h.rerankMock }));
vi.mock('@/features/ai-studio/kb/query-kb', () => ({ resolveVisibleKbs: h.resolveVisibleKbsMock, queryKbDocs: h.queryKbDocsMock }));

import { createKbRetrievalTool } from './kb-retrieval-tool';

beforeEach(() => { Object.values(h).forEach((m) => m.mockReset()); });

describe('createKbRetrievalTool', () => {
  it('sem KB visível → hits vazio, não embeda', async () => {
    h.resolveVisibleKbsMock.mockResolvedValueOnce([]);
    const t = createKbRetrievalTool({ clientId: 'OM', knowledgeBaseRefs: ['x'] });
    const out = await (t as any).execute({ query: 'q' });
    expect(out.hits).toEqual([]);
    expect(h.embedTextsMock).not.toHaveBeenCalled();
  });

  it('com KB visível: embeda, busca escopado, reranqueia', async () => {
    h.resolveVisibleKbsMock.mockResolvedValueOnce(['k1', 'k2']);
    h.embedTextsMock.mockResolvedValueOnce([[1, 0]]);
    h.queryKbDocsMock.mockResolvedValueOnce([{ id: 'c1', content: 'a', similarity: 0.7, metadata: { filename: 'a.md' } }]);
    h.rerankMock.mockResolvedValueOnce([{ id: 'c1', content: 'a', similarity: 0.7, metadata: { filename: 'a.md' } }]);
    const t = createKbRetrievalTool({ clientId: 'OM', knowledgeBaseRefs: ['k1', 'k2'] });
    const out = await (t as any).execute({ query: 'inadimplência' });
    expect(h.queryKbDocsMock).toHaveBeenCalledWith(expect.objectContaining({ knowledgeBaseIds: ['k1', 'k2'] }));
    expect(out.hits[0]).toMatchObject({ content: 'a', similarity: 0.7 });
  });

  it('embedding vazio → hits vazio', async () => {
    h.resolveVisibleKbsMock.mockResolvedValueOnce(['k1']);
    h.embedTextsMock.mockResolvedValueOnce([]);
    const t = createKbRetrievalTool({ clientId: null, knowledgeBaseRefs: ['k1'] });
    const out = await (t as any).execute({ query: 'q' });
    expect(out.hits).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/features/ai-studio/runtime/kb-retrieval-tool.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar a tool**

`src/features/ai-studio/runtime/kb-retrieval-tool.ts`:

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import { embedTexts } from '@/shared/lib/rag/embeddings';
import { rerank } from '@/shared/lib/rag/reranker';
import { resolveVisibleKbs, queryKbDocs } from '@/features/ai-studio/kb/query-kb';

export function createKbRetrievalTool(ctx: { clientId?: string; knowledgeBaseRefs: string[] }) {
  return tool({
    description:
      'Busca semântica nos documentos das Knowledge Bases vinculadas a este agente (conhecimento de mercado, produto e negócio). Use para fundamentar respostas com o material curado pela administração.',
    inputSchema: z.object({ query: z.string().min(1) }),
    execute: async (input: { query: string }) => {
      const topKRetrieve = Number(process.env.RAG_TOPK_RETRIEVE ?? 20);
      const topKRerank = Number(process.env.RAG_TOPK_RERANK ?? 5);

      const visible = await resolveVisibleKbs(ctx.knowledgeBaseRefs, ctx.clientId ?? null);
      if (visible.length === 0) return { hits: [] };

      const [embedding] = await embedTexts([input.query]);
      if (!embedding) return { hits: [] };

      const candidates = await queryKbDocs({ embedding, topK: topKRetrieve, knowledgeBaseIds: visible });
      if (candidates.length === 0) return { hits: [] };

      const reranked = await rerank({ query: input.query, candidates: candidates.map((c) => ({ ...c })), topN: topKRerank });
      return {
        hits: reranked.map((h) => ({
          content: h.content,
          similarity: h.similarity,
          filename: (h.metadata as { filename?: string })?.filename,
          metadata: h.metadata,
        })),
      };
    },
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/features/ai-studio/runtime/kb-retrieval-tool.test.ts`
Expected: PASS.

- [ ] **Step 5: Adicionar a flag no app-store**

Em `src/shared/stores/app-store.ts`, junto de `useAiStudioAgents` (adicionado na Fase 1), adicionar à interface e ao store o par `useAiStudioKb`:

```typescript
  // interface (junto de useAiStudioAgents)
  useAiStudioKb: boolean;
  setUseAiStudioKb: (v: boolean) => void;
```

```typescript
  // store (junto de useAiStudioAgents)
  useAiStudioKb: false,
  setUseAiStudioKb: (v) => set({ useAiStudioKb: v }),
```

- [ ] **Step 6: Wire no descriptive-agent-mastra (atrás de AI_STUDIO_KB)**

Em `src/features/ai-agents/mastra/descriptive-agent-mastra.ts`, após montar `const tools = buildDescriptiveAgentTools(ctx) as Record<string, unknown>;` (linha ~39), injetar a tool de KB quando a flag estiver on. Precisa das `knowledgeBaseRefs` do agente — resolvidas do config do AI Studio quando disponível; no MVP, lê do doc do agente via loader (reusa `loadAgentConfig`):

```typescript
import { createKbRetrievalTool } from '@/features/ai-studio/runtime/kb-retrieval-tool';
import { loadAgentConfig } from '@/features/ai-studio/runtime/config-loader';
```

Logo após a montagem de `tools` e antes de `resolveAgentInstructions`:

```typescript
  // Fase 2: injeta a tool de retrieval KB-scoped quando AI_STUDIO_KB=on.
  // As knowledgeBaseRefs vêm do doc do agente no Firestore (fail-soft: se
  // não houver doc/erro, não injeta a tool — comportamento atual intacto).
  if (process.env.AI_STUDIO_KB === 'on') {
    try {
      const cfg = await loadAgentConfig('descriptive');
      const refs = (cfg?.knowledgeBaseRefs as string[] | undefined) ?? [];
      if (refs.length > 0) {
        tools.kb_retrieval = createKbRetrievalTool({
          clientId: (ctx as { clientId?: string }).clientId,
          knowledgeBaseRefs: refs,
        });
      }
    } catch {
      // fail-soft: sem KB tool, segue com as tools legadas
    }
  }
```

- [ ] **Step 7: Verificar não-regressão (flag off) + tool test**

Run: `pnpm test src/features/ai-studio/runtime/kb-retrieval-tool.test.ts src/features/ai-agents/agents/descriptive-agent.test.ts`
Expected: PASS (com `AI_STUDIO_KB` ausente, nenhuma KB tool é injetada; comportamento do descriptive inalterado).

- [ ] **Step 8: Build**

Run: `pnpm build`
Expected: verde.

- [ ] **Step 9: Commit**

```bash
git add src/features/ai-studio/runtime/kb-retrieval-tool.ts src/features/ai-studio/runtime/kb-retrieval-tool.test.ts src/features/ai-agents/mastra/descriptive-agent-mastra.ts src/shared/stores/app-store.ts
git commit -m "feat(ai-studio): tool de retrieval KB-scoped no descriptive agent atrás de AI_STUDIO_KB"
```

---

### Task 9: UI — upload de docs na KnowledgeBasesTab

**Files:**
- Create: `src/features/ai-studio/admin/ui/KbDocUploader.tsx`
- Create: `src/features/ai-studio/admin/ui/KbDocList.tsx`
- Modify: `src/features/ai-studio/admin/model/api.ts` (fns de docs)
- Modify: `src/features/ai-studio/admin/ui/KnowledgeBasesTab.tsx` (seção Documentos)

> UI presentational — sem teste unitário (padrão do projeto). Validação por `pnpm build` + smoke. A lógica de dados (api fns) é fina e coberta pelo build/types.

**Interfaces:**
- Consumes: `getToken`/`headers` (já em `api.ts`); componentes shadcn.
- Produces (em `api.ts`): `uploadKbDoc(kbId, file): Promise<KbSourceRecordLike>`, `listKbDocs(kbId): Promise<KbSourceRecordLike[]>`, `deleteKbDoc(kbId, docId): Promise<void>`. `interface KbSourceRecordLike { id; filename; status; chunkCount; error?; sizeBytes }`.

- [ ] **Step 1: Adicionar as fns de docs no api.ts**

Em `src/features/ai-studio/admin/model/api.ts`, ao final, adicionar (reusa o `getToken` privado já existente no módulo — as fns ficam no mesmo arquivo, então têm acesso):

```typescript
export interface KbSourceRecordLike {
  id: string; filename: string; status: 'pending' | 'processing' | 'ready' | 'error';
  chunkCount: number; error?: string; sizeBytes: number;
}

export async function listKbDocs(kbId: string): Promise<KbSourceRecordLike[]> {
  const token = await getToken();
  const body = await unwrap(await fetch(`/api/ai-studio/kb/${encodeURIComponent(kbId)}/docs`, { headers: headers(token) }), 'Falha ao listar documentos');
  return body.data ?? [];
}

export async function uploadKbDoc(kbId: string, file: File): Promise<KbSourceRecordLike> {
  const token = await getToken();
  const fd = new FormData();
  fd.append('file', file);
  // NÃO setar Content-Type — o browser define o boundary do multipart.
  const res = await fetch(`/api/ai-studio/kb/${encodeURIComponent(kbId)}/docs`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
  });
  const body = await unwrap(res, 'Falha no upload');
  return body.data;
}

export async function deleteKbDoc(kbId: string, docId: string): Promise<void> {
  const token = await getToken();
  await unwrap(
    await fetch(`/api/ai-studio/kb/${encodeURIComponent(kbId)}/docs?docId=${encodeURIComponent(docId)}`, { method: 'DELETE', headers: headers(token) }),
    'Falha ao excluir documento',
  );
}
```

> `getToken`, `headers` e `unwrap` já existem no `api.ts` (Fase 0). Se `unwrap` não estiver exportado/acessível no escopo, reusar o mesmo padrão inline das outras fns do arquivo.

- [ ] **Step 2: KbDocList**

`src/features/ai-studio/admin/ui/KbDocList.tsx`:

```tsx
'use client';
import { Trash2, FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import type { KbSourceRecordLike } from '../model/api';

const STATUS: Record<string, { icon: React.ReactNode; label: string }> = {
  pending: { icon: <Loader2 className="size-3.5 animate-spin" />, label: 'pendente' },
  processing: { icon: <Loader2 className="size-3.5 animate-spin" />, label: 'processando' },
  ready: { icon: <CheckCircle2 className="size-3.5 text-primary" />, label: 'pronto' },
  error: { icon: <AlertCircle className="size-3.5 text-destructive" />, label: 'erro' },
};

export function KbDocList({ docs, onDelete }: { docs: KbSourceRecordLike[]; onDelete: (d: KbSourceRecordLike) => void }) {
  if (docs.length === 0) return <p className="text-xs text-muted-foreground">Nenhum documento ainda.</p>;
  return (
    <div className="rounded-lg border border-border divide-y divide-border">
      {docs.map((d) => {
        const s = STATUS[d.status] ?? STATUS.pending;
        return (
          <div key={d.id} className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="size-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm truncate">{d.filename}</span>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">{s.icon}{s.label}</span>
              {d.status === 'ready' && <span className="text-[11px] text-muted-foreground">{d.chunkCount} chunks</span>}
              {d.status === 'error' && d.error && <span className="text-[11px] text-destructive truncate">{d.error}</span>}
            </div>
            <Button size="sm" variant="ghost" title="Excluir" onClick={() => onDelete(d)}>
              <Trash2 className="size-3.5 text-destructive" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: KbDocUploader**

`src/features/ai-studio/admin/ui/KbDocUploader.tsx`:

```tsx
'use client';
import { useRef, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';

const ACCEPT = '.md,.txt,.pdf';
const MAX_BYTES = 10 * 1024 * 1024;

export function KbDocUploader({ onUpload }: { onUpload: (file: File) => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setErr(null);
    for (const file of Array.from(files)) {
      if (file.size > MAX_BYTES) { setErr(`"${file.name}" excede 10 MB`); continue; }
      setBusy(true);
      try { await onUpload(file); }
      catch (e) { setErr(e instanceof Error ? e.message : 'Falha no upload'); }
      finally { setBusy(false); }
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="space-y-2">
      <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => handleFiles(e.target.files)} />
      <Button size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()} className="gap-1.5">
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
        {busy ? 'Enviando...' : 'Enviar documento (.md/.txt/.pdf, ≤10MB)'}
      </Button>
      {err && <p className="text-[11px] text-destructive">{err}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Integrar na KnowledgeBasesTab**

Em `src/features/ai-studio/admin/ui/KnowledgeBasesTab.tsx`, dentro do `Dialog` de edição (somente quando editando uma KB existente, i.e. `draft.origin` setado OU `id` presente), adicionar a seção Documentos. Imports no topo:

```tsx
import { useEffect, useState } from 'react';
import { listKbDocs, uploadKbDoc, deleteKbDoc, type KbSourceRecordLike } from '../model/api';
import { KbDocUploader } from './KbDocUploader';
import { KbDocList } from './KbDocList';
```

Dentro do componente, estado + carga dos docs quando um id existente está aberto:

```tsx
  const [docs, setDocs] = useState<KbSourceRecordLike[]>([]);
  const editingExisting = Boolean(draft.origin) || rows.some((r) => r.id === draft.id);

  async function refreshDocs(kbId: string) {
    try { setDocs(await listKbDocs(kbId)); } catch { /* lista vazia em erro */ }
  }
  useEffect(() => {
    if (open && editingExisting && draft.id) refreshDocs(draft.id);
    else setDocs([]);
  }, [open, editingExisting, draft.id]);
```

No JSX do dialog, abaixo dos campos, quando `editingExisting`:

```tsx
            {editingExisting && draft.id && (
              <div className="space-y-2 pt-2 border-t border-border">
                <label className="text-xs font-medium">Documentos</label>
                <KbDocUploader onUpload={async (file) => { await uploadKbDoc(draft.id, file); await refreshDocs(draft.id); }} />
                <KbDocList docs={docs} onDelete={async (d) => { await deleteKbDoc(draft.id, d.id); await refreshDocs(draft.id); }} />
              </div>
            )}
```

- [ ] **Step 5: Lint + Build**

Run: `pnpm build`
Expected: verde (compila com a nova seção).

- [ ] **Step 6: Smoke manual (opcional)**

Run: `pnpm dev`, abrir `/admin?section=ai-knowledge-bases`, editar a KB `default`, enviar um `.md` pequeno → aparece na lista como `ready` com chunks (requer Firestore dev + flag de ingestão; ingestão não depende de flag, só o consumo no agente).

- [ ] **Step 7: Commit**

```bash
git add src/features/ai-studio/admin/ui/KbDocUploader.tsx src/features/ai-studio/admin/ui/KbDocList.tsx src/features/ai-studio/admin/ui/KnowledgeBasesTab.tsx src/features/ai-studio/admin/model/api.ts
git commit -m "feat(ai-studio): UI de upload/lista/exclusão de documentos na KnowledgeBasesTab"
```

---

### Task 10: Migração dos embeddingsDocs legados + smoke da suíte

**Files:**
- Create: `scripts/migrate-embeddings-to-kb.ts`
- Modify: `package.json` (script `migrate:embeddings-kb`)
- Test: `scripts/migrate-embeddings-to-kb.test.ts`

**Interfaces:**
- Consumes: `getSeedDb` (`scripts/_firestore-admin`, mesmo helper da Fase 0); `FieldValue`.
- Produces: `async function migrateEmbeddingsToKb(db, kbId='default'): Promise<{ updated: number; skipped: number }>` — para cada doc em `embeddingsDocs` SEM `knowledgeBaseId`, set `knowledgeBaseId=kbId`; idempotente (docs que já têm o campo são pulados).

- [ ] **Step 1: Escrever o teste (falhando)**

`scripts/migrate-embeddings-to-kb.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { migrateEmbeddingsToKb } from './migrate-embeddings-to-kb';

function makeFakeDb() {
  const store: Record<string, Record<string, any>> = { embeddingsDocs: {} };
  return {
    store,
    collection(name: string) {
      store[name] ??= {};
      return {
        async get() { return { docs: Object.entries(store[name]).map(([id, d]) => ({ id, data: () => d, ref: { async update(v: any) { store[name][id] = { ...store[name][id], ...v }; } } })) }; },
      };
    },
  } as any;
}

describe('migrateEmbeddingsToKb', () => {
  let db: ReturnType<typeof makeFakeDb>;
  beforeEach(() => { db = makeFakeDb(); });

  it('marca docs sem knowledgeBaseId com default; pula os que já têm', async () => {
    db.store.embeddingsDocs = {
      legacy1: { content: 'a', clientId: 'OM' },
      legacy2: { content: 'b', clientId: 'OM' },
      already: { content: 'c', knowledgeBaseId: 'mercado' },
    };
    const r = await migrateEmbeddingsToKb(db);
    expect(r.updated).toBe(2);
    expect(r.skipped).toBe(1);
    expect(db.store.embeddingsDocs.legacy1.knowledgeBaseId).toBe('default');
    expect(db.store.embeddingsDocs.already.knowledgeBaseId).toBe('mercado');
  });

  it('idempotente: 2ª passada não altera nada', async () => {
    db.store.embeddingsDocs = { legacy1: { content: 'a' } };
    await migrateEmbeddingsToKb(db);
    const r2 = await migrateEmbeddingsToKb(db);
    expect(r2.updated).toBe(0);
    expect(r2.skipped).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test scripts/migrate-embeddings-to-kb.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`scripts/migrate-embeddings-to-kb.ts`:

```typescript
import { getSeedDb } from './_firestore-admin';

type Db = FirebaseFirestore.Firestore;

/** Marca chunks legados (sem knowledgeBaseId) com a KB default. Idempotente. */
export async function migrateEmbeddingsToKb(db: Db, kbId = 'default'): Promise<{ updated: number; skipped: number }> {
  const snap = await db.collection('embeddingsDocs').get();
  let updated = 0;
  let skipped = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.knowledgeBaseId) { skipped++; continue; }
    await doc.ref.update({ knowledgeBaseId: kbId });
    updated++;
  }
  return { updated, skipped };
}

async function main() {
  const db = getSeedDb();
  const r = await migrateEmbeddingsToKb(db);
  console.log(`[migrate:embeddings-kb] updated=${r.updated} skipped=${r.skipped}`);
}

// Executa só quando rodado como script (não em import de teste).
if (process.argv[1] && process.argv[1].includes('migrate-embeddings-to-kb')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test scripts/migrate-embeddings-to-kb.test.ts`
Expected: PASS.

- [ ] **Step 5: Adicionar o script no package.json**

Em `package.json` scripts:

```json
    "migrate:embeddings-kb": "tsx scripts/migrate-embeddings-to-kb.ts",
```

- [ ] **Step 6: Suíte completa + build final**

Run: `pnpm test src/features/ai-studio src/shared/lib/firestore/vector-search.test.ts app/api/ai-studio scripts/migrate-embeddings-to-kb.test.ts src/features/ai-agents/agents/descriptive-agent.test.ts`
Expected: tudo PASS (incluindo não-regressão do descriptive).

Run: `pnpm build`
Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add scripts/migrate-embeddings-to-kb.ts scripts/migrate-embeddings-to-kb.test.ts package.json
git commit -m "feat(ai-studio): migração idempotente de embeddingsDocs legados p/ KB default"
```

---

## Self-Review

**Spec coverage:**
- Upload .md/.txt/.pdf síncrono + status → Tasks 2, 5, 7. ✅
- KB-scoped upsert (id determinístico, re-upload substitui, delete remove chunks) → Tasks 3, 4. ✅
- `embeddingsDocs` taggeado knowledgeBaseId/sourceDocId/clientId → Task 3. ✅
- `knowledgeBaseSources` + contadores → Task 4. ✅
- Retrieval escopado (queryKbDocs + filtro `in` + resolveVisibleKbs/tenancy) → Tasks 1, 6. ✅
- Wiring no agente atrás de `useAiStudioKb`/`AI_STUDIO_KB` + fallback → Task 8. ✅
- UI upload/lista/delete → Task 9. ✅
- Migração legado → 'default' → Task 10. ✅
- Dep pdf-parse → Task 2. ✅
- Não-regressão (flag off, legado intocado) → Tasks 8 (step 7), 10 (step 6). ✅
- ADR: nenhuma nova (implementa ADR-0016) — conforme spec. ✅

**Placeholder scan:** Sem TBD/TODO. Pontos de "se X não estiver acessível, reusar padrão" (Task 9 `unwrap`) são instruções condicionais com fallback concreto, não placeholders.

**Type consistency:** `kbChunkId`/`sourceDocId` (Tasks 3/4) consumidos por ingest (5) e migração não-relacionada. `KbChunkInput` (3) usado por ingest (5). `KbSourceRecord` (4) retornado por ingest (5) e rota (7). `resolveVisibleKbs`/`queryKbDocs` (6) consumidos pela tool (8). `KbSourceRecordLike` (9) espelha `KbSourceRecord`. `vectorSearch` filtro array (1) consumido por queryKbDocs (6). Nomes batem.

**Escopo:** focado numa única entrega coesa (ingestão→retrieval→wiring→migração). Sem decomposição adicional necessária.

## Execution Notes

- Ordem: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10. (8 depende de 6; 7 depende de 5/4; 5 depende de 2/3/4.)
- Tasks 1–8, 10 são TDD; Task 9 é UI (build/smoke).
- Flag `AI_STUDIO_KB` off por default → retrieval KB não é injetado; chat atual intocado.
- Operacional pós-merge: `pnpm migrate:embeddings-kb` (atenção ao pitfall `GOOGLE_APPLICATION_CREDENTIALS`).
