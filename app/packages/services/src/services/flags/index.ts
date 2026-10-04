// Public surface of the flags context (SP5 Task 8, decision 0039).

export { FEATURE_FLAG_OVERRIDES_COLLECTION, FEATURE_FLAGS_COLLECTION } from "./adapters/driven/firestore-flags.ts";
export { createInMemoryFlagStores } from "./adapters/driven/in-memory-flags.ts";
export {
  type RemoteConfigClient,
  type RemoteConfigTemplateLike,
  remoteConfigParameterOf,
} from "./adapters/driven/remote-config-flags.ts";
export { buildAdminFlagsRoutes } from "./adapters/driving/admin-flags-route-handler.ts";
export { buildFlagsRoutes, FLAG_PERMISSIONS } from "./adapters/driving/flags-route-handler.ts";
export type { EnvironmentFlagValues, FlagStores, TenantFlagOverrides } from "./application/ports/flag-store.ts";
export type { GetFlagValues } from "./application/use-cases/get-flags.ts";
export type { ListFlags } from "./application/use-cases/list-flags.ts";
export type { SetFlagError, SetFlagValue } from "./application/use-cases/set-flag-value.ts";
export {
  createFirebaseFlagsServices,
  createFlagStoresFor,
  createFlagsServices,
  type FlagsServices,
} from "./composition.ts";
export {
  CORE_FLAGS,
  expiredFlags,
  findFlag,
  flagEnvironmentDefaults,
  isFlagExpired,
  type RegisteredFlag,
} from "./flag-registry.ts";
