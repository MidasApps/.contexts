import { z } from "zod";

/**
 * Reads the AI catalog (`docs/catalog/catalog.ai.json`, spec §8.2, decision
 * 0005) and applies the visibility rules the catalog tools rely on:
 * - a contract with a `permission` is visible only to principals holding it;
 *   one without a permission (shared core shapes) only to holders of
 *   `core.catalog.read` (decision 0024, amendment 2026-09-30);
 * - `sensitive` fields never reach the model (the generator already drops
 *   them; the reader drops them again, and their example keys, as defence in depth);
 * - `personal` fields are described, but their example values are redacted.
 */

export const REDACTED = "[redacted]";

/** Permission that makes contracts without their own `permission` visible. */
export const CATALOG_READ_PERMISSION = "core.catalog.read";

const PiiSchema = z.enum(["none", "personal", "sensitive"]);

const AiCatalogFieldSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  pii: PiiSchema,
  required: z.boolean(),
  ui: z.record(z.string(), z.unknown()).optional(),
  examples: z.array(z.unknown()).optional(),
});

const AiCatalogEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  context: z.string().min(1),
  kind: z.string().min(1),
  description: z.string(),
  pii: PiiSchema,
  tenancyScope: z.string().min(1),
  permission: z.string().min(1).optional(),
  relations: z.array(z.object({ field: z.string(), target: z.string(), type: z.string() })),
  fields: z.array(AiCatalogFieldSchema),
  examples: z.array(z.record(z.string(), z.unknown())),
});

const AiCatalogSchema = z.object({ catalogVersion: z.int(), contracts: z.array(AiCatalogEntrySchema) });

type AiCatalogEntry = z.infer<typeof AiCatalogEntrySchema>;

// Plain (mutable) shapes on purpose: they are the tools' output schema inputs.
export type AiEntitySummary = { id: string; name: string; context: string; kind: string; description: string };

export type AiFieldDescription = {
  name: string;
  description: string;
  pii: "none" | "personal";
  required: boolean;
  ui?: Record<string, unknown>;
  examples?: unknown[];
};

export type AiEntityDescription = AiEntitySummary & {
  pii: string;
  tenancyScope: string;
  permission?: string;
  fields: AiFieldDescription[];
  relations: { field: string; target: string; type: string }[];
  examples: Record<string, unknown>[];
};

export type AiEntityPage = { entities: AiEntitySummary[]; total: number; truncated: boolean };

export type AiCatalogReader = {
  readonly list: (args: { permissions: ReadonlySet<string>; query?: string; kind?: string; limit: number }) => AiEntityPage;
  /** @returns `undefined` when the contract is unknown or hidden (the caller cannot tell which). */
  readonly describe: (args: { id: string; permissions: ReadonlySet<string> }) => AiEntityDescription | undefined;
  readonly kinds: () => readonly string[];
};

/** Thrown at boot when the bundled catalog does not have the generator's shape (bug). */
export class InvalidAiCatalogError extends Error {
  readonly code = "INVALID_AI_CATALOG";

  constructor(options?: ErrorOptions) {
    super("catalog.ai.json does not match the AI catalog shape; run pnpm contracts:catalog", options);
    this.name = "InvalidAiCatalogError";
  }
}

// Fail-closed: a contract that names no permission still needs the catalog read grant.
const isVisible = (entry: AiCatalogEntry, permissions: ReadonlySet<string>): boolean =>
  permissions.has(entry.permission ?? CATALOG_READ_PERMISSION);

const summarize = (entry: AiCatalogEntry): AiEntitySummary => ({
  id: entry.id,
  name: entry.name,
  context: entry.context,
  kind: entry.kind,
  description: entry.description,
});

const describeField = (field: z.infer<typeof AiCatalogFieldSchema>): AiFieldDescription | undefined => {
  if (field.pii === "sensitive") return undefined;
  return {
    name: field.name,
    description: field.description,
    pii: field.pii,
    required: field.required,
    ...(field.ui === undefined ? {} : { ui: field.ui }),
    ...(field.pii === "none" && field.examples !== undefined ? { examples: field.examples } : {}),
  };
};

/** Example with every non-`none` value replaced (unknown keys too) and `sensitive` keys dropped. */
const redactExample = (
  example: Record<string, unknown>,
  fields: { readonly public: ReadonlySet<string>; readonly sensitive: ReadonlySet<string> },
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(example)
      .filter(([key]) => !fields.sensitive.has(key))
      .map(([key, value]) => [key, fields.public.has(key) ? value : REDACTED]),
  );

const fieldNamesWith = (entry: AiCatalogEntry, pii: z.infer<typeof PiiSchema>): ReadonlySet<string> =>
  new Set(entry.fields.filter((field) => field.pii === pii).map((field) => field.name));

const describeEntry = (entry: AiCatalogEntry): AiEntityDescription => {
  const fields = { public: fieldNamesWith(entry, "none"), sensitive: fieldNamesWith(entry, "sensitive") };
  return {
    ...summarize(entry),
    pii: entry.pii,
    tenancyScope: entry.tenancyScope,
    ...(entry.permission === undefined ? {} : { permission: entry.permission }),
    fields: entry.fields.flatMap((field) => describeField(field) ?? []),
    relations: entry.relations,
    examples: entry.examples.map((example) => redactExample(example, fields)),
  };
};

const matchesQuery = (entry: AiCatalogEntry, query: string | undefined): boolean => {
  const needle = query?.trim().toLowerCase();
  if (needle === undefined || needle === "") return true;
  return [entry.id, entry.name, entry.description].some((text) => text.toLowerCase().includes(needle));
};

/**
 * @param raw the parsed `catalog.ai.json` (see `loadBundledAiCatalog`).
 * @throws {InvalidAiCatalogError} when it does not match the generator's shape.
 */
export const createAiCatalogReader = (raw: unknown): AiCatalogReader => {
  const parsed = AiCatalogSchema.safeParse(raw);
  if (!parsed.success) throw new InvalidAiCatalogError({ cause: parsed.error });
  const entries = [...parsed.data.contracts].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return {
    list: ({ permissions, query, kind, limit }) => {
      const matches = entries.filter((entry) => isVisible(entry, permissions) && (kind === undefined || entry.kind === kind) && matchesQuery(entry, query));
      return { entities: matches.slice(0, limit).map(summarize), total: matches.length, truncated: matches.length > limit };
    },
    describe: ({ id, permissions }) => {
      const entry = byId.get(id);
      return entry === undefined || !isVisible(entry, permissions) ? undefined : describeEntry(entry);
    },
    kinds: () => [...new Set(entries.map((entry) => entry.kind))].sort(),
  };
};
