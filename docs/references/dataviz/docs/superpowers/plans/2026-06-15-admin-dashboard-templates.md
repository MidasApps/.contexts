# Admin — Gerenciamento de Dashboard Templates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar os Dashboard Templates (hoje hardcoded em `src/shared/config/dashboard-templates.ts`) gerenciáveis pelo Admin Panel com CRUD completo + editor visual sem IA, persistidos no Firestore, e renomear a aba `Data Metrics` → `Metrics Contracts`.

**Architecture:** Coleção global `dashboardTemplates/{id}` no Firestore (espelha o padrão de `metrics/`), com API `/api/dashboard-templates`, hooks (`useAdminTemplates`, `useTemplates`), uma aba admin com tabela + form de metadados, e uma rota de editor `/admin/templates/[id]` que reusa o `canvas-store`/`CanvasPanel` num **modo autoria** (prop `authoring`) com paleta de blocos + inspector de conteúdo. A `TemplateGallery` passa a ler do Firestore. O array de código vira fonte de tipos + seed.

**Tech Stack:** Next.js 16 (App Router), Firestore (firebase-admin), Zod v4, Zustand (`canvas-store`), React 19, Tailwind v4, Vitest + Testing Library (happy-dom).

**Spec:** `docs/superpowers/specs/2026-06-15-admin-dashboard-templates-design.md`

**Convenções do repo (ler antes de começar):**
- API routes: auth via `verifyAuthToken(req)` de `@/shared/lib/api-auth` (retorna email ou `null`; tem dev-bypass). DB via `getDb()` de `@/shared/lib/firebase/admin`, `FieldValue` de `firebase-admin/firestore`. Ver `app/api/reports/route.ts` e `app/api/metrics/route.ts`.
- Testes de API: `/* @vitest-environment node */` + `vi.mock` no topo (ver `app/api/admin/sql-catalog/__tests__/collection.test.ts`).
- Testes de componente: happy-dom (default), `render`/`screen` de `@testing-library/react`; componentes apresentacionais recebem props/callbacks (ver `src/pages/admin-sql-catalog/__tests__/CatalogTable.test.tsx`).
- Comandos: `pnpm test <path>` (vitest run), `pnpm lint`, `pnpm build`. Package manager: **pnpm**.
- Commits frequentes, mensagens em PT-BR no estilo do repo (`feat(...)`, `test(...)`, `refactor(...)`).

---

## Phase 1 — Camada de dados (schema, API, acesso, seed)

### Task 1: Schema Zod do Dashboard Template

**Files:**
- Create: `src/shared/schemas/dashboard-template.ts`
- Modify: `src/shared/schemas/index.ts`
- Test: `src/shared/schemas/__tests__/dashboard-template.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// src/shared/schemas/__tests__/dashboard-template.test.ts
import { describe, it, expect } from 'vitest';
import {
  DashboardTemplateDoc,
  DashboardTemplate,
  TemplateId,
} from '../dashboard-template';

const baseDoc = {
  name: 'Visão Geral',
  description: 'KPIs principais',
  category: 'Carteira' as const,
  product: 'play' as const,
  blockMap: {},
  layout: [],
  metricRefs: ['dashboard.total_contratos'],
  status: 'active' as const,
  createdAt: new Date('2026-06-15T00:00:00Z'),
  updatedAt: new Date('2026-06-15T00:00:00Z'),
};

describe('TemplateId', () => {
  it('aceita kebab-case', () => {
    expect(() => TemplateId.parse('visao-geral')).not.toThrow();
    expect(() => TemplateId.parse('pdd')).not.toThrow();
  });
  it('rejeita maiúsculas e espaços', () => {
    expect(() => TemplateId.parse('Visao Geral')).toThrow();
    expect(() => TemplateId.parse('VisaoGeral')).toThrow();
  });
});

describe('DashboardTemplateDoc', () => {
  it('valida um doc mínimo e aplica defaults', () => {
    const parsed = DashboardTemplateDoc.parse({
      name: 'X',
      description: 'desc',
      category: 'Risco',
      product: 'play',
      createdAt: 0,
      updatedAt: 0,
    });
    expect(parsed.blockMap).toEqual({});
    expect(parsed.layout).toEqual([]);
    expect(parsed.metricRefs).toEqual([]);
    expect(parsed.status).toBe('active');
  });

  it('rejeita category inválida', () => {
    expect(() => DashboardTemplateDoc.parse({ ...baseDoc, category: 'Foo' })).toThrow();
  });

  it('aceita segment opcional', () => {
    const parsed = DashboardTemplateDoc.parse({ ...baseDoc, segment: 'sbpe' });
    expect(parsed.segment).toBe('sbpe');
  });
});

describe('DashboardTemplate', () => {
  it('exige id válido', () => {
    expect(() => DashboardTemplate.parse({ ...baseDoc, id: 'visao-geral' })).not.toThrow();
    expect(() => DashboardTemplate.parse({ ...baseDoc, id: 'Bad Id' })).toThrow();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm test src/shared/schemas/__tests__/dashboard-template.test.ts`
Expected: FAIL — "Cannot find module '../dashboard-template'".

- [ ] **Step 3: Implementar o schema**

```typescript
// src/shared/schemas/dashboard-template.ts
import { z } from 'zod';

/**
 * Dashboard Template — molde de página pronto (blocos + layout + metadados).
 * Migrado de `src/shared/config/dashboard-templates.ts` (código) para Firestore
 * `dashboardTemplates/{id}` para gestão em runtime via Admin Panel.
 *
 * `blockMap`/`layout` são persistidos como JSON livre — a validação estrutural
 * vive nos tipos do canvas (`@/shared/config/agents/types`).
 */

export const TemplateId = z.string().regex(/^[a-z][a-z0-9-]*$/, {
  message: 'TemplateId deve ser kebab-case (ex: "visao-geral")',
});

export const TemplateProduct = z.enum(['play', 'play-plus']);
export const TemplateSegment = z.enum(['sbpe', 'mcmv', 'both']);
export const TemplateCategory = z.enum(['Carteira', 'Risco', 'Operacional', 'Covenants']);
export const TemplateStatus = z.enum(['active', 'draft', 'archived']);

export const DashboardTemplateDoc = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500),
  category: TemplateCategory,
  product: TemplateProduct,
  segment: TemplateSegment.optional(),
  blockMap: z.record(z.string(), z.unknown()).default({}),
  layout: z.array(z.unknown()).default([]),
  filters: z.record(z.string(), z.unknown()).optional(),
  queries: z.array(z.unknown()).optional(),
  metricRefs: z.array(z.string()).default([]),
  status: TemplateStatus.default('active'),
  createdAt: z.unknown(),
  updatedAt: z.unknown(),
});

export const DashboardTemplate = DashboardTemplateDoc.extend({ id: TemplateId });

export type TemplateProduct = z.infer<typeof TemplateProduct>;
export type TemplateSegment = z.infer<typeof TemplateSegment>;
export type TemplateCategory = z.infer<typeof TemplateCategory>;
export type TemplateStatus = z.infer<typeof TemplateStatus>;
export type DashboardTemplateDoc = z.infer<typeof DashboardTemplateDoc>;
export type DashboardTemplate = z.infer<typeof DashboardTemplate>;
```

> **Nota:** este `DashboardTemplate` (schema) coexiste com o tipo rico de mesmo nome em `src/shared/config/dashboard-templates.ts`. Eles vivem em módulos diferentes; importar pelo caminho certo conforme o uso (schema na borda da API; tipo rico na UI do canvas). NÃO reexportar os tipos `TemplateProduct`/`TemplateSegment` do config no barrel para evitar colisão — o barrel exporta apenas os do schema.

- [ ] **Step 4: Exportar no barrel**

Modify `src/shared/schemas/index.ts` — adicionar ao final:

