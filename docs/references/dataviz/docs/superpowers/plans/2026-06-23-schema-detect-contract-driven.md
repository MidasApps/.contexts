# schema-detect contract-driven + aposentar legado (G7) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O `/api/schema-detect/v2` lê o Data Contract (não `expectedTables`), mapeia colunas reais → `SemanticSchemaBinding` flat, aplica o resultado no `schemaBindings` do dataset (hoje é descartado), reporta cobertura advisory das métricas contratadas, e o legado de schema-detect é removido.

**Architecture:** Endpoint passa a carregar `dataContracts/{contractRef}/entities/*/attributes/*` e pedir ao Gemini o mapeamento `entity.attr → coluna`, devolvendo flat + `coverage`. A UI (`ClientForm`→`ProductBindingsEditor`→`SchemaMapEditor`) funde o binding detectado em `dataset.schemaBindings` e mostra gaps não-bloqueantes. Depois remove-se v1, `EXPECTED_SCHEMA`, `expectedTables`, e os modos legados dos editores.

**Tech Stack:** TypeScript, Next.js App Router, firebase-admin (Firestore), Vertex AI (`generateObject`), Zod, Vitest.

## Global Constraints

- TDD obrigatório: teste-primeiro, RED→GREEN→refactor.
- Saída do endpoint é **flat** `SemanticSchemaBinding` (`{"entity.attr": coluna|null}`). Coluna não encontrada ⇒ `null` (nunca inventa).
- Cobertura é **advisory** (não bloqueia salvar). `null` é estado legítimo.
- Sem dependência de `product.expectedTables` em lugar nenhum do caminho novo.
- Path do endpoint permanece `/api/schema-detect/v2` (caller já usa).
- Marcador do schema hardcoded a NÃO reintroduzir: nenhuma. (Este plano não toca prompts de agente.)
- Spec: `docs/superpowers/specs/2026-06-23-schema-detect-contract-driven-design.md`.

## File Structure

- `app/api/schema-detect/v2/route.ts` — reescrito contract-driven + coverage (Task 1).
- `app/api/schema-detect/v2/__tests__/route.test.ts` — novo (Task 1).
- `src/features/admin/ui/ClientForm.tsx` — `handleDetectBinding` retorna flat; remove modo legado (Tasks 2, 3).
- `src/features/admin/ui/ProductBindingsEditor.tsx` — aplica binding + coverage; remove props legados (Tasks 2, 3).
- `src/features/admin/ui/SchemaMapEditor.tsx` — `onDetect` propaga binding; remove `LegacyEditor` (Tasks 2, 3).
- Deleções/edições de retirement (Task 3): `app/api/schema-detect/route.ts`, `SchemaEditor.tsx`, `ExpectedTablesEditor.tsx`, `model/types.ts` (`EXPECTED_SCHEMA`/`ExpectedTable`/`ClientSchema`), `schemas/product.ts` (`ExpectedTable`/`expectedTables`), `ProductForm.tsx`, `ProductsTab.tsx`, `ProductSwitcher.tsx`, `admin/ui/index.ts`, seeds + testes.

---

## Task 1: Reescrever o endpoint — contract-driven, saída flat, coverage

**Files:**
- Modify: `app/api/schema-detect/v2/route.ts` (reescrita do corpo; mantém auth + helpers de BQ)
- Test: `app/api/schema-detect/v2/__tests__/route.test.ts` (criar)

**Interfaces:**
- Consumes: `getProduct(productId)` (→ `metricRefs`), Firestore `dataContracts/{c}/entities/*/attributes/*`, `metrics/{id}` (`requires[]`), `collectBindingGaps` de `@/shared/lib/metrics/coverage`.
- Produces: `POST` retorna `{ data: { contractRef, schemaBindings: SemanticSchemaBinding, actualColumns, coverage: CoverageGap[] } }`. Input `{ productId, contractRef, dataSourceId, datasetId }`.

