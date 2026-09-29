import { z } from 'zod';

/**
 * The slice of a Firestore `clients/{id}` document that `/api/filter-options`
 * reads to find the client of a dataset, the table behind its period filter and
 * the legacy per-client column map.
 *
 * Deliberately narrower than `ClientDoc` (`@/shared/schemas/client`): that one
 * is the write-side shape (slugs, SQL identifiers, `datasets.min(1)`), and
 * applying it here would reject documents that serve this route today.
 *
 * The schemas are split by consumer. The identity fields feed
 * `matchClientDataset`, which decides tenancy; the date-source maps feed only
 * `resolveDateSource`; the legacy column map feeds `queryFilterOptions` and the
 * `unavailableFields` of the response. `parseClientDoc` applies them element by element, so a
 * malformed map entry can never cost a client its match.
 */

// ── Matcher slice (tenancy) ─────────────────────────────────────────────────
export const LegacyDatasetEntrySchema = z.object({ dataset: z.string() });

export const DatasetIdentitySchema = z.object({
  dataSourceId: z.string().optional(),
  datasetId: z.string().optional(),
});

// ── Date-source slice (period filter only) ──────────────────────────────────
/** `entity.attribute` → physical column; `null` = attribute unavailable. */
export const SchemaBindingValueSchema = z.string().nullable();
/** entity → physical table. */
export const TableBindingValueSchema = z.string();

// ── Legacy column map (SQL columns + unavailableFields) ─────────────────────
/** field → physical column; `null` = field unavailable for this client. */
export const LegacyColumnValueSchema = z.string().nullable();
/** Type-only, like the schemas below: table → field → column. */
export const LegacyClientSchemaSchema = z.record(z.string(), z.record(z.string(), LegacyColumnValueSchema));

// Type-only (z.infer): `DatasetBindingSchema`, `ProductBindingSchema` and
// `ClientDatasetLookupSchema` below describe the RESULT of `parseClientDoc`.
// Never `.parse()` a raw document with them: a whole-document parse drops a
// field on any bad element and brings back the round-1 bug (valid siblings
// lost, clients unmatched). Raw documents go through `parseClientDoc`, which
// applies the leaf schemas per element and fails soft.
export const DatasetBindingSchema = DatasetIdentitySchema.extend({
  schemaBindings: z.record(z.string(), SchemaBindingValueSchema).optional(),
  tableBindings: z.record(z.string(), TableBindingValueSchema).optional(),
});

export const ProductBindingSchema = z.object({
  datasets: z.array(DatasetBindingSchema).optional(),
});

/** What `parseClientDoc` returns: only valid entries, no nulls. */
export const ClientDatasetLookupSchema = z.object({
  dataset: z.string().optional(),
  datasets: z.array(LegacyDatasetEntrySchema).optional(),
  productBindings: z.array(ProductBindingSchema).optional(),
  schema: LegacyClientSchemaSchema.optional(),
});

export type ClientDatasetLookup = z.infer<typeof ClientDatasetLookupSchema>;
export type DatasetBinding = z.infer<typeof DatasetBindingSchema>;
export type ProductBinding = z.infer<typeof ProductBindingSchema>;
export type LegacyClientSchema = z.infer<typeof LegacyClientSchemaSchema>;