```typescript
export * from './dashboard-template';
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `pnpm test src/shared/schemas/__tests__/dashboard-template.test.ts`
Expected: PASS (todos os casos).

- [ ] **Step 6: Commit**

```bash
git add src/shared/schemas/dashboard-template.ts src/shared/schemas/index.ts src/shared/schemas/__tests__/dashboard-template.test.ts
git commit -m "feat(schema): Zod schema para Dashboard Template (Firestore)"
```

---

### Task 2: API route `/api/dashboard-templates`

**Files:**
- Create: `app/api/dashboard-templates/route.ts`
- Test: `app/api/dashboard-templates/__tests__/route.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// app/api/dashboard-templates/__tests__/route.test.ts
/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { verifyAuthTokenMock, dbState } = vi.hoisted(() => {
  const docData: Record<string, unknown> = {
    name: 'Visão Geral', description: 'x', category: 'Carteira', product: 'play',
    blockMap: {}, layout: [], metricRefs: [], status: 'active',
  };
  const docRef = {
    get: vi.fn(async () => ({ exists: true, id: 'visao-geral', data: () => docData })),
    set: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  };
  const colRef = {
    doc: vi.fn(() => docRef),
    get: vi.fn(async () => ({ docs: [{ id: 'visao-geral', data: () => docData }] })),
  };
  return {
    verifyAuthTokenMock: vi.fn(async () => 'admin@askliquid.com'),
    dbState: { collection: vi.fn(() => colRef), colRef, docRef },
  };
});

vi.mock('@/shared/lib/api-auth', () => ({ verifyAuthToken: verifyAuthTokenMock }));
vi.mock('@/shared/lib/firebase/admin', () => ({ getDb: () => dbState }));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__ts__', delete: () => '__del__' },
}));

import { GET, POST, PATCH, DELETE } from '../route';

