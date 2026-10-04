/**
 * Environment values of the flags (decision 0039): Firebase Remote Config outside local, the
 * Firestore `feature-flags` collection in local (Remote Config has no emulator). Values only:
 * no tenant data ever goes to Remote Config.
 */
export type EnvironmentFlagValues = {
  /** Values set for this environment, by flag key; a missing key falls back to the defaults. */
  readonly read: () => Promise<Readonly<Record<string, boolean>>>;
  readonly write: (input: {
    readonly key: string;
    readonly value: boolean;
    readonly updatedBy: string;
  }) => Promise<void>;
};

/** Per-organization overrides (Firestore `feature-flag-overrides/{tenantId}` in every environment). */
export type TenantFlagOverrides = {
  readonly read: (tenantId: string) => Promise<Readonly<Record<string, boolean>>>;
  readonly write: (input: {
    readonly key: string;
    readonly tenantId: string;
    readonly value: boolean;
    readonly updatedBy: string;
  }) => Promise<void>;
  /** Removes one override; @returns false when the organization had none for the flag. */
  readonly clear: (input: {
    readonly key: string;
    readonly tenantId: string;
    readonly updatedBy: string;
  }) => Promise<boolean>;
};

export type FlagStores = {
  readonly environment: EnvironmentFlagValues;
  readonly tenants: TenantFlagOverrides;
};
