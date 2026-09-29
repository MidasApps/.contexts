# Propriedade/Escopo de Métrica — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar um dono a cada métrica — globais (Liquid, admin-only) vs de cliente (CRUD pelo dono), com promoção (cliente→global) por flip de campo.

**Architecture:** Coleção única `metrics/{id}` ganha `ownerClientId: Slug|null` (null=global). Permissão por dono via helper `authorizeMetricWrite` (reusa `verifyClientAccess`). Id estável e independente do dono; helper `generateUniqueMetricId` evita colisão. O resolve (`/api/metrics/[id]/data`) autoriza escopo.

**Tech Stack:** TypeScript, Zod, firebase-admin (Firestore), Next.js App Router, Vitest.

## Global Constraints

- TDD obrigatório: teste-primeiro, RED→GREEN→refactor.
- `ownerClientId` default `null` ⇒ docs existentes são globais; **nenhuma migração de dados**.
- Mudança ADITIVA: caminho de métricas globais (todas hoje) permanece idêntico em status/shape.
- Permissão server-side reusa `verifyClientAccess(email, clientId)` de `src/shared/lib/api-auth.ts` (admin ⇒ `{ allowed: true }`) e `isAdminEmail` de `src/shared/lib/runtime-config`.
- `MetricId` (`^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$`) inalterado; ids de cliente são `domain.slug` sufixados (`_2`, `_3`…), válidos no mesmo regex.
- Anti-sequestro: em update/delete a autorização usa o `ownerClientId` **do doc existente**, nunca o do corpo.
- Spec: `docs/superpowers/specs/2026-06-22-propriedade-escopo-metrica-design.md`.

## File Structure

- `src/shared/schemas/metric.ts` — adiciona `ownerClientId` a `MetricDoc`.
- `src/shared/lib/metrics/metric-id.ts` (novo) — `generateUniqueMetricId`.
- `src/shared/lib/metrics/authorize-metric.ts` (novo) — `authorizeMetricWrite`.
- `app/api/metrics/route.ts` — POST (ownerClientId + authorize + promote), DELETE (authorize), GET (escopo).
- `app/api/metrics/[id]/data/route.ts` — autorização de escopo da métrica.
- Testes: `metric.test.ts`, `metric-id.test.ts`, `authorize-metric.test.ts`, `app/api/metrics/__tests__/route.test.ts`, `app/api/metrics/[id]/data/route.test.ts`.

---

## Task 1: `ownerClientId` no schema `Metric`

**Files:**
- Modify: `src/shared/schemas/metric.ts` (dentro de `MetricDoc`, após `status`)
- Test: `src/shared/schemas/__tests__/metric.test.ts` (adicionar describe)

**Interfaces:**
- Consumes: `Slug` (já importado em `metric.ts` linha 2), `MetricDoc`/`Metric`.
- Produces: `MetricDoc.ownerClientId: string | null` (default `null`).

- [ ] **Step 1: Write the failing test** (append ao final de `src/shared/schemas/__tests__/metric.test.ts`)

```ts
describe('ownerClientId', () => {
  const base = {
    id: 'pdd.total',
    label: 'PDD',
    requires: ['canonical.contratos.saldo_devedor'],
    createdAt: 0,
    updatedAt: 0,
  };
  it('default é null (métrica global)', () => {
    const { ownerClientId, ...withoutOwner } = { ...base };
    void ownerClientId;
    expect(MetricDoc.parse({ ...withoutOwner }).ownerClientId).toBeNull();
  });
  it('aceita um Slug de cliente', () => {
    expect(Metric.parse({ ...base, ownerClientId: 'brz' }).ownerClientId).toBe('brz');
  });
  it('rejeita ownerClientId não-Slug', () => {
    expect(() => Metric.parse({ ...base, ownerClientId: 'BRZ Cliente' })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/shared/schemas/__tests__/metric.test.ts`
Expected: FAIL — `ownerClientId` é `undefined` (não null) / `BRZ Cliente` não é rejeitado.

- [ ] **Step 3: Write minimal implementation** (em `metric.ts`, dentro de `MetricDoc`, logo após a linha `status: MetricStatus.default('active'),`)

```ts
  /**
   * Dono da métrica. `null` ⇒ global/sistema (Liquid): compartilhada com todos
   * os clientes, CRUD só por admin. Slug do clientId ⇒ métrica daquele cliente:
   * CRUD pelo dono ou admin. Promoção a global = setar para `null` (id estável).
   */
  ownerClientId: Slug.nullable().default(null),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/shared/schemas/__tests__/metric.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/shared/schemas/metric.ts src/shared/schemas/__tests__/metric.test.ts
git commit -m "feat(schema): Metric.ownerClientId (global=null | cliente=Slug)"
```

