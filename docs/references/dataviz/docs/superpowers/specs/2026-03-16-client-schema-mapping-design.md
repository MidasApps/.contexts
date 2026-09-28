# Client Schema Mapping Design

**Date:** 2026-03-16
**Status:** Approved

## Goal

Allow per-client configuration of BigQuery column mappings so the application handles datasets with different column structures. AI auto-detects mappings from actual BigQuery columns using structured output; admin reviews and adjusts.

## Problem

All 4 clients share the same application codebase but their BigQuery datasets have different column structures. Some clients lack certain columns, and some use different column names for the same data. Currently, queries assume a fixed schema, causing indicators to show zeros/nulls without explanation.

## Data Model

### Schema stored in Firestore client document

```typescript
// clients/{id}
{
  name: string;
  dataset: string;
  color: string;
  initial: string;
  schema?: ClientSchema | null;       // NEW
  lastSchemaSync?: Timestamp | null;   // NEW — when auto-detect last ran
}
```

### ClientSchema type

```typescript
// Map of: table name → { expected_field → real_column_name | null }
// null means the field does not exist in this client's dataset
// Missing field means same name as expected (backward-compatible)
type ClientSchema = Record<string, Record<string, string | null>>;
```

Example:
```json
{
  "contratos": {
    "valor_atraso": "valor_atraso",
    "saldo_devedor": "saldo_dev",
    "ltv_banco": null,
    "rating": "rating_liquid"
  },
  "pagamentos": {
    "valor_pago": "vl_pago",
    "data_pagamento": "dt_pgto"
  }
}
```

### Resolution rules

- Field mapped to `string` → use that column name in queries
- Field mapped to `null` → field does not exist, indicator shows empty state
- Field absent from mapping → assume same name as expected (backward-compat)
- `schema` absent or `null` on client → all fields assumed same name (backward-compat)

## Expected Fields Catalog

A constant `EXPECTED_SCHEMA` defines what fields the app expects per table:

```typescript
export const EXPECTED_SCHEMA: Record<string, { field: string; description: string }[]> = {
  contratos: [
    { field: 'id_contrato', description: 'ID do contrato' },
    { field: 'valor_atraso', description: 'Valor em atraso' },
    { field: 'saldo_devedor', description: 'Saldo devedor atual' },
    { field: 'saldo_nominal', description: 'Saldo nominal contratado' },
    { field: 'rating', description: 'Rating de risco' },
    { field: 'ltv_banco', description: 'Loan-to-Value do banco' },
    // ... all fields used by queries
  ],
  pagamentos: [ ... ],
  fluxo_caixa: [ ... ],
  // etc.
};
```

## AI Auto-Detect Flow

### Endpoint: `POST /api/schema-detect`

1. Receives `{ dataset: string }` from admin panel
2. Queries BigQuery `INFORMATION_SCHEMA.COLUMNS` for all tables in the dataset
3. Builds prompt with:
   - Actual BigQuery columns per table
   - Expected fields from `EXPECTED_SCHEMA`
   - Instruction to map or return null
4. Calls Vertex AI (same `@ai-sdk/google-vertex` already used by AI sidebar) with structured output (JSON schema)
5. Returns suggested mapping

### AI Prompt Structure

```
You are a database schema mapper. Given the actual BigQuery columns and the expected application fields, produce a mapping.

For each expected field, find the best matching BigQuery column based on name similarity and description. If no match exists, map to null.

Actual columns in table "contratos": id, vl_atraso, saldo_dev, saldo_nom, ...
Expected fields: valor_atraso (Valor em atraso), saldo_devedor (Saldo devedor atual), ...

Return JSON: { "contratos": { "valor_atraso": "vl_atraso", "saldo_devedor": "saldo_dev", ... } }
```

### Structured Output Schema

```typescript
// Vertex AI generateObject schema
z.record(                           // table name
  z.record(                         // expected field name
    z.string().nullable()           // real column name or null
  )
)
```

## Runtime Query Translation

### Hook: useClientSchema

```typescript
function useClientSchema() {
  // Reads schema from active client's Firestore doc (already loaded by useClients)
  return {
    resolveField(table: string, field: string): string | null,
    hasField(table: string, field: string): boolean,
    schema: ClientSchema | null,
  };
}
```

### BigQuery query layer

In `src/shared/lib/bigquery/queries.ts`, each query function receives the schema and translates field names:

```typescript
function resolveColumn(schema: ClientSchema | null, table: string, field: string): string | null {
  if (!schema) return field; // no schema = assume same names
  const tableSchema = schema[table];
  if (!tableSchema) return field; // table not in schema = assume same names
  if (!(field in tableSchema)) return field; // field not mapped = assume same name
  return tableSchema[field]; // string = real name, null = doesn't exist
}
```

Queries skip fields that resolve to `null` and alias fields with different names:

```sql
-- If saldo_devedor maps to "saldo_dev" and ltv_banco maps to null:
SELECT saldo_dev AS saldo_devedor, valor_atraso FROM contratos
-- ltv_banco omitted from SELECT
```

## Empty State for Unavailable Indicators

When a field required by an indicator is `null` in the schema, the indicator shows an empty state instead of broken data.

### IndicatorGuard enhancement

`IndicatorGuard` gains a new check: if the indicator's required fields are not available for the active client's schema, render empty state regardless of permissions.

```tsx
// New state in IndicatorGuard:
if (!hasRequiredFields(id)) {
  return (
    <div className="empty-state">
      <DatabaseIcon />
      <p>Dados não disponíveis para este cliente</p>
    </div>
  );
}
```

### Indicator → Required Fields mapping

Extend `ALL_INDICATORS` with a `requiredFields` property:

```typescript
{
  id: 'dashboard.valor_atraso',
  label: 'Valor em Atraso',
  page: 'Visão Geral',
  type: 'kpi',
  requiredFields: [{ table: 'contratos', field: 'valor_atraso' }],
}
```

## Admin UI

### Client Form — Schema Section

In the client edit dialog, new "Schema de Dados" section:

- **"Detectar Schema com IA" button** — calls `/api/schema-detect`, shows loading spinner, populates the editor with suggested mappings
- **Editable table per BigQuery table**:
  - Left column: expected field name + description
  - Right column: text input with real column name, or toggle to mark as null (não disponível)
- **"Última sincronização" badge** — shows `lastSchemaSync` timestamp
- **Save** — stores schema in Firestore client doc

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/features/admin/model/types.ts` | Modify | Add `ClientSchema`, `EXPECTED_SCHEMA`, update `ClientDoc`, extend `ALL_INDICATORS` with `requiredFields` |
| `app/api/schema-detect/route.ts` | Create | INFORMATION_SCHEMA query + Vertex AI structured output |
| `src/shared/hooks/useClientSchema.ts` | Create | `resolveField`, `hasField` from active client schema |
| `src/shared/lib/bigquery/queries.ts` | Modify | Use schema mapping in all query functions |
| `src/features/admin/ui/ClientForm.tsx` | Modify | Add schema editor section with AI detect button |
| `src/features/admin/ui/SchemaEditor.tsx` | Create | Editable schema mapping table component |
| `src/shared/ui/indicator-guard.tsx` | Modify | Add required fields check + empty state for missing data |
| `src/shared/stores/app-store.ts` | Modify | Include schema in `ClientConfig` |
| `app/api/clients/route.ts` | Modify | Return schema field in client data |

## Non-Goals

- Automatic schema migration or BigQuery table modification
- Per-query field override (schema is per-client, not per-query)
- Schema versioning or history