- [ ] **Step 1: Write the failing test**

Criar `app/api/schema-detect/v2/__tests__/route.test.ts`:

```ts
/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  genObjMock: vi.fn(),
  getProductMock: vi.fn(),
  bqQueryMock: vi.fn(),
  // Firestore: dataContracts/{c}/entities + attributes, metrics/{id}
  contracts: {} as Record<string, Record<string, Record<string, Record<string, unknown>>>>,
  metrics: {} as Record<string, Record<string, unknown>>,
}));

vi.mock('ai', () => ({ generateObject: h.genObjMock }));
vi.mock('@ai-sdk/google-vertex', () => ({ vertex: () => 'model' }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken: async () => ({ email: 'a@b.com' }) }) }));
vi.mock('@/shared/lib/runtime-config', () => ({
  isAdminEmail: () => true, isDevAuthBypassEnabled: () => true, DEV_BYPASS_EMAIL: 'a@b.com',
}));
vi.mock('@/shared/repositories/product-repo', () => ({ getProduct: h.getProductMock }));
vi.mock('@/shared/lib/bigquery/client', () => ({ getBigQueryClientFor: async () => ({ query: h.bqQueryMock }) }));
vi.mock('@/shared/lib/firebase/admin', () => ({
  ensureAdminApp: vi.fn(),
  getDb: () => ({
    collection: (name: string) => {
      if (name === 'metrics') return { doc: (id: string) => ({ get: async () => ({ exists: !!h.metrics[id], data: () => h.metrics[id] }) }) };
      if (name === 'dataContracts') return {
        doc: (c: string) => ({ collection: () => ({
          get: async () => ({ docs: Object.keys(h.contracts[c] ?? {}).map((id) => ({ id, data: () => ({}) })) }),
          doc: (eid: string) => ({ collection: () => ({
            get: async () => ({ docs: Object.entries(h.contracts[c]?.[eid] ?? {}).map(([aid, d]) => ({ id: aid, data: () => d })) }),
          }) }),
        }) }),
      };
      throw new Error(`unexpected collection ${name}`);
    },
  }),
}));

import { POST } from '../route';

function req(body: unknown) {
  return { headers: { get: () => 'Bearer x' }, json: async () => body } as never;
}

beforeEach(() => {
  Object.values(h).forEach((v) => { if (typeof v === 'function' && 'mockReset' in v) (v as ReturnType<typeof vi.fn>).mockReset(); });
  h.contracts = {}; h.metrics = {};
  h.getProductMock.mockResolvedValue({ id: 'prod', name: 'Prod', metricRefs: [] });
  h.bqQueryMock.mockResolvedValue([[
    { table_name: 'contratos', column_name: 'vl_saldo', data_type: 'FLOAT64' },
  ]]);
  h.genObjMock.mockResolvedValue({ object: { contratos: { saldo_devedor: 'vl_saldo' } } });
});

describe('POST /api/schema-detect/v2 (contract-driven)', () => {
  it('mapeia colunas reais → SemanticSchemaBinding flat (sem expectedTables)', async () => {
    h.contracts['canonical'] = { contratos: { saldo_devedor: { type: 'float' } } };
    const res = await POST(req({ productId: 'prod', contractRef: 'canonical', dataSourceId: 'src', datasetId: 'ds' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.schemaBindings).toEqual({ 'contratos.saldo_devedor': 'vl_saldo' });
  });

  it('422 quando o contrato não tem entidades/atributos', async () => {
    h.contracts['canonical'] = {}; // vazio
    const res = await POST(req({ productId: 'prod', contractRef: 'canonical', dataSourceId: 'src', datasetId: 'ds' }));
    expect(res.status).toBe(422);
  });

  it('coverage reporta refs de métricas contratadas sem binding', async () => {
    h.contracts['canonical'] = { contratos: { saldo_devedor: { type: 'float' }, ltv: { type: 'float' } } };
    h.getProductMock.mockResolvedValue({ id: 'prod', name: 'Prod', metricRefs: ['m.ltv'] });
    h.metrics['m.ltv'] = { requires: ['canonical.contratos.ltv'] };
    // Gemini só mapeia saldo_devedor; ltv fica sem binding
    h.genObjMock.mockResolvedValue({ object: { contratos: { saldo_devedor: 'vl_saldo', ltv: null } } });
    const res = await POST(req({ productId: 'prod', contractRef: 'canonical', dataSourceId: 'src', datasetId: 'ds' }));
    const body = await res.json();
    expect(body.data.coverage).toContainEqual({ ref: 'canonical.contratos.ltv', reason: 'desabilitado' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run app/api/schema-detect/v2/__tests__/route.test.ts`
