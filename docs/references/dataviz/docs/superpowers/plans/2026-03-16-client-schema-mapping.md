# Client Schema Mapping Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-client BigQuery column mapping with AI auto-detect so the app handles datasets with different column structures gracefully.

**Architecture:** Schema stored in Firestore client doc. AI reads INFORMATION_SCHEMA.COLUMNS and suggests mappings via Vertex AI structured output. Admin reviews in ClientForm. Queries translate field names at runtime. Indicators show empty state when required fields are null.

**Tech Stack:** Next.js 16, BigQuery, Vertex AI (gemini-2.5-flash), Firestore, Zustand, Zod, ai SDK

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/features/admin/model/types.ts` | Modify | Add `ClientSchema`, `EXPECTED_SCHEMA`, update `ClientDoc` |
| `src/shared/stores/app-store.ts` | Modify | Add `schema` to `ClientConfig` |
| `app/api/clients/route.ts` | Modify | Return `schema` and `lastSchemaSync` fields |
| `src/shared/hooks/useClients.ts` | Modify | Map schema from API response |
| `src/shared/lib/bigquery/schema-resolver.ts` | Create | `resolveColumn()` utility for query translation |
| `src/shared/lib/bigquery/queries.ts` | Modify | Use `resolveColumn()` in all queries |
| `app/api/schema-detect/route.ts` | Create | INFORMATION_SCHEMA + Vertex AI structured output |
| `src/features/admin/ui/SchemaEditor.tsx` | Create | Editable schema table component |
| `src/features/admin/ui/ClientForm.tsx` | Modify | Add schema section with AI detect button |
| `src/shared/ui/indicator-guard.tsx` | Modify | Add empty state for missing schema fields |
| `src/shared/hooks/useClientSchema.ts` | Create | `hasField()` for indicator empty state checks |

---

## Task 1: Types and EXPECTED_SCHEMA

**Files:**
- Modify: `src/features/admin/model/types.ts`

- [ ] **Step 1: Add ClientSchema type and EXPECTED_SCHEMA**

After the existing `ClientDoc` interface, add:

```typescript
// Schema mapping: table → { expected_field → real_column | null }
export type ClientSchema = Record<string, Record<string, string | null>>;

// All fields the application expects from BigQuery, grouped by table
export const EXPECTED_SCHEMA = {
  contratos: [
    { field: 'data_base_report', description: 'Data base do relatório (filtro de período)' },
    { field: 'id_contrato', description: 'Identificador do contrato' },
    { field: 'projeto', description: 'Nome do empreendimento' },
    { field: 'saldo_devedor', description: 'Saldo devedor atual' },
    { field: 'saldo_nominal', description: 'Saldo nominal contratado' },
    { field: 'valor_atraso', description: 'Valor em atraso' },
    { field: 'valor_imovel', description: 'Valor do imóvel' },
    { field: 'ltv', description: 'Loan-to-Value' },
    { field: 'dias_atraso', description: 'Dias em atraso' },
    { field: 'rating_liquid', description: 'Rating de risco Liquid' },
    { field: 'elegibilidade', description: 'Classificação de elegibilidade' },
    { field: 'faixa_ltv', description: 'Faixa de LTV' },
    { field: 'proponent_type', description: 'Tipo de proponente (PF/PJ)' },
    { field: 'grupos_repasse', description: 'Grupo de estratégia de repasse' },
    { field: 'valor_over_90', description: 'Valor com atraso > 90 dias' },
    { field: 'restricoes', description: 'Valor de restrições cadastrais' },
    { field: 'pricing', description: 'Valor de pricing' },
    { field: 'prazo_remanescente', description: 'Prazo remanescente em meses' },
    { field: 'prazo_decorrido', description: 'Prazo decorrido em meses' },
    { field: 'pdd_minimo_bacen', description: 'PDD mínimo regulatório Bacen' },
    { field: 'pdd_liquid', description: 'PDD calculado Liquid' },
    { field: 'delta_pdd', description: 'Delta entre PDD Liquid e Bacen' },
    { field: 'correcao_monetaria', description: 'Índice de correção monetária' },
    { field: 'renda_suficiente', description: 'Indicador de renda suficiente' },
    { field: 'limite_simulacao', description: 'Limite para simulação LTV' },
    { field: 'ltv_banco', description: 'LTV calculado pelo banco' },
    { field: 'ltv_banco_stress', description: 'LTV estressado' },
    { field: 'faixa_ltv_banco', description: 'Faixa de LTV banco' },
    { field: 'faixa_ltv_stress', description: 'Faixa de LTV estressado' },
    { field: 'nome_cliente', description: 'Nome do cliente' },
    { field: 'documento', description: 'CPF/CNPJ do cliente' },
    { field: 'unidade', description: 'Unidade do imóvel' },
    { field: 'data_emissao', description: 'Data de emissão do contrato' },
    { field: 'private_area', description: 'Área privativa do imóvel' },
    { field: 'tipo_restricao', description: 'Tipo de restrição cadastral' },
    { field: 'faixa_restricao', description: 'Faixa de valor de restrição' },
    { field: 'categoria_inadimplencia', description: 'Categoria de inadimplência' },
    { field: 'perfil_cobranca', description: 'Perfil de cobrança' },
  ],
  pagamentos: [
    { field: 'data_base_report', description: 'Data base do relatório' },
    { field: 'tipo_recebimento', description: 'Tipo de recebimento' },
    { field: 'valor_pago', description: 'Valor pago' },
  ],
  fluxo_caixa: [
    { field: 'data_base_fluxo', description: 'Data do fluxo' },
    { field: 'data_base_report', description: 'Data base do relatório' },
    { field: 'fluxo_esperado', description: 'Fluxo esperado' },
    { field: 'fluxo_contratado', description: 'Fluxo contratado' },
  ],
} as const;

