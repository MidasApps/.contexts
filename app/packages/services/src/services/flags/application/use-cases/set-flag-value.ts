import type { FeatureFlag, TenantId, UserPrincipal } from "@core/contracts";
import { auditActorOf } from "../../../audit/domain/audit-actor.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import { findFlag, type RegisteredFlag } from "../../flag-registry.ts";
import type { FlagsDeps } from "../flags-deps.ts";
import { environmentValueFor, toFeatureFlag } from "./list-flags.ts";

/** Expected refusals of a flag write; the handler maps them to 404, 403 and 400. */
export type SetFlagError = { readonly code: "FLAG_NOT_FOUND" } | { readonly code: "FLAG_NOT_OVERRIDABLE" } | { readonly code: "ENVIRONMENT_DISABLED" };

export type SetFlagValueCommand = {
  readonly actor: UserPrincipal;
  /** `staff` (`/v1/admin/flags`, already authorized) or `tenant` (`/v1/flags`, already authorized at the organization). */
  readonly by: "staff" | "tenant";
  readonly key: string;
  readonly value: boolean;
  /** The organization to override; null sets the environment value (staff only). */
  readonly tenantId: TenantId | null;
  readonly requestId: string;
};

export type SetFlagValue = (command: SetFlagValueCommand) => Promise<Result<FeatureFlag, SetFlagError>>;

// A tenant may override only tenant-overridable flags, and may not enable what the environment disables.
const tenantRefusal = async (deps: FlagsDeps, flag: RegisteredFlag, value: boolean): Promise<SetFlagError | null> => {
  if (!flag.tenantOverridable) return { code: "FLAG_NOT_OVERRIDABLE" };
  return value && !(await environmentValueFor(deps, flag)) ? { code: "ENVIRONMENT_DISABLED" } : null;
};

const recordChange = async (deps: FlagsDeps, command: SetFlagValueCommand): Promise<void> => {
  const common = {
    action: "FEATURE_FLAG_UPDATED" as const,
    actor: auditActorOf(command.actor),
    target: { type: "feature-flag", id: command.key },
    outcome: "success" as const,
    requestId: command.requestId,
    changes: [command.tenantId === null ? "value" : "tenantOverride"],
  };
  if (command.by === "staff") {
    await deps.audit.record({ log: "platform", ...common, ...(command.tenantId === null ? {} : { targetTenantId: command.tenantId }) });
    return;
  }
  if (command.tenantId === null) return;
  await deps.audit.record({ log: "tenant", ...common, tenantId: command.tenantId, node: { level: "organization", tenantId: command.tenantId } });
};

/**
 * Sets a flag (decision 0039): the environment value (staff) or an organization's override
 * (staff, or the organization's admins for tenant-overridable flags). Audited as
 * `FEATURE_FLAG_UPDATED`: staff writes on the platform log with `targetTenantId`.
 */
export const makeSetFlagValue =
  (deps: FlagsDeps): SetFlagValue =>
  async (command) => {
    const flag = findFlag(deps.registry, command.key);
    if (flag === undefined) return err({ code: "FLAG_NOT_FOUND" });
    if (command.by === "tenant") {
      const refusal = command.tenantId === null ? ({ code: "FLAG_NOT_OVERRIDABLE" } as const) : await tenantRefusal(deps, flag, command.value);
      if (refusal !== null) return err(refusal);
    }
    const updatedBy = command.actor.uid;
    if (command.tenantId === null) await deps.stores.environment.write({ key: flag.key, value: command.value, updatedBy });
    else await deps.stores.tenants.write({ key: flag.key, tenantId: command.tenantId, value: command.value, updatedBy });
    await recordChange(deps, command);
    const [stored, overrides] = await Promise.all([deps.stores.environment.read(), command.tenantId === null ? Promise.resolve({}) : deps.stores.tenants.read(command.tenantId)]);
    return ok(
      toFeatureFlag(flag, {
        stored: stored[flag.key],
        environmentDefault: deps.environmentDefaults[flag.key],
        tenantOverride: (overrides as Readonly<Record<string, boolean>>)[flag.key] ?? null,
        now: deps.clock.now(),
      }),
    );
  };

export type ClearFlagOverrideCommand = { readonly actor: UserPrincipal; readonly key: string; readonly tenantId: TenantId; readonly requestId: string };

export type ClearFlagOverride = (command: ClearFlagOverrideCommand) => Promise<Result<FeatureFlag, { readonly code: "FLAG_NOT_FOUND" }>>;

/**
 * Staff remove an organization's override (decision 0044): the environment value applies again.
 * Idempotent: clearing an absent override answers the flag without a second audit entry. A removal
 * is audited like a write (`FEATURE_FLAG_UPDATED`, platform log, `targetTenantId`).
 */
export const makeClearFlagOverride =
  (deps: FlagsDeps): ClearFlagOverride =>
  async (command) => {
    const flag = findFlag(deps.registry, command.key);
    if (flag === undefined) return err({ code: "FLAG_NOT_FOUND" });
    const removed = await deps.stores.tenants.clear({ key: flag.key, tenantId: command.tenantId, updatedBy: command.actor.uid });
    if (removed) {
      await deps.audit.record({
        log: "platform",
        action: "FEATURE_FLAG_UPDATED",
        actor: auditActorOf(command.actor),
        target: { type: "feature-flag", id: flag.key },
        targetTenantId: command.tenantId,
        outcome: "success",
        requestId: command.requestId,
        changes: ["tenantOverride"],
      });
    }
    const [stored, overrides] = await Promise.all([deps.stores.environment.read(), deps.stores.tenants.read(command.tenantId)]);
    return ok(toFeatureFlag(flag, { stored: stored[flag.key], environmentDefault: deps.environmentDefaults[flag.key], tenantOverride: overrides[flag.key] ?? null, now: deps.clock.now() }));
  };
