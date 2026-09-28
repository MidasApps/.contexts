# Chat cria métrica do cliente (G4) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao preencher um bloco no chat, criar uma métrica do cliente (recipe `sql` com filtros parametrizados) e vincular `metricId` ao bloco — para o bloco re-resolver via `useReportData`.

**Architecture:** Dentro de `fillBlock` (único ponto com o SQL), após `submit_data`: captura o SQL do último `execute_sql`, parametriza os filtros conhecidos (`data_base_report`, `projeto`) para `{filter.*}`, deduplica via recall (`embeddingsBlocks` passa a carregar `metricId`), e persiste uma `Metric` do cliente reusando `generateUniqueMetricId` (fundação, PR #19). Best-effort: falha não quebra o chat.

**Tech Stack:** TypeScript, Zod, firebase-admin (Firestore), Vitest, Vercel AI SDK.

## Global Constraints

- TDD obrigatório: teste-primeiro, RED→GREEN→refactor.
- Best-effort: erro na materialização da métrica NUNCA quebra o preenchimento do bloco (igual ao `persistBlockSpec`).
- Métrica criada: `ownerClientId = ctx.clientId`, `recipe.kind = 'sql'`, `requires = [routingRef]` (só roteamento de dataset). Reusa `generateUniqueMetricId` (`src/shared/lib/metrics/metric-id.ts`).
- `routingRef` null (cliente sem `semanticContext.dataContracts`) ⇒ NÃO cria métrica (warn).
- Parametrização é textual/regex ancorada nas colunas que o fill-prompt garante (`data_base_report`, `projeto`) — não é parser SQL. Aproxima `=` da data-base por `BETWEEN` (placeholder `{filter.date_range}`); fidelidade total = G5.
- Dedup só reusa em match de **alta similaridade** (`score >= 0.95`).
- Spec: `docs/superpowers/specs/2026-06-22-chat-cria-metrica-design.md`.

## File Structure

- `src/shared/lib/metrics/parameterize-sql.ts` (novo) — `parameterizeFilters`.
- `src/shared/lib/metrics/create-chat-metric.ts` (novo) — `createChatMetric`.
- `src/shared/lib/memory/recall-store.ts` — `EmbeddedBlock`/`UpsertBlockInput`/`BlockEmbeddingDoc` + `metricId`.
- `src/shared/lib/memory/persist-block.ts` — `PersistBlockInput.metricId` + repasse.
- `src/features/canvas-orchestrator/lib/fill-block-fn.ts` — materialização + `block.metricId`.
- `app/api/metrics/[id]/data/route.ts` — pular coverage G8 para recipes `sql`.

---

## Task 1: `parameterizeFilters`

**Files:**
- Create: `src/shared/lib/metrics/parameterize-sql.ts`
- Test: `src/shared/lib/metrics/parameterize-sql.test.ts`

**Interfaces:**
- Consumes: `ChatRequestFilters` (`@/shared/config/agents/types`) — `{ dateRange: {start,end}, projetos: string[], ... }`.
- Produces: `parameterizeFilters(sql: string, filters: ChatRequestFilters): string`.

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/lib/metrics/parameterize-sql.test.ts
import { describe, it, expect } from 'vitest';
import { parameterizeFilters } from './parameterize-sql';

const filters = {
  dateRange: { start: '2026-01-01', end: '2026-02-01' },
  projetos: ['VIVA PARK', 'SOL NASCENTE'],
  advancedFilters: {},
  compareEnabled: false,
} as never;

describe('parameterizeFilters', () => {
  it('troca o predicado de data_base_report (=) por {filter.date_range}', () => {
    const out = parameterizeFilters(
      `SELECT SUM(saldo_devedor) FROM t WHERE data_base_report = '2026-02-01'`,
      filters,
    );
    expect(out).toBe(`SELECT SUM(saldo_devedor) FROM t WHERE {filter.date_range:contratos.data_base_report}`);
  });

  it('troca o predicado de data_base_report (BETWEEN) por {filter.date_range}', () => {
    const out = parameterizeFilters(
      `SELECT 1 FROM t WHERE data_base_report BETWEEN '2026-01-01' AND '2026-02-01'`,
      filters,
    );
    expect(out).toBe(`SELECT 1 FROM t WHERE {filter.date_range:contratos.data_base_report}`);
  });

  it('troca o predicado de projeto IN (...) por {filter.projetos}', () => {
    const out = parameterizeFilters(
      `SELECT 1 FROM t WHERE projeto IN ('VIVA PARK', 'SOL NASCENTE')`,
      filters,
    );
    expect(out).toBe(`SELECT 1 FROM t WHERE {filter.projetos:contratos.projeto}`);
  });

  it('sem projetos no filtro não mexe na cláusula projeto', () => {
    const out = parameterizeFilters(
      `SELECT 1 FROM t WHERE projeto IN ('A')`,
      { ...filters, projetos: [] } as never,
    );
    expect(out).toBe(`SELECT 1 FROM t WHERE projeto IN ('A')`);
  });

  it('é idempotente (rodar 2x não duplica placeholder)', () => {
    const once = parameterizeFilters(
      `SELECT 1 FROM t WHERE data_base_report = '2026-02-01'`,
      filters,
    );
    expect(parameterizeFilters(once, filters)).toBe(once);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/shared/lib/metrics/parameterize-sql.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/shared/lib/metrics/parameterize-sql.ts
import type { ChatRequestFilters } from '@/shared/config/agents/types';

/**
 * Substitui os predicados de filtro conhecidos do SQL do chat por placeholders
 * de recipe `sql` (`{filter.date_range}` / `{filter.projetos}`), tornando a
 * métrica responsiva a filtro/data-base no resolve.
 *
 * NÃO é um parser SQL: ancora nas colunas que o fill-prompt garante
 * (`data_base_report`, `projeto`). A data-base com `=` aproxima por `BETWEEN`
 * (semântica do placeholder). Fidelidade total via vocabulário semântico = G5.
 * Idempotente: predicados já parametrizados não casam de novo.
 */
export function parameterizeFilters(sql: string, filters: ChatRequestFilters): string {
  let out = sql;

  // data_base_report BETWEEN '...' AND '...'  → {filter.date_range:...}
  out = out.replace(
    /data_base_report\s+BETWEEN\s+'[^']+'\s+AND\s+'[^']+'/gi,
    '{filter.date_range:contratos.data_base_report}',
  );
  // data_base_report (=|>=|<=|>|<) '...'       → {filter.date_range:...}
  out = out.replace(
    /data_base_report\s*(?:=|>=|<=|>|<)\s*'[^']+'/gi,
    '{filter.date_range:contratos.data_base_report}',
  );

  // projeto IN ( '...' , ... )  /  projeto = '...'  → {filter.projetos:...}
  if (filters.projetos.length > 0) {
    out = out.replace(
      /projeto\s+IN\s*\([^)]*\)/gi,
      '{filter.projetos:contratos.projeto}',
    );
    out = out.replace(
      /projeto\s*=\s*'[^']+'/gi,
      '{filter.projetos:contratos.projeto}',
    );
  }

  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/shared/lib/metrics/parameterize-sql.test.ts`
Expected: PASS (5).

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/metrics/parameterize-sql.ts src/shared/lib/metrics/parameterize-sql.test.ts
git commit -m "feat(metrics): parameterizeFilters (SQL do chat -> placeholders de filtro)"
```

---

## Task 2: `embeddingsBlocks` carrega `metricId` (dedup)

**Files:**
- Modify: `src/shared/lib/memory/recall-store.ts` (`EmbeddedBlock`, `UpsertBlockInput`, `BlockEmbeddingDoc`, `upsertBlockEmbedding`, `queryBlockEmbeddings`)
- Modify: `src/shared/lib/memory/persist-block.ts` (`PersistBlockInput`, repasse)
- Test: `src/shared/lib/memory/recall-store.test.ts`, `src/shared/lib/memory/persist-block.test.ts`

**Interfaces:**
- Produces: `EmbeddedBlock.metricId: string | null`; `UpsertBlockInput.metricId?: string | null`; `PersistBlockInput.metricId?: string | null`. `queryBlockEmbeddings` retorna `metricId`; `persistBlockSpec`/`upsertBlockEmbedding` gravam.

- [ ] **Step 1: Write the failing test** (em `recall-store.test.ts`, adicionar 1 caso no describe `upsertBlockEmbedding` e 1 no `queryBlockEmbeddings`)

```ts
// dentro de describe('recall-store.upsertBlockEmbedding', ...)
  it('grava metricId quando fornecido (default null)', async () => {
    const { upsertBlockEmbedding } = await import('./recall-store');
    await upsertBlockEmbedding({ ...baseInput, metricId: 'carteira.x' });
    const [, data] = firestoreMock.state.addMock.mock.calls[0]!;
    expect(data).toMatchObject({ metricId: 'carteira.x' });

    firestoreMock = makeFirestoreMock();
    const { upsertBlockEmbedding: u2 } = await import('./recall-store');
    await u2({ ...baseInput });
    const [, d2] = firestoreMock.state.addMock.mock.calls[0]!;
    expect(d2).toMatchObject({ metricId: null });
  });
```

```ts
// dentro de describe('recall-store.queryBlockEmbeddings', ...), no caso de mapeamento:
//   adicionar metricId ao data do vectorSearchMock e à asserção:
//   data: { ..., metricId: 'carteira.x' }  → expect(out[0]).toMatchObject({ metricId: 'carteira.x' })
  it('mapeia metricId do doc (default null)', async () => {
    vectorSearchMock.mockResolvedValueOnce([
      { id: 'b1', score: 0.9, data: { clientId: 'OM', blockType: 'kpi', blockSpec: {}, metricId: 'carteira.x' } },
    ]);
    const { queryBlockEmbeddings } = await import('./recall-store');
    const out = await queryBlockEmbeddings({ embedding: [0.1], clientId: 'OM', blockType: 'kpi', topK: 1 });
    expect(out[0].metricId).toBe('carteira.x');
  });
```

E em `persist-block.test.ts`:
```ts
  it('repassa metricId para upsertBlockEmbedding', async () => {
    const { persistBlockSpec } = await import('./persist-block');
    await persistBlockSpec({ clientId: 'OM', blockType: 'kpi', spec: {}, description: 'd', metricId: 'carteira.x' });
    expect(upsertMock.mock.calls[0][0].metricId).toBe('carteira.x');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/shared/lib/memory/recall-store.test.ts src/shared/lib/memory/persist-block.test.ts`
Expected: FAIL — `metricId` não existe nos tipos/escrita.

- [ ] **Step 3: Write minimal implementation**

Em `recall-store.ts`:
- `EmbeddedBlock` (após `templateId`): adicionar `metricId: string | null;`
- `UpsertBlockInput` (após `templateId?`): adicionar `metricId?: string | null;`
- `BlockEmbeddingDoc` (após `templateId?`): adicionar `metricId?: string | null;`
- `upsertBlockEmbedding`: no objeto do `.add({...})`, após `templateId: i.templateId ?? null,` adicionar `metricId: i.metricId ?? null,`
- `queryBlockEmbeddings`: no `return matches.map(...)`, após `templateId: m.data.templateId ?? null,` adicionar `metricId: m.data.metricId ?? null,`

Em `persist-block.ts`:
- `PersistBlockInput` (após `templateId?`): adicionar `metricId?: string | null;`
- `persistBlockSpec`: na chamada `upsertBlockEmbedding({...})`, após `templateId: input.templateId ?? null,` adicionar `metricId: input.metricId ?? null,`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/shared/lib/memory/recall-store.test.ts src/shared/lib/memory/persist-block.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/memory/recall-store.ts src/shared/lib/memory/persist-block.ts src/shared/lib/memory/recall-store.test.ts src/shared/lib/memory/persist-block.test.ts
git commit -m "feat(memory): embeddingsBlocks carrega metricId (dedup de métrica do chat)"
```

---

## Task 3: `createChatMetric`

**Files:**
- Create: `src/shared/lib/metrics/create-chat-metric.ts`
- Test: `src/shared/lib/metrics/create-chat-metric.test.ts`

**Interfaces:**
- Consumes: `generateUniqueMetricId` (`./metric-id`), `Timestamp` (`firebase-admin/firestore`).
- Produces:
  ```ts
  interface CreateChatMetricOpts {
    db: FirebaseFirestore.Firestore;
    clientId: string;
    intent: string;
    targetType: 'kpi' | 'chart' | 'table';
    sql: string;            // já parametrizado
    routingRef: string | null;
    reuseMetricId?: string | null;
  }
  createChatMetric(opts: CreateChatMetricOpts): Promise<{ metricId: string } | null>
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/lib/metrics/create-chat-metric.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ genId: vi.fn(async () => 'imoveis.preco_m2') }));
vi.mock('./metric-id', () => ({ generateUniqueMetricId: h.genId }));
vi.mock('firebase-admin/firestore', () => ({ Timestamp: { now: () => ({ s: 0 }) } }));