---

## Task 2: `generateUniqueMetricId`

**Files:**
- Create: `src/shared/lib/metrics/metric-id.ts`
- Test: `src/shared/lib/metrics/metric-id.test.ts`

**Interfaces:**
- Produces: `generateUniqueMetricId(db, domain, slug): Promise<string>` — retorna `domain.slug` livre em `metrics/`, sufixando `_2`, `_3`… em colisão. `db` é `FirebaseFirestore.Firestore`.

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/lib/metrics/metric-id.test.ts
import { describe, it, expect } from 'vitest';
import { generateUniqueMetricId } from './metric-id';

function db(existing: Set<string>) {
  return {
    collection: () => ({
      doc: (id: string) => ({ get: async () => ({ exists: existing.has(id) }) }),
    }),
  } as unknown as FirebaseFirestore.Firestore;
}

describe('generateUniqueMetricId', () => {
  it('retorna domain.slug quando livre', async () => {
    expect(await generateUniqueMetricId(db(new Set()), 'carteira', 'meu_kpi')).toBe('carteira.meu_kpi');
  });
  it('sufixa _2 quando o base já existe', async () => {
    expect(await generateUniqueMetricId(db(new Set(['carteira.meu_kpi'])), 'carteira', 'meu_kpi')).toBe('carteira.meu_kpi_2');
  });
  it('sufixa _3 quando base e _2 existem', async () => {
    const taken = new Set(['carteira.meu_kpi', 'carteira.meu_kpi_2']);
    expect(await generateUniqueMetricId(db(taken), 'carteira', 'meu_kpi')).toBe('carteira.meu_kpi_3');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/shared/lib/metrics/metric-id.test.ts`
Expected: FAIL — módulo `./metric-id` não existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/shared/lib/metrics/metric-id.ts
import 'server-only';

/**
 * Gera um MetricId `domain.slug` único na coleção `metrics/`, sufixando
 * `_2`, `_3`… em colisão. `domain` e `slug` devem ser identifiers válidos
 * (lowercase, [a-z0-9_], começando com letra) — responsabilidade do caller.
 * O id resultante NÃO codifica o dono (promoção mantém o id estável).
 */
export async function generateUniqueMetricId(
  db: FirebaseFirestore.Firestore,
  domain: string,
  slug: string,
): Promise<string> {
  const base = `${domain}.${slug}`;
  let candidate = base;
  let n = 1;
  while ((await db.collection('metrics').doc(candidate).get()).exists) {
    n += 1;
    candidate = `${base}_${n}`;
  }
  return candidate;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/shared/lib/metrics/metric-id.test.ts`
Expected: PASS (3).

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/metrics/metric-id.ts src/shared/lib/metrics/metric-id.test.ts
git commit -m "feat(metrics): generateUniqueMetricId (id estável p/ métrica de cliente)"
```

---

## Task 3: `authorizeMetricWrite`

**Files:**
- Create: `src/shared/lib/metrics/authorize-metric.ts`
- Test: `src/shared/lib/metrics/authorize-metric.test.ts`

**Interfaces:**
- Consumes: `isAdminEmail` (`@/shared/lib/runtime-config`), `verifyClientAccess` (`@/shared/lib/api-auth`, retorna `{ allowed, status?, error? }`).
- Produces:
  ```ts
  type MetricWriteIntent = 'create' | 'update' | 'delete' | 'promote';
  authorizeMetricWrite(email: string, ownerClientId: string | null, intent: MetricWriteIntent): Promise<{ allowed: boolean; status?: number; error?: string }>
  ```
  Regras: admin ⇒ sempre; `promote` ⇒ só admin; global (`null`) ⇒ só admin; de cliente ⇒ delega a `verifyClientAccess(email, ownerClientId)`.

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/lib/metrics/authorize-metric.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ isAdmin: vi.fn(() => false), verifyClientAccess: vi.fn(async () => ({ allowed: true })) }));
vi.mock('@/shared/lib/runtime-config', () => ({ isAdminEmail: h.isAdmin }));
vi.mock('@/shared/lib/api-auth', () => ({ verifyClientAccess: h.verifyClientAccess }));

import { authorizeMetricWrite } from './authorize-metric';

beforeEach(() => { h.isAdmin.mockReset().mockReturnValue(false); h.verifyClientAccess.mockReset().mockResolvedValue({ allowed: true }); });

describe('authorizeMetricWrite', () => {
  it('admin pode tudo (inclusive global e promote)', async () => {
    h.isAdmin.mockReturnValue(true);
    expect((await authorizeMetricWrite('a@askliquid.com', null, 'create')).allowed).toBe(true);
    expect((await authorizeMetricWrite('a@askliquid.com', 'brz', 'promote')).allowed).toBe(true);
  });
  it('não-admin é barrado em métrica global', async () => {
    const r = await authorizeMetricWrite('u@x.com', null, 'create');
    expect(r.allowed).toBe(false);
    expect(r.status).toBe(403);
  });
  it('não-admin é barrado em promote', async () => {
    expect((await authorizeMetricWrite('u@x.com', 'brz', 'promote')).allowed).toBe(false);
  });
  it('cliente dono pode CRUD da sua (delega a verifyClientAccess)', async () => {
    h.verifyClientAccess.mockResolvedValue({ allowed: true });
    expect((await authorizeMetricWrite('u@x.com', 'brz', 'update')).allowed).toBe(true);
    expect(h.verifyClientAccess).toHaveBeenCalledWith('u@x.com', 'brz');
  });
  it('não-dono é barrado (verifyClientAccess nega)', async () => {
    h.verifyClientAccess.mockResolvedValue({ allowed: false, status: 403, error: 'Sem permissão para este cliente' });
    expect((await authorizeMetricWrite('u@x.com', 'conx', 'delete')).allowed).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/shared/lib/metrics/authorize-metric.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/shared/lib/metrics/authorize-metric.ts
import 'server-only';
import { isAdminEmail } from '@/shared/lib/runtime-config';
import { verifyClientAccess } from '@/shared/lib/api-auth';

export type MetricWriteIntent = 'create' | 'update' | 'delete' | 'promote';

/**
 * Autoriza escrita de métrica por dono. admin ⇒ sempre; promote ⇒ só admin;
 * global (ownerClientId null) ⇒ só admin; de cliente ⇒ delega a verifyClientAccess.
 */
export async function authorizeMetricWrite(
  email: string,
  ownerClientId: string | null,
  intent: MetricWriteIntent,
): Promise<{ allowed: boolean; status?: number; error?: string }> {
  if (isAdminEmail(email)) return { allowed: true };
  if (intent === 'promote') {
    return { allowed: false, status: 403, error: 'Apenas admin pode promover métricas' };
  }
  if (ownerClientId === null) {
    return { allowed: false, status: 403, error: 'Apenas admin gerencia métricas globais' };
  }
  return verifyClientAccess(email, ownerClientId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/shared/lib/metrics/authorize-metric.test.ts`
Expected: PASS (5).

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/metrics/authorize-metric.ts src/shared/lib/metrics/authorize-metric.test.ts
git commit -m "feat(metrics): authorizeMetricWrite (permissão por dono)"
```

---

## Task 4: `POST /api/metrics` — ownerClientId + permissão por dono + promoção

**Files:**
- Modify: `app/api/metrics/route.ts` (função `POST`, ~linhas 238-320)
- Test: `app/api/metrics/__tests__/route.test.ts` (estender mocks + novos casos)

**Interfaces:**
- Consumes: `authorizeMetricWrite` (Task 3), `MetricDoc` com `ownerClientId` (Task 1).
- Produces: POST persiste `ownerClientId`; aplica permissão por dono (substitui o `isAdminEmail` cego); suporta `{ action: 'promote', id }`.

- [ ] **Step 1: Write the failing test** — primeiro, estenda o mock do Firestore (no `vi.hoisted`, dentro do bloco `// metrics collection`) para permitir controlar o doc existente. Substitua o bloco `return { doc: () => ({ ... get: async () => ({ exists: false }) }) };` por:

```ts
      // metrics collection
      return {
        doc: () => ({
          delete: state.metricDocDelete,
          update: state.metricDocUpdate,
          set: state.metricDocSet,
          get: async () => ({
            exists: state.metricExisting !== null,
            data: () => state.metricExisting ?? {},
          }),
        }),
      };
```

E adicione ao `state` (no topo do `vi.hoisted`): `metricExisting: null as Record<string, unknown> | null,`. Adicione o mock de `authorize-metric` após os mocks existentes:

```ts
const authMock = vi.hoisted(() => ({ authorizeMetricWrite: vi.fn(async () => ({ allowed: true })) }));
vi.mock('@/shared/lib/metrics/authorize-metric', () => ({ authorizeMetricWrite: authMock.authorizeMetricWrite }));
```

> **Blindagem anti-vazamento:** adicione `mocks.state.metricExisting = null;` ao `beforeEach` de TODOS os describes de POST existentes (`ref validation`, `recipe + multi-contract warnings`) — assim um teste de update/promote não deixa `metricExisting` setado para um teste de create posterior.

Agora os casos (novo describe ao final do arquivo):

```ts
describe('POST /api/metrics — propriedade/escopo', () => {
  beforeEach(() => {
    mocks.state.attributes = new Map();
    mocks.state.metricDocSet.mockClear();
    mocks.state.metricExisting = null;
    authMock.authorizeMetricWrite.mockReset().mockResolvedValue({ allowed: true });
  });

  it('persiste ownerClientId do corpo ao criar métrica de cliente', async () => {
    mocks.state.attributes.set('canonical.contratos.saldo_devedor', { exists: true, deprecated: false });
    const res = await POST(postReq({ ...baseMetric, requires: ['canonical.contratos.saldo_devedor'], ownerClientId: 'brz' }));
    expect(res.status).toBe(200);
    expect(authMock.authorizeMetricWrite).toHaveBeenCalledWith('admin@askliquid.com', 'brz', 'create');
    const saved = mocks.state.metricDocSet.mock.calls[0]![0] as { ownerClientId?: unknown };
    expect(saved.ownerClientId).toBe('brz');
  });

  it('403 quando authorizeMetricWrite nega', async () => {
    mocks.state.attributes.set('canonical.contratos.saldo_devedor', { exists: true, deprecated: false });
    authMock.authorizeMetricWrite.mockResolvedValue({ allowed: false, status: 403, error: 'Sem permissão' });
    const res = await POST(postReq({ ...baseMetric, requires: ['canonical.contratos.saldo_devedor'], ownerClientId: 'conx' }));
    expect(res.status).toBe(403);
    expect(mocks.state.metricDocSet).not.toHaveBeenCalled();
  });

  it('anti-sequestro: update autoriza pelo dono do DOC existente e preserva o dono', async () => {
    mocks.state.attributes.set('canonical.contratos.saldo_devedor', { exists: true, deprecated: false });
    mocks.state.metricExisting = { ownerClientId: null }; // doc global já existe
    const res = await POST(postReq({ ...baseMetric, requires: ['canonical.contratos.saldo_devedor'], ownerClientId: 'brz' }));
    expect(res.status).toBe(200);
    // autoriza contra o dono atual (null/global), intent update — não contra o corpo ('brz')
    expect(authMock.authorizeMetricWrite).toHaveBeenCalledWith('admin@askliquid.com', null, 'update');
    const saved = mocks.state.metricDocSet.mock.calls[0]![0] as { ownerClientId?: unknown };
    expect(saved.ownerClientId).toBeNull(); // dono preservado, corpo ignorado
  });

  it('promote: flipa ownerClientId para null', async () => {
    mocks.state.metricExisting = { ownerClientId: 'brz', label: 'X', requires: ['canonical.contratos.saldo_devedor'] };
    const res = await POST(postReq({ action: 'promote', id: 'perf.inadimplencia' }));
    expect(res.status).toBe(200);
    expect(authMock.authorizeMetricWrite).toHaveBeenCalledWith('admin@askliquid.com', 'brz', 'promote');
    expect(mocks.state.metricDocUpdate).toHaveBeenCalledWith(expect.objectContaining({ ownerClientId: null }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run app/api/metrics/__tests__/route.test.ts`
Expected: FAIL — POST ainda é admin-only/ignora ownerClientId; não há ramo `promote`.

- [ ] **Step 3: Write minimal implementation** — em `app/api/metrics/route.ts`:

(a) Adicione o import no topo (após a linha do `runtime-config`):
```ts
import { authorizeMetricWrite } from '@/shared/lib/metrics/authorize-metric';
```

(b) Substitua o corpo da função `POST` (de `if (!isAdminEmail(email)) ...` até o `return NextResponse.json({ ok: true, ... })`) por:

```ts
  // Promoção (cliente→global): admin-only, flip de campo, id/refs estáveis.
  const rawBody = await req.json();
  if (rawBody?.action === 'promote') {
    const idParse = MetricId.safeParse(rawBody?.id);
    if (!idParse.success) return NextResponse.json({ error: 'Metric ID inválido' }, { status: 400 });
    const ref = firestore().collection('metrics').doc(idParse.data);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Métrica não encontrada' }, { status: 422 });
    const currentOwner = ((snap.data() as { ownerClientId?: string | null }).ownerClientId) ?? null;
    const auth = await authorizeMetricWrite(email, currentOwner, 'promote');
    if (!auth.allowed) return NextResponse.json({ error: auth.error ?? 'Sem permissão' }, { status: auth.status ?? 403 });
    await ref.update({ ownerClientId: null, updatedAt: Timestamp.now() });
    return NextResponse.json({ ok: true, id: idParse.data });
  }

  try {
    const idParse = MetricId.safeParse(rawBody?.id);
    if (!idParse.success) {
      return NextResponse.json({ error: 'Metric ID inválido (esperado "domain.slug")' }, { status: 400 });
    }

    const docParse = MetricDoc.omit({ createdAt: true, updatedAt: true }).safeParse({
      label: rawBody.label,
      description: rawBody.description ?? null,
      type: rawBody.type,
      category: rawBody.category ?? null,
      unit: rawBody.unit ?? null,
      requires: rawBody.requires ?? [],
      recipe: rawBody.recipe ?? undefined,
      version: rawBody.version ?? '1.0.0',
      status: rawBody.status ?? 'active',
      ownerClientId: rawBody.ownerClientId ?? null,
    });
    if (!docParse.success) {
      return NextResponse.json({ error: 'Payload inválido', issues: docParse.error.issues }, { status: 400 });
    }

    const ref = firestore().collection('metrics').doc(idParse.data);
    const existing = await ref.get();

    // Anti-sequestro: em update, autoriza e preserva o dono do DOC existente
    // (ignora ownerClientId do corpo). Em create, usa o dono do corpo.
    const effectiveOwner = existing.exists
      ? (((existing.data() as { ownerClientId?: string | null }).ownerClientId) ?? null)
      : docParse.data.ownerClientId;
    const auth = await authorizeMetricWrite(email, effectiveOwner, existing.exists ? 'update' : 'create');
    if (!auth.allowed) return NextResponse.json({ error: auth.error ?? 'Sem permissão' }, { status: auth.status ?? 403 });

    // Fail-loud: refs órfãs viram erro 422.
    const invalid = await findInvalidRefs(docParse.data.requires);
    if (invalid.length > 0) {
      return NextResponse.json({ error: 'Refs inexistentes no contract', invalidRefs: invalid }, { status: 422 });
    }

    const warnings = [
      ...(await collectDeprecatedRefWarnings(docParse.data.requires)),
      ...collectMultiContractWarnings(docParse.data.requires),
      ...(await collectRecipeRefWarnings(docParse.data.recipe, docParse.data.requires)),
    ];
    if (warnings.length > 0) console.warn(`[POST /api/metrics] ${idParse.data}:`, warnings);

    const now = Timestamp.now();
    await ref.set(
      {
        ...docParse.data,
        ownerClientId: effectiveOwner,
        updatedAt: now,
        ...(existing.exists ? {} : { createdAt: now }),
      },
      { merge: false },
    );

    return NextResponse.json({ ok: true, id: idParse.data, ...(warnings.length > 0 ? { warnings } : {}) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao salvar';
    return NextResponse.json({ error: message }, { status: 500 });
  }
```

> Nota: a checagem `if (!isAdminEmail(email)) return 403` é REMOVIDA — `authorizeMetricWrite` agora cobre admin e dono. O `import { isAdminEmail }` segue usado por GET (Task 6) e por outras partes; não remova o import.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run app/api/metrics/__tests__/route.test.ts`
Expected: PASS (incluindo os casos antigos de POST — `authorizeMetricWrite` mockado retorna `{ allowed: true }` por padrão).

- [ ] **Step 5: Commit**

```bash
git add app/api/metrics/route.ts app/api/metrics/__tests__/route.test.ts
git commit -m "feat(api): POST /api/metrics persiste ownerClientId + permissão por dono + promote"
```

---

## Task 5: `DELETE /api/metrics` — permissão por dono

**Files:**
- Modify: `app/api/metrics/route.ts` (função `DELETE`, ~linhas 329+)
- Test: `app/api/metrics/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `authorizeMetricWrite` (Task 3).
- Produces: DELETE autoriza por `ownerClientId` do doc; mantém o guard de hard-delete por referência.

- [ ] **Step 1: Write the failing test** (novo describe; reaproveita o `req`/mocks; o `authorize-metric` já está mockado pela Task 4)

```ts
describe('DELETE /api/metrics — permissão por dono', () => {
  beforeEach(() => {
    mocks.state.productsQueryResult = [];
    mocks.state.templatesQueryResult = [];
    mocks.state.metricDocDelete.mockClear();
    mocks.state.metricDocUpdate.mockClear();
    mocks.state.metricExisting = { ownerClientId: 'brz' };
    authMock.authorizeMetricWrite.mockReset().mockResolvedValue({ allowed: true });
  });

  it('autoriza pelo dono do doc (soft delete)', async () => {
    const res = await DELETE(req('http://x/api/metrics?id=perf.inadimplencia'));
    expect(res.status).toBe(200);
    expect(authMock.authorizeMetricWrite).toHaveBeenCalledWith('admin@askliquid.com', 'brz', 'delete');
  });

  it('403 quando authorize nega', async () => {
    authMock.authorizeMetricWrite.mockResolvedValue({ allowed: false, status: 403, error: 'Sem permissão' });
    const res = await DELETE(req('http://x/api/metrics?id=perf.inadimplencia'));
    expect(res.status).toBe(403);
    expect(mocks.state.metricDocUpdate).not.toHaveBeenCalled();
    expect(mocks.state.metricDocDelete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run app/api/metrics/__tests__/route.test.ts`
Expected: FAIL — DELETE ainda é admin-only e não chama `authorizeMetricWrite`.

- [ ] **Step 3: Write minimal implementation** — em `DELETE`, substitua `if (!isAdminEmail(email)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });` por um bloco que carrega o doc e autoriza. Logo após `const idParse = MetricId.safeParse(id); if (!idParse.success) ...` e a obtenção de `const ref = db.collection('metrics').doc(idParse.data);`, insira ANTES do `if (hard)`:

```ts
    const snap = await ref.get();
    const owner = snap.exists ? (((snap.data() as { ownerClientId?: string | null }).ownerClientId) ?? null) : null;
    const auth = await authorizeMetricWrite(email, owner, 'delete');
    if (!auth.allowed) return NextResponse.json({ error: auth.error ?? 'Sem permissão' }, { status: auth.status ?? 403 });
```

> Remova a linha `if (!isAdminEmail(email)) return ... 403` do início do `DELETE`. O `ref` deve ser declarado antes desse bloco (mova a declaração `const db = firestore(); const ref = db.collection('metrics').doc(idParse.data);` para antes da autorização, se necessário).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run app/api/metrics/__tests__/route.test.ts`
Expected: PASS (incluindo o describe "hard delete gate" antigo — admin mockado allow).

- [ ] **Step 5: Commit**

```bash
git add app/api/metrics/route.ts app/api/metrics/__tests__/route.test.ts
git commit -m "feat(api): DELETE /api/metrics autoriza por dono da métrica"
```

---

## Task 6: `GET /api/metrics` — listagem por escopo

**Files:**
- Modify: `app/api/metrics/route.ts` (função `GET`, ~linhas 220-236)
- Test: `app/api/metrics/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `isAdminEmail`, `verifyClientAccess`.
- Produces: `GET ?clientId=X` → globais + métricas de X (se o usuário tem acesso a X). Admin sem `clientId` → todas.

- [ ] **Step 1: Write the failing test** — adicione ao mock do Firestore a capacidade de listar métricas. No `vi.hoisted` `state`, adicione `metricsList: [] as Array<{ id: string; ownerClientId: string | null }>,`. No bloco `// metrics collection`, troque o objeto retornado para incluir `get` na coleção:

```ts
      // metrics collection
      return {
        get: async () => ({
          docs: state.metricsList.map((m) => ({ id: m.id, data: () => ({ ownerClientId: m.ownerClientId }) })),
        }),
        where: () => ({
          get: async () => ({
            docs: state.metricsList.map((m) => ({ id: m.id, data: () => ({ ownerClientId: m.ownerClientId }) })),
          }),
        }),
        doc: () => ({
          delete: state.metricDocDelete,
          update: state.metricDocUpdate,
          set: state.metricDocSet,
          get: async () => ({ exists: state.metricExisting !== null, data: () => state.metricExisting ?? {} }),
        }),
      };
```

Adicione o mock de `api-auth` (após os outros mocks): 
```ts
const apiAuthMock = vi.hoisted(() => ({ verifyClientAccess: vi.fn(async () => ({ allowed: true })) }));
vi.mock('@/shared/lib/api-auth', () => ({ verifyClientAccess: apiAuthMock.verifyClientAccess }));
```

E o helper GET + casos:
```ts
import { GET } from '../route'; // adicionar ao import existente de '../route'

function getReq(qs = '') {
  return new NextRequest(`http://x/api/metrics${qs}`, { method: 'GET', headers: { authorization: 'Bearer token' } });
}

describe('GET /api/metrics — escopo por dono', () => {
  beforeEach(() => {
    mocks.state.metricsList = [
      { id: 'pdd.total', ownerClientId: null },
      { id: 'carteira.brz_kpi', ownerClientId: 'brz' },
      { id: 'carteira.conx_kpi', ownerClientId: 'conx' },
    ];
    (runtimeMock.isAdminEmail as ReturnType<typeof vi.fn>).mockReturnValue(false);
    apiAuthMock.verifyClientAccess.mockReset().mockResolvedValue({ allowed: true });
  });

  it('clientId=brz (com acesso) → globais + métricas da brz', async () => {
    const body = await (await GET(getReq('?clientId=brz'))).json();
    const ids = body.data.map((m: { id: string }) => m.id).sort();
    expect(ids).toEqual(['carteira.brz_kpi', 'pdd.total']);
  });

  it('sem acesso ao cliente → só globais', async () => {
    apiAuthMock.verifyClientAccess.mockResolvedValue({ allowed: false, status: 403 });
    const body = await (await GET(getReq('?clientId=brz'))).json();
    expect(body.data.map((m: { id: string }) => m.id)).toEqual(['pdd.total']);
  });

  it('admin sem clientId → todas', async () => {
    (runtimeMock.isAdminEmail as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const body = await (await GET(getReq())).json();
    expect(body.data).toHaveLength(3);
  });
});
```

> O mock de `runtime-config` precisa expor `isAdminEmail` como referência controlável. Garanta no topo: `const runtimeMock = vi.hoisted(() => ({ isAdminEmail: vi.fn(() => true) }));` e troque o `vi.mock('@/shared/lib/runtime-config', ...)` para usar `isAdminEmail: runtimeMock.isAdminEmail` (mantendo `DATAVIZ_DATABASE_ID`, `DEV_BYPASS_EMAIL`, `isDevAuthBypassEnabled`).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run app/api/metrics/__tests__/route.test.ts`
Expected: FAIL — GET retorna todas as métricas sem filtrar por escopo.

- [ ] **Step 3: Write minimal implementation** — em `GET`, adicione o import `import { verifyClientAccess } from '@/shared/lib/api-auth';` no topo (se ainda não existir) e substitua o corpo do `try` por:

```ts
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const clientId = url.searchParams.get('clientId');
    let query = firestore().collection('metrics') as FirebaseFirestore.Query;
    if (status) query = query.where('status', '==', status);
    const snap = await query.get();
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<{ id: string; ownerClientId?: string | null }>;

    const admin = isAdminEmail(email);
    if (admin && !clientId) {
      return NextResponse.json({ data: all });
    }
    const canSeeClient = clientId ? (await verifyClientAccess(email, clientId)).allowed : false;
    const data = all.filter((m) => {
      const owner = m.ownerClientId ?? null;
      return owner === null || (canSeeClient && owner === clientId);
    });
    return NextResponse.json({ data });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run app/api/metrics/__tests__/route.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add app/api/metrics/route.ts app/api/metrics/__tests__/route.test.ts
git commit -m "feat(api): GET /api/metrics filtra por escopo (global + cliente)"
```

---

## Task 7: `/api/metrics/[id]/data` — autorização de escopo

**Files:**
- Modify: `app/api/metrics/[id]/data/route.ts` (após `const metric = Metric.parse(...)`, antes do branch `derived`)
- Test: `app/api/metrics/[id]/data/route.test.ts`

**Interfaces:**
- Consumes: `metric` parseado (já tem `ownerClientId` após Task 1), `body.clientId`.
- Produces: 403 quando a métrica é de outro cliente; global e própria passam.

- [ ] **Step 1: Write the failing test** (novo describe ao final; reaproveita mocks do arquivo)

```ts
describe('POST /api/metrics/[id]/data — escopo de propriedade', () => {
  beforeEach(() => {
    verifyAuthMock.mockReset().mockResolvedValue('user@example.com');
    verifyAccessMock.mockReset().mockResolvedValue({ allowed: true });
    metricDocGetMock.mockReset();
    clientDocGetMock.mockReset().mockResolvedValue(CLIENT_DOC);
    getDataSourceMock.mockReset().mockResolvedValue({ projectId: 'gcp-project' });
    bqQueryMock.mockReset().mockResolvedValue([[{ v: 1 }]]);
  });

  const ownedMetric = (owner: string | null) => ({
    exists: true,
    id: 'carteira.saldo',
    data: () => ({
      label: 'X', requires: ['canonical.carteira.saldo'],
      recipe: { kind: 'aggregation', primaryEntity: 'carteira', aggregation: 'sum', valueAttribute: 'carteira.saldo', groupByAttributes: [], filters: [] },
      type: 'kpi', version: '1.0.0', status: 'active', ownerClientId: owner, createdAt: null, updatedAt: null,
    }),
  });

  it('403 quando a métrica pertence a outro cliente', async () => {
    metricDocGetMock.mockResolvedValue(ownedMetric('outro-cliente'));
    const { POST } = await import('./route');
    const res = await POST(makeReq({ clientId: 'client-om' }) as Parameters<typeof POST>[0], { params: Promise.resolve({ id: 'carteira.saldo' }) });
    expect(res.status).toBe(403);
    expect(bqQueryMock).not.toHaveBeenCalled();
  });

  it('200 quando a métrica é global (ownerClientId null)', async () => {
    metricDocGetMock.mockResolvedValue(ownedMetric(null));
    const { POST } = await import('./route');
    const res = await POST(makeReq({ clientId: 'client-om' }) as Parameters<typeof POST>[0], { params: Promise.resolve({ id: 'carteira.saldo' }) });
    expect(res.status).toBe(200);
  });
});
```

> `CLIENT_DOC` no arquivo tem dataset `contractRef: 'canonical'` cobrindo `requires[0]`; `resolveMetric` é mockado para `{ sql, params, outputColumns }`. O caso global deve resolver 200.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run "app/api/metrics/[id]/data/route.test.ts"`
Expected: FAIL — o caso "outro cliente" retorna 200 (sem checagem de escopo).

- [ ] **Step 3: Write minimal implementation** — em `app/api/metrics/[id]/data/route.ts`, logo após o bloco que valida `if (!metric.recipe) { ... 422 }` (e antes do branch `if (metric.recipe.kind === 'derived')`), insira:

```ts
    // Autorização de escopo (propriedade da métrica): global (null) é visível a
    // todos; métrica de cliente só resolve no contexto do próprio cliente.
    const metricOwner = (metric as { ownerClientId?: string | null }).ownerClientId ?? null;
    if (metricOwner !== null && metricOwner !== body.clientId) {
      return NextResponse.json(
        { error: 'Métrica pertence a outro cliente' },
        { status: 403 },
      );
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run "app/api/metrics/[id]/data/route.test.ts"`
Expected: PASS (todos, incluindo os casos derived/coverage existentes).

- [ ] **Step 5: Commit**

```bash
git add "app/api/metrics/[id]/data/route.ts" "app/api/metrics/[id]/data/route.test.ts"
git commit -m "feat(api): /api/metrics/[id]/data autoriza escopo de propriedade da métrica"
```

---

## Verificação final (após Task 7)

- [ ] Suíte do escopo: `pnpm exec vitest run src/shared/schemas/__tests__/metric.test.ts src/shared/lib/metrics/metric-id.test.ts src/shared/lib/metrics/authorize-metric.test.ts app/api/metrics/__tests__/route.test.ts "app/api/metrics/[id]/data/route.test.ts"` → tudo verde.
- [ ] `npx eslint <arquivos criados/modificados>` → 0 erros.
- [ ] `pnpm exec tsc --noEmit` → 0 erros.
- [ ] Suíte completa `pnpm exec vitest run` → tudo verde (sem regressão).
- [ ] Finalizar com `superpowers:finishing-a-development-branch`.

## Fora deste plano (próximos sub-projetos)
- **G4** — chat materializa indicador como métrica (do cliente) via `create_metric` usando `generateUniqueMetricId` + vincula `metricId` ao bloco.
- **G5** — tools do chat resolvem via `schemaBindings`/contrato; recipes semânticos; aposentar schema hardcoded.
- **Admin UI** — promoção/edição/listagem por dono (consome `GET ?clientId=` + `action: promote`).