export type ExpectedTable = keyof typeof EXPECTED_SCHEMA;
```

Update `ClientDoc` to include schema fields:

```typescript
export interface ClientDoc {
  name: string;
  dataset: string;
  color: string;
  initial: string;
  schema?: ClientSchema | null;           // NEW
  lastSchemaSync?: Timestamp | null;      // NEW
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/features/admin/model/types.ts
git commit -m "feat: add ClientSchema type and EXPECTED_SCHEMA catalog"
```

---

## Task 2: Propagate schema through client data flow

**Files:**
- Modify: `src/shared/stores/app-store.ts`
- Modify: `src/shared/hooks/useClients.ts`
- Modify: `app/api/clients/route.ts`

- [ ] **Step 1: Add schema to ClientConfig in app-store.ts**

```typescript
export interface ClientConfig {
  id: string;
  name: string;
  dataset: string;
  color: string;
  initial: string;
  schema?: Record<string, Record<string, string | null>> | null;  // NEW
}
```

- [ ] **Step 2: Update useClients.ts to map schema from API**

In the `mapped` array where clients are constructed, add `schema`:

```typescript
const mapped: ClientConfig[] = clients.map((data) => ({
  id: data.id as string,
  name: data.name as string,
  dataset: data.dataset as string,
  color: data.color as string,
  initial: data.initial as string,
  schema: (data.schema as ClientConfig['schema']) ?? null,  // NEW
}));
```

- [ ] **Step 3: Update /api/clients GET to return schema**

The GET handler reads from Firestore and returns client docs. The current code does `{ id: docSnap.id, ...docSnap.data() }` which already spreads all fields including `schema`. Verify this — if it selectively picks fields, add `schema` and `lastSchemaSync`.

- [ ] **Step 4: Verify build and commit**

```bash
npx tsc --noEmit
git add src/shared/stores/app-store.ts src/shared/hooks/useClients.ts app/api/clients/route.ts
git commit -m "feat: propagate schema through client data flow"
```

---

## Task 3: Schema resolver utility

**Files:**
- Create: `src/shared/lib/bigquery/schema-resolver.ts`

- [ ] **Step 1: Create the resolver**

```typescript
import type { ClientSchema } from '@/features/admin/model/types';

/**
 * Resolve an expected field name to the actual BigQuery column name.
 * Returns null if the field is explicitly mapped as unavailable.
 * Returns the original field name if no schema or no mapping exists (backward-compat).
 */
export function resolveColumn(
  schema: ClientSchema | null | undefined,
  table: string,
  field: string,
): string | null {
  if (!schema) return field;
  const tableSchema = schema[table];
  if (!tableSchema) return field;
  if (!(field in tableSchema)) return field;
  return tableSchema[field]; // string = real name, null = doesn't exist
}

/**
 * Build a SELECT field expression, aliasing if the real name differs.
 * Returns null if the field doesn't exist in the schema.
 */
export function selectField(
  schema: ClientSchema | null | undefined,
  table: string,
  field: string,
): string | null {
  const real = resolveColumn(schema, table, field);
  if (real === null) return null;
  if (real === field) return field;
  return `${real} AS ${field}`;
}

/**
 * Build a SELECT clause from a list of expected fields, skipping nulls.
 */
export function buildSelect(
  schema: ClientSchema | null | undefined,
  table: string,
  fields: string[],
): string {
  const selected = fields
    .map((f) => selectField(schema, table, f))
    .filter((f): f is string => f !== null);
  return selected.join(', ');
}

/**
 * Check if a field exists for this client.
 */
export function hasField(
  schema: ClientSchema | null | undefined,
  table: string,
  field: string,
): boolean {
  return resolveColumn(schema, table, field) !== null;
}
```

- [ ] **Step 2: Verify build and commit**

```bash
npx tsc --noEmit
git add src/shared/lib/bigquery/schema-resolver.ts
git commit -m "feat: create schema resolver utility for BigQuery field translation"
```

---

## Task 4: Integrate schema into BigQuery queries

**Files:**
- Modify: `src/shared/lib/bigquery/queries.ts`
- Modify: `app/api/bigquery/route.ts`

This is the most impactful task. The `schema` must be passed from the API route into each query function. The approach:

1. The `/api/bigquery` route already receives `dataset` — it will also lookup the client's schema from Firestore
2. Each query function gets an optional `schema` parameter
3. Fields are resolved using `resolveColumn()` before building SQL

- [ ] **Step 1: Load schema in /api/bigquery route**

In `app/api/bigquery/route.ts`, after the `canAccessDataset` check, load the client's schema:

```typescript
// After line ~96 (after canAccessDataset check), add:
let clientSchema: Record<string, Record<string, string | null>> | null = null;
if (dataset) {
  const db = FIRESTORE_DATABASE_ID ? getFirestore(FIRESTORE_DATABASE_ID) : getFirestore();
  const clientsSnap = await db.collection('clients').where('dataset', '==', dataset).limit(1).get();
  if (!clientsSnap.empty) {
    const clientData = clientsSnap.docs[0].data();
    clientSchema = (clientData.schema as typeof clientSchema) ?? null;
  }
}
```

Then pass `clientSchema` as the last argument to each query function call in the switch statement.

- [ ] **Step 2: Add schema parameter to query functions**

In `queries.ts`, add `schema?: ClientSchema | null` as the last parameter to the key query functions:

- `queryFilterOptions(dataset, schema)` — resolve `data_base_report` and `projeto`
- `queryContratosAggregated(dataBase, projeto, advancedFilters, dataset, schema)`
- `queryContratosPage(...)`
- `queryPagamentosEvolucao(...)`
- `queryFluxoCaixa(...)`
- `queryElegibilidadePage(...)`
- `queryPricingPage(...)`
- `queryPddPage(...)`
- `querySimulacaoPage(...)`
- `queryRepassePage(...)`
- `queryDashboardFaixaAtraso(...)`
- `queryDetalhamento(...)`
- `queryKpiHistory(...)`

For each function, use `resolveColumn(schema, 'contratos', 'field_name')` to translate field names in SQL. Where a field resolves to `null`, omit it from the SELECT and handle gracefully.

**Important**: Start with `queryFilterOptions` as the simplest example, then apply the pattern to others incrementally.

- [ ] **Step 3: Update queryFilterOptions to use schema**

```typescript
import { resolveColumn } from './schema-resolver';
import type { ClientSchema } from '@/features/admin/model/types';

export async function queryFilterOptions(dataset?: string, schema?: ClientSchema | null) {
  const bq = getBigQueryClient();

  const dateField = resolveColumn(schema, 'contratos', 'data_base_report') ?? 'data_base_report';
  const projetoField = resolveColumn(schema, 'contratos', 'projeto');

  const datesSql = `
    SELECT DISTINCT ${dateField} AS data_base_report
    FROM ${formatTableRef(dataset, 'contratos')}
    WHERE ${dateField} IS NOT NULL
    ORDER BY ${dateField} DESC
  `;

  // Only query projetos if the field exists
  const projetosSql = projetoField ? `
    SELECT DISTINCT ${projetoField} AS projeto
    FROM ${formatTableRef(dataset, 'contratos')}
    WHERE ${projetoField} IS NOT NULL AND ${projetoField} != ''
    ORDER BY ${projetoField}
  ` : null;

  const [dateRows, projetoRows] = await Promise.all([
    bq.query({ query: datesSql }).then(([rows]) => rows as Array<{ data_base_report: Date | string }>),
    projetosSql
      ? bq.query({ query: projetosSql }).then(([rows]) => rows as Array<{ projeto: string }>)
      : Promise.resolve([] as Array<{ projeto: string }>),
  ]);

  // ... rest of date parsing (already fixed for BigQueryDate objects)
}
```

- [ ] **Step 4: Apply pattern to remaining query functions**

For each query function, the pattern is:
1. Add `schema?: ClientSchema | null` as last parameter
2. Resolve field names at the top of the function using `resolveColumn()`
3. Use resolved names in SQL strings
4. Skip fields that resolve to `null` where appropriate

This is mechanical work — repeat for all query functions. Focus on correctness: if a critical field like `saldo_devedor` is null, the query should still work (just return 0/null for that column).

- [ ] **Step 5: Update /api/bigquery switch to pass schema**

Pass `clientSchema` to each query function call:

```typescript
case 'filter_options':
  result = await queryFilterOptions(dataset, clientSchema);
  break;
case 'contratos_aggregated':
  result = await queryContratosAggregated(params.dataBase, params.projeto, params.advancedFilters, dataset, clientSchema);
  break;
// ... etc for all cases
```

- [ ] **Step 6: Verify build and commit**

```bash
npx tsc --noEmit
git add src/shared/lib/bigquery/queries.ts app/api/bigquery/route.ts
git commit -m "feat: integrate schema mapping into BigQuery queries"
```

---

## Task 5: Schema auto-detect API with Vertex AI

**Files:**
- Create: `app/api/schema-detect/route.ts`

- [ ] **Step 1: Create the API endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { isAdminEmail } from '@/shared/lib/runtime-config';
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';
import { EXPECTED_SCHEMA } from '@/features/admin/model/types';
import { generateObject } from 'ai';
import { vertex } from '@ai-sdk/google-vertex';
import { z } from 'zod';

// Ensure Firebase Admin is initialized (same pattern as other routes)
if (getApps().length === 0) {
  if (process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  } else {
    initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
  }
}

async function verifyAdmin(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  try {
    const decoded = await getAuth().verifyIdToken(authHeader.slice(7));
    return isAdminEmail(decoded.email ?? '');
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdmin(req))) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const { dataset } = await req.json();
  if (!dataset) {
    return NextResponse.json({ error: 'Dataset é obrigatório' }, { status: 400 });
  }

  try {
    const bq = getBigQueryClient();
    const { projectId, datasetId } = parseDatasetRef(dataset);

    // 1. Get actual columns from BigQuery
    const sql = `
      SELECT table_name, column_name, data_type
      FROM \`${projectId}.${datasetId}.INFORMATION_SCHEMA.COLUMNS\`
      WHERE table_name IN ('contratos', 'pagamentos', 'fluxo_caixa')
      ORDER BY table_name, ordinal_position
    `;
    const [rows] = await bq.query({ query: sql });