Expected: FAIL — a rota atual exige `expectedTables`, devolve `schema` nested, não tem `schemaBindings`/`coverage`.

- [ ] **Step 3: Write minimal implementation** — substituir o corpo de `app/api/schema-detect/v2/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { generateObject } from 'ai';
import { vertex } from '@ai-sdk/google-vertex';
import { z } from 'zod';
import { ensureAdminApp, getDb } from '@/shared/lib/firebase/admin';
import { getBigQueryClientFor } from '@/shared/lib/bigquery/client';
import { safeDatasetRef, safeIdentifier } from '@/shared/lib/bigquery/identifier';
import { getProduct } from '@/shared/repositories/product-repo';
import { Slug, SqlIdentifier } from '@/shared/schemas';
import { collectBindingGaps, type CoverageGap } from '@/shared/lib/metrics/coverage';
import type { SemanticSchemaBinding } from '@/shared/schemas/client-binding';
import {
  isAdminEmail,
  isDevAuthBypassEnabled,
  DEV_BYPASS_EMAIL,
} from '@/shared/lib/runtime-config';

/**
 * Schema-detect contract-driven (G7). Recebe { productId, contractRef,
 * dataSourceId, datasetId }, lê entities+attributes de dataContracts/{contractRef},
 * pede ao Gemini para mapear colunas reais do BigQuery → entity.attribute, e
 * devolve SemanticSchemaBinding flat + cobertura advisory das métricas contratadas.
 */

ensureAdminApp();

const RequestBody = z.object({
  productId: Slug,
  contractRef: Slug,
  dataSourceId: Slug,
  datasetId: SqlIdentifier,
});

async function verifyAdmin(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return isDevAuthBypassEnabled() ? isAdminEmail(DEV_BYPASS_EMAIL) : false;
  }
  try {
    const decoded = await getAuth().verifyIdToken(authHeader.slice(7));
    return isAdminEmail(decoded.email ?? '');
  } catch {
    return false;
  }
}

interface ColumnRow { table_name: string; column_name: string; data_type: string }
interface ContractEntity { id: string; attributes: { id: string; type?: string }[] }

export async function POST(req: NextRequest) {
  try {
    if (!(await verifyAdmin(req))) {
      return NextResponse.json({ error: 'Apenas administradores.' }, { status: 403 });
    }

    const parsed = RequestBody.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Payload inválido', issues: parsed.error.issues }, { status: 400 });
    }
    const { productId, contractRef, dataSourceId, datasetId } = parsed.data;

    const product = await getProduct(productId);
    if (!product) {
      return NextResponse.json({ error: `Produto "${productId}" não encontrado.` }, { status: 404 });
    }

    const entities = await loadContractEntities(contractRef);
    if (entities.length === 0) {
      return NextResponse.json(
        { error: `O contrato "${contractRef}" não tem entidades/atributos. Configure o Data Contract antes de detectar.` },
        { status: 422 },
      );
    }

    const entityIds = entities.map((e) => safeIdentifier(e.id, 'table'));
    const safeDataset = safeDatasetRef(datasetId);
    const bq = await getBigQueryClientFor(dataSourceId);
    const [rows] = await bq.query({ query: buildColumnsQuery(safeDataset, entityIds) });
    const actualColumns = groupColumnsByTable(rows as ColumnRow[], entityIds);

    const schemaBindings = await detectWithGemini({ entities, actualColumns });
    const coverage = await computeCoverage(product.metricRefs ?? [], schemaBindings, contractRef);

    return NextResponse.json({ data: { contractRef, schemaBindings, actualColumns, coverage } });
  } catch (error) {
    console.error('[Schema Detect] Error', error);
    const message = error instanceof Error ? error.message : 'Erro interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── helpers ──────────────────────────────────────────────────────

async function loadContractEntities(contractRef: string): Promise<ContractEntity[]> {
  const db = getDb();
  const entitiesSnap = await db.collection('dataContracts').doc(contractRef).collection('entities').get();
  const out: ContractEntity[] = [];
  for (const eDoc of entitiesSnap.docs) {
    const attrsSnap = await db
      .collection('dataContracts').doc(contractRef)
      .collection('entities').doc(eDoc.id)
      .collection('attributes').get();
    const attributes = attrsSnap.docs
      .filter((d) => d.data()?.deprecated !== true)
      .map((d) => {
        const a = d.data() ?? {};
        return { id: d.id, type: typeof a.type === 'string' ? a.type : undefined };
      });
    if (attributes.length > 0) out.push({ id: eDoc.id, attributes });
  }
  return out;
}

function buildColumnsQuery(ds: { projectId?: string; datasetId: string }, tables: string[]): string {
  const ref = ds.projectId
    ? `\`${ds.projectId}.${ds.datasetId}.INFORMATION_SCHEMA.COLUMNS\``
    : `\`${ds.datasetId}.INFORMATION_SCHEMA.COLUMNS\``;
  const inList = tables.map((t) => `'${t}'`).join(', ');
  return `SELECT table_name, column_name, data_type FROM ${ref} WHERE table_name IN (${inList}) ORDER BY table_name, ordinal_position`;
}

