// Composition root of the flags context (SP5 Task 8, decision 0039).
import type { AuditWriter } from "../audit/application/use-cases/record-audit.ts";
import type { Clock } from "../shared/clock/clock.ts";
import type { FirebaseAdmin } from "../shared/firebase/firebase-admin.ts";
import { createFirestoreEnvironmentFlagValues, createFirestoreTenantFlagOverrides } from "./adapters/driven/firestore-flags.ts";
import { createLazyRemoteConfigClient, createRemoteConfigEnvironmentFlagValues, type RemoteConfigClient } from "./adapters/driven/remote-config-flags.ts";
import type { FlagsDeps } from "./application/flags-deps.ts";
import type { FlagStores } from "./application/ports/flag-store.ts";
import { type GetFlagValues, makeGetFlagValues } from "./application/use-cases/get-flags.ts";
import { type ListFlags, makeListFlags } from "./application/use-cases/list-flags.ts";
import { makeSetFlagValue, type SetFlagValue } from "./application/use-cases/set-flag-value.ts";
import { assertFlagRegistry, CORE_FLAGS } from "./flag-registry.ts";

export type FlagsServices = {
  readonly getFlagValues: GetFlagValues;
  readonly listFlags: ListFlags;
  readonly setFlagValue: SetFlagValue;
};

/** Binds the flags use cases (in-memory stores in unit tests). */
export const createFlagsServices = (deps: Omit<FlagsDeps, "registry"> & { readonly registry?: FlagsDeps["registry"] }): FlagsServices => {
  const full: FlagsDeps = { ...deps, registry: assertFlagRegistry(deps.registry ?? CORE_FLAGS) };
  return { getFlagValues: makeGetFlagValues(full), listFlags: makeListFlags(full), setFlagValue: makeSetFlagValue(full) };
};

/**
 * The stores of an environment: Firestore `feature-flags` in `local`, Remote Config everywhere
 * else (never a silent fallback between them); tenant overrides in Firestore everywhere.
 */
export const createFlagStoresFor = (args: { readonly firebase: FirebaseAdmin; readonly appEnv: string; readonly remoteConfig?: RemoteConfigClient }): FlagStores => ({
  environment:
    args.appEnv === "local"
      ? createFirestoreEnvironmentFlagValues({ firestore: args.firebase.firestore })
      : createRemoteConfigEnvironmentFlagValues({
          client: args.remoteConfig ?? createLazyRemoteConfigClient(args.firebase.app),
          keys: CORE_FLAGS.map((flag) => flag.key),
        }),
  tenants: createFirestoreTenantFlagOverrides({ firestore: args.firebase.firestore }),
});

/** Firebase-backed flags services (web `/v1` routes and the Mastra `FlagsPort`). */
export const createFirebaseFlagsServices = (args: {
  readonly firebase: FirebaseAdmin;
  readonly appEnv: string;
  readonly audit: AuditWriter;
  readonly clock: Clock;
  readonly environmentDefaults?: FlagsDeps["environmentDefaults"];
}): FlagsServices =>
  createFlagsServices({
    stores: createFlagStoresFor({ firebase: args.firebase, appEnv: args.appEnv }),
    environmentDefaults: args.environmentDefaults ?? {},
    clock: args.clock,
    audit: args.audit,
  });
