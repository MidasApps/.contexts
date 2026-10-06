import type { FeatureFlag } from "@core/contracts";
import { environmentValueOf, evaluateFlag } from "../../domain/evaluate-flag.ts";
import { isFlagExpired, type RegisteredFlag } from "../../flag-registry.ts";
import type { FlagsDeps } from "../flags-deps.ts";

export type ListFlags = (input: {
  readonly tenantId: string | null;
  readonly tenantOverridableOnly: boolean;
}) => Promise<FeatureFlag[]>;

/** A registry flag as the console shows it: metadata, effective value, override and expiry warning. */
export const toFeatureFlag = (
  flag: RegisteredFlag,
  inputs: {
    stored: boolean | undefined;
    environmentDefault: boolean | undefined;
    tenantOverride: boolean | null;
    now: Date;
  },
): FeatureFlag => {
  const { tenantOverridable, ...definition } = flag;
  void tenantOverridable;
  return {
    ...definition,
    value: evaluateFlag(flag, inputs),
    tenantOverride: inputs.tenantOverride,
    expired: isFlagExpired(flag, inputs.now),
  };
};

/** The environment value alone (the rule a tenant write is checked against). */
export const environmentValueFor = async (
  deps: Pick<FlagsDeps, "stores" | "environmentDefaults">,
  flag: RegisteredFlag,
): Promise<boolean> =>
  environmentValueOf(flag, {
    stored: (await deps.stores.environment.read())[flag.key],
    environmentDefault: deps.environmentDefaults[flag.key],
  });

/**
 * `/v1/admin/flags` (every flag; an organization's overrides when one is named) and `/v1/flags`
 * (tenant-overridable flags of the caller's organization).
 */
export const makeListFlags =
  (deps: Pick<FlagsDeps, "registry" | "stores" | "environmentDefaults" | "clock">): ListFlags =>
  async ({ tenantId, tenantOverridableOnly }) => {
    const [stored, overrides] = await Promise.all([
      deps.stores.environment.read(),
      tenantId === null ? Promise.resolve({}) : deps.stores.tenants.read(tenantId),
    ]);
    const now = deps.clock.now();
    return deps.registry
      .filter((flag) => !tenantOverridableOnly || flag.tenantOverridable)
      .map((flag) =>
        toFeatureFlag(flag, {
          stored: stored[flag.key],
          environmentDefault: deps.environmentDefaults[flag.key],
          tenantOverride: (overrides as Readonly<Record<string, boolean>>)[flag.key] ?? null,
          now,
        }),
      );
  };
