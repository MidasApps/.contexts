// Keys that name personal data or credentials. The entry contracts strip unknown keys, so a
// careless `{ ...user }` would silently lose them; rejecting instead surfaces the bug.
const FORBIDDEN_KEY_PATTERN = /e-?mail|password|passwd|secret|token|cookie|credential|phone/i;
const FORBIDDEN_EXACT_KEYS: ReadonlySet<string> = new Set(["code", "apiKey"]);

const isForbiddenKey = (key: string): boolean => FORBIDDEN_KEY_PATTERN.test(key) || FORBIDDEN_EXACT_KEYS.has(key);

const collect = (value: unknown, path: readonly string[], found: string[]): void => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collect(item, [...path, String(index)], found));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (isForbiddenKey(key)) found.push([...path, key].join("."));
    else collect(child, [...path, key], found);
  }
};

/** Dotted paths of every forbidden key in `value`, in document order. */
export const findForbiddenAuditKeys = (value: unknown): string[] => {
  const found: string[] = [];
  collect(value, [], found);
  return found;
};
