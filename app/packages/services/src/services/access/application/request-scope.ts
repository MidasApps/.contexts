import type { AccessReaders } from "./ports/driven/access-readers.ts";

type AsyncFn<Args extends unknown[], Result> = (...args: Args) => Promise<Result>;

const memoize = <Args extends unknown[], Result>(fn: AsyncFn<Args, Result>): AsyncFn<Args, Result> => {
  const cache = new Map<string, Promise<Result>>();
  return (...args) => {
    const key = JSON.stringify(args);
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const pending = fn(...args);
    cache.set(key, pending);
    return pending;
  };
};

/**
 * Wraps the access readers so each distinct read runs once per request (SP1 spec
 * §5.2). Create one per request and drop it after: nothing is cached across requests,
 * so a revoked grant takes effect on the next request. Concurrent identical reads
 * share one promise; a failed read fails every caller of that request.
 */
export const createRequestScope = (readers: AccessReaders): AccessReaders => ({
  grants: { listGrants: memoize(readers.grants.listGrants) },
  roles: { getRoles: memoize(readers.roles.getRoles) },
  nodeChains: { loadChain: memoize(readers.nodeChains.loadChain) },
  principals: {
    getUser: memoize(readers.principals.getUser),
    getDevice: memoize(readers.principals.getDevice),
    getApiKey: memoize(readers.principals.getApiKey),
    getPlatformStaff: memoize(readers.principals.getPlatformStaff),
    getImpersonationSession: memoize(readers.principals.getImpersonationSession),
  },
});
