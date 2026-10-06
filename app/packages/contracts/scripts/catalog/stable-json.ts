export type JsonRecord = Record<string, unknown>;

export const isJsonRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const compareKeys = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

/** Recursively sorts object keys so generated artifacts never depend on insertion order. */
export const sortKeysDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (!isJsonRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort(compareKeys)
      .map((key) => [key, sortKeysDeep(value[key])]),
  );
};

/** Deterministic JSON text: sorted keys, 2-space indent, trailing newline. */
export const stableStringify = (value: unknown): string => `${JSON.stringify(sortKeysDeep(value), null, 2)}\n`;
