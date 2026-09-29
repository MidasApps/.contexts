import type { z } from 'zod';
import {
  DatasetIdentitySchema,
  LegacyColumnValueSchema,
  LegacyDatasetEntrySchema,
  SchemaBindingValueSchema,
  TableBindingValueSchema,
  type ClientDatasetLookup,
  type DatasetBinding,
  type LegacyClientSchema,
  type ProductBinding,
} from './client-doc.schema';

/** Paths of the entries dropped while parsing one document, e.g. `productBindings[1].datasets`. */
type DroppedPaths = string[];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Absent and `null` mean "not set"; any other invalid value is dropped and recorded. */
function parseValue<T>(value: unknown, schema: z.ZodType<T>, path: string, dropped: DroppedPaths): T | undefined {
  if (value === undefined || value === null) return undefined;
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  dropped.push(path);
  return undefined;
}

function parseObject(value: unknown, path: string, dropped: DroppedPaths): Record<string, unknown> | undefined {
  if (isPlainObject(value)) return value;
  dropped.push(path);
  return undefined;
}

/** Keeps every valid element; a malformed one is dropped on its own. */
function parseList<T>(
  value: unknown,
  path: string,
  dropped: DroppedPaths,
  parseItem: (item: unknown, itemPath: string) => T | undefined,
): T[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    dropped.push(path);
    return undefined;
  }
  return value.flatMap((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (item === undefined || item === null) {
      dropped.push(itemPath);
      return [];
    }
    const parsed = parseItem(item, itemPath);
    return parsed === undefined ? [] : [parsed];
  });
}

/** Keeps every valid map entry; a malformed value is dropped on its own. */
function parseRecord<T>(value: unknown, schema: z.ZodType<T>, path: string, dropped: DroppedPaths) {
  if (value === undefined || value === null) return undefined;
  const map = parseObject(value, path, dropped);
  if (!map) return undefined;
  const entries = Object.entries(map).flatMap(([key, entry]) => {
    const parsed = schema.safeParse(entry);
    if (parsed.success) return [[key, parsed.data] as const];
    dropped.push(`${path}.${key}`);
    return [];
  });
  return Object.fromEntries(entries);
}

function parseDatasetBinding(item: unknown, path: string, dropped: DroppedPaths): DatasetBinding | undefined {
  const raw = parseObject(item, path, dropped);
  if (!raw) return undefined;
  const { shape } = DatasetIdentitySchema;
  // Identity (tenancy) and date-source maps are parsed independently: a bad map
  // entry only degrades the period filter, it never removes the binding.
  return {
    dataSourceId: parseValue(raw.dataSourceId, shape.dataSourceId, `${path}.dataSourceId`, dropped),
    datasetId: parseValue(raw.datasetId, shape.datasetId, `${path}.datasetId`, dropped),
    schemaBindings: parseRecord(raw.schemaBindings, SchemaBindingValueSchema, `${path}.schemaBindings`, dropped),
    tableBindings: parseRecord(raw.tableBindings, TableBindingValueSchema, `${path}.tableBindings`, dropped),
  };
}

function parseProductBinding(item: unknown, path: string, dropped: DroppedPaths): ProductBinding | undefined {
  const raw = parseObject(item, path, dropped);
  if (!raw) return undefined;
  const datasets = parseList(raw.datasets, `${path}.datasets`, dropped, (binding, bindingPath) =>
    parseDatasetBinding(binding, bindingPath, dropped),
  );
  return datasets === undefined ? {} : { datasets };
}

/**
 * The legacy column map, per table and per column. A table that is not a map
 * (`null`, string, number, array) or a column that is neither a string nor
 * `null` is dropped on its own; the valid tables and columns are kept as is.
 */
function parseLegacySchema(value: unknown, dropped: DroppedPaths): LegacyClientSchema | undefined {
  if (value === undefined || value === null) return undefined;
  const map = parseObject(value, 'schema', dropped);
  if (!map) return undefined;
  const tables = Object.entries(map).flatMap(([table, columns]) => {
    const path = `schema.${table}`;
    if (!isPlainObject(columns)) {
      dropped.push(path);
      return [];
    }
    return [[table, parseRecord(columns, LegacyColumnValueSchema, path, dropped) ?? {}] as const];
  });
  return Object.fromEntries(tables);
}

const warnedDocuments = new Set<string>();

/** One structured line per client and dropped paths per process; values are never logged. */
function warnDroppedPaths(clientId: string, droppedPaths: DroppedPaths): void {
  const key = `${clientId}|${droppedPaths.join(',')}`;
  if (warnedDocuments.has(key)) return;
  warnedDocuments.add(key);
  console.warn(
    JSON.stringify({
      severity: 'WARNING',
      component: 'filter-options',
      message: 'client document has invalid entries; ignoring them',
      clientId,
      droppedPaths,
      ts: new Date().toISOString(),
    }),
  );
}

/**
 * Validates the fields of a client document that `/api/filter-options` reads,
 * failing soft per element.
 *
 * A malformed entry must not break a client that works today, nor the route for
 * every other client (the lookup scans all of them). So only the malformed
 * element is dropped: a `productBindings` item, a `datasets` item, or a single
 * `tableBindings`/`schemaBindings` entry, or a legacy `schema` table or column.
 * Valid siblings are kept, which is what keeps `matchClientDataset` answering as
 * it did on the raw document.
 */
export function parseClientDoc(clientId: string, raw: unknown): ClientDatasetLookup {
  const dropped: DroppedPaths = [];
  const doc = isPlainObject(raw) ? raw : {};
  const lookup: ClientDatasetLookup = {
    dataset: parseValue(doc.dataset, LegacyDatasetEntrySchema.shape.dataset, 'dataset', dropped),
    datasets: parseList(doc.datasets, 'datasets', dropped, (item, path) =>
      parseValue(item, LegacyDatasetEntrySchema, path, dropped),
    ),
    productBindings: parseList(doc.productBindings, 'productBindings', dropped, (item, path) =>
      parseProductBinding(item, path, dropped),
    ),
    schema: parseLegacySchema(doc.schema, dropped),
  };
  if (dropped.length > 0) warnDroppedPaths(clientId, dropped);
  return lookup;
}