function groupColumnsByTable(rows: ColumnRow[], tableIds: string[]): Record<string, { column_name: string; data_type: string }[]> {
  const grouped: Record<string, { column_name: string; data_type: string }[]> = {};
  for (const id of tableIds) grouped[id] = [];
  for (const row of rows) {
    if (row.table_name in grouped) grouped[row.table_name].push({ column_name: row.column_name, data_type: row.data_type });
  }
  return grouped;
}

async function detectWithGemini(params: {
  entities: ContractEntity[];
  actualColumns: Record<string, { column_name: string; data_type: string }[]>;
}): Promise<SemanticSchemaBinding> {
  const { entities, actualColumns } = params;
  const shape: Record<string, z.ZodObject<Record<string, z.ZodNullable<z.ZodString>>>> = {};
  for (const e of entities) {
    const fieldShape: Record<string, z.ZodNullable<z.ZodString>> = {};
    for (const a of e.attributes) fieldShape[a.id] = z.string().nullable();
    shape[e.id] = z.object(fieldShape);
  }
  const model = vertex('gemini-2.5-flash');
  const { object } = await generateObject({ model, schema: z.object(shape), prompt: buildPrompt(entities, actualColumns) });
  // Achata { entity: { attr: col } } → { "entity.attr": col }
  const flat: SemanticSchemaBinding = {};
  for (const [entityId, attrs] of Object.entries(object as Record<string, Record<string, string | null>>)) {
    for (const [attrId, col] of Object.entries(attrs)) flat[`${entityId}.${attrId}`] = col;
  }
  return flat;
}

