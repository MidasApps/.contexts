import { evaluateFlag } from "../../domain/evaluate-flag.ts";
import type { FlagsDeps } from "../flags-deps.ts";

/** Effective value of every registry flag for an organization (or the environment when `tenantId` is null). */
export type GetFlagValues = (input: { readonly tenantId: string | null }) => Promise<Readonly<Record<string, boolean>>>;

/**
 * The read the runtime uses (`FlagsPort`, cached 30 s there): one environment read and one
 * override read. A store failure rejects; callers decide their fail-safe (the kill-switch
 * fails closed, decision 0039).
 */
export const makeGetFlagValues =
  (deps: Pick<FlagsDeps, "registry" | "stores" | "environmentDefaults">): GetFlagValues =>
  async ({ tenantId }) => {
    const [stored, overrides] = await Promise.all([deps.stores.environment.read(), tenantId === null ? Promise.resolve({}) : deps.stores.tenants.read(tenantId)]);
    const values: Record<string, boolean> = {};
    for (const flag of deps.registry) {
      values[flag.key] = evaluateFlag(flag, {
        stored: stored[flag.key],
        environmentDefault: deps.environmentDefaults[flag.key],
        tenantOverride: (overrides as Readonly<Record<string, boolean>>)[flag.key] ?? null,
      });
    }
    return values;
  };