    const actualColumns: Record<string, string[]> = {};
    for (const row of rows as Array<{ table_name: string; column_name: string }>) {
      if (!actualColumns[row.table_name]) actualColumns[row.table_name] = [];
      actualColumns[row.table_name].push(row.column_name);
    }

    // 2. Build prompt for AI
    const prompt = buildPrompt(actualColumns);

    // 3. Call Vertex AI with structured output
    const model = vertex('gemini-2.5-flash');
    const schemaZod = buildZodSchema();

    const { object } = await generateObject({
      model,
      schema: schemaZod,
      prompt,
    });

    return NextResponse.json({ data: { schema: object, actualColumns } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao detectar schema';
    console.error('[Schema Detect Error]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function buildPrompt(actualColumns: Record<string, string[]>): string {
  const lines: string[] = [
    'Você é um mapeador de schema de banco de dados para uma aplicação de securitização de crédito imobiliário.',
    'Dado as colunas reais do BigQuery e os campos esperados pela aplicação, produza um mapeamento.',
    'Para cada campo esperado, encontre a coluna do BigQuery que melhor corresponde com base no nome e descrição.',
    'Se não houver correspondência, mapeie para null.',
    '',
    '## Colunas reais no BigQuery:',
  ];

  for (const [table, columns] of Object.entries(actualColumns)) {
    lines.push(`\n### Tabela: ${table}`);
    lines.push(columns.join(', '));
  }

  lines.push('\n## Campos esperados pela aplicação:');
  for (const [table, fields] of Object.entries(EXPECTED_SCHEMA)) {
    lines.push(`\n### Tabela: ${table}`);
    for (const f of fields) {
      lines.push(`- ${f.field}: ${f.description}`);
    }
  }

  lines.push('\n## Regras:');
  lines.push('- Se o nome da coluna real é idêntico ao campo esperado, mapeie diretamente (ex: "valor_atraso" → "valor_atraso")');
  lines.push('- Se o nome é diferente mas representa o mesmo dado, mapeie (ex: "vl_atraso" → "valor_atraso" mapeia campo "valor_atraso" para coluna "vl_atraso")');
  lines.push('- Se não existe coluna correspondente, mapeie para null');

  return lines.join('\n');
}

function buildZodSchema() {
  const tableSchemas: Record<string, z.ZodType> = {};
  for (const [table, fields] of Object.entries(EXPECTED_SCHEMA)) {
    const fieldSchemas: Record<string, z.ZodType> = {};
    for (const f of fields) {
      fieldSchemas[f.field] = z.string().nullable().describe(f.description);
    }
    tableSchemas[table] = z.object(fieldSchemas);
  }
  return z.object(tableSchemas);
}
```

- [ ] **Step 2: Verify build and commit**

```bash
npx tsc --noEmit
git add app/api/schema-detect/route.ts
git commit -m "feat: create schema-detect API with Vertex AI structured output"
```

---

## Task 6: Schema Editor component

**Files:**
- Create: `src/features/admin/ui/SchemaEditor.tsx`

- [ ] **Step 1: Create the editor component**

A table per BigQuery table showing expected fields with editable real column names. Each row has: expected field name, description, text input for real column, and a toggle for null (não disponível).

Follow the same styling patterns as `RouteCheckboxGrid.tsx` and `IndicatorCheckboxGrid.tsx`.

```tsx
'use client';

import { useState } from 'react';
import { EXPECTED_SCHEMA, type ClientSchema, type ExpectedTable } from '@/features/admin/model/types';
import { cn } from '@/shared/lib/utils';
import { Check, X, Loader2, Sparkles } from 'lucide-react';

interface SchemaEditorProps {
  schema: ClientSchema;
  onChange: (schema: ClientSchema) => void;
  onDetect: () => Promise<void>;
  detecting: boolean;
  lastSync?: string | null;
}

export function SchemaEditor({ schema, onChange, onDetect, detecting, lastSync }: SchemaEditorProps) {
  const tables = Object.keys(EXPECTED_SCHEMA) as ExpectedTable[];

  const getValue = (table: string, field: string): string | null => {
    return schema[table]?.[field] ?? field; // default = same name
  };

  const setValue = (table: string, field: string, value: string | null) => {
    onChange({
      ...schema,
      [table]: {
        ...schema[table],
        [field]: value,
      },
    });
  };

  const toggleNull = (table: string, field: string) => {
    const current = getValue(table, field);
    setValue(table, field, current === null ? field : null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] text-white/50 uppercase tracking-wider">Schema de Dados</p>
          {lastSync && (
            <p className="text-[10px] text-white/30 mt-0.5">Última detecção: {lastSync}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onDetect}
          disabled={detecting}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors',
            'border-[#F3A169]/30 bg-[#F3A169]/10 text-[#F3A169] hover:bg-[#F3A169]/20',
            detecting && 'opacity-50 cursor-not-allowed'
          )}
        >
          {detecting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          {detecting ? 'Detectando...' : 'Detectar com IA'}
        </button>
      </div>

      {/* Tables */}
      {tables.map((table) => {
        const fields = EXPECTED_SCHEMA[table];
        return (
          <div key={table} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">{table}</span>
              <span className="text-[10px] text-white/25">{fields.length} campos</span>
            </div>
            <div className="rounded-lg border border-white/[0.08] overflow-hidden">
              <div className="grid grid-cols-[1fr_1fr_40px] gap-0 text-[10px] text-white/40 uppercase tracking-wider bg-white/[0.02] px-3 py-2 border-b border-white/[0.06]">
                <span>Campo esperado</span>
                <span>Coluna BigQuery</span>
                <span></span>
              </div>
              {fields.map((f) => {
                const value = getValue(table, f.field);
                const isNull = value === null;
                return (
                  <div
                    key={f.field}
                    className={cn(
                      'grid grid-cols-[1fr_1fr_40px] gap-0 items-center px-3 py-1.5 border-b border-white/[0.04] last:border-0',
                      isNull && 'bg-red-500/[0.03]'
                    )}
                  >
                    <div className="min-w-0">
                      <p className={cn('text-xs truncate', isNull ? 'text-white/30 line-through' : 'text-white/70')}>
                        {f.field}
                      </p>
                      <p className="text-[10px] text-white/25 truncate">{f.description}</p>
                    </div>
                    <div>
                      {isNull ? (
                        <span className="text-[11px] text-red-400/60 italic">não disponível</span>
                      ) : (
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => setValue(table, f.field, e.target.value || f.field)}
                          className="w-full bg-transparent text-xs text-white/60 border-b border-white/[0.08] focus:border-[#F3A169]/40 outline-none py-0.5 font-mono"
                        />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleNull(table, f.field)}
                      className={cn(
                        'flex items-center justify-center h-6 w-6 rounded transition-colors mx-auto',
                        isNull
                          ? 'text-red-400/60 hover:bg-red-400/10'
                          : 'text-green-400/40 hover:bg-green-400/10'
                      )}
                      title={isNull ? 'Marcar como disponível' : 'Marcar como não disponível'}
                    >
                      {isNull ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify build and commit**

```bash
npx tsc --noEmit
git add src/features/admin/ui/SchemaEditor.tsx
git commit -m "feat: create SchemaEditor component for admin panel"
```

---

## Task 7: Integrate SchemaEditor into ClientForm

**Files:**
- Modify: `src/features/admin/ui/ClientForm.tsx`

- [ ] **Step 1: Add schema state and detection logic**

Read `ClientForm.tsx` first. Add:

```typescript
import { SchemaEditor } from './SchemaEditor';
import type { ClientSchema } from '@/features/admin/model/types';

// New state in the component:
const [schema, setSchema] = useState<ClientSchema>({});
const [detecting, setDetecting] = useState(false);
const [lastSync, setLastSync] = useState<string | null>(null);
```

In the `useEffect` that loads client data on open:
```typescript
if (client) {
  // ... existing fields ...
  setSchema(client.schema ?? {});
  setLastSync(client.lastSchemaSync ? new Date(client.lastSchemaSync).toLocaleString('pt-BR') : null);
} else {
  // ... existing resets ...
  setSchema({});
  setLastSync(null);
}
```

Note: The `Client` runtime type extends `ClientDoc` minus timestamps, so it needs to include `schema` and `lastSchemaSync`. Verify this.

- [ ] **Step 2: Add detect handler**

```typescript
const handleDetect = async () => {
  if (!dataset.trim()) return;
  setDetecting(true);
  try {
    const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
    const auth = getFirebaseAuth();
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch('/api/schema-detect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ dataset: dataset.trim() }),
    });
    const body = await res.json();
    if (res.ok && body.data?.schema) {
      setSchema(body.data.schema);
      setLastSync(new Date().toLocaleString('pt-BR'));
    }
  } catch (err) {
    console.error('Schema detection failed:', err);
  } finally {
    setDetecting(false);
  }
};
```

- [ ] **Step 3: Add SchemaEditor to the form JSX**

After the color picker section, add:

```tsx
{/* Schema */}
<SchemaEditor
  schema={schema}
  onChange={setSchema}
  onDetect={handleDetect}
  detecting={detecting}
  lastSync={lastSync}
/>
```

- [ ] **Step 4: Include schema in save payload**

Update `handleSave` to include schema in the body sent to `/api/clients`:

```typescript
const body = {
  id: generatedId,
  name: nome.trim(),
  dataset: dataset.trim(),
  color: cor,
  initial: inicial.trim(),
  schema: Object.keys(schema).length > 0 ? schema : null,
};
```

- [ ] **Step 5: Verify build and commit**

```bash
npx tsc --noEmit
git add src/features/admin/ui/ClientForm.tsx
git commit -m "feat: integrate SchemaEditor into ClientForm with AI detection"
```

---

## Task 8: useClientSchema hook + IndicatorGuard empty state

**Files:**
- Create: `src/shared/hooks/useClientSchema.ts`
- Modify: `src/shared/ui/indicator-guard.tsx`

- [ ] **Step 1: Create useClientSchema hook**

```typescript
'use client';

import { useCallback } from 'react';
import { useAppStore } from '@/shared/stores/app-store';
import { hasField as checkField } from '@/shared/lib/bigquery/schema-resolver';

export function useClientSchema() {
  const activeClientId = useAppStore((s) => s.activeClientId);
  const clients = useAppStore((s) => s.clients);

  const activeClient = clients.find((c) => c.id === activeClientId);
  const schema = activeClient?.schema ?? null;

  const hasField = useCallback(
    (table: string, field: string): boolean => {
      return checkField(schema, table, field);
    },
    [schema],
  );

  return { schema, hasField };
}
```

- [ ] **Step 2: Add requiredFields to indicator definitions**

This is optional but very useful. Add a `requiredFields` property to select indicators in `ALL_INDICATORS`. For now, add it to the most important KPI indicators. The type:

```typescript
// In types.ts, update indicator entries that need schema checks:
{ id: 'dashboard.valor_atraso', ..., requiredFields: [{ table: 'contratos', field: 'valor_atraso' }] },
```

This can be done incrementally — only add `requiredFields` where the mapping is clear.

- [ ] **Step 3: Update IndicatorGuard with schema empty state**

```tsx
import { useClientSchema } from '@/shared/hooks/useClientSchema';
import { ALL_INDICATORS } from '@/features/admin/model/types';
import { Database } from 'lucide-react';

// Inside the component, after the existing permission checks:
const { hasField } = useClientSchema();

// After canAccessIndicator check, before rendering children:
const indicatorDef = ALL_INDICATORS.find((i) => i.id === id);
if (indicatorDef && 'requiredFields' in indicatorDef && indicatorDef.requiredFields) {
  const missingField = indicatorDef.requiredFields.find(
    (rf: { table: string; field: string }) => !hasField(rf.table, rf.field)
  );
  if (missingField) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
        <Database className="h-5 w-5 text-white/15" strokeWidth={1.5} />
        <p className="text-xs text-white/25">Dados não disponíveis para este cliente</p>
      </div>
    );
  }
}
```

- [ ] **Step 4: Verify build and commit**

```bash
npx tsc --noEmit
git add src/shared/hooks/useClientSchema.ts src/shared/ui/indicator-guard.tsx src/features/admin/model/types.ts
git commit -m "feat: add useClientSchema hook and IndicatorGuard schema empty state"
```

---

## Task 9: Update /api/clients POST to save schema

**Files:**
- Modify: `app/api/clients/route.ts`

- [ ] **Step 1: Include schema in the POST handler**

The POST body currently accepts `{ id, name, dataset, color, initial }`. Add `schema` and `lastSchemaSync`:

```typescript
const body = await req.json() as {
  id: string;
  name: string;
  dataset: string;
  color: string;
  initial: string;
  schema?: Record<string, Record<string, string | null>> | null;  // NEW
};

await ref.set({
  name: body.name,
  dataset: body.dataset,
  color: body.color,
  initial: body.initial,
  ...(body.schema !== undefined ? { schema: body.schema } : {}),
  ...(body.schema !== undefined ? { lastSchemaSync: now } : {}),
  updatedAt: now,
  ...(existing.exists ? {} : { createdAt: now }),
}, { merge: true });
```

- [ ] **Step 2: Verify build and commit**

```bash
npx tsc --noEmit
git add app/api/clients/route.ts
git commit -m "feat: save schema field in /api/clients POST"
```

---

## Verification

After all tasks:

- [ ] **Final build check**: `npx tsc --noEmit` passes
- [ ] **Manual test**: Admin panel → edit client → see Schema Editor
- [ ] **AI detect test**: Click "Detectar com IA" and verify mapping is suggested
- [ ] **Runtime test**: Verify dashboard still loads with data after query changes