function buildPrompt(
  entities: ContractEntity[],
  actualColumns: Record<string, { column_name: string; data_type: string }[]>,
): string {
  const actualText = Object.entries(actualColumns)
    .map(([t, cols]) => `Tabela "${t}":\n${cols.map((c) => `  - ${c.column_name} (${c.data_type})`).join('\n') || '  (nenhuma coluna)'}`)
    .join('\n\n');
  const expectedText = entities
    .map((e) => `Entidade "${e.id}":\n${e.attributes.map((a) => `  - ${a.id}${a.type ? ` (${a.type})` : ''}`).join('\n')}`)
    .join('\n\n');
  return `Você é um especialista em dados. Mapeie as colunas reais de um dataset BigQuery para os atributos esperados de cada entidade.
- Use apenas nomes de colunas que existam na lista de colunas reais.
- Se não houver correspondência clara, retorne null.
- Considere sinônimos e variações (dt_apuracao ↔ data_apuracao) e tipos compatíveis.

## Colunas reais encontradas:
${actualText}

## Atributos esperados (por entidade):
${expectedText}

Retorne o mapeamento estruturado conforme o schema.`;
}

async function computeCoverage(
  metricRefs: string[],
  schemaBindings: SemanticSchemaBinding,
  contractRef: string,
): Promise<CoverageGap[]> {
  if (metricRefs.length === 0) return [];
  const db = getDb();
  const requires = new Set<string>();
  for (const id of metricRefs) {
    try {
      const snap = await db.collection('metrics').doc(id).get();
      if (!snap.exists) continue;
      const reqs = snap.data()?.requires;
      if (Array.isArray(reqs)) for (const r of reqs) if (typeof r === 'string') requires.add(r);
    } catch { /* métrica ilegível ⇒ ignora (best-effort) */ }
  }
  const binding = { schemaBindings } as Parameters<typeof collectBindingGaps>[1];
  return collectBindingGaps([...requires], binding, contractRef);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run app/api/schema-detect/v2/__tests__/route.test.ts`
Expected: PASS (3 casos).

- [ ] **Step 5: Commit**

```bash
git add app/api/schema-detect/v2/route.ts app/api/schema-detect/v2/__tests__/route.test.ts
git commit -m "feat(schema-detect): endpoint contract-driven com saída flat + coverage (G7)"
```

---

## Task 2: Aplicar o binding detectado no `schemaBindings` + coverage advisory na UI

**Files:**
- Modify: `src/features/admin/ui/ClientForm.tsx` (`handleDetectBinding` retorna flat)
- Modify: `src/features/admin/ui/ProductBindingsEditor.tsx` (aplica binding + lastSync; render advisory de coverage)
- Test: novo `src/features/admin/ui/__tests__/ProductBindingsEditor.test.tsx` (ver Step 1)

> `SchemaMapEditor.tsx` **não muda** nesta task — o botão dispara `onDetect`; quem aplica o binding é o card pai (`ProductBindingsEditor`). A remoção do `LegacyEditor` dele fica na Task 3.

**Interfaces:**
- Consumes: response `{ data: { schemaBindings, coverage } }` (Task 1).
- Produces: `onDetectSchema(params) => Promise<{ schemaBindings: SemanticSchemaBinding; coverage: CoverageGap[] }>`; o card de dataset funde `schemaBindings` em `dataset.schemaBindings` via `onChange` e renderiza N gaps.

- [ ] **Step 1: Write the failing test** — criar `src/features/admin/ui/__tests__/ProductBindingsEditor.test.tsx`:

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProductBindingsEditor } from '../ProductBindingsEditor';

vi.mock('@/features/admin/model/useContractSchema', () => ({
  useContractSchema: () => ({
    schema: [{ entity: { id: 'contratos', label: 'Contratos' }, attributes: [{ id: 'saldo_devedor', type: 'float' }] }],
    loading: false, error: null, refetch: vi.fn(),
  }),
}));

const baseProduct = {
  id: 'prod', name: 'Prod', slug: 'prod', icon: 'box', color: '#fff', status: 'active',
  contractRefs: ['canonical'], entityRefs: ['contratos'], metricRefs: [], routes: [],
} as never;

function setup(onChange: (b: never) => void, onDetect: () => Promise<{ schemaBindings: Record<string, string | null>; coverage: unknown[] }>) {
  return render(
    <ProductBindingsEditor
      bindings={[{ productId: 'prod', datasets: [{ id: 'd1', dataSourceId: 'src', datasetId: 'ds', contractRef: 'canonical', schemaBindings: {}, isPrimary: true }] }] as never}
      onChange={onChange}
      products={[baseProduct]}
      dataSources={[{ id: 'src', name: 'Src' }] as never}
      onDetectSchema={onDetect}
    />,
  );
}

describe('ProductBindingsEditor — detect aplica schemaBindings', () => {
  it('funde o binding detectado no dataset via onChange', async () => {
    const onChange = vi.fn();
    const onDetect = vi.fn().mockResolvedValue({ schemaBindings: { 'contratos.saldo_devedor': 'vl_saldo' }, coverage: [] });
    setup(onChange, onDetect);
    fireEvent.click(screen.getByText(/Auto-detect with AI/i));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const next = onChange.mock.calls.at(-1)![0];
    expect(next[0].datasets[0].schemaBindings).toEqual({ 'contratos.saldo_devedor': 'vl_saldo' });
  });
});
```

> Se o `data-testid`/label do botão divergir, ajuste o seletor para o texto real renderizado pelo `SchemaMapEditor` (`Auto-detect with AI`).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/admin/ui/__tests__/ProductBindingsEditor.test.tsx`
Expected: FAIL — hoje o detect é descartado; `onChange` não recebe `schemaBindings`.

- [ ] **Step 3: Write minimal implementation**

(a) `ClientForm.tsx` — `handleDetectBinding` passa a retornar o objeto `{ schemaBindings, coverage }` e mandar `contractRef`:
```ts
  const handleDetectBinding = async (params: {
    productId: string;
    contractRef: string;
    dataSourceId: string;
    datasetId: string;
  }): Promise<{ schemaBindings: SemanticSchemaBinding; coverage: CoverageGap[] }> => {
    const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
    const token = await getFirebaseAuth().currentUser?.getIdToken();
    if (!token) throw new Error('Usuário não autenticado.');
    const res = await fetch('/api/schema-detect/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(params),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `Erro ${res.status}`);
    return { schemaBindings: body.data?.schemaBindings ?? {}, coverage: body.data?.coverage ?? [] };
  };
```
Imports a adicionar no topo do `ClientForm.tsx`:
```ts
import type { SemanticSchemaBinding } from '@/shared/schemas';
import type { CoverageGap } from '@/shared/lib/metrics/coverage';
```

(b) `ProductBindingsEditor.tsx` — atualizar a prop e a aplicação. Trocar a assinatura de `onDetectSchema`:
```ts
  onDetectSchema?: (params: {
    productId: string;
    contractRef: string;
    dataSourceId: string;
    datasetId: string;
  }) => Promise<{ schemaBindings: SemanticSchemaBinding; coverage: CoverageGap[] }>;
```
E, no card do dataset, aplicar o resultado (substituir o `onDetectSchema` arrow atual que descarta):
```ts
                    onDetectSchema={
                      onDetectSchema
                        ? async () => {
                            if (!dataset.dataSourceId || !dataset.datasetId) return;
                            const contractRef = dataset.contractRef ?? product.contractRefs?.[0] ?? 'canonical';
                            const { schemaBindings, coverage } = await onDetectSchema({
                              productId: binding.productId,
                              contractRef,
                              dataSourceId: dataset.dataSourceId,
                              datasetId: dataset.datasetId,
                            });
                            updateDataset(binding.productId, dIndex, {
                              schemaBindings,
                              lastSchemaSync: new Date().toISOString(),
                            });
                            return coverage;
                          }
                        : undefined
                    }
```
> `DatasetBindingCard.onDetectSchema` muda para `() => Promise<CoverageGap[] | void>`; `handleDetect` guarda os gaps em estado local (`const [gaps, setGaps] = useState<CoverageGap[]>([])`) e renderiza um aviso advisory abaixo do `SchemaMapEditor`:
> ```tsx
> {gaps.length > 0 && (
>   <p className="text-[11px] text-amber-300 mt-2">
>     {gaps.length} atributo(s) exigido(s) por métricas contratadas sem coluna mapeada.
>   </p>
> )}
> ```
> Imports: `import type { SemanticSchemaBinding } from '@/shared/schemas'; import type { CoverageGap } from '@/shared/lib/metrics/coverage';`.

(c) `SchemaMapEditor.tsx` — `onDetect` continua `() => Promise<void>` na assinatura visual, mas o card pai já aplica via `updateDataset`. **Nenhuma mudança de tipo necessária aqui** se o `onDetect` do card faz o trabalho (o botão só dispara). Mantém-se como está; a propagação acontece no `ProductBindingsEditor` (b).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/admin/ui/__tests__/ProductBindingsEditor.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/ui/ClientForm.tsx src/features/admin/ui/ProductBindingsEditor.tsx src/features/admin/ui/__tests__/ProductBindingsEditor.test.tsx
git commit -m "feat(admin): auto-detect aplica schemaBindings + coverage advisory (G7)"
```

---

## Task 3: Aposentar o legado (v1, EXPECTED_SCHEMA, expectedTables, modos legados)

**Files:**
- Delete: `app/api/schema-detect/route.ts`, `src/features/admin/ui/SchemaEditor.tsx`, `src/features/admin/ui/ExpectedTablesEditor.tsx`
- Modify: `src/features/admin/model/types.ts`, `src/shared/schemas/product.ts`, `src/features/admin/ui/ClientForm.tsx`, `src/features/admin/ui/SchemaMapEditor.tsx`, `src/features/admin/ui/ProductBindingsEditor.tsx`, `src/features/admin/ui/ProductForm.tsx`, `src/features/admin/ui/ProductsTab.tsx`, `src/widgets/product-switcher/ui/ProductSwitcher.tsx`, `src/features/admin/ui/index.ts`
- Modify (seeds/tests): `scripts/seed-play-product.mjs` (e similares com `expectedTables`), `src/widgets/nav-sidebar/ui/__tests__/TemplateGallery.test.tsx`, `src/shared/repositories/__tests__/client-semantic-context.test.ts`

**Interfaces:**
- Produces: nenhuma referência a `EXPECTED_SCHEMA`, `ExpectedTable` (de product.ts e de model/types.ts), `product.expectedTables`, `client.schema` (modo legado), ou `/api/schema-detect` (v1) no código.

- [ ] **Step 1: Baseline verde + nota de TDD**

Esta task é **remoção de código** — exceção legítima ao teste-primeiro de produção. A rede de segurança é: a suíte + `tsc --noEmit` continuam verdes após a remoção, e um `grep` de regressão retorna zero ocorrências do legado (Step 6). Antes de começar, rode o escopo para confirmar o baseline verde:

Run: `pnpm exec vitest run src/features/admin app/api/schema-detect` → anote o estado atual (deve estar verde após Tasks 1–2).

- [ ] **Step 2: Remover do schema e dos modelos**

(a) `src/shared/schemas/product.ts`: remover `ExpectedField`, `ExpectedTable` (const + type export) e o campo `expectedTables` de `ProductDoc`. Manter `FieldType` se usado por outros (grep antes; se órfão, remover também).

(b) `src/features/admin/model/types.ts`: remover `EXPECTED_SCHEMA` (const), `export type ExpectedTable`, `ClientSchema` (type) e o campo `schema?: ClientSchema | null` de `ClientDoc` (com o `dataset?` legado — manter `dataset?` se ainda referenciado por outros; grep). 

- [ ] **Step 3: Deletar arquivos órfãos e remover modos legados**

(a) Deletar `app/api/schema-detect/route.ts`, `src/features/admin/ui/SchemaEditor.tsx`, `src/features/admin/ui/ExpectedTablesEditor.tsx`. Remover o export de `ExpectedTablesEditor` em `src/features/admin/ui/index.ts`.

(b) `SchemaMapEditor.tsx`: remover `LegacyEditor` (função + render), as props `legacyTables`/`legacySchema`/`onChangeLegacy`, o import de `ExpectedTable`/`BindingSchemaMap` e o fallback "modo legado". O componente passa a renderizar só `SemanticEditor` (ou o empty-state quando o contrato não tem entidades).

(c) `ProductBindingsEditor.tsx`: remover `legacyTables={product.expectedTables}`, `legacySchema={dataset.schema}`, `onChangeLegacy`.

(d) `ClientForm.tsx`: remover `type Mode`/`mode`/`setMode`, `ModeButton`, o toggle, `handleDetectLegacy`, `legacySchema`/`setLegacySchema`, o import de `SchemaEditor` e de `ClientSchema`/`BindingSchemaMap`, o ramo `mode==='legacy'` do `handleSave` (e o `payload.dataset`/`payload.schema`). O form passa a renderizar sempre o `ProductBindingsEditor`. `handleSave` exige `bindings.length > 0`.

- [ ] **Step 4: Remover consumidores de contagem `expectedTables`**

(a) `src/widgets/product-switcher/ui/ProductSwitcher.tsx:148` — trocar `product.entityRefs?.length ?? product.expectedTables.length` por `product.entityRefs?.length ?? 0`.

(b) `src/features/admin/ui/ProductsTab.tsx:202` — trocar `(p.entityRefs?.length ?? 0) || p.expectedTables.length` por `(p.entityRefs?.length ?? 0)`.

(c) `src/features/admin/ui/ProductForm.tsx` — remover o ramo "produto legado" (`isLegacyProduct`/banner que cita `expectedTables`) e o `expectedTables: []` do payload de criação (linha ~125). O form passa a operar só com `entityRefs`/`contractRefs`/`metricRefs`.

- [ ] **Step 5: Atualizar seeds e testes que setam `expectedTables`**

(a) Remover `expectedTables` dos seeds (`scripts/seed-play-product.mjs` e quaisquer outros — grep `expectedTables` em `scripts/`).

(b) `src/widgets/nav-sidebar/ui/__tests__/TemplateGallery.test.tsx:58` e `src/shared/repositories/__tests__/client-semantic-context.test.ts:152` — remover a chave `expectedTables: []` dos fixtures de produto.

- [ ] **Step 6: Verificar (rede de segurança da remoção)**

Run: `pnpm exec tsc --noEmit` → 0 erros (nenhum import órfão).
Run (grep de regressão):
```bash
grep -rn "EXPECTED_SCHEMA\|expectedTables\|ExpectedTable\b\|schema-detect'" src app scripts | grep -v "schema-detect/v2"
```
Expected: zero ocorrências (fora do `/v2`).
Run: `pnpm exec vitest run` → sem novas falhas (mod. as 6 ambientais `invalid_rapt` pré-existentes).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(admin): aposentar schema-detect v1, EXPECTED_SCHEMA, expectedTables e modos legados (G7)"
```

---

## Verificação final (após Task 3)

- [ ] Suíte do escopo: `pnpm exec vitest run app/api/schema-detect/v2 src/features/admin/ui/__tests__` → verde.
- [ ] `npx eslint` nos arquivos tocados → 0 erros.
- [ ] `pnpm exec tsc --noEmit` → 0 erros.
- [ ] Suíte completa `pnpm exec vitest run` → só as 6 falhas ambientais pré-existentes (`invalid_rapt`), zero regressão nova.
- [ ] Finalizar com `superpowers:finishing-a-development-branch`.

## Fora deste plano
- **G9** — `/api/bigquery` fail-loud + guard `NEXT_PUBLIC_SEMANTIC_LAYER`.
- Popular dados da BRZ; R2 Admin UI; demais D2–D10; padronização de nomenclatura.
