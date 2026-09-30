// Shared refinements (contracts/schemas.md §13): named, reused instead of inline copies.

/** A PATCH body must change something: at least one key with a defined value. */
export const hasAnyField = (input: Readonly<Record<string, unknown>>): boolean =>
  Object.values(input).some((value) => value !== undefined);

/** Error option of `hasAnyField`, so every update input reports the same message. */
export const HAS_ANY_FIELD_ERROR = { error: "Provide at least one field to change." } as const;

/** Array items must be distinct (permissions, scopes). */
export const hasUniqueItems = (items: readonly unknown[]): boolean => new Set(items).size === items.length;
