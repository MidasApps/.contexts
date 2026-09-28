# Métricas cross-contract (R2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir métricas que cruzam atributos de ≥1 Data Contracts (ex.: preço/m²) resolvendo a um único SQL no BigQuery, de forma estruturada (sem SQL cru).

**Architecture:** Relações de JOIN viram cidadãs top-level (`relations/{id}`). Um novo `MetricRecipe.kind: 'derived'` referencia atributos 3-part (`contractId.entity.attr`), declara joins por `relationId` e combina termos agregados via uma `expression` aritmética validada. O resolver carrega o `ClientDatasetBinding` de cada contrato e monta FROM/JOINs com tabelas totalmente qualificadas (`projeto.dataset.tabela`).

**Tech Stack:** TypeScript, Zod, Firestore (firebase-admin), BigQuery (`@google-cloud/bigquery`), Vitest, Next.js App Router.

## Global Constraints

- TDD obrigatório: teste-primeiro, RED→GREEN→refactor (ADR/skills do projeto).
- Identificadores SQL SEMPRE sanitizados via `quoteIdentifier`/`quoteTableRef`/`safeDatasetRef` (`src/shared/lib/bigquery/identifier.ts`); valores SEMPRE em params nomeados (`@nome`).
- Fail-loud: contrato sem binding, relação ausente/que não conecta, atributo sem mapping, datasets em projetos diferentes → erro explícito (nunca SQL contra coluna/tabela errada).
- `expression` NUNCA aceita coluna/SQL cru — apenas ids de termos, números e `+ - * / ( )`.
- Mudança ADITIVA: recipes `aggregation` e `sql` (single-contract) seguem inalterados.
- Slug/SqlIdentifier: usar os schemas existentes em `src/shared/schemas/identifier.ts`.
- Escopo deste plano: Fases 1–2 (engine). Admin UI e chat = planos separados.

---

## Phase 1 — Relações

### Task 1: Schema `Relation`

**Files:**
- Create: `src/shared/schemas/relation.ts`
- Test: `src/shared/schemas/__tests__/relation.test.ts`
- Modify: `src/shared/schemas/index.ts` (re-export, seguindo o padrão dos outros schemas)

**Interfaces:**
- Produces: `Relation` (Zod) e tipo `Relation`; `RelationDoc` (sem `id`). Campos: `id: Slug`, `label: string`, `leftRef: AttributeRef`, `rightRef: AttributeRef`, `cardinality: 'one-to-one'|'many-to-one'|'one-to-many'|'many-to-many'`, `description?: string|null`, `createdAt/updatedAt: unknown`. `AttributeRef` reusado de `./metric`.

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/schemas/__tests__/relation.test.ts
import { describe, it, expect } from 'vitest';
import { Relation } from '../relation';

const base = {
  id: 'contrato-cliente',
  label: 'Contrato → Cliente',
  leftRef: 'contratos.contratos.cliente_id',
  rightRef: 'clientes.proponentes.id',
  cardinality: 'many-to-one',
  createdAt: 0,
  updatedAt: 0,
};

