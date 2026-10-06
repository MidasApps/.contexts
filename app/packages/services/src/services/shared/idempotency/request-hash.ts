import { sha256Hex } from "../crypto/sha256.ts";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, sortKeys(value[key])]),
  );
};

/** JSON with object keys sorted at every depth (undefined dropped), so equal inputs hash equally. */
export const canonicalJson = (value: unknown): string => JSON.stringify(sortKeys(value)) ?? "null";

/**
 * `sha256` of the canonical JSON of the parsed request parts (decision 0009 §3): the
 * same `Idempotency-Key` with another request hashes differently (409 conflict).
 */
export const hashRequest = (parts: { params: unknown; query: unknown; body: unknown }): string =>
  sha256Hex(canonicalJson({ params: parts.params, query: parts.query, body: parts.body }));
