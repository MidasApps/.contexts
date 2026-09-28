/**
 * Utilities for resolving expected field names to actual BigQuery column names
 * using per-client schema mapping.
 */

import type { ClientSchema } from '@/features/admin/model/types';

const SAFE_COLUMN_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Validate that a column name is safe for SQL interpolation */
function sanitizeColumn(col: string, fallback: string): string {
  if (!col || !SAFE_COLUMN_RE.test(col)) return fallback;
  return col;
}

/**
 * Resolve an expected field name to the actual BigQuery column name.
 * Returns null if the field is explicitly mapped as unavailable.
 * Returns the original field name if no schema or no mapping exists (backward-compat).
 * Sanitizes output to prevent SQL injection.
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
  const mapped = tableSchema[field];
  if (mapped === null) return null;
  return sanitizeColumn(mapped, field);
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

/**
 * Erro fail-loud (G9): campo explicitamente marcado indisponível (mapping `null`)
 * foi requerido por uma agregação. Substitui o antigo fallback silencioso `'0'`.
 */
export class FieldUnavailableError extends Error {
  constructor(public readonly table: string, public readonly field: string) {
    super(`Campo indisponível para este cliente: ${table}.${field}`);
    this.name = 'FieldUnavailableError';
  }
}

/**
 * Como `resolveColumn`, mas lança `FieldUnavailableError` quando o campo está
 * mapeado para `null` (indisponível). Sem schema / sem mapping ⇒ nome canônico.
 */
export function resolveColumnOrThrow(
  schema: ClientSchema | null | undefined,
  table: string,
  field: string,
): string {
  const resolved = resolveColumn(schema, table, field);
  if (resolved === null) throw new FieldUnavailableError(table, field);
  return resolved;
}