import { createChatMetric } from './create-chat-metric';

function db() {
  const setMock = vi.fn(async () => undefined);
  return {
    setMock,
    db: { collection: () => ({ doc: () => ({ set: setMock }) }) } as unknown as FirebaseFirestore.Firestore,
  };
}

beforeEach(() => h.genId.mockReset().mockResolvedValue('imoveis.preco_m2'));

const base = {
  clientId: 'brz',
  intent: 'preço médio por m²',
  targetType: 'kpi' as const,
  sql: 'SELECT 1 WHERE {filter.date_range:contratos.data_base_report}',
  routingRef: 'liquid-play.unidades.valor',
};

describe('createChatMetric', () => {
  it('cria métrica do cliente com recipe sql + requires roteável', async () => {
    const { db: d, setMock } = db();
    const r = await createChatMetric({ db: d, ...base });
    expect(r).toEqual({ metricId: 'imoveis.preco_m2' });
    const saved = setMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(saved).toMatchObject({
      ownerClientId: 'brz',
      requires: ['liquid-play.unidades.valor'],
      recipe: { kind: 'sql', template: base.sql },
      type: 'kpi',
      status: 'active',
    });
  });

  it('reuseMetricId ⇒ retorna sem persistir', async () => {
    const { db: d, setMock } = db();
    const r = await createChatMetric({ db: d, ...base, reuseMetricId: 'carteira.ja_existe' });
    expect(r).toEqual({ metricId: 'carteira.ja_existe' });
    expect(setMock).not.toHaveBeenCalled();
    expect(h.genId).not.toHaveBeenCalled();
  });

  it('routingRef null ⇒ retorna null sem persistir', async () => {
    const { db: d, setMock } = db();
    const r = await createChatMetric({ db: d, ...base, routingRef: null });
    expect(r).toBeNull();
    expect(setMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/shared/lib/metrics/create-chat-metric.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/shared/lib/metrics/create-chat-metric.ts
import 'server-only';
import { Timestamp } from 'firebase-admin/firestore';
import { generateUniqueMetricId } from './metric-id';

export interface CreateChatMetricOpts {
  db: FirebaseFirestore.Firestore;
  clientId: string;
  intent: string;
  targetType: 'kpi' | 'chart' | 'table';
  /** SQL já parametrizado (placeholders {filter.*}). */
  sql: string;
  /** AttributeRef 3-part "contract.entity.attr" p/ roteamento; null ⇒ não cria. */
  routingRef: string | null;
  /** Do dedup: se presente, retorna sem criar. */
  reuseMetricId?: string | null;
}

/** domain.slug a partir do intent (lowercase, [a-z0-9_], 2 segmentos). */
function deriveDomainSlug(intent: string): { domain: string; slug: string } {
  const norm = intent
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove diacríticos (combining marks)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const slug = (norm || 'metrica').slice(0, 40).replace(/^[0-9_]+/, '') || 'metrica';
  return { domain: 'chat', slug };
}

/**
 * Materializa o indicador do chat como uma Metric DO CLIENTE (recipe sql).
 * Escreve direto em `metrics/{id}` (server-side; não passa pelo POST /api/metrics).
 * Best-effort: o caller trata erro/null sem quebrar o preenchimento do bloco.
 */
export async function createChatMetric(
  opts: CreateChatMetricOpts,
): Promise<{ metricId: string } | null> {
  if (opts.reuseMetricId) return { metricId: opts.reuseMetricId };
  if (!opts.routingRef) return null;

  const { domain, slug } = deriveDomainSlug(opts.intent);
  const metricId = await generateUniqueMetricId(opts.db, domain, slug);
  const now = Timestamp.now();
  await opts.db.collection('metrics').doc(metricId).set({
    label: opts.intent.slice(0, 120),
    description: null,
    type: opts.targetType,
    category: null,
    unit: null,
    requires: [opts.routingRef],
    recipe: { kind: 'sql', template: opts.sql },
    version: '1.0.0',
    status: 'active',
    ownerClientId: opts.clientId,
    createdAt: now,
    updatedAt: now,
  });
  return { metricId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/shared/lib/metrics/create-chat-metric.test.ts`
Expected: PASS (3).

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/metrics/create-chat-metric.ts src/shared/lib/metrics/create-chat-metric.test.ts
git commit -m "feat(metrics): createChatMetric (materializa indicador do chat como métrica do cliente)"
```

---

## Task 4: Wire no `fillBlock` (captura SQL + dedup + metricId)

**Files:**
- Modify: `src/features/canvas-orchestrator/lib/fill-block-fn.ts`
- Test: `src/features/canvas-orchestrator/lib/fill-block-fn.test.ts`

**Interfaces:**
- Consumes: `parameterizeFilters` (T1), `createChatMetric` (T3), `queryBlockEmbeddings` retornando `metricId` (T2), `persistBlockSpec` aceitando `metricId` (T2), `getDb` (`@/shared/lib/firebase/admin`).
- Produces: bloco com `block.metricId` quando há SQL + `routingRef`; persiste o `metricId` no recall.

- [ ] **Step 1: Write the failing test** (adicionar mocks + casos ao `fill-block-fn.test.ts`)

Adicione aos mocks do topo:
```ts
const createMetricMock = vi.fn();
const getDbMock = vi.fn(() => ({}));
vi.mock('@/shared/lib/metrics/create-chat-metric', () => ({
  createChatMetric: (...a: unknown[]) => createMetricMock(...a),
}));
vi.mock('@/shared/lib/firebase/admin', () => ({ getDb: () => getDbMock() }));
```
No `beforeEach`, adicione: `createMetricMock.mockReset().mockResolvedValue({ metricId: 'chat.kpi_1' });`

`ctxWithClient` precisa de `semanticContext` com um contrato (para `routingRef`). Defina um ctx novo:
```ts
const ctxWithContract = {
  ...ctxWithClient,
  semanticContext: {
    clientId: 'client-x',
    metrics: [],
    dataContracts: [{ contractId: 'liquid-play', entities: [{ entityId: 'unidades', attributes: [{ attributeId: 'valor' }] }] }],
  },
} as never;
```

Casos:
```ts
it('vincula metricId ao bloco quando há SQL + contrato', async () => {
  generateTextMock.mockResolvedValueOnce({
    steps: [{
      toolCalls: [{ toolName: 'execute_sql', input: { query: "SELECT 1 WHERE data_base_report = '2026-02-01'" } }],
      toolResults: [{ toolName: 'submit_data', output: { label: 'X', value: '10' } }],
    }],
  });
  const { fillBlock } = await import('./fill-block-fn');
  const r = await fillBlock({ slot: baseSlot, ctx: ctxWithContract });
  expect(r.status).toBe('success');
  if (r.status === 'success') {
    expect((r.block as { metricId?: string }).metricId).toBe('chat.kpi_1');
  }
  // createChatMetric recebe o SQL parametrizado + routingRef do contrato
  const arg = createMetricMock.mock.calls[0]![0];
  expect(arg.routingRef).toBe('liquid-play.unidades.valor');
  expect(arg.sql).toContain('{filter.date_range');
});

it('não cria métrica quando o cliente não tem contrato semântico', async () => {
  generateTextMock.mockResolvedValueOnce({
    steps: [{
      toolCalls: [{ toolName: 'execute_sql', input: { query: 'SELECT 1' } }],
      toolResults: [{ toolName: 'submit_data', output: { label: 'X', value: '10' } }],
    }],
  });
  const { fillBlock } = await import('./fill-block-fn');
  const r = await fillBlock({ slot: baseSlot, ctx: ctxWithClient }); // sem semanticContext
  expect(r.status).toBe('success');
  // routingRef null ⇒ createChatMetric retorna null (mockado) ⇒ sem metricId
  expect(createMetricMock.mock.calls[0]![0].routingRef).toBeNull();
});

it('falha de createChatMetric não quebra o bloco', async () => {
  createMetricMock.mockRejectedValueOnce(new Error('firestore down'));
  generateTextMock.mockResolvedValueOnce({
    steps: [{
      toolCalls: [{ toolName: 'execute_sql', input: { query: 'SELECT 1' } }],
      toolResults: [{ toolName: 'submit_data', output: { label: 'X', value: '10' } }],
    }],
  });
  const { fillBlock } = await import('./fill-block-fn');
  const r = await fillBlock({ slot: baseSlot, ctx: ctxWithContract });
  expect(r.status).toBe('success');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/canvas-orchestrator/lib/fill-block-fn.test.ts`
Expected: FAIL — bloco sem `metricId`; `createChatMetric` não chamado.

- [ ] **Step 3: Write minimal implementation** (em `fill-block-fn.ts`)

(a) Imports (após os imports existentes):
```ts
import { getDb } from '@/shared/lib/firebase/admin';
import { parameterizeFilters } from '@/shared/lib/metrics/parameterize-sql';
import { createChatMetric } from '@/shared/lib/metrics/create-chat-metric';
```

(b) Guarde o match do recall para dedup. Onde hoje há `if (matches.length > 0) { ... }` (injeção do draft hint), capture o topo num escopo acessível depois:
substitua `const matches = await queryBlockEmbeddings({...})` mantendo, e logo após o bloco de hint, declare:
```ts
      // Dedup G4: match de alta similaridade com metricId ⇒ reusa a métrica.
      recallMetricId = matches[0]?.score && matches[0].score >= 0.95 ? (matches[0].metricId ?? null) : null;
```
Declare `let recallMetricId: string | null = null;` antes do `if (ctx.clientId && RECALLABLE_TYPES.has(targetType))`.

(c) No ramo de sucesso (após `const block = convertToBlock(targetType, slotId, spec);` e antes do `persistBlockSpec`), adicione a materialização:
```ts
      // G4 — materializa a métrica do cliente e vincula metricId (best-effort).
      if (ctx.clientId && RECALLABLE_TYPES.has(targetType)) {
        try {
          const sqlRaw = extractLastSql(result.steps);
          const dc = ctx.semanticContext?.dataContracts?.[0];
          const ent = dc?.entities?.[0];
          const attr = ent?.attributes?.[0];
          const routingRef = dc && ent && attr ? `${dc.contractId}.${ent.entityId}.${attr.attributeId}` : null;
          if (sqlRaw && routingRef) {
            const created = await createChatMetric({
              db: getDb(),
              clientId: ctx.clientId,
              intent,
              targetType: targetType as 'kpi' | 'chart' | 'table',
              sql: parameterizeFilters(sqlRaw, ctx.filters),
              routingRef,
              reuseMetricId: recallMetricId,
            });
            if (created) {
              (block as { metricId?: string }).metricId = created.metricId;
              metricIdForRecall = created.metricId;
            }
          } else if (!routingRef) {
            console.warn(`[fillBlock] ${slotId}: cliente sem contrato semântico — métrica não materializada.`);
          }
        } catch (err) {
          console.warn(`[fillBlock] ${slotId}: falha ao materializar métrica:`, err instanceof Error ? err.message : err);
        }
      }
```
Declare `let metricIdForRecall: string | null = null;` antes desse bloco.

(d) No `persistBlockSpec` existente, passe o `metricId`:
```ts
        void persistBlockSpec({
          clientId: ctx.clientId,
          blockType: targetType as 'kpi' | 'chart' | 'table',
          spec,
          description: intent.slice(0, 200),
          metricId: metricIdForRecall,
        }).catch(() => {});
```

(e) Adicione o helper de extração ao final do arquivo:
```ts
/** Extrai o SQL do último execute_sql dos steps (campo input.query). null se ausente. */
function extractLastSql(steps: unknown[]): string | null {
  for (let i = steps.length - 1; i >= 0; i--) {
    const calls = (steps[i] as { toolCalls?: Array<{ toolName?: string; input?: { query?: unknown } }> }).toolCalls ?? [];
    for (let j = calls.length - 1; j >= 0; j--) {
      if (calls[j]?.toolName === 'execute_sql' && typeof calls[j].input?.query === 'string') {
        return calls[j].input!.query as string;
      }
    }
  }
  return null;
}
```

> Nota: `ctx.semanticContext` já existe em `AgentDynamicContext` (passado pelo orchestrator). Se o tipo não expuser `dataContracts`, faça o acesso via narrowing como acima (optional chaining) — não altere o tipo.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/canvas-orchestrator/lib/fill-block-fn.test.ts`
Expected: PASS (todos, incluindo os existentes — `persistBlockSpec` agora recebe `metricId: null` nos casos antigos; ajuste a asserção `toHaveBeenCalledWith` do teste "persists block on success" para incluir `metricId: null`).

> **Ajuste necessário no teste existente** "persists block on success when ctx.clientId is set": o objeto esperado passa a incluir `metricId: null` (esses casos não têm `semanticContext` ⇒ não materializam). Atualize o `toHaveBeenCalledWith` para `{ clientId: 'client-x', blockType: 'kpi', spec: submitOutput, description: 'inadimplência total', metricId: null }`.

- [ ] **Step 5: Commit**

```bash
git add src/features/canvas-orchestrator/lib/fill-block-fn.ts src/features/canvas-orchestrator/lib/fill-block-fn.test.ts
git commit -m "feat(canvas): fillBlock materializa métrica do cliente + vincula metricId (G4)"
```

---

## Task 5: Pular coverage G8 para recipes `sql`

**Files:**
- Modify: `app/api/metrics/[id]/data/route.ts` (bloco do G8, caminho single-contract)
- Test: `app/api/metrics/[id]/data/route.test.ts`

**Interfaces:**
- Consumes: `metric.recipe.kind`.
- Produces: a pré-checagem `collectBindingGaps` só roda para recipes que usam `requires` no resolveColumn (não-`sql`).

- [ ] **Step 1: Write the failing test** (novo caso; reusa mocks do arquivo)

```ts
it('não aplica coverage 422 a métrica com recipe sql (requires é só roteamento)', async () => {
  const SQL_METRIC = {
    exists: true, id: 'chat.kpi_1',
    data: () => ({
      label: 'X', requires: ['canonical.carteira.saldo'],
      recipe: { kind: 'sql', template: 'SELECT 1' },
      type: 'kpi', version: '1.0.0', status: 'active', ownerClientId: null, createdAt: null, updatedAt: null,
    }),
  };
  // Cliente migrado SEM cobertura de carteira.saldo — coverage dispararia 422 p/ aggregation.
  const CLIENT_MIGRATED = {
    exists: true,
    data: () => ({ productBindings: [{ productId: 'play', datasets: [{
      id: 'ds', dataSourceId: 'bq-main', datasetId: 'om_dataset', contractRef: 'canonical',
      schemaBindings: { 'carteira.outra': 'x' }, schema: {}, isPrimary: true,
    }] }] }),
  };
  metricDocGetMock.mockResolvedValue(SQL_METRIC);
  clientDocGetMock.mockResolvedValue(CLIENT_MIGRATED);
  const { POST } = await import('./route');
  const res = await POST(
    makeReq({ clientId: 'client-om' }) as Parameters<typeof POST>[0],
    { params: Promise.resolve({ id: 'chat.kpi_1' }) },
  );
  expect(res.status).toBe(200);
  expect(bqQueryMock).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run "app/api/metrics/[id]/data/route.test.ts"`
Expected: FAIL — coverage retorna 422 (carteira.saldo sem mapping no cliente migrado).

- [ ] **Step 3: Write minimal implementation** — no bloco do G8, troque a guarda `if (metricContractId)` para também exigir recipe não-`sql`:

```ts
    // G8 — só faz sentido p/ recipes que resolvem requires via resolveColumn.
    // Recipes `sql` usam template literal (requires é só roteamento) — pular.
    if (metricContractId && metric.recipe.kind !== 'sql') {
      const gaps = collectBindingGaps(metric.requires, resolvedDataset, metricContractId);
      if (gaps.length > 0) {
        return NextResponse.json(
          {
            error: `Cliente não cobre todos os atributos exigidos pela métrica no contrato "${metricContractId}"`,
            missing: gaps,
          },
          { status: 422 },
        );
      }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run "app/api/metrics/[id]/data/route.test.ts"`
Expected: PASS (todos, incluindo o caso G8 de aggregation que ainda deve 422).

- [ ] **Step 5: Commit**

```bash
git add "app/api/metrics/[id]/data/route.ts" "app/api/metrics/[id]/data/route.test.ts"
git commit -m "feat(api): coverage G8 pula recipes sql (requires é só roteamento)"
```

---

## Verificação final (após Task 5)

- [ ] Suíte do escopo: `pnpm exec vitest run src/shared/lib/metrics/parameterize-sql.test.ts src/shared/lib/metrics/create-chat-metric.test.ts src/shared/lib/memory/recall-store.test.ts src/shared/lib/memory/persist-block.test.ts src/features/canvas-orchestrator/lib/fill-block-fn.test.ts "app/api/metrics/[id]/data/route.test.ts"` → tudo verde.
- [ ] `npx eslint <arquivos>` → 0 erros.
- [ ] `pnpm exec tsc --noEmit` → 0 erros.
- [ ] Suíte completa `pnpm exec vitest run` → sem regressão.
- [ ] Finalizar com `superpowers:finishing-a-development-branch`.

## Fora deste plano (G5 / depois)
- Recipes semânticos portáveis (entity.attr; templatizar tabela/colunas).
- Materializar métrica para clientes legados (sem semanticContext).
- Admin UI de promoção/edição/listagem por dono.
