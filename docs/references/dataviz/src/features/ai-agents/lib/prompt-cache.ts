/**
 * Simple memoization for static prompt sections.
 * Process-level cache (lives for the lifetime of the server process).
 * Safe because the cached content is truly static (schema docs, glossary, benchmarks).
 */
const cache = new Map<string, string>();

export function getCachedOrCompute(key: string, compute: () => string): string {
  const existing = cache.get(key);
  if (existing !== undefined) return existing;
  const result = compute();
  cache.set(key, result);
  return result;
}

/** Clear all cached prompts. Useful if you ever hot-reload config. */
// clearPromptCache() removida — nunca teve chamador. O cache é process-local e
// morre com o worker; quem precisar invalidar em teste mocka o módulo.
