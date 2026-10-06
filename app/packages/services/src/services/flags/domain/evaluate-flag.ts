import type { RegisteredFlag } from "../flag-registry.ts";

/** Inputs of one flag's resolution. */
export type FlagInputs = {
  /** Value stored for the environment (Remote Config / Firestore), if any. */
  readonly stored: boolean | undefined;
  /** Boot-time default of the environment (an env var such as `AI_VOICE_ENABLED`), if any. */
  readonly environmentDefault: boolean | undefined;
  readonly tenantOverride: boolean | null;
};

/** The environment value: stored → environment default → registry default. */
export const environmentValueOf = (flag: RegisteredFlag, inputs: Omit<FlagInputs, "tenantOverride">): boolean =>
  inputs.stored ?? inputs.environmentDefault ?? flag.default;

/**
 * The effective value (decision 0039). A kill-switch is on when the environment **or** the
 * organization turns it on (a tenant override never lifts a platform kill); any other flag
 * takes the organization's override, else the environment value.
 */
export const evaluateFlag = (flag: RegisteredFlag, inputs: FlagInputs): boolean => {
  const environment = environmentValueOf(flag, inputs);
  if (flag.kind === "kill-switch") return environment || inputs.tenantOverride === true;
  return inputs.tenantOverride ?? environment;
};
