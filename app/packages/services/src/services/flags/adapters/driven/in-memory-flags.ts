import type { FlagStores } from "../../application/ports/flag-store.ts";

/** In-memory flag stores for unit tests (`environment` and `tenants` are inspectable). */
export const createInMemoryFlagStores = (seed: { environment?: Record<string, boolean>; tenants?: Record<string, Record<string, boolean>> } = {}) => {
  const environment: Record<string, boolean> = { ...seed.environment };
  const tenants: Record<string, Record<string, boolean>> = { ...seed.tenants };
  const stores: FlagStores = {
    environment: {
      read: () => Promise.resolve({ ...environment }),
      write: ({ key, value }) => {
        environment[key] = value;
        return Promise.resolve();
      },
    },
    tenants: {
      read: (tenantId) => Promise.resolve({ ...tenants[tenantId] }),
      write: ({ key, tenantId, value }) => {
        tenants[tenantId] = { ...tenants[tenantId], [key]: value };
        return Promise.resolve();
      },
    },
  };
  return { stores, environment, tenants };
};