function req(url: string, method = 'GET', body?: unknown) {
  return new Request(url, {
    method,
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('/api/dashboard-templates', () => {
  beforeEach(() => {
    verifyAuthTokenMock.mockResolvedValue('admin@askliquid.com');
    dbState.collection.mockClear();
    dbState.docRef.set.mockClear();
    dbState.docRef.update.mockClear();
    dbState.docRef.delete.mockClear();
  });

  it('GET 401 sem auth', async () => {
    verifyAuthTokenMock.mockResolvedValueOnce(null);
    const res = await GET(req('http://x/api/dashboard-templates'));
    expect(res.status).toBe(401);
  });

  it('GET lista todos', async () => {
    const res = await GET(req('http://x/api/dashboard-templates'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('visao-geral');
  });

  it('GET single por id', async () => {
    const res = await GET(req('http://x/api/dashboard-templates?id=visao-geral'));
    const body = await res.json();
    expect(body.data.id).toBe('visao-geral');
  });

  it('POST cria/upsert via set', async () => {
    const res = await POST(req('http://x/api/dashboard-templates', 'POST', {
      id: 'novo', name: 'Novo', description: 'd', category: 'Risco', product: 'play',
    }));
    expect(res.status).toBe(200);
    expect(dbState.docRef.set).toHaveBeenCalled();
  });

  it('POST 400 com payload inválido', async () => {
    const res = await POST(req('http://x/api/dashboard-templates', 'POST', { id: 'x' }));
    expect(res.status).toBe(400);
  });

  it('PATCH atualiza parcial', async () => {
    const res = await PATCH(req('http://x/api/dashboard-templates', 'PATCH', {
      id: 'visao-geral', layout: [{ id: 'r1', blockIds: [] }],
    }));
    expect(res.status).toBe(200);
    expect(dbState.docRef.update).toHaveBeenCalled();
  });

  it('DELETE remove por id', async () => {
    const res = await DELETE(req('http://x/api/dashboard-templates?id=visao-geral', 'DELETE'));
    expect(res.status).toBe(200);
    expect(dbState.docRef.delete).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm test app/api/dashboard-templates/__tests__/route.test.ts`
Expected: FAIL — "Cannot find module '../route'".

- [ ] **Step 3: Implementar a rota**

```typescript
// app/api/dashboard-templates/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '@/shared/lib/firebase/admin';
import { verifyAuthToken } from '@/shared/lib/api-auth';
import { DashboardTemplateDoc, TemplateId } from '@/shared/schemas/dashboard-template';

const COLLECTION = 'dashboardTemplates';
function col() {
  return getDb().collection(COLLECTION);
}

function serialize(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    name: data.name ?? '',
    description: data.description ?? '',
    category: data.category ?? 'Carteira',
    product: data.product ?? 'play',
    segment: data.segment ?? undefined,
    blockMap: data.blockMap ?? {},
    layout: data.layout ?? [],
    filters: data.filters ?? undefined,
    queries: data.queries ?? undefined,
    metricRefs: data.metricRefs ?? [],
    status: data.status ?? 'active',
  };
}

export async function GET(req: NextRequest) {
  if (!(await verifyAuthToken(req))) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (id) {
      const snap = await col().doc(id).get();
      if (!snap.exists) return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 });
      return NextResponse.json({ data: serialize(snap.id, snap.data()!) });
    }
    const snap = await col().get();
    const data = snap.docs.map((d) => serialize(d.id, d.data()));
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao carregar templates';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await verifyAuthToken(req))) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  try {
    const body = await req.json();

    // --- Duplicate ---
    if (body.action === 'duplicate') {
      const sourceId = body.id as string | undefined;
      if (!sourceId) return NextResponse.json({ error: 'id é obrigatório para duplicar' }, { status: 400 });
      const snap = await col().doc(sourceId).get();
      if (!snap.exists) return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 });
      const src = snap.data()!;
      const newId = `${sourceId}-copia`;
      await col().doc(newId).set({
        ...src,
        name: `${src.name} (cópia)`,
        status: 'draft',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ data: { id: newId } });
    }

    // --- Create / upsert ---
    const idResult = TemplateId.safeParse(body.id);
    if (!idResult.success) {
      return NextResponse.json({ error: 'id inválido (kebab-case)' }, { status: 400 });
    }
    const parsed = DashboardTemplateDoc.safeParse({
      ...body,
      createdAt: 0,
      updatedAt: 0,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Payload inválido', issues: parsed.error.issues }, { status: 400 });
    }
    const { createdAt: _c, updatedAt: _u, ...doc } = parsed.data;
    await col().doc(idResult.data).set(
      { ...doc, updatedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return NextResponse.json({ data: { id: idResult.data } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao salvar template';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await verifyAuthToken(req))) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });
    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    for (const key of ['name', 'description', 'category', 'product', 'segment', 'blockMap', 'layout', 'filters', 'queries', 'metricRefs', 'status'] as const) {
      if (body[key] !== undefined) updates[key] = body[key];
    }
    await col().doc(body.id).update(updates);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao atualizar template';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await verifyAuthToken(req))) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });
    await col().doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao excluir template';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

> Nota: o teste mocka `set`/`update`/`delete`/`get`. O `PATCH` retorna `{ ok: true }` com status 200; o teste checa `res.status === 200`.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test app/api/dashboard-templates/__tests__/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/dashboard-templates/route.ts app/api/dashboard-templates/__tests__/route.test.ts
git commit -m "feat(api): rota CRUD /api/dashboard-templates"
```

---

### Task 3: Camada de acesso client-side (firestore lib)

**Files:**
- Create: `src/shared/lib/firestore/dashboard-templates.ts`

> Sem teste unitário dedicado (é wrapper de `fetch`, igual a `src/shared/lib/firestore/reports.ts`, que não tem teste). Validado pelos hooks/UI e smoke.

- [ ] **Step 1: Implementar o wrapper de fetch**

```typescript
// src/shared/lib/firestore/dashboard-templates.ts
import type { CanvasBlock, CanvasRow, CanvasPageFilters } from '@/shared/config/agents/types';
import type { TemplateQueryConfig } from '@/shared/config/dashboard-templates';

export interface TemplateRecord {
  id: string;
  name: string;
  description: string;
  category: 'Carteira' | 'Risco' | 'Operacional' | 'Covenants';
  product: 'play' | 'play-plus';
  segment?: 'sbpe' | 'mcmv' | 'both';
  blockMap: Record<string, CanvasBlock>;
  layout: CanvasRow[];
  filters?: CanvasPageFilters;
  queries?: TemplateQueryConfig[];
  metricRefs: string[];
  status: 'active' | 'draft' | 'archived';
}

async function getToken(): Promise<string | null> {
  const { getExternalToken } = await import('@/shared/lib/external-token');
  const externalToken = getExternalToken();
  if (externalToken) return externalToken;
  const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  return token ?? null;
}

async function headers(): Promise<Record<string, string>> {
  const token = await getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const BASE = '/api/dashboard-templates';

export async function fetchTemplates(): Promise<TemplateRecord[]> {
  const res = await fetch(BASE, { headers: await headers() });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Falha ao listar templates');
  return (await res.json()).data ?? [];
}

export async function getTemplate(id: string): Promise<TemplateRecord | null> {
  const res = await fetch(`${BASE}?id=${encodeURIComponent(id)}`, { headers: await headers() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Falha ao buscar template');
  return (await res.json()).data ?? null;
}

export async function saveTemplate(record: Partial<TemplateRecord> & { id: string }): Promise<string> {
  const res = await fetch(BASE, { method: 'POST', headers: await headers(), body: JSON.stringify(record) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Falha ao salvar template');
  return (await res.json()).data.id;
}

export async function patchTemplate(id: string, updates: Partial<TemplateRecord>): Promise<void> {
  const res = await fetch(BASE, { method: 'PATCH', headers: await headers(), body: JSON.stringify({ id, ...updates }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Falha ao atualizar template');
}

export async function deleteTemplate(id: string): Promise<void> {
  const res = await fetch(`${BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: await headers() });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Falha ao excluir template');
}

export async function duplicateTemplate(id: string): Promise<string> {
  const res = await fetch(BASE, { method: 'POST', headers: await headers(), body: JSON.stringify({ action: 'duplicate', id }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Falha ao duplicar template');
  return (await res.json()).data.id;
}
```

> Verificar que `@/shared/lib/external-token` exporta `getExternalToken` (usado em `reports.ts`). Se o caminho divergir, ajustar o import para o mesmo usado lá.

- [ ] **Step 2: Verificar compilação**

Run: `pnpm lint`
Expected: sem erros novos no arquivo criado.

- [ ] **Step 3: Commit**

```bash
git add src/shared/lib/firestore/dashboard-templates.ts
git commit -m "feat(firestore): client lib para dashboard templates"
```

---

### Task 4: Seed script (código → Firestore)

**Files:**
- Create: `scripts/seed-dashboard-templates.ts`

- [ ] **Step 1: Implementar o seed (mirror de `scripts/seed-galli-templates.ts`)**

```typescript
// scripts/seed-dashboard-templates.ts
import { DASHBOARD_TEMPLATES } from '../src/shared/config/dashboard-templates';

const BASE = process.env.SEED_BASE_URL ?? 'http://localhost:3005';

async function upsert(template: (typeof DASHBOARD_TEMPLATES)[number]): Promise<void> {
  const res = await fetch(`${BASE}/api/dashboard-templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      product: template.product,
      segment: template.segment,
      blockMap: template.blockMap,
      layout: template.layout,
      filters: template.filters,
      queries: template.queries,
      metricRefs: template.metricRefs,
      status: 'active',
    }),
  });
  if (!res.ok) throw new Error(`template "${template.id}": ${res.status} ${await res.text()}`);
}

async function main() {
  console.log(`Seeding ${DASHBOARD_TEMPLATES.length} templates → ${BASE}`);
  for (const t of DASHBOARD_TEMPLATES) {
    await upsert(t);
    console.log(`  ✓ ${t.id}`);
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Adicionar script ao package.json**

Modify `package.json` — adicionar em `scripts` (após `"cron:revalidate-catalog"`):

```json
    "seed:templates": "tsx scripts/seed-dashboard-templates.ts",
```

- [ ] **Step 3: Rodar o seed contra o dev server**

Pré-requisito: dev server rodando (`pnpm dev`) e dev-auth-bypass habilitado (mesma config usada por `seed-galli-templates`).
Run: `pnpm seed:templates`
Expected: imprime `✓ <id>` para cada template e `Done.`

- [ ] **Step 4: Validar no Firestore (manual)**

Verificar no console do Firestore que a coleção `dashboardTemplates` tem 1 doc por template (ids como `visao-geral`, `pdd`, etc.).

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-dashboard-templates.ts package.json
git commit -m "feat(seed): popula dashboardTemplates a partir do código"
```

---

## Phase 2 — Hooks

### Task 5: `useAdminTemplates` (CRUD admin)

**Files:**
- Create: `src/features/admin/model/useAdminTemplates.ts`

> Mirror de `useAdminMetrics` (sem teste unitário dedicado, igual aos outros hooks `useAdmin*`).

- [ ] **Step 1: Implementar o hook**

```typescript
// src/features/admin/model/useAdminTemplates.ts
'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  fetchTemplates, saveTemplate, patchTemplate, deleteTemplate, duplicateTemplate,
  type TemplateRecord,
} from '@/shared/lib/firestore/dashboard-templates';

export function useAdminTemplates() {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTemplates(await fetchTemplates());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback(async (record: Partial<TemplateRecord> & { id: string }) => {
    await saveTemplate(record);
    await refetch();
  }, [refetch]);

  const patch = useCallback(async (id: string, updates: Partial<TemplateRecord>) => {
    await patchTemplate(id, updates);
    await refetch();
  }, [refetch]);

  const remove = useCallback(async (id: string) => {
    await deleteTemplate(id);
    await refetch();
  }, [refetch]);

  const duplicate = useCallback(async (id: string) => {
    const newId = await duplicateTemplate(id);
    await refetch();
    return newId;
  }, [refetch]);

  useEffect(() => { refetch(); }, [refetch]);

  return { templates, loading, error, save, patch, remove, duplicate, refetch };
}
```

- [ ] **Step 2: Verificar compilação**

Run: `pnpm lint`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/features/admin/model/useAdminTemplates.ts
git commit -m "feat(admin): hook useAdminTemplates"
```

---

### Task 6: `useTemplates` (read-only para a galeria)

**Files:**
- Create: `src/shared/hooks/useTemplates.ts`

- [ ] **Step 1: Implementar o hook**

```typescript
// src/shared/hooks/useTemplates.ts
'use client';
import { useCallback, useEffect, useState } from 'react';
import { fetchTemplates, type TemplateRecord } from '@/shared/lib/firestore/dashboard-templates';

export function useTemplates() {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      setTemplates((await fetchTemplates()).filter((t) => t.status !== 'archived'));
    } catch (error) {
      console.error('[useTemplates] Error:', error);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { templates, loading, refetch };
}
```

- [ ] **Step 2: Verificar compilação**

Run: `pnpm lint`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/shared/hooks/useTemplates.ts
git commit -m "feat(hooks): useTemplates read-only para a galeria"
```

---

## Phase 3 — Admin UI (CRUD de metadados)

### Task 7: `TemplateForm` (dialog de metadados)

**Files:**
- Create: `src/features/admin/ui/TemplateForm.tsx`
- Test: `src/features/admin/ui/__tests__/TemplateForm.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// src/features/admin/ui/__tests__/TemplateForm.test.tsx
/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TemplateForm } from '../TemplateForm';

describe('<TemplateForm>', () => {
  it('cria template novo com id derivado do nome', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<TemplateForm open onClose={() => {}} onSave={onSave} existingIds={[]} />);

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Minha Análise' } });
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'desc' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'minha-analise', name: 'Minha Análise', description: 'desc' }),
    );
  });

  it('pré-popula campos ao editar e mantém o id', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <TemplateForm
        open
        onClose={() => {}}
        onSave={onSave}
        existingIds={['pdd']}
        template={{ id: 'pdd', name: 'PDD', description: 'd', category: 'Risco', product: 'play', status: 'active' }}
      />,
    );
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('PDD');
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'pdd' }));
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm test src/features/admin/ui/__tests__/TemplateForm.test.tsx`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar o form**

```tsx
// src/features/admin/ui/TemplateForm.tsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/shared/ui/dialog';

export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  category: 'Carteira' | 'Risco' | 'Operacional' | 'Covenants';
  product: 'play' | 'play-plus';
  segment?: 'sbpe' | 'mcmv' | 'both';
  status: 'active' | 'draft' | 'archived';
}

interface TemplateFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: TemplateMetadata) => Promise<void>;
  existingIds: string[];
  /** Quando presente = modo edição (id imutável). */
  template?: TemplateMetadata;
}

const CATEGORIES = ['Carteira', 'Risco', 'Operacional', 'Covenants'] as const;
const PRODUCTS = ['play', 'play-plus'] as const;
const SEGMENTS = ['', 'sbpe', 'mcmv', 'both'] as const;
const STATUSES = ['active', 'draft', 'archived'] as const;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const selectCls =
  'h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground';

export function TemplateForm({ open, onClose, onSave, existingIds, template }: TemplateFormProps) {
  const editing = !!template;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TemplateMetadata['category']>('Carteira');
  const [product, setProduct] = useState<TemplateMetadata['product']>('play');
  const [segment, setSegment] = useState<string>('');
  const [status, setStatus] = useState<TemplateMetadata['status']>('active');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(template?.name ?? '');
    setDescription(template?.description ?? '');
    setCategory(template?.category ?? 'Carteira');
    setProduct(template?.product ?? 'play');
    setSegment(template?.segment ?? '');
    setStatus(template?.status ?? 'active');
    setError(null);
  }, [open, template]);

  async function handleSave() {
    const id = editing ? template!.id : slugify(name);
    if (!id) { setError('Nome inválido'); return; }
    if (name.trim().length < 2) { setError('Nome muito curto'); return; }
    if (!editing && existingIds.includes(id)) { setError(`Já existe um template "${id}"`); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        id,
        name: name.trim(),
        description: description.trim(),
        category,
        product,
        segment: segment ? (segment as TemplateMetadata['segment']) : undefined,
        status,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-popover border-border text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar template' : 'Novo template'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Nome</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome" />
            {!editing && name && (
              <span className="text-[10px] text-muted-foreground/60 font-mono">id: {slugify(name)}</span>
            )}
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Descrição</span>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Descrição" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Categoria</span>
              <select aria-label="Categoria" className={selectCls} value={category}
                onChange={(e) => setCategory(e.target.value as TemplateMetadata['category'])}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Produto</span>
              <select aria-label="Produto" className={selectCls} value={product}
                onChange={(e) => setProduct(e.target.value as TemplateMetadata['product'])}>
                {PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Segmento</span>
              <select aria-label="Segmento" className={selectCls} value={segment}
                onChange={(e) => setSegment(e.target.value)}>
                {SEGMENTS.map((s) => <option key={s || 'none'} value={s}>{s || '—'}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Status</span>
              <select aria-label="Status" className={selectCls} value={status}
                onChange={(e) => setStatus(e.target.value as TemplateMetadata['status'])}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}
            className="bg-primary text-black hover:bg-primary/90">
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test src/features/admin/ui/__tests__/TemplateForm.test.tsx`
Expected: PASS.

> Se o `Dialog` do Radix não renderizar conteúdo em happy-dom sem portal target, seguir o mesmo workaround usado em `CatalogEditDialog.test.tsx` (já passa no repo). Conferir esse teste antes de implementar.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/ui/TemplateForm.tsx src/features/admin/ui/__tests__/TemplateForm.test.tsx
git commit -m "feat(admin): TemplateForm para metadados de template"
```

---

### Task 8: `TemplatesTab` (lista + ações)

**Files:**
- Create: `src/features/admin/ui/TemplatesTab.tsx`
- Create: `src/features/admin/ui/TemplatesTable.tsx` (apresentacional, testável)
- Test: `src/features/admin/ui/__tests__/TemplatesTable.test.tsx`

> Padrão do repo: componente apresentacional puro (`TemplatesTable`) recebe `rows` + callbacks → testável isolado (como `CatalogTable`). O `TemplatesTab` faz o wiring com `useAdminTemplates` + router.

- [ ] **Step 1: Escrever o teste do componente apresentacional (falha)**

```tsx
// src/features/admin/ui/__tests__/TemplatesTable.test.tsx
/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { TemplateRecord } from '@/shared/lib/firestore/dashboard-templates';
import { TemplatesTable } from '../TemplatesTable';

function rec(o: Partial<TemplateRecord>): TemplateRecord {
  return {
    id: 'visao-geral', name: 'Visão Geral', description: 'd', category: 'Carteira',
    product: 'play', blockMap: { a: {} as never, b: {} as never }, layout: [],
    metricRefs: ['m1'], status: 'active', ...o,
  };
}

describe('<TemplatesTable>', () => {
  const cbs = { onEditMeta: vi.fn(), onOpenEditor: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn() };

  it('renderiza linhas com contagem de blocos', () => {
    render(<TemplatesTable rows={[rec({ id: 'a', name: 'A' }), rec({ id: 'b', name: 'B' })]} {...cbs} />);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('chama onOpenEditor ao clicar em editar', () => {
    const onOpenEditor = vi.fn();
    render(<TemplatesTable rows={[rec({ id: 'x', name: 'X' })]} {...cbs} onOpenEditor={onOpenEditor} />);
    fireEvent.click(screen.getByRole('button', { name: /abrir editor/i }));
    expect(onOpenEditor).toHaveBeenCalledWith('x');
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm test src/features/admin/ui/__tests__/TemplatesTable.test.tsx`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar o componente apresentacional**

```tsx
// src/features/admin/ui/TemplatesTable.tsx
'use client';

import { LayoutTemplate, Pencil, Copy, Trash2, PenSquare } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import type { TemplateRecord } from '@/shared/lib/firestore/dashboard-templates';

const STATUS_COLORS: Record<TemplateRecord['status'], string> = {
  active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  draft: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  archived: 'bg-muted/50 text-muted-foreground/80 border-border',
};

interface TemplatesTableProps {
  rows: TemplateRecord[];
  onEditMeta: (t: TemplateRecord) => void;
  onOpenEditor: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (t: TemplateRecord) => void;
}

export function TemplatesTable({ rows, onEditMeta, onOpenEditor, onDuplicate, onDelete }: TemplatesTableProps) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="grid grid-cols-[40px_1.6fr_.8fr_.5fr_.5fr_.6fr_150px] gap-3 px-4 py-2.5 border-b border-border bg-muted/40">
        <span />
        <Header>Nome / id</Header>
        <Header>Produto</Header>
        <Header>Blocos</Header>
        <Header>Métricas</Header>
        <Header>Status</Header>
        <Header className="text-right">Ações</Header>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground/60">Nenhum template.</div>
      ) : (
        rows.map((t) => (
          <div key={t.id} className="grid grid-cols-[40px_1.6fr_.8fr_.5fr_.5fr_.6fr_150px] gap-3 px-4 py-3 items-center border-b border-border last:border-b-0 hover:bg-muted/40 transition-colors">
            <div className="size-7 rounded-full bg-muted/50 flex items-center justify-center flex-shrink-0">
              <LayoutTemplate className="size-3.5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-foreground truncate">{t.name}</p>
              <p className="text-[11px] text-muted-foreground/60 font-mono truncate">{t.id}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {t.product}{t.segment && t.segment !== 'both' ? ` · ${t.segment}` : ''}
            </p>
            <p className="text-xs text-muted-foreground">{Object.keys(t.blockMap ?? {}).length}</p>
            <p className="text-xs text-muted-foreground">{t.metricRefs?.length ?? 0}</p>
            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border w-fit ${STATUS_COLORS[t.status]}`}>
              {t.status}
            </span>
            <div className="flex items-center justify-end gap-1">
              <Button variant="ghost" size="icon-xs" title="Editar metadados" onClick={() => onEditMeta(t)}
                className="text-muted-foreground/80 hover:text-foreground">
                <Pencil className="size-3" />
              </Button>
              <Button variant="ghost" size="icon-xs" title="Abrir editor" aria-label="Abrir editor" onClick={() => onOpenEditor(t.id)}
                className="text-muted-foreground/80 hover:text-primary">
                <PenSquare className="size-3" />
              </Button>
              <Button variant="ghost" size="icon-xs" title="Duplicar" onClick={() => onDuplicate(t.id)}
                className="text-muted-foreground/80 hover:text-foreground">
                <Copy className="size-3" />
              </Button>
              <Button variant="ghost" size="icon-xs" title="Excluir" onClick={() => onDelete(t)}
                className="text-muted-foreground/80 hover:text-red-400">
                <Trash2 className="size-3" />
              </Button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function Header({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium ${className}`}>{children}</span>;
}
```

> Verificar que `size="icon-xs"` existe no `Button` (usado em `ProductsTab.tsx`). Se não, usar `size="sm"`.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test src/features/admin/ui/__tests__/TemplatesTable.test.tsx`
Expected: PASS.

- [ ] **Step 5: Implementar o container `TemplatesTab`**

```tsx
// src/features/admin/ui/TemplatesTab.tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { useAdminTemplates } from '@/features/admin/model/useAdminTemplates';
import type { TemplateRecord } from '@/shared/lib/firestore/dashboard-templates';
import { TemplatesTable } from './TemplatesTable';
import { TemplateForm, type TemplateMetadata } from './TemplateForm';

export function TemplatesTab() {
  const router = useRouter();
  const { templates, loading, error, save, patch, remove, duplicate } = useAdminTemplates();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateMetadata | undefined>();
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<TemplateRecord | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => t.id.toLowerCase().includes(q) || t.name.toLowerCase().includes(q));
  }, [templates, search]);

  function toMeta(t: TemplateRecord): TemplateMetadata {
    return { id: t.id, name: t.name, description: t.description, category: t.category, product: t.product, segment: t.segment, status: t.status };
  }

  async function handleSave(data: TemplateMetadata) {
    const exists = templates.some((t) => t.id === data.id);
    if (exists) {
      await patch(data.id, data);
    } else {
      // Cria com blocos/layout vazios; admin abre o editor para compor.
      await save({ ...data, blockMap: {}, layout: [], metricRefs: [] });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading ? 'Carregando...' : `${filtered.length} de ${templates.length} template${templates.length !== 1 ? 's' : ''}`}
        </p>
        <Button size="sm" onClick={() => { setEditing(undefined); setFormOpen(true); }}
          className="bg-primary text-black hover:bg-primary/90 text-xs gap-1.5">
          <Plus className="size-3.5" /> Novo template
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300">{error}</div>
      )}

      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por id ou nome..." className="max-w-md" />

      <TemplatesTable
        rows={filtered}
        onEditMeta={(t) => { setEditing(toMeta(t)); setFormOpen(true); }}
        onOpenEditor={(id) => router.push(`/admin/templates/${id}`)}
        onDuplicate={(id) => duplicate(id)}
        onDelete={(t) => setConfirmDelete(t)}
      />

      <TemplateForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
        existingIds={templates.map((t) => t.id)}
        template={editing}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        destructive
        title="Excluir template"
        description={confirmDelete
          ? `Excluir "${confirmDelete.name}"?\n\nA galeria "Importar template" deixará de oferecê-lo. Ação irreversível.`
          : ''}
        confirmLabel="Excluir"
        onConfirm={async () => { if (confirmDelete) await remove(confirmDelete.id); }}
      />
    </div>
  );
}
```

- [ ] **Step 6: Rodar lint + os testes da Phase 3**

Run: `pnpm lint && pnpm test src/features/admin/ui/__tests__/`
Expected: lint OK; testes PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/admin/ui/TemplatesTab.tsx src/features/admin/ui/TemplatesTable.tsx src/features/admin/ui/__tests__/TemplatesTable.test.tsx
git commit -m "feat(admin): TemplatesTab + TemplatesTable (CRUD de metadados)"
```

---

### Task 9: Wire da aba no `AdminPage` + rename `Data Metrics` → `Metrics Contracts`

**Files:**
- Modify: `src/features/admin/ui/AdminPage.tsx`
- Modify: `src/features/admin/ui/index.ts`

- [ ] **Step 1: Exportar `TemplatesTab` no barrel**

Modify `src/features/admin/ui/index.ts` — adicionar a linha de export (seguir o estilo das exports existentes no arquivo; ex.):

```typescript
export { TemplatesTab } from './TemplatesTab';
```

- [ ] **Step 2: Adicionar import, tipo, tab e render no `AdminPage`**

Modify `src/features/admin/ui/AdminPage.tsx`:

(a) após `import { MetricsTab } from './MetricsTab';` adicionar:
```typescript
import { TemplatesTab } from './TemplatesTab';
```

(b) no `type Tab`, adicionar `'templates'`:
```typescript
type Tab =
  | 'data-contracts'
  | 'metrics'
  | 'data-sources'
  | 'ingestion'
  | 'templates'
  | 'products'
  | 'clients'
  | 'groups'
  | 'users';
```

(c) no array `TABS`, renomear o label de metrics e inserir a aba templates antes de products:
```typescript
const TABS: TabDef[] = [
  { id: 'data-contracts', label: 'Data Contracts',   group: 'semantic' },
  { id: 'metrics',        label: 'Metrics Contracts', group: 'semantic' },
  { id: 'data-sources',   label: 'Data Sources',     group: 'semantic' },
  { id: 'ingestion',      label: 'Ingestion',        group: 'infra' },
  { id: 'templates',      label: 'Dashboard Templates', group: 'commercial' },
  { id: 'products',       label: 'Products',         group: 'commercial' },
  { id: 'clients',        label: 'Clients',          group: 'tenants' },
  { id: 'groups',         label: 'Groups',           group: 'tenants' },
  { id: 'users',          label: 'Users',            group: 'tenants' },
];
```

(d) no comentário de ordem das tabs (logo acima de `TABS`), trocar `métricas (Data Metrics)` por `métricas (Metrics Contracts)`.

(e) no bloco de render condicional, adicionar antes de `{activeTab === 'products' && <ProductsTab />}`:
```tsx
          {activeTab === 'templates' && <TemplatesTab />}
```

- [ ] **Step 3: Verificar build + lint**

Run: `pnpm lint`
Expected: sem erros.

- [ ] **Step 4: Smoke manual**

`pnpm dev` → abrir `/admin` → confirmar: aba "Metrics Contracts" (renomeada) e aba "Dashboard Templates" (nova, ao lado de Products) listando os templates seedados.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/ui/AdminPage.tsx src/features/admin/ui/index.ts
git commit -m "feat(admin): aba Dashboard Templates + rename Data Metrics -> Metrics Contracts"
```

---

## Phase 4 — Editor visual (modo autoria)

### Task 10: Util `template-blocks` (`makeEmptyBlock` + `deriveMetricRefs`)

**Files:**
- Create: `src/shared/config/agents/template-blocks.ts`
- Test: `src/shared/config/agents/__tests__/template-blocks.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// src/shared/config/agents/__tests__/template-blocks.test.ts
import { describe, it, expect } from 'vitest';
import { makeEmptyBlock, deriveMetricRefs } from '../template-blocks';
import type { CanvasBlock } from '../types';

describe('makeEmptyBlock', () => {
  it('cria KPI com defaults e id único', () => {
    const b = makeEmptyBlock('kpi');
    expect(b.type).toBe('kpi');
    expect(b.id).toBeTruthy();
    expect(makeEmptyBlock('kpi').id).not.toBe(b.id);
  });
  it('cria chart/table/text', () => {
    expect(makeEmptyBlock('chart').type).toBe('chart');
    expect(makeEmptyBlock('table').type).toBe('table');
    expect(makeEmptyBlock('text').type).toBe('text');
  });
});

describe('deriveMetricRefs', () => {
  it('extrai metricId únicos, ignora blocos sem metricId', () => {
    const blockMap: Record<string, CanvasBlock> = {
      a: { id: 'a', type: 'kpi', label: 'A', value: '—', metricId: 'dashboard.x' },
      b: { id: 'b', type: 'chart', chartType: 'bar', data: [], dataKeys: [], xAxisKey: 'n', metricId: 'dashboard.x' },
      c: { id: 'c', type: 'text', content: 'oi' },
      d: { id: 'd', type: 'table', columns: [], rows: [], metricId: 'pdd.y' },
    };
    expect(deriveMetricRefs(blockMap).sort()).toEqual(['dashboard.x', 'pdd.y']);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm test src/shared/config/agents/__tests__/template-blocks.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar o util**

```typescript
// src/shared/config/agents/template-blocks.ts
import type { CanvasBlock } from './types';

export type PaletteBlockType = 'kpi' | 'chart' | 'table' | 'text';

/** Cria um bloco vazio com defaults sensatos para o autorador de templates. */
export function makeEmptyBlock(type: PaletteBlockType): CanvasBlock {
  const id = crypto.randomUUID();
  switch (type) {
    case 'kpi':
      return { id, type: 'kpi', label: 'Novo KPI', value: '—', colSpan: 2 };
    case 'chart':
      return { id, type: 'chart', chartType: 'bar', title: 'Novo gráfico', data: [], dataKeys: ['value'], xAxisKey: 'name', colSpan: 3 };
    case 'table':
      return { id, type: 'table', title: 'Nova tabela', columns: [{ header: 'Coluna', accessorKey: 'coluna' }], rows: [], colSpan: 6 };
    case 'text':
      return { id, type: 'text', content: '### Título', colSpan: 6 };
  }
}

/** Extrai os metricId únicos presentes nos blocos (single source of truth de metricRefs). */
export function deriveMetricRefs(blockMap: Record<string, CanvasBlock>): string[] {
  const set = new Set<string>();
  for (const block of Object.values(blockMap)) {
    const metricId = (block as { metricId?: string }).metricId;
    if (metricId) set.add(metricId);
  }
  return Array.from(set);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test src/shared/config/agents/__tests__/template-blocks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/config/agents/template-blocks.ts src/shared/config/agents/__tests__/template-blocks.test.ts
git commit -m "feat(canvas): util makeEmptyBlock + deriveMetricRefs"
```

---

### Task 11: `BlockInspector` (editor de conteúdo por tipo)

**Files:**
- Create: `src/pages/explore/ui/BlockInspector.tsx`
- Test: `src/pages/explore/ui/__tests__/BlockInspector.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// src/pages/explore/ui/__tests__/BlockInspector.test.tsx
/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CanvasBlock } from '@/shared/config/agents/types';
import { BlockInspector } from '../BlockInspector';

describe('<BlockInspector>', () => {
  it('edita label de KPI e dispara onChange', () => {
    const onChange = vi.fn();
    const block: CanvasBlock = { id: 'k', type: 'kpi', label: 'Antigo', value: '—', metricId: 'dashboard.x' };
    render(<BlockInspector block={block} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Novo' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ label: 'Novo' }));
  });

  it('edita dataKeys de chart como lista separada por vírgula', () => {
    const onChange = vi.fn();
    const block: CanvasBlock = { id: 'c', type: 'chart', chartType: 'bar', data: [], dataKeys: ['a'], xAxisKey: 'mes' };
    render(<BlockInspector block={block} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Data keys (vírgula)'), { target: { value: 'a, b' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ dataKeys: ['a', 'b'] }));
  });

  it('edita conteúdo de texto', () => {
    const onChange = vi.fn();
    const block: CanvasBlock = { id: 't', type: 'text', content: 'oi' };
    render(<BlockInspector block={block} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Conteúdo (markdown)'), { target: { value: '## h2' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ content: '## h2' }));
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm test src/pages/explore/ui/__tests__/BlockInspector.test.tsx`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar o inspector**

```tsx
// src/pages/explore/ui/BlockInspector.tsx
'use client';

import { Input } from '@/shared/ui/input';
import type { CanvasBlock } from '@/shared/config/agents/types';

interface BlockInspectorProps {
  block: CanvasBlock;
  onChange: (updates: Partial<CanvasBlock>) => void;
}

const selectCls = 'h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground';
const COL_SPANS = [1, 2, 3, 4, 5, 6] as const;
const FORMATS = ['', 'number', 'currency', 'percent'] as const;
const CHART_TYPES = ['bar', 'line', 'area', 'composed', 'stacked-bar'] as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function BlockInspector({ block, onChange }: BlockInspectorProps) {
  return (
    <div className="space-y-3">
      {block.type === 'kpi' && (
        <>
          <Field label="Label">
            <Input aria-label="Label" value={block.label}
              onChange={(e) => onChange({ label: e.target.value })} />
          </Field>
          <Field label="Metric ID">
            <Input aria-label="Metric ID" value={block.metricId ?? ''}
              onChange={(e) => onChange({ metricId: e.target.value || undefined })} />
          </Field>
          <Field label="Formato">
            <select aria-label="Formato" className={selectCls} value={block.format ?? ''}
              onChange={(e) => onChange({ format: (e.target.value || undefined) as never })}>
              {FORMATS.map((f) => <option key={f || 'none'} value={f}>{f || '—'}</option>)}
            </select>
          </Field>
        </>
      )}

      {block.type === 'chart' && (
        <>
          <Field label="Título">
            <Input aria-label="Título" value={block.title ?? ''}
              onChange={(e) => onChange({ title: e.target.value })} />
          </Field>
          <Field label="Tipo de gráfico">
            <select aria-label="Tipo de gráfico" className={selectCls} value={block.chartType}
              onChange={(e) => onChange({ chartType: e.target.value as never })}>
              {CHART_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Eixo X (xAxisKey)">
            <Input aria-label="Eixo X (xAxisKey)" value={block.xAxisKey}
              onChange={(e) => onChange({ xAxisKey: e.target.value })} />
          </Field>
          <Field label="Data keys (vírgula)">
            <Input aria-label="Data keys (vírgula)" value={block.dataKeys.join(', ')}
              onChange={(e) => onChange({ dataKeys: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
          </Field>
          <Field label="Metric ID">
            <Input aria-label="Metric ID" value={block.metricId ?? ''}
              onChange={(e) => onChange({ metricId: e.target.value || undefined })} />
          </Field>
        </>
      )}

      {block.type === 'table' && (
        <>
          <Field label="Título">
            <Input aria-label="Título" value={block.title ?? ''}
              onChange={(e) => onChange({ title: e.target.value })} />
          </Field>
          <Field label="Metric ID">
            <Input aria-label="Metric ID" value={block.metricId ?? ''}
              onChange={(e) => onChange({ metricId: e.target.value || undefined })} />
          </Field>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Colunas</span>
            {block.columns.map((c, i) => (
              <div key={i} className="flex gap-2">
                <Input aria-label={`Coluna ${i} header`} placeholder="Header" value={c.header}
                  onChange={(e) => {
                    const columns = block.columns.map((col, j) => j === i ? { ...col, header: e.target.value } : col);
                    onChange({ columns });
                  }} />
                <Input aria-label={`Coluna ${i} accessorKey`} placeholder="accessorKey" value={c.accessorKey}
                  onChange={(e) => {
                    const columns = block.columns.map((col, j) => j === i ? { ...col, accessorKey: e.target.value } : col);
                    onChange({ columns });
                  }} />
                <button type="button" aria-label={`Remover coluna ${i}`} className="text-muted-foreground/60 hover:text-red-400 px-2"
                  onClick={() => onChange({ columns: block.columns.filter((_, j) => j !== i) })}>×</button>
              </div>
            ))}
            <button type="button" className="text-xs text-primary hover:underline"
              onClick={() => onChange({ columns: [...block.columns, { header: 'Coluna', accessorKey: 'coluna' }] })}>
              + Adicionar coluna
            </button>
          </div>
        </>
      )}

      {block.type === 'text' && (
        <Field label="Conteúdo (markdown)">
          <textarea aria-label="Conteúdo (markdown)" className={`${selectCls} h-28 py-2`} value={block.content}
            onChange={(e) => onChange({ content: e.target.value })} />
        </Field>
      )}

      {/* Comum a todos os tipos editáveis */}
      <Field label="Largura (colSpan)">
        <select aria-label="Largura (colSpan)" className={selectCls} value={block.colSpan ?? 1}
          onChange={(e) => onChange({ colSpan: Number(e.target.value) as never })}>
          {COL_SPANS.map((n) => <option key={n} value={n}>{n}/6</option>)}
        </select>
      </Field>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test src/pages/explore/ui/__tests__/BlockInspector.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/explore/ui/BlockInspector.tsx src/pages/explore/ui/__tests__/BlockInspector.test.tsx
git commit -m "feat(canvas): BlockInspector (editor de conteúdo por tipo)"
```

---

### Task 12: `BlockPalette` (inserir blocos)

**Files:**
- Create: `src/pages/explore/ui/BlockPalette.tsx`
- Test: `src/pages/explore/ui/__tests__/BlockPalette.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// src/pages/explore/ui/__tests__/BlockPalette.test.tsx
/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BlockPalette } from '../BlockPalette';

describe('<BlockPalette>', () => {
  it('dispara onAdd com o tipo clicado', () => {
    const onAdd = vi.fn();
    render(<BlockPalette onAdd={onAdd} />);
    fireEvent.click(screen.getByRole('button', { name: /kpi/i }));
    expect(onAdd).toHaveBeenCalledWith('kpi');
    fireEvent.click(screen.getByRole('button', { name: /tabela/i }));
    expect(onAdd).toHaveBeenCalledWith('table');
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm test src/pages/explore/ui/__tests__/BlockPalette.test.tsx`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar a paleta**

```tsx
// src/pages/explore/ui/BlockPalette.tsx
'use client';

import { Gauge, LineChart, Table2, Type, Plus } from 'lucide-react';
import type { PaletteBlockType } from '@/shared/config/agents/template-blocks';

interface BlockPaletteProps {
  onAdd: (type: PaletteBlockType) => void;
}

const ITEMS: { type: PaletteBlockType; label: string; icon: React.ElementType }[] = [
  { type: 'kpi', label: 'KPI', icon: Gauge },
  { type: 'chart', label: 'Gráfico', icon: LineChart },
  { type: 'table', label: 'Tabela', icon: Table2 },
  { type: 'text', label: 'Texto', icon: Type },
];

export function BlockPalette({ onAdd }: BlockPaletteProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/80">
        <Plus className="size-3.5" /> Adicionar bloco:
      </span>
      {ITEMS.map(({ type, label, icon: Icon }) => (
        <button
          key={type}
          type="button"
          onClick={() => onAdd(type)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs text-foreground hover:bg-muted/60 transition-colors"
        >
          <Icon className="size-3.5" strokeWidth={1.75} />
          {label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm test src/pages/explore/ui/__tests__/BlockPalette.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/explore/ui/BlockPalette.tsx src/pages/explore/ui/__tests__/BlockPalette.test.tsx
git commit -m "feat(canvas): BlockPalette para inserir blocos"
```

---

### Task 13: Modo `authoring` no `CanvasPanel`

**Files:**
- Modify: `src/pages/explore/ui/CanvasPanel.tsx`

> Mudança guardada por flag `authoring` (default `false`) → comportamento atual do editor de reports inalterado. Ler `CanvasPanel.tsx` inteiro antes de editar.

- [ ] **Step 1: Adicionar imports no topo do arquivo**

`useCanvasStore` (de `@/shared/stores/canvas-store`) **já está importado** no arquivo (linha 5) — reutilizar, não duplicar.

(a) Adicionar `Pencil` à linha de import existente do `lucide-react` (linha 4): incluir `Pencil` na lista de ícones já importados.

(b) Adicionar os novos imports (após a linha `import { GlobalFilters } from '@/widgets/global-filters';`):

```tsx
import { BlockPalette } from './BlockPalette';
import { BlockInspector } from './BlockInspector';
import { makeEmptyBlock } from '@/shared/config/agents/template-blocks';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
```

- [ ] **Step 2: Adicionar prop `authoring` + estado do inspector ao `CanvasPanel`**

Trocar a assinatura:
```tsx
export function CanvasPanel() {
```
por:
```tsx
export function CanvasPanel({ authoring = false }: { authoring?: boolean } = {}) {
```

Logo no início do corpo (junto às outras chamadas de store), adicionar:
```tsx
  const addBlock = useCanvasStore((s) => s.addBlock);
  const updateBlockContent = useCanvasStore((s) => s.updateBlockContent);
  const [inspectingId, setInspectingId] = useState<string | null>(null);
```

- [ ] **Step 3: Passar `authoring` + handler de edição para o `BlockCard`**

No JSX onde os blocos são renderizados (o `.map` que cria `<BlockCard ... />` dentro do grid, por volta da linha 560-570), adicionar as props:
```tsx
                  authoring={authoring}
                  onEditContent={authoring ? (id) => setInspectingId(id) : undefined}
```

E na assinatura/props do componente `BlockCard` (por volta da linha 41), adicionar ao tipo de props:
```tsx
  authoring?: boolean;
  onEditContent?: (blockId: string) => void;
```

Dentro do toolbar do `BlockCard` (onde ficam os botões de hover — ao lado do controle de colSpan, por volta da linha 130), adicionar um botão de editar quando `authoring`:
```tsx
              {authoring && onEditContent && (
                <button
                  type="button"
                  title="Editar conteúdo"
                  aria-label="Editar conteúdo"
                  onClick={() => onEditContent(block.id)}
                  className="rounded p-1 text-muted-foreground/70 hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
```

- [ ] **Step 4: Esconder `GlobalFilters`/`filtersStale` e injetar `BlockPalette` quando `authoring`**

(a) No early-return de estado vazio (`if (pages.length === 0 || !hasBlocks)`, ~linha 491), trocar o conteúdo para considerar authoring:
```tsx
  if (pages.length === 0 || !hasBlocks) {
    return (
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-border px-6 py-3">
          {authoring ? (
            <BlockPalette onAdd={(type) => addBlock(activePage, makeEmptyBlock(type))} />
          ) : (
            <GlobalFilters pageTitle="" />
          )}
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <Sparkles className="h-6 w-6 text-primary" strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {authoring ? 'Template vazio' : 'Comece perguntando algo ao assistente'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {authoring ? 'Use "Adicionar bloco" acima para compor o template.' : 'Os resultados aparecerao aqui como blocos visuais.'}
            </p>
          </div>
        </div>
      </div>
    );
  }
```

(b) No return principal (~linha 514), trocar a barra de filtros:
```tsx
      {/* Filters bar / palette */}
      <div className="shrink-0 border-b border-border px-6 py-3">
        {authoring ? (
          <BlockPalette onAdd={(type) => addBlock(activePage, makeEmptyBlock(type))} />
        ) : (
          <GlobalFilters pageTitle="" />
        )}
      </div>
```

(c) Envolver o bloco do banner `filtersStale` (~linha 535) para não aparecer em authoring:
```tsx
        {!authoring && filtersStale && (
```

- [ ] **Step 5: Renderizar o `BlockInspector` num dialog**

Antes do fechamento do container principal do return (após o conteúdo da página), adicionar:
```tsx
      {authoring && inspectingId && currentPage?.blockMap[inspectingId] && (
        <Dialog open onOpenChange={(v) => { if (!v) setInspectingId(null); }}>
          <DialogContent className="bg-popover border-border text-foreground sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Editar bloco</DialogTitle>
            </DialogHeader>
            <BlockInspector
              block={currentPage.blockMap[inspectingId]}
              onChange={(updates) => updateBlockContent(activePage, inspectingId, updates)}
            />
          </DialogContent>
        </Dialog>
      )}
```

- [ ] **Step 6: Verificar build + lint + testes do canvas existentes**

Run: `pnpm lint && pnpm test src/pages/explore`
Expected: lint OK; testes existentes do explore continuam passando (a flag default `false` preserva o comportamento).

- [ ] **Step 7: Commit**

```bash
git add src/pages/explore/ui/CanvasPanel.tsx
git commit -m "feat(canvas): modo authoring (palette + inspector) no CanvasPanel"
```

---

### Task 14: Rota do editor `/admin/templates/[id]`

**Files:**
- Create: `app/(admin)/admin/templates/[id]/page.tsx`
- Create: `src/pages/admin-template-editor/ui/TemplateEditorPage.tsx`
- Modify: nenhum

> Padrão: a rota só reexporta o componente da page (como `app/(admin)/admin/page.tsx`). O componente vive em `src/pages/...` (FSD).

- [ ] **Step 1: Implementar o componente da página do editor**

```tsx
// src/pages/admin-template-editor/ui/TemplateEditorPage.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, ArrowLeft } from 'lucide-react';
import { CanvasPanel } from '@/pages/explore/ui/CanvasPanel';
import { useCanvasStore } from '@/shared/stores/canvas-store';
import { getTemplate, patchTemplate, type TemplateRecord } from '@/shared/lib/firestore/dashboard-templates';
import { deriveMetricRefs } from '@/shared/config/agents/template-blocks';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import type { CanvasPage } from '@/shared/config/agents/types';

export function TemplateEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? '';

  const loadPages = useCanvasStore((s) => s.loadPages);

  const [template, setTemplate] = useState<TemplateRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getTemplate(id)
      .then((t) => {
        setTemplate(t);
        if (t) {
          const page: CanvasPage = {
            id: t.id, title: t.name, blockMap: t.blockMap ?? {}, layout: t.layout ?? [], filters: t.filters,
          };
          loadPages([page]);
        }
      })
      .finally(() => setLoading(false));
    return () => loadPages([]);
  }, [id, loadPages]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const page = useCanvasStore.getState().pages[0];
      if (page) {
        await patchTemplate(id, {
          blockMap: page.blockMap,
          layout: page.layout,
          filters: page.filters,
          metricRefs: deriveMetricRefs(page.blockMap),
        });
      }
      loadPages([]);
      router.push('/admin');
    } finally {
      setSaving(false);
    }
  }, [id, loadPages, router]);

  if (loading) {
    return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" /></div>;
  }
  if (!template) {
    return <div className="flex flex-1 items-center justify-center"><p className="text-sm text-muted-foreground/60">Template não encontrado.</p></div>;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 lg:px-6 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => setConfirmLeave(true)} aria-label="Voltar"
            className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground/80 hover:text-foreground hover:bg-muted/40">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{template.name}</p>
            <p className="text-[11px] text-muted-foreground/60 font-mono truncate">{template.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setConfirmLeave(true)} disabled={saving}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-black hover:bg-primary/90 disabled:opacity-50">
            {saving ? 'Salvando…' : 'Salvar template'}
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0">
        <CanvasPanel authoring />
      </div>

      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        destructive
        title="Sair sem salvar?"
        description={'As alterações não salvas serão descartadas.'}
        confirmLabel="Sair"
        onConfirm={() => { loadPages([]); router.push('/admin'); }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Criar a rota que reexporta a page**

```tsx
// app/(admin)/admin/templates/[id]/page.tsx
export { TemplateEditorPage as default } from '@/pages/admin-template-editor/ui/TemplateEditorPage';
```

- [ ] **Step 3: Verificar build + lint**

Run: `pnpm lint && pnpm build`
Expected: build conclui sem erros (a rota dinâmica compila). Se `pnpm build` for muito lento, no mínimo `pnpm lint` deve passar.

- [ ] **Step 4: Smoke manual do editor**

`pnpm dev` → `/admin` → aba Dashboard Templates → "Abrir editor" num template → confirmar: paleta no topo (sem GlobalFilters), blocos do template renderizados, botão de editar (lápis) abre o inspector, "Adicionar bloco" insere bloco, "Salvar template" volta para `/admin`. Reabrir o editor e confirmar persistência.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/admin/templates/[id]/page.tsx" src/pages/admin-template-editor/ui/TemplateEditorPage.tsx
git commit -m "feat(admin): rota /admin/templates/[id] (editor visual de template)"
```

---

## Phase 5 — Rewiring da galeria

### Task 15: `TemplateGallery` lê do Firestore

**Files:**
- Modify: `src/widgets/nav-sidebar/ui/TemplateGallery.tsx`

> Ler o arquivo inteiro antes de editar. O objetivo é trocar a fonte de dados de `DASHBOARD_TEMPLATES` (array de código) para `useTemplates()` (Firestore), preservando filtros, painel de detalhes e fluxo de import.

- [ ] **Step 1: Trocar a fonte de dados**

(a) No import de `@/shared/config/dashboard-templates`, manter apenas o que continua vindo do código (`TEMPLATE_CATEGORIES`, e os tipos `TemplateProduct`/`TemplateSegment` usados nos metadados visuais). Remover `DASHBOARD_TEMPLATES` e o tipo `DashboardTemplate` desse import.

(b) Adicionar:
```tsx
import { useTemplates } from '@/shared/hooks/useTemplates';
import type { TemplateRecord } from '@/shared/lib/firestore/dashboard-templates';
```

(c) Dentro do componente, adicionar:
```tsx
  const { templates, loading: templatesLoading } = useTemplates();
```

(d) Trocar todas as referências a `DASHBOARD_TEMPLATES` por `templates`. Onde o tipo `DashboardTemplate` era usado para tipar variáveis/params locais (ex.: `handleImport(template: DashboardTemplate)`), trocar por `TemplateRecord`.

(e) O `useMemo` de `filteredTemplates` passa a depender de `[templates, productFilter, segmentFilter]` e filtrar sobre `templates`.

(f) O estado inicial `selectedId` e o `selected`/`effectiveSelectedId` passam a referenciar `templates` (em vez de `DASHBOARD_TEMPLATES`). Como `templates` começa vazio (async), guardar contra `undefined`: `templates.find(...) ?? templates[0]` e early-return de loading.

- [ ] **Step 2: Adicionar estados de loading/vazio**

Logo após os hooks, antes do return principal:
```tsx
  if (templatesLoading) {
    return <div className="flex h-[640px] items-center justify-center text-sm text-muted-foreground/60">Carregando templates…</div>;
  }
  if (templates.length === 0) {
    return <div className="flex h-[640px] items-center justify-center text-sm text-muted-foreground/60">Nenhum template disponível. Crie um em Admin → Dashboard Templates.</div>;
  }
```

- [ ] **Step 3: Garantir o import sem `queries`/`filters` ausentes**

No `handleImport`, o `create(...)` já trata `queries`/`filters` opcionais. Como `TemplateRecord` tem os mesmos campos (`blockMap`, `layout`, `queries?`, `filters?`, `description`, `name`), o corpo de `handleImport` permanece igual — só conferir que `template.queries`/`template.filters` continuam opcionais (são).

- [ ] **Step 4: Verificar build + lint**

Run: `pnpm lint`
Expected: sem erros (sem referências remanescentes a `DASHBOARD_TEMPLATES`).

- [ ] **Step 5: Smoke manual da galeria**

`pnpm dev` → header → "Importar template" → confirmar que a galeria lista os templates do Firestore, filtros funcionam, e importar cria um Report normalmente.

- [ ] **Step 6: Commit**

```bash
git add src/widgets/nav-sidebar/ui/TemplateGallery.tsx
git commit -m "refactor(gallery): TemplateGallery lê templates do Firestore (useTemplates)"
```

---

## Phase 6 — Verificação final

### Task 16: Suite completa + checagem da spec

- [ ] **Step 1: Rodar toda a suite de testes**

Run: `pnpm test`
Expected: todos os testes passam (novos + existentes).

- [ ] **Step 2: Lint + build**

Run: `pnpm lint && pnpm build`
Expected: sem erros.

- [ ] **Step 3: Smoke end-to-end (manual)**

Com `pnpm dev` e seed rodado:
1. `/admin` → aba renomeada "Metrics Contracts" presente.
2. Aba "Dashboard Templates" lista os seedados.
3. Criar template novo (form) → aparece com 0 blocos.
4. Abrir editor → adicionar KPI + tabela → editar conteúdo via inspector → Salvar.
5. Reabrir editor → mudanças persistiram.
6. Duplicar um template → aparece `<id>-copia` (status draft).
7. Header → "Importar template" → galeria mostra o template novo → importar → Report criado e navega para ele.
8. Excluir um template draft → some da galeria.

- [ ] **Step 4: Commit final (se houver ajustes)**

```bash
git add -A
git commit -m "chore(templates): ajustes finais pós-verificação"
```

---

## Notas de implementação / divergências da spec

- **`metricRefs` derivado, não editado manualmente** (`deriveMetricRefs`): decisão tomada no plano porque o `MetricRefsPicker` faz gating por entity (precisa de `availableEntityIds`/contract) e não encaixa em template. Single source of truth = `metricId` dos blocos.
- **Editor = modo `authoring` no `CanvasPanel`** (Opção 3): paleta + inspector + esconde GlobalFilters; guardado por flag default `false` → zero regressão no editor de reports.
- **`BlockInspector` cobre kpi/chart/table/text.** Blocos `gauge`/`donut`/`kpis` (templates Play+) continuam editáveis em layout (mover/redimensionar/excluir) mas sem editor de conteúdo dedicado nesta fase — documentado como fronteira na spec.
- **`id` do template é imutável após criação** (form em modo edição não permite trocar id) — evita quebrar referências por id (seeds, `select-template`).
