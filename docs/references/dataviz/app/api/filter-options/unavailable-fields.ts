import type { LegacyClientSchema } from './client-doc.schema';

/**
 * Fields the legacy column map marks as unavailable (`null`), in document order.
 * A field `null` in several tables is listed once per table, as before.
 */
export const listUnavailableFields = (schema: LegacyClientSchema | undefined): string[] =>
  Object.values(schema ?? {}).flatMap((columns) =>
    Object.entries(columns).flatMap(([field, column]) => (column === null ? [field] : [])),
  );
