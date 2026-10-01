import type { FlagsPort } from "./runtime-ports.ts";

/** Flag reads of the runtime (decision 0039): values cached 30 s per organization. */
export type FlagReader = {
  /**
   * @param fallback the value when the store fails and nothing is cached yet (the kill-switch
   * passes `true`: fail closed; a rollout passes its safe default).
   */
  readonly isEnabled: (input: { readonly key: string; readonly tenantId: string | null; readonly fallback: boolean }) => Promise<boolean>;
};

export const FLAG_CACHE_TTL_MS = 30_000;

type Entry = { readonly values: Readonly<Record<string, boolean>>; readonly at: number };

/**
 * Wraps the `FlagsPort` with a per-organization cache (30 s). A failed refresh keeps serving the
 * last values (a store blip never flips a flag); with nothing cached the reader answers the
 * caller's fallback. A key the registry does not know reads as the fallback.
 */
export const createFlagReader = (port: FlagsPort, options: { readonly ttlMs?: number; readonly now?: () => number } = {}): FlagReader => {
  const ttl = options.ttlMs ?? FLAG_CACHE_TTL_MS;
  const now = options.now ?? (() => Date.now());
  const cache = new Map<string, Entry>();
  const inflight = new Map<string, Promise<Entry | undefined>>();
  const refresh = (tenantId: string | null): Promise<Entry | undefined> => {
    const cacheKey = tenantId ?? "";
    const pending =
      inflight.get(cacheKey) ??
      port
        .getValues({ tenantId })
        .then((values) => {
          const entry = { values, at: now() };
          cache.set(cacheKey, entry);
          return entry;
        })
        .catch(() => cache.get(cacheKey))
        .finally(() => inflight.delete(cacheKey));
    inflight.set(cacheKey, pending);
    return pending;
  };
  return {
    isEnabled: async ({ key, tenantId, fallback }) => {
      const cached = cache.get(tenantId ?? "");
      const entry = cached !== undefined && now() - cached.at < ttl ? cached : await refresh(tenantId);
      return entry?.values[key] ?? fallback;
    },
  };
};