describe('Relation', () => {
  it('valida uma relação cross-contract bem formada', () => {
    expect(Relation.parse(base)).toMatchObject({ id: 'contrato-cliente', cardinality: 'many-to-one' });
  });
  it('rejeita ref que não é 3-part (contractId.entity.attr)', () => {
    expect(() => Relation.parse({ ...base, leftRef: 'contratos.cliente_id' })).toThrow();
  });
  it('rejeita cardinalidade fora do enum', () => {
    expect(() => Relation.parse({ ...base, cardinality: 'sometimes' })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/shared/schemas/__tests__/relation.test.ts`
Expected: FAIL — `Failed to resolve import "../relation"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/shared/schemas/relation.ts
import { z } from 'zod';
import { Slug } from './identifier';
import { AttributeRef } from './metric';

export const RelationCardinality = z.enum([
  'one-to-one',
  'many-to-one',
  'one-to-many',
  'many-to-many',
]);

export const RelationDoc = z.object({
  label: z.string().min(1).max(120),
  leftRef: AttributeRef,
  rightRef: AttributeRef,
  cardinality: RelationCardinality,
  description: z.string().max(500).optional().nullable(),
  createdAt: z.unknown(),
  updatedAt: z.unknown(),
});

export const Relation = RelationDoc.extend({ id: Slug });

export type RelationCardinality = z.infer<typeof RelationCardinality>;
export type RelationDoc = z.infer<typeof RelationDoc>;
export type Relation = z.infer<typeof Relation>;
```

Then add to `src/shared/schemas/index.ts` (match existing re-export style):
```ts
export * from './relation';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/shared/schemas/__tests__/relation.test.ts`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add src/shared/schemas/relation.ts src/shared/schemas/__tests__/relation.test.ts src/shared/schemas/index.ts
git commit -m "feat(schema): Relation (chaves de JOIN cross-contract) — R2 fase 1"
```

---

### Task 2: API CRUD `/api/relations`

**Files:**
- Create: `app/api/relations/route.ts`
- Test: `app/api/relations/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `Relation`/`RelationDoc` (Task 1); `verifyAuthToken`, `isAdminEmail`, `getDb` (`src/shared/lib/api-auth.ts`, `runtime-config`, `firebase/admin`).
- Produces: `GET /api/relations` → `{ data: Relation[] }`; `POST` (admin) upsert `{ id, ...RelationDoc }` → `{ ok: true }`; `DELETE ?id=` (admin) → `{ ok: true }`. Coleção Firestore `relations`.

> **Padrão a espelhar:** `app/api/data-contracts/route.ts` (mesma estrutura de auth admin, getDb, validação Zod, Timestamp). Copie a forma; troque a coleção para `relations` e o schema para `Relation`/`RelationDoc`.

- [ ] **Step 1: Write the failing test** (mock Firestore no padrão de `app/api/data-contracts/__tests__` — se não existir, espelhe `app/api/products/__tests__/route.test.ts`)

```ts
// app/api/relations/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getMock = vi.fn();
const setMock = vi.fn();
const docMock = vi.fn(() => ({ set: setMock }));
const collectionMock = vi.fn(() => ({ get: getMock, doc: docMock }));
vi.mock('@/shared/lib/firebase/admin', () => ({ getDb: () => ({ collection: collectionMock }) }));
vi.mock('@/shared/lib/api-auth', () => ({ verifyAuthToken: vi.fn(async () => 'admin@askliquid.com') }));
vi.mock('@/shared/lib/runtime-config', () => ({ isAdminEmail: () => true }));

function makeReq(body?: unknown, url = 'http://x/api/relations') {
  return { json: async () => body, url, nextUrl: new URL(url) } as never;
}

beforeEach(() => { getMock.mockReset(); setMock.mockReset(); });

describe('/api/relations', () => {
  it('GET lista as relações', async () => {
    getMock.mockResolvedValue({ docs: [{ id: 'r1', data: () => ({ label: 'L', leftRef: 'a.b.c', rightRef: 'd.e.f', cardinality: 'many-to-one' }) }] });
    const { GET } = await import('../route');
    const res = await GET(makeReq());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data[0].id).toBe('r1');
  });

  it('POST valida e faz upsert', async () => {
    getMock.mockResolvedValue({ exists: false });
    const { POST } = await import('../route');
    const res = await POST(makeReq({
      id: 'contrato-cliente', label: 'C→Cli',
      leftRef: 'contratos.contratos.cliente_id', rightRef: 'clientes.proponentes.id',
      cardinality: 'many-to-one',
    }));
    expect(res.status).toBe(200);
    expect(setMock).toHaveBeenCalled();
  });

  it('POST rejeita payload inválido (ref 2-part)', async () => {
    const { POST } = await import('../route');
    const res = await POST(makeReq({ id: 'x', label: 'X', leftRef: 'a.b', rightRef: 'd.e.f', cardinality: 'many-to-one' }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run app/api/relations/__tests__/route.test.ts`
Expected: FAIL — `Failed to resolve import "../route"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/api/relations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getDb } from '@/shared/lib/firebase/admin';
import { isAdminEmail } from '@/shared/lib/runtime-config';
import { verifyAuthToken } from '@/shared/lib/api-auth';
import { RelationDoc } from '@/shared/schemas/relation';
import { Slug } from '@/shared/schemas/identifier';

export async function GET(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const snap = await getDb().collection('relations').get();
  const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!isAdminEmail(email)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const raw = await req.json();
  const idResult = Slug.safeParse(raw?.id);
  if (!idResult.success) return NextResponse.json({ error: 'id inválido (kebab-case)' }, { status: 400 });
  const parsed = RelationDoc.safeParse({ ...raw, createdAt: raw.createdAt ?? 0, updatedAt: raw.updatedAt ?? 0 });
  if (!parsed.success) return NextResponse.json({ error: 'Payload inválido', issues: parsed.error.issues }, { status: 400 });

  const ref = getDb().collection('relations').doc(idResult.data);
  const now = Timestamp.now();
  const existing = await ref.get();
  await ref.set(
    {
      label: parsed.data.label,
      leftRef: parsed.data.leftRef,
      rightRef: parsed.data.rightRef,
      cardinality: parsed.data.cardinality,
      description: parsed.data.description ?? null,
      updatedAt: now,
      ...(existing.exists ? {} : { createdAt: now }),
    },
    { merge: true },
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!isAdminEmail(email)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });
  await getDb().collection('relations').doc(id).delete();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run app/api/relations/__tests__/route.test.ts`
Expected: PASS (3 passed). If the Firestore mock shape differs from the repo's convention, align it with `app/api/products/__tests__/route.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add app/api/relations/route.ts app/api/relations/__tests__/route.test.ts
git commit -m "feat(api): CRUD /api/relations — R2 fase 1"
```

---

## Phase 2 — Recipe `derived` + resolver + rota

### Task 3: Parser/validador da `expression`

**Files:**
- Create: `src/shared/lib/metrics/expression.ts`
- Test: `src/shared/lib/metrics/expression.test.ts`

**Interfaces:**
- Produces:
  - `tokenizeExpression(expr: string): string[]` — tokens; lança em char inválido.
  - `validateExpression(expr: string, allowedIds: string[]): void` — lança se id desconhecido / parênteses desbalanceados / token inválido.
  - `renderExpression(expr: string, sqlById: Record<string, string>): string` — substitui ids por SQL; mantém números/operadores/parênteses.

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/lib/metrics/expression.test.ts
import { describe, it, expect } from 'vitest';
import { tokenizeExpression, validateExpression, renderExpression } from './expression';

describe('expression', () => {
  it('tokeniza ids, números e operadores', () => {
    expect(tokenizeExpression('valor / area')).toEqual(['valor', '/', 'area']);
    expect(tokenizeExpression('(a + b) * 2')).toEqual(['(', 'a', '+', 'b', ')', '*', '2']);
  });
  it('rejeita caractere fora da gramática (anti-injeção: ponto/; bloqueados)', () => {
    expect(() => tokenizeExpression('contratos.valor')).toThrow();
    expect(() => tokenizeExpression('valor; DROP')).toThrow();
  });
  it('valida ids conhecidos e parênteses balanceados', () => {
    expect(() => validateExpression('valor / area', ['valor', 'area'])).not.toThrow();
    expect(() => validateExpression('valor / x', ['valor', 'area'])).toThrow();
    expect(() => validateExpression('(valor / area', ['valor', 'area'])).toThrow();
  });
  it('renderiza substituindo ids por SQL', () => {
    expect(renderExpression('valor / area', { valor: 'SUM(v)', area: 'SUM(a)' }))
      .toBe('SUM(v) / SUM(a)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/shared/lib/metrics/expression.test.ts`
Expected: FAIL — module não existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/shared/lib/metrics/expression.ts
const ID = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NUM = /^\d+(\.\d+)?$/;
const OPS = new Set(['+', '-', '*', '/']);

/** Quebra a expressão em tokens; lança em caractere fora da gramática. */
export function tokenizeExpression(expr: string): string[] {
  const tokens: string[] = [];
  const re = /\s*([A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|[()+\-*/])/y;
  let pos = 0;
  while (pos < expr.length) {
    if (/\s/.test(expr[pos])) { pos++; continue; }
    re.lastIndex = pos;
    const m = re.exec(expr);
    if (!m || m.index !== pos) {
      throw new Error(`Expressão inválida: caractere inesperado em "${expr.slice(pos)}"`);
    }
    tokens.push(m[1]);
    pos = re.lastIndex;
  }
  return tokens;
}

export function validateExpression(expr: string, allowedIds: string[]): void {
  const allowed = new Set(allowedIds);
  const tokens = tokenizeExpression(expr);
  if (tokens.length === 0) throw new Error('Expressão vazia');
  let depth = 0;
  for (const t of tokens) {
    if (t === '(') depth++;
    else if (t === ')') { depth--; if (depth < 0) throw new Error('Parênteses desbalanceados'); }
    else if (OPS.has(t) || NUM.test(t)) { /* ok */ }
    else if (ID.test(t)) { if (!allowed.has(t)) throw new Error(`Termo desconhecido na expressão: "${t}"`); }
    else throw new Error(`Token inválido: "${t}"`);
  }
  if (depth !== 0) throw new Error('Parênteses desbalanceados');
}

export function renderExpression(expr: string, sqlById: Record<string, string>): string {
  const tokens = tokenizeExpression(expr);
  return tokens
    .map((t) => (ID.test(t) && t in sqlById ? sqlById[t] : t))
    .join(' ');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/shared/lib/metrics/expression.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/metrics/expression.ts src/shared/lib/metrics/expression.test.ts
git commit -m "feat(metrics): parser/validador seguro de expression — R2 fase 2"
```

---

### Task 4: Recipe `derived` no schema `Metric`

**Files:**
- Modify: `src/shared/schemas/metric.ts` (adicionar `DerivedRecipe` ao `MetricRecipe` discriminated union; adicionar helpers `ContractEntityRef`)
- Test: `src/shared/schemas/__tests__/metric.test.ts` (adicionar casos; arquivo já existe)

**Interfaces:**
- Consumes: `AttributeRef`, `MetricAggregation`, `TimeGrain`, `MetricFilter` (já em `metric.ts`).
- Produces: `ContractEntityRef` (`"contractId.entityId"`); `DerivedRecipe` membro de `MetricRecipe` com `kind: 'derived'`. Campos: `primaryEntity: ContractEntityRef`, `joins: {relationId: Slug}[]`, `terms: {id, aggregation, valueRef?: AttributeRef}[]`, `expression: string`, `timeRef?: AttributeRef`, `timeGrain?`, `groupByRefs?: AttributeRef[]`, `filters?: DerivedFilter[]`, `orderBy?: {ref: AttributeRef, dir}`, `limit?`. `DerivedFilter` = como `MetricFilter` mas `attribute: AttributeRef` (3-part).

- [ ] **Step 1: Write the failing test** (adicionar ao final de `metric.test.ts`)

```ts
import { Metric } from '../metric'; // já importado no arquivo

describe('DerivedRecipe', () => {
  const baseMetric = {
    id: 'imoveis.preco_m2', label: 'Preço/m²', requires: ['produtos.unidades.valor', 'produtos.unidades.area'],
    createdAt: 0, updatedAt: 0,
  };
  it('aceita recipe derived bem formado', () => {
    const m = Metric.parse({
      ...baseMetric,
      recipe: {
        kind: 'derived',
        primaryEntity: 'produtos.unidades',
        joins: [],
        terms: [
          { id: 'valor', aggregation: 'sum', valueRef: 'produtos.unidades.valor' },
          { id: 'area', aggregation: 'sum', valueRef: 'produtos.unidades.area' },
        ],
        expression: 'valor / area',
      },
    });
    expect(m.recipe?.kind).toBe('derived');
  });
  it('rejeita primaryEntity que não é "contractId.entity"', () => {
    expect(() => Metric.parse({ ...baseMetric, recipe: { kind: 'derived', primaryEntity: 'unidades', joins: [], terms: [{ id: 'n', aggregation: 'count' }], expression: 'n' } })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/shared/schemas/__tests__/metric.test.ts`
Expected: FAIL — `derived` não é membro do union (parse lança / kind não reconhecido).

- [ ] **Step 3: Write minimal implementation** (em `metric.ts`, antes de `MetricRecipe`)

```ts
/** Ref "contractId.entityId" (2-part) — entidade qualificada pelo contrato. */
const ContractEntityRef = z.string().regex(
  /^[a-z][a-z0-9-]*\.[a-z_][a-z0-9_]*$/,
  { message: 'Esperado "contractId.entityId" (ex.: "produtos.unidades")' },
);

const DerivedFilter = z.object({
  attribute: AttributeRef,
  op: FilterOp,
  value: FilterValue.optional(),
});

const DerivedTerm = z.object({
  id: z.string().regex(/^[a-z_][a-z0-9_]*$/, 'id do termo deve ser snake/identifier'),
  aggregation: MetricAggregation,
  valueRef: AttributeRef.optional(),
});

const DerivedRecipe = z.object({
  kind: z.literal('derived'),
  primaryEntity: ContractEntityRef,
  joins: z.array(z.object({ relationId: Slug })).default([]),
  terms: z.array(DerivedTerm).min(1),
  expression: z.string().min(1).max(500),
  timeRef: AttributeRef.optional(),
  timeGrain: TimeGrain.optional(),
  groupByRefs: z.array(AttributeRef).default([]),
  filters: z.array(DerivedFilter).default([]),
  orderBy: z.object({ ref: AttributeRef, dir: z.enum(['asc', 'desc']).default('asc') }).optional(),
  limit: z.number().int().positive().max(10000).optional(),
});
```

Adicionar `Slug` ao import do topo (`import { Slug, ... } from './identifier'` se ainda não estiver) e estender o union:
```ts
export const MetricRecipe = z.discriminatedUnion('kind', [
  AggregationRecipe,
  SqlRecipe,
  DerivedRecipe,
]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/shared/schemas/__tests__/metric.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/schemas/metric.ts src/shared/schemas/__tests__/metric.test.ts
git commit -m "feat(schema): MetricRecipe.derived (cross-contract) — R2 fase 2"
```

---

### Task 5: `resolveDerivedMetric`

**Files:**
- Modify: `src/shared/lib/metrics/resolve-metric.ts` (adicionar `resolveDerivedMetric` + despacho em `resolveMetric` quando `kind === 'derived'`)
- Test: `src/shared/lib/metrics/resolve-derived.test.ts`

**Interfaces:**
- Consumes: `resolveColumn`, `tableRef`, `buildFilterClause`, `nextParam`, `aggExpr`, `TIME_GRAIN_TO_BQ` (já em `resolve-metric.ts` — exportar/local), `Relation` (Task 1), `renderExpression`/`validateExpression` (Task 3).
- Produces:
  ```ts
  resolveDerivedMetric(opts: {
    metric: Metric;
    bindingsByContract: Record<string, ClientDatasetBinding>;
    relations: Relation[];
    projectIdByContract?: Record<string, string>;
    pageFilters?: Record<string, PageFilterValue>;
  }): ResolvedMetric
  ```
  Lança `MetricResolutionError` em: binding de contrato ausente, relação ausente, relação que não conecta entidades já no escopo.

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/lib/metrics/resolve-derived.test.ts
import { describe, it, expect } from 'vitest';
import { resolveDerivedMetric } from './resolve-metric';
import type { Metric } from '@/shared/schemas/metric';
import type { ClientDatasetBinding } from '@/shared/schemas/client-binding';
import type { Relation } from '@/shared/schemas/relation';

function binding(datasetId: string, map: Record<string, string>): ClientDatasetBinding {
  return { id: 'main', dataSourceId: 'ds', datasetId, contractRef: 'x', schemaBindings: map, schema: {}, isPrimary: true } as ClientDatasetBinding;
}

const precoM2: Metric = {
  id: 'imoveis.preco_m2', label: 'Preço/m²',
  requires: ['produtos.unidades.valor', 'produtos.unidades.area'],
  recipe: {
    kind: 'derived', primaryEntity: 'produtos.unidades', joins: [],
    terms: [
      { id: 'valor', aggregation: 'sum', valueRef: 'produtos.unidades.valor' },
      { id: 'area', aggregation: 'sum', valueRef: 'produtos.unidades.area' },
    ],
    expression: 'valor / area',
  },
  version: '1.0.0', status: 'active', type: 'kpi', createdAt: 0, updatedAt: 0,
} as Metric;

describe('resolveDerivedMetric', () => {
  it('cross-entity num contrato: SELECT com a expression sobre aggs', () => {
    const r = resolveDerivedMetric({
      metric: precoM2,
      bindingsByContract: { produtos: binding('proj.prod_ds', { 'unidades.valor': 'vl_total', 'unidades.area': 'area_m2' }) },
      relations: [],
      projectIdByContract: { produtos: 'proj' },
    });
    expect(r.sql).toContain('SUM(`vl_total`) / SUM(`area_m2`) AS value');
    expect(r.sql).toContain('FROM `proj`.`prod_ds`.`unidades`');
  });

  it('cross-contract: JOIN entre datasets via relação', () => {
    const ticket: Metric = {
      ...precoM2, id: 'credito.ticket_segmento',
      requires: ['contratos.contratos.valor', 'clientes.proponentes.segmento'],
      recipe: {
        kind: 'derived', primaryEntity: 'contratos.contratos',
        joins: [{ relationId: 'contrato-cliente' }],
        groupByRefs: ['clientes.proponentes.segmento'],
        terms: [{ id: 'tot', aggregation: 'sum', valueRef: 'contratos.contratos.valor' }, { id: 'n', aggregation: 'count' }],
        expression: 'tot / n',
      },
    } as Metric;
    const rel: Relation = { id: 'contrato-cliente', label: '', leftRef: 'contratos.contratos.cliente_id', rightRef: 'clientes.proponentes.id', cardinality: 'many-to-one', createdAt: 0, updatedAt: 0 };
    const r = resolveDerivedMetric({
      metric: ticket,
      bindingsByContract: {
        contratos: binding('proj.cred_ds', { 'contratos.valor': 'valor', 'contratos.cliente_id': 'cli_id' }),
        clientes: binding('proj.cli_ds', { 'proponentes.id': 'id', 'proponentes.segmento': 'seg' }),
      },
      relations: [rel],
      projectIdByContract: { contratos: 'proj', clientes: 'proj' },
    });
    expect(r.sql).toContain('JOIN `proj`.`cli_ds`.`proponentes`');
    expect(r.sql).toContain('`cli_id` = `id`');
    expect(r.sql).toContain('GROUP BY');
  });

  it('fail-loud: contrato sem binding', () => {
    expect(() => resolveDerivedMetric({ metric: precoM2, bindingsByContract: {}, relations: [] }))
      .toThrow(/contrato "produtos"/i);
  });

  it('fail-loud: relação inexistente', () => {
    const m = { ...precoM2, recipe: { ...precoM2.recipe, joins: [{ relationId: 'nope' }] } } as Metric;
    expect(() => resolveDerivedMetric({ metric: m, bindingsByContract: { produtos: binding('p.d', { 'unidades.valor': 'v', 'unidades.area': 'a' }) }, relations: [] }))
      .toThrow(/relação "nope"/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/shared/lib/metrics/resolve-derived.test.ts`
Expected: FAIL — `resolveDerivedMetric` não exportado.

- [ ] **Step 3: Write minimal implementation** (em `resolve-metric.ts`)

```ts
import type { Relation } from '@/shared/schemas/relation';
import { renderExpression, validateExpression } from './expression';

interface DerivedOpts {
  metric: Metric;
  bindingsByContract: Record<string, ClientDatasetBinding>;
  relations: Relation[];
  projectIdByContract?: Record<string, string>;
  pageFilters?: Record<string, PageFilterValue>;
}

export function resolveDerivedMetric(opts: DerivedOpts): ResolvedMetric {
  const { metric, bindingsByContract, relations, projectIdByContract, pageFilters } = opts;
  const recipe = metric.recipe;
  if (!recipe || recipe.kind !== 'derived') {
    throw new MetricResolutionError('Recipe não é derived.', metric.id);
  }

  const bindingFor = (contractId: string): ClientDatasetBinding => {
    const b = bindingsByContract[contractId];
    if (!b) throw new MetricResolutionError(`Cliente não cobre o contrato "${contractId}" exigido pela métrica.`, metric.id);
    return b;
  };
  // ref 3-part "contractId.entity.attr" → coluna real (via binding do contrato).
  const col = (ref: string): string => {
    const [contractId, entity, attr] = ref.split('.');
    return resolveColumn(bindingFor(contractId), `${entity}.${attr}`, metric.id);
  };
  // "contractId.entity" → tabela qualificada.
  const table = (ceRef: string): string => {
    const [contractId, entity] = ceRef.split('.');
    const b = bindingFor(contractId);
    return tableRef(b, entity, projectIdByContract?.[contractId]);
  };

  // FROM
  const fromCe = recipe.primaryEntity;
  const inScope = new Set<string>([fromCe]); // "contractId.entity"
  const joinClauses: string[] = [];

  for (const j of recipe.joins) {
    const rel = relations.find((r) => r.id === j.relationId);
    if (!rel) throw new MetricResolutionError(`Relação "${j.relationId}" não encontrada.`, metric.id);
    const leftCe = rel.leftRef.split('.').slice(0, 2).join('.');
    const rightCe = rel.rightRef.split('.').slice(0, 2).join('.');
    const leftIn = inScope.has(leftCe);
    const rightIn = inScope.has(rightCe);
    if (leftIn === rightIn) {
      throw new MetricResolutionError(`Relação "${j.relationId}" não conecta as entidades da métrica.`, metric.id);
    }
    const newCe = leftIn ? rightCe : leftCe;
    joinClauses.push(`JOIN ${table(newCe)} ON ${col(rel.leftRef)} = ${col(rel.rightRef)}`);
    inScope.add(newCe);
  }

  // termos → agg(coluna); expression validada e renderizada
  const termSql: Record<string, string> = {};
  for (const t of recipe.terms) {
    const inner = t.valueRef ? col(t.valueRef) : '*';
    termSql[t.id] = aggExpr(t.aggregation, inner);
  }
  validateExpression(recipe.expression, recipe.terms.map((t) => t.id));
  const valueExpr = renderExpression(recipe.expression, termSql);

  const selectParts: string[] = [];
  const groupByExprs: string[] = [];
  const outputColumns: string[] = [];

  if (recipe.timeRef) {
    const grain = TIME_GRAIN_TO_BQ[recipe.timeGrain ?? 'month'];
    const expr = `DATE_TRUNC(${col(recipe.timeRef)}, ${grain})`;
    selectParts.push(`${expr} AS bucket`);
    groupByExprs.push(expr);
    outputColumns.push('bucket');
  }
  for (const ref of recipe.groupByRefs ?? []) {
    const c = col(ref);
    const alias = ref.split('.')[2];
    selectParts.push(`${c} AS ${quoteIdentifier(alias, 'alias')}`);
    groupByExprs.push(c);
    outputColumns.push(alias);
  }
  selectParts.push(`${valueExpr} AS value`);
  outputColumns.push('value');

  const params: Record<string, unknown> = {};
  const whereParts: string[] = [];
  for (const f of recipe.filters ?? []) {
    // buildFilterClause espera attribute resolvível via `col`; usa o mesmo helper
    // passando o binding correto por ref. Adaptação: reidratar um clause manual.
    whereParts.push(buildDerivedFilter(f, col, metric.id, params, pageFilters));
  }

  const orderBy = recipe.orderBy
    ? `ORDER BY ${col(recipe.orderBy.ref)} ${recipe.orderBy.dir === 'desc' ? 'DESC' : 'ASC'}`
    : recipe.timeRef ? 'ORDER BY bucket ASC' : '';
  const limit = recipe.limit ? `LIMIT ${Math.floor(recipe.limit)}` : '';

  const sql = [
    `SELECT ${selectParts.join(', ')}`,
    `FROM ${table(fromCe)}`,
    ...joinClauses,
    whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '',
    groupByExprs.length ? `GROUP BY ${groupByExprs.join(', ')}` : '',
    orderBy, limit,
  ].filter(Boolean).join('\n');

  return { sql, params, outputColumns };
}
```

Adicionar o helper de filtro 3-part (espelha `buildFilterClause`, mas resolve a coluna via `col`):
```ts
function buildDerivedFilter(
  filter: { attribute: string; op: string; value?: unknown },
  col: (ref: string) => string,
  metricId: string,
  params: Record<string, unknown>,
  pageFilters: Record<string, PageFilterValue> | undefined,
): string {
  const c = col(filter.attribute);
  if (filter.op === 'is_null') return `${c} IS NULL`;
  if (filter.op === 'is_not_null') return `${c} IS NOT NULL`;
  if (typeof filter.value === 'string' && filter.value.startsWith('filter.')) {
    const key = filter.value.slice('filter.'.length);
    const pf = pageFilters?.[key];
    if (!pf) return '1=1';
    if (pf.kind === 'date_range') {
      const s = nextParam(params, `${key}_start`); const e = nextParam(params, `${key}_end`);
      params[s] = pf.start; params[e] = pf.end; return `${c} BETWEEN @${s} AND @${e}`;
    }
    if (pf.kind === 'snapshot') { const n = nextParam(params, key); params[n] = pf.value; return `${c} = @${n}`; }
    if (pf.kind === 'in') { if (pf.values.length === 0) return '1=1'; const n = nextParam(params, key); params[n] = pf.values; return `${c} IN UNNEST(@${n})`; }
    return '1=1';
  }
  const n = nextParam(params, filter.attribute.replace(/\./g, '_'));
  params[n] = filter.value;
  return `${c} ${filter.op} @${n}`;
}
```

E no `resolveMetric` (despacho) — esta função fica para a rota chamar `resolveDerivedMetric` diretamente (precisa dos múltiplos bindings), então NÃO despachar `derived` por `resolveMetric` (que só tem 1 binding). Adicionar guard:
```ts
export function resolveMetric(opts: ResolveMetricOptions): ResolvedMetric {
  const { metric } = opts;
  if (metric.recipe?.kind === 'derived') {
    throw new MetricResolutionError('Recipe derived deve ser resolvido via resolveDerivedMetric (multi-binding).', metric.id);
  }
  // ... resto inalterado
}
```

> Garanta que `quoteIdentifier`, `tableRef`, `resolveColumn`, `nextParam`, `aggExpr`, `TIME_GRAIN_TO_BQ`, `MetricResolutionError`, `PageFilterValue`, `ResolvedMetric` estejam acessíveis no módulo (já existem; nenhum precisa de novo import além de `Relation`, `renderExpression`, `validateExpression`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/shared/lib/metrics/resolve-derived.test.ts`
Expected: PASS (4 passed). Ajuste o quoting esperado nos `toContain` se os helpers `quote*` usarem aspas/escape diferentes (rode e alinhe à saída real).

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/metrics/resolve-metric.ts src/shared/lib/metrics/resolve-derived.test.ts
git commit -m "feat(metrics): resolveDerivedMetric (JOIN cross-contract) — R2 fase 2"
```

---

### Task 6: Rota `/api/metrics/[id]/data` — multi-binding + despacho derived

**Files:**
- Modify: `app/api/metrics/[id]/data/route.ts`
- Test: `app/api/metrics/[id]/data/route.test.ts` (adicionar casos derived; arquivo já existe)

**Interfaces:**
- Consumes: `resolveDerivedMetric` (Task 5), `Relation` (Task 1).
- Comportamento: se `metric.recipe.kind === 'derived'`: coletar todos os `contractId` (de `primaryEntity`, `joins`→relations refs, `terms.valueRef`, `groupByRefs`, `filters.attribute`); para cada, achar o `ClientDatasetBinding` cujo `contractRef === contractId` (varrendo `parsedBindings`); validar mesmo projeto BigQuery; carregar `relations` (coleção); chamar `resolveDerivedMetric`. Recipes não-derived seguem o caminho atual.

- [ ] **Step 1: Write the failing test** (adicionar ao describe existente; reuse os mocks do arquivo)

```ts
it('derived: resolve com múltiplos bindings e executa o JOIN', async () => {
  // CLIENT_DOC com dois bindings cobrindo 'contratos' e 'clientes' (mesmo projeto),
  // métrica derived com 1 join. Espera 200 e bqQueryMock chamado com SQL contendo JOIN.
  // (montar fixtures no padrão do arquivo; ver casos existentes de contractRef.)
  clientDocGetMock.mockResolvedValue(CLIENT_DOC_TWO_CONTRACTS);
  metricSnapGetMock.mockResolvedValue(DERIVED_METRIC_SNAP);
  relationsGetMock.mockResolvedValue({ docs: [{ id: 'contrato-cliente', data: () => REL_DATA }] });
  const { POST } = await import('./route');
  const res = await POST(makeReq(BASE_BODY) as never, { params: Promise.resolve({ id: 'credito.ticket_segmento' }) });
  expect(res.status).toBe(200);
  expect(bqQueryMock).toHaveBeenCalled();
  expect(bqQueryMock.mock.calls[0][0].query).toContain('JOIN');
});

it('derived: 422 quando falta binding de um contrato', async () => {
  clientDocGetMock.mockResolvedValue(CLIENT_DOC); // só cobre 'contratos'
  metricSnapGetMock.mockResolvedValue(DERIVED_METRIC_SNAP); // exige 'clientes' também
  const { POST } = await import('./route');
  const res = await POST(makeReq(BASE_BODY) as never, { params: Promise.resolve({ id: 'credito.ticket_segmento' }) });
  expect(res.status).toBe(422);
});
```

> Reaproveite os mocks/fixtures já presentes em `route.test.ts` (clientDoc, metricSnap, bqQuery). Adicione `CLIENT_DOC_TWO_CONTRACTS`, `DERIVED_METRIC_SNAP`, `REL_DATA`, e um mock para a coleção `relations`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run "app/api/metrics/[id]/data/route.test.ts"`
Expected: FAIL — caminho derived ainda não implementado (cai no fluxo single-contract → erro/contrato).

- [ ] **Step 3: Write minimal implementation** (no POST, após `const metric = Metric.parse(...)` e o carregamento de `parsedBindings`)

```ts
import { resolveDerivedMetric } from '@/shared/lib/metrics/resolve-metric';
import type { Relation } from '@/shared/schemas/relation';

// ... dentro do POST, logo após obter `parsedBindings` e antes da seleção single-contract:
if (metric.recipe?.kind === 'derived') {
  const recipe = metric.recipe;
  // 1) coletar contractIds
  const contractIds = new Set<string>();
  const addCe = (ce: string) => contractIds.add(ce.split('.')[0]);
  addCe(recipe.primaryEntity);
  recipe.terms.forEach((t) => t.valueRef && contractIds.add(t.valueRef.split('.')[0]));
  (recipe.groupByRefs ?? []).forEach((r) => contractIds.add(r.split('.')[0]));
  (recipe.filters ?? []).forEach((f) => contractIds.add(f.attribute.split('.')[0]));
  if (recipe.timeRef) contractIds.add(recipe.timeRef.split('.')[0]);

  // relations (precisamos para os joins, e elas adicionam contratos)
  const relSnap = await firestore().collection('relations').get();
  const relations = relSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Relation[];
  for (const j of recipe.joins) {
    const rel = relations.find((r) => r.id === j.relationId);
    if (!rel) return NextResponse.json({ error: `Relação "${j.relationId}" não encontrada` }, { status: 422 });
    contractIds.add(rel.leftRef.split('.')[0]);
    contractIds.add(rel.rightRef.split('.')[0]);
  }

  // 2) binding por contrato + projeto
  const bindingsByContract: Record<string, typeof parsedBindings[number]['datasets'][number]> = {};
  const projectIdByContract: Record<string, string> = {};
  for (const contractId of contractIds) {
    let found: (typeof parsedBindings)[number]['datasets'][number] | undefined;
    for (const b of parsedBindings) {
      const d = b.datasets.find((ds) => ds.contractRef === contractId);
      if (d) { found = d; break; }
    }
    if (!found) {
      return NextResponse.json({ error: `Cliente não cobre o contrato "${contractId}" exigido pela métrica` }, { status: 422 });
    }
    bindingsByContract[contractId] = found;
    const proj = safeDatasetRef(found.datasetId).projectId ?? bqProjectId; // bqProjectId = projeto default do client/datasource
    projectIdByContract[contractId] = proj;
  }

  // 3) validar mesmo projeto
  const projects = new Set(Object.values(projectIdByContract));
  if (projects.size > 1) {
    return NextResponse.json({ error: 'Métrica cross-contract exige datasets no mesmo projeto BigQuery' }, { status: 422 });
  }

  // 4) resolver + executar (mesma execução BQ usada pelos outros recipes)
  const resolved = resolveDerivedMetric({ metric, bindingsByContract, relations, projectIdByContract, pageFilters });
  const [rows] = await bq.query({ query: resolved.sql, params: resolved.params });
  return NextResponse.json({ data: rows });
}
```

> Ajuste nomes (`firestore()`, `safeDatasetRef`, `bq`, `bqProjectId`, `pageFilters`) aos identificadores reais já usados no arquivo — leia o POST atual e reutilize o mesmo cliente BQ e o mesmo cálculo de `pageFilters` que o caminho single-contract usa.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run "app/api/metrics/[id]/data/route.test.ts"`
Expected: PASS (todos, incluindo os 2 novos).

- [ ] **Step 5: Commit**

```bash
git add "app/api/metrics/[id]/data/route.ts" "app/api/metrics/[id]/data/route.test.ts"
git commit -m "feat(api): /api/metrics resolve recipe derived multi-contract — R2 fase 2"
```

---

## Verificação final (após Task 6)

- [ ] Suíte completa do escopo: `pnpm exec vitest run src/shared/schemas/__tests__/relation.test.ts app/api/relations/__tests__/route.test.ts src/shared/lib/metrics/expression.test.ts src/shared/schemas/__tests__/metric.test.ts src/shared/lib/metrics/resolve-derived.test.ts "app/api/metrics/[id]/data/route.test.ts"` → tudo verde.
- [ ] `npx eslint <arquivos criados/modificados>` → exit 0.
- [ ] `pnpm exec tsc --noEmit` filtrado pelos arquivos do plano → sem erros novos.

## Fora deste plano (planos seguintes)
- **Fase 3 — Admin UI:** editor de Relations (aba Data Contracts) + builder `derived` no `MetricForm` (pickers de atributo 3-part + termos + expression com validação client reusando `validateExpression`).
- **Fase 4 — Chat semântico (G4/G5):** tool de IA que materializa métricas `derived`; reconciliar o caminho do chat com a camada semântica.
