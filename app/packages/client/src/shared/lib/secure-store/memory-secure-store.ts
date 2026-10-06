import type { SecureStorePort } from "./secure-store-port.ts";

/** Secure store kept in memory: lost on reload (browser mode, tests). */
export const createMemorySecureStore = (initial: string | null = null): SecureStorePort => {
  let secret = initial;
  return {
    get: () => Promise.resolve(secret),
    set: (next) => {
      secret = next;
      return Promise.resolve();
    },
    delete: () => {
      secret = null;
      return Promise.resolve();
    },
  };
};
